import { getARecords } from "../dns";
import { ReputationResult } from "../types";
import { CONFIG } from "../config";

const BLACKLIST_ZONES = [
  "zen.spamhaus.org",
  "dbl.spamhaus.org",
  "b.barracudacentral.org",
  "bl.spamcop.net",
  "dnsbl.sorbs.net",
];

/**
 * Checks if a target (domain or IP) is listed in common DNS-based blacklists.
 * 
 * @param target - The domain or IP address to check.
 * @param isIp - Whether the target is an IP address.
 * @returns A promise resolving to an array of blacklist names where the target was found.
 */
async function checkBlacklists(
  target: string,
  isIp: boolean,
): Promise<string[]> {
  const listings: string[] = [];
  const queryBase = isIp ? target.split(".").reverse().join(".") : target;

  const checks = BLACKLIST_ZONES.map(async (zone) => {
    const query = `${queryBase}.${zone}`;
    try {
      const result = await getARecords(query);
      if (result.length > 0) {
        listings.push(`${target} found in ${zone}`);
      }
    } catch {}
  });

  await Promise.all(checks);
  return listings;
}

/**
 * Estimates the age of a domain in days using RDAP lookups.
 * 
 * @param domain - The domain name to check.
 * @returns A promise resolving to the domain age in days, or null if the lookup fails.
 */
async function getDomainAge(domain: string): Promise<number | null> {
  try {
    const response = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: AbortSignal.timeout(CONFIG.rdapTimeout),
    });
    if (!response.ok) return null;

    const data = await response.json();
    const events = data.events || [];
    const registrationEvent = events.find(
      (e: { eventAction: string }) =>
        e.eventAction === "registration" || e.eventAction === "created",
    );

    if (registrationEvent) {
      const regDate = new Date(registrationEvent.eventTime);
      const diffTime = Math.abs(Date.now() - regDate.getTime());
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Analyzes the reputation of a domain and its associated mail server IPs.
 * 
 * Performs blacklist checks and domain age lookups.
 * 
 * @param domain - The domain to analyze.
 * @param mxIps - List of IP addresses for the domain's MX servers.
 * @returns A promise resolving to a ReputationResult.
 */
export async function analyzeReputation(
  domain: string,
  mxIps: string[],
): Promise<ReputationResult> {
  const [domainListings, ipListings, age] = await Promise.all([
    checkBlacklists(domain, false),
    Promise.all(mxIps.map((ip) => checkBlacklists(ip, true))),
    getDomainAge(domain),
  ]);

  const allListings = [...domainListings, ...ipListings.flat()];

  return {
    blacklisted: allListings.length > 0,
    listings: allListings,
    domainAgeDays: age,
  };
}
