import { POPULAR_DOMAINS, isKnownProvider } from "./providers";

/** Shared mailboxes that rarely belong to one consenting person. */
const ROLE_LOCALS = new Set([
  "abuse", "accounting", "accounts", "admin", "administrator", "billing",
  "booking", "bookings", "careers", "ceo", "compliance", "contact",
  "contactus", "customerservice", "customersupport", "dev", "devnull",
  "enquiries", "enquiry", "everyone", "finance", "feedback", "help",
  "helpdesk", "hello", "hi", "hostmaster", "hr", "info", "information",
  "inquiries", "inquiry", "it", "jobs", "legal", "list", "mail", "marketing",
  "media", "news", "newsletter", "office", "orders", "partners", "postmaster",
  "press", "privacy", "recruiting", "recruitment", "reservations", "root",
  "sales", "security", "service", "services", "shop", "staff", "subscribe",
  "support", "sysadmin", "team", "tech", "webmaster", "welcome",
]);

const NO_REPLY_LOCALS = new Set([
  "noreply", "donotreply", "mailerdaemon", "bounce", "bounces", "nobody",
]);

const PLACEHOLDER_LOCALS = new Set([
  "test", "testing", "tester", "example", "sample", "demo", "fake", "asdf",
  "qwerty", "abc", "abcd", "xxx", "xyz", "foo", "bar", "foobar", "null",
  "none", "noemail", "noone", "na", "user", "username", "email", "youremail",
  "yourname", "name",
]);

/** RFC 2606 / RFC 6761 reserved names that can never receive mail. */
const RESERVED_TLDS = new Set([
  "test", "example", "invalid", "localhost", "local", "internal", "lan",
  "home", "corp", "onion",
]);
const RESERVED_DOMAINS = new Set([
  "example.com", "example.net", "example.org", "home.arpa",
]);

/** Real domains that appear in forms as placeholders. */
const PLACEHOLDER_DOMAINS = new Set([
  "domain.com", "yourdomain.com", "yourcompany.com", "company.com",
  "test.com", "testing.com", "sample.com", "email.example",
]);

/** Strips "+tag" and separators so "no-reply" and "no_reply" match. */
function canonicalLocal(local: string): string {
  return local.toLowerCase().split("+")[0].replace(/[._-]/g, "");
}

export function isRoleAccount(local: string): boolean {
  const base = local.toLowerCase().split("+")[0];
  return ROLE_LOCALS.has(base) || ROLE_LOCALS.has(canonicalLocal(local));
}

export function isNoReply(local: string): boolean {
  return NO_REPLY_LOCALS.has(canonicalLocal(local));
}

export function isPlaceholder(local: string, domain: string): boolean {
  return PLACEHOLDER_LOCALS.has(canonicalLocal(local)) || PLACEHOLDER_DOMAINS.has(domain);
}

export function isReservedDomain(domain: string): boolean {
  if (RESERVED_DOMAINS.has(domain)) return true;
  const labels = domain.split(".");
  if (RESERVED_TLDS.has(labels[labels.length - 1])) return true;
  // example.co.uk, example.de, ...
  return labels[0] === "example" && labels.length <= 3;
}

/** Optimal string alignment distance (Levenshtein + adjacent transposition). */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2][j - 2] + 1);
      }
      d[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** Domains that typos are most often made against. */
const TYPO_TARGETS = [
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
  "aol.com", "live.com", "msn.com", "mail.ru", "yandex.ru", "ukr.net",
  "proton.me", "protonmail.com", "gmx.de", "gmx.net", "web.de", "comcast.net",
];

/** Real domains that sit one edit away from a popular provider. */
const LOOKALIKE_REAL_DOMAINS = new Set([
  "cloud.com", "email.com", "gail.com", "mail.com", "yahoo.co.jp",
  "outlook.de", "hotmail.de",
]);

const TLD_TYPOS = new Set([
  "co", "cm", "con", "cpm", "cim", "cmo", "comm", "coom", "om", "ocm", "vom",
  "xom", "c", "ne", "nt", "ner", "et", "rus", "r",
]);

/**
 * Returns the intended domain if `domain` looks like a typo of a popular
 * mailbox provider, e.g. "gnail.com" -> "gmail.com", "gmail.con" ->
 * "gmail.com". Known real domains (ymail.com, mail.com, ...) are never
 * flagged.
 */
export function suggestDomain(domain: string): string | null {
  if (isKnownProvider(domain) || LOOKALIKE_REAL_DOMAINS.has(domain)) return null;

  const dot = domain.indexOf(".");
  const sld = domain.slice(0, dot);
  const tld = domain.slice(dot + 1);

  for (const target of TYPO_TARGETS) {
    const targetSld = target.slice(0, target.indexOf("."));
    if (sld === targetSld && TLD_TYPOS.has(tld)) return target;
  }

  // Typos in the second-level label with the TLD intact ("gnail.com").
  // Short targets (aol, msn, live, gmx, web) are skipped: at distance 1 they match
  // too many unrelated real domains.
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const target of TYPO_TARGETS) {
    const targetDot = target.indexOf(".");
    const targetSld = target.slice(0, targetDot);
    if (target.slice(targetDot + 1) !== tld || targetSld.length <= 4) continue;
    const limit = targetSld.length >= 7 ? 2 : 1;
    const d = editDistance(sld, targetSld, limit);
    if (d > 0 && d <= limit && d < bestDistance) {
      best = target;
      bestDistance = d;
    }
  }
  return best;
}

export { POPULAR_DOMAINS };
