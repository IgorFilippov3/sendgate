import { isIPv4 } from "node:net";
import type { DnsClient } from "../net/dns";
import type { BlocklistCheck } from "../types";

type ListingResult = "listed" | "clean" | "error";

/**
 * Interprets a DNSBL answer. Only real listing codes count: Spamhaus answers
 * 127.255.255.x when it refuses the query (public resolver, rate limit), and
 * 127.0.1.255 for invalid DBL queries; the old implementation reported those
 * as listings. PBL (127.0.0.10/11) marks dynamic IP space, not abuse.
 */
export function interpretDnsblAnswer(zone: string, answers: string[]): ListingResult {
  const isSpamhaus = zone.includes("spamhaus");
  let listed = false;
  for (const ip of answers) {
    const octets = ip.split(".").map(Number);
    if (octets.length !== 4 || octets[0] !== 127) return "error";
    if (octets[1] === 255) return "error";
    if (isSpamhaus && octets[1] === 0 && octets[2] === 1 && octets[3] === 255) return "error";
    if (isSpamhaus && octets[1] === 0 && octets[2] === 0 && (octets[3] === 10 || octets[3] === 11)) {
      continue; // PBL
    }
    if (octets[3] >= 2) listed = true;
  }
  return listed ? "listed" : "clean";
}

async function lookup(dns: DnsClient, name: string, zone: string): Promise<ListingResult> {
  const res = await dns.a(`${name}.${zone}`);
  if (res.status === "nxdomain" || res.status === "nodata") return "clean";
  if (res.status === "error") return "error";
  return interpretDnsblAnswer(zone, res.records);
}

function reverseIPv4(ip: string): string {
  return ip.split(".").reverse().join(".");
}

const MAX_IPS = 3;

export async function checkBlocklists(
  dns: DnsClient,
  domain: string,
  mxAddresses: string[],
  zones: { domain: string[]; ip: string[] },
): Promise<BlocklistCheck> {
  const ips = [...new Set(mxAddresses.filter((ip) => isIPv4(ip)))].slice(0, MAX_IPS);

  const domainQueries = zones.domain.map(async (zone) => ({
    entry: `${domain} on ${zone}`,
    result: await lookup(dns, domain, zone),
  }));
  const ipQueries = ips.flatMap((ip) =>
    zones.ip.map(async (zone) => ({
      entry: `${ip} on ${zone}`,
      result: await lookup(dns, reverseIPv4(ip), zone),
    })),
  );

  const [domainResults, ipResults] = await Promise.all([
    Promise.all(domainQueries),
    Promise.all(ipQueries),
  ]);
  const all = [...domainResults, ...ipResults];
  const errors = all.filter((r) => r.result === "error").length;

  return {
    status:
      all.length === 0
        ? "skipped"
        : errors === 0
          ? "ok"
          : errors === all.length
            ? "unavailable"
            : "partial",
    domainListings: domainResults.filter((r) => r.result === "listed").map((r) => r.entry),
    ipListings: ipResults.filter((r) => r.result === "listed").map((r) => r.entry),
  };
}

/**
 * Domain age in days from RDAP (registration event), or null when unknown.
 */
export async function domainAgeDays(
  domain: string,
  options: { timeoutMs: number; fetchFn?: typeof fetch; now?: number },
): Promise<number | null> {
  const fetchFn = options.fetchFn ?? fetch;
  try {
    const res = await fetchFn(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: { accept: "application/rdap+json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { events?: { eventAction?: string; eventDate?: string }[] };
    const event = data.events?.find((e) => e.eventAction === "registration");
    if (!event?.eventDate) return null;
    const registered = Date.parse(event.eventDate);
    if (Number.isNaN(registered)) return null;
    const days = Math.floor(((options.now ?? Date.now()) - registered) / 86_400_000);
    return days >= 0 ? days : null;
  } catch {
    return null;
  }
}
