import { BehavioralResult } from "../types";
import { disposableProvider } from "../disposable-provider";

export const ROLE_PREFIXES = new Set([
  "admin",
  "info",
  "support",
  "sales",
  "contact",
  "hello",
  "mail",
  "webmaster",
  "postmaster",
  "hostmaster",
  "billing",
  "help",
  "office",
  "marketing",
  "team",
  "jobs",
  "hr",
]);

export const COMMON_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "mail.ru",
  "yandex.ru",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "zoho.com",
];

export const DOMAIN_TYPOS: Record<string, string> = {
  "gnail.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "yaho.com": "yahoo.com",
  "yhoo.com": "yahoo.com",
  "hotmal.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "outlok.com": "outlook.com",
};

export const DISPOSABLE_MX_PATTERNS = [
  "temp-mail.org",
  "temp-mail.ru",
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamailblock.com",
  "10minutemail.com",
  "dispostable.com",
  "yopmail.com",
  "sharklasers.com",
  "grr.la",
  "temp-mail.io",
  "mail.ixunbo.com",
  "tmail.ws",
  "v-mail.org",
  "mail.tm",
  "mail.gw",
  "mktomail.com",
  "temp-mail.de",
  "temp-mail.info",
  "temp-mail.io",
  "tempmail.net",
  "temp-mail.org",
  "temp-mail.ru",
  "privaterelay.appleid.com",
  "secmail.pro",
  "one-time.email",
  "dropmail.me",
  "eml.monster",
  "eml.xyz",
  "tempmail.plus",
  "icubik.com",
  "fexpost.com",
  "fextemp.com",
  "fexbox.org",
  "mailboxify.ru",
  "mailboxy.fun",
  "mailboxy.ru",
  "mailboxy.store",
];

export const BLACKLISTED_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "test.org",
  "test.net",
  "localhost",
  "invalid",
  "domain.com",
]);

export const BLACKLISTED_LOCALS = new Set([
  "test",
  "testing",
  "noreply",
  "no-reply",
  "example",
]);

/**
 * Checks if the local part of an email address matches common role-based prefixes.
 * 
 * @param email - The email address to check.
 * @returns True if the email is likely role-based (e.g., support@, admin@).
 */
export function checkRoleBased(email: string): boolean {
  const localPart = email.split("@")[0].toLowerCase();
  return ROLE_PREFIXES.has(localPart);
}

/**
 * Checks if an email address or domain is present on the local test/internal blacklist.
 * 
 * @param email - The full email address.
 * @param domain - The domain part of the email.
 * @returns True if the email or domain is blacklisted.
 */
export function checkBlacklisted(email: string, domain: string): boolean {
  const localPart = email.split("@")[0].toLowerCase();
  return (
    BLACKLISTED_DOMAINS.has(domain.toLowerCase()) ||
    BLACKLISTED_LOCALS.has(localPart)
  );
}

/**
 * Checks if a domain is a known common typo of popular email providers.
 * 
 * @param domain - The domain string to check.
 * @returns True if the domain is identified as a likely typo.
 */
export function checkDomainTypo(domain: string): boolean {
  return !!DOMAIN_TYPOS[domain.toLowerCase()];
}

/**
 * Checks if a domain or its MX infrastructure is associated with disposable email providers.
 * 
 * @param domain - The domain name to check.
 * @param mxExchanges - List of MX server hostnames for the domain.
 * @returns True if the domain is identified as disposable.
 */
export function checkDisposable(
  domain: string,
  mxExchanges: string[] = [],
): boolean {
  const lowerDomain = domain.toLowerCase();

  if (disposableProvider.isDisposable(lowerDomain)) return true;

  for (const mx of mxExchanges) {
    const lowerMx = mx.toLowerCase().replace(/\.$/, ""); // Normalize trailing dot
    if (DISPOSABLE_MX_PATTERNS.some((pattern) => lowerMx.includes(pattern))) {
      return true;
    }
  }

  // Cross-check: If any MX record points to the domain itself (e.g. mail.domain.com)
  // and the domain itself is in a suspicious IP range, we could flag it,
  // but for now, we rely on the broader lists.

  return false;
}

/**
 * Performs a comprehensive behavioral and pattern analysis for an email address.
 * 
 * Aggregates results from role-based, typo, disposable, and blacklist checks.
 * 
 * @param email - The email address to analyze.
 * @param domain - The domain part of the email.
 * @param mxExchanges - List of MX server hostnames.
 * @param isCatchAll - Whether the domain was previously identified as a catch-all.
 * @returns A promise resolving to a BehavioralResult.
 */
export async function analyzeBehavioral(
  email: string,
  domain: string,
  mxExchanges: string[] = [],
  isCatchAll: boolean = false,
): Promise<BehavioralResult> {
  const isRole = checkRoleBased(email);
  const isTypo = checkDomainTypo(domain);
  const isDisp = checkDisposable(domain, mxExchanges);
  const isBlack = checkBlacklisted(email, domain);

  const details: string[] = [];
  if (isRole) details.push("Role-based email address");
  if (isTypo)
    details.push(`Likely typo of ${DOMAIN_TYPOS[domain.toLowerCase()]}`);
  if (isDisp) details.push("Disposable email provider");
  if (isBlack) details.push("Internal/Test address (Blacklisted)");
  if (isCatchAll) details.push("Catch-all configuration detected");

  return {
    isRoleBased: isRole,
    isDisposable: isDisp,
    isTypo: isTypo,
    isBlacklisted: isBlack,
    isCatchAll: isCatchAll,
    details,
  };
}
