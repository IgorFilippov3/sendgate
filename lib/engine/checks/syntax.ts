import { domainToASCII } from "node:url";
import type { SyntaxCheck } from "../types";

const MAX_ADDRESS = 254;
const MAX_LOCAL = 64;
const MAX_DOMAIN = 253;
const MAX_LABEL = 63;

/** RFC 5322 atext plus Unicode letters/digits (RFC 6531 SMTPUTF8). */
const ATOM = /^[\p{L}\p{N}!#$%&'*+/=?^_`{|}~-]+$/u;
const LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function invalid(error: string): SyntaxCheck {
  return { valid: false, error };
}

/**
 * Validates an address the way a real sending MTA would accept it.
 *
 * Accepts dot-atom local parts (including Unicode) and internationalised
 * domains (converted to punycode). Rejects quoted local parts, domain
 * literals ([1.2.3.4]), single-label domains and malformed labels.
 */
export function checkSyntax(raw: string): SyntaxCheck {
  const address = raw.trim();
  if (!address) return invalid("Empty address");
  if (/\s/.test(address)) return invalid("Address contains whitespace");

  const at = address.lastIndexOf("@");
  if (at <= 0) return invalid("Missing local part or '@'");
  const local = address.slice(0, at);
  let domain = address.slice(at + 1);

  if (local.includes('"')) return invalid("Quoted local parts are not supported");
  if (local.includes("@")) return invalid("More than one '@'");
  if (local.length > MAX_LOCAL) return invalid("Local part is longer than 64 characters");
  if (local.startsWith(".") || local.endsWith(".")) {
    return invalid("Local part starts or ends with a dot");
  }
  if (local.includes("..")) return invalid("Local part contains consecutive dots");
  if (!local.split(".").every((atom) => ATOM.test(atom))) {
    return invalid("Local part contains invalid characters");
  }

  if (!domain) return invalid("Missing domain");
  if (domain.startsWith("[")) return invalid("IP address literals are not supported");
  domain = domain.replace(/\.$/, "");

  const ascii = domainToASCII(domain.toLowerCase());
  if (!ascii) return invalid("Domain is not a valid hostname");
  if (ascii.length > MAX_DOMAIN) return invalid("Domain is too long");

  const labels = ascii.split(".");
  if (labels.length < 2) return invalid("Domain must contain a dot");
  for (const label of labels) {
    if (!label) return invalid("Domain contains an empty label");
    if (label.length > MAX_LABEL) return invalid("Domain label is longer than 63 characters");
    if (!LABEL.test(label)) return invalid("Domain contains invalid characters");
  }
  const tld = labels[labels.length - 1];
  if (/^\d+$/.test(tld) || tld.length < 2) return invalid("Invalid top-level domain");

  if (local.length + 1 + ascii.length > MAX_ADDRESS) {
    return invalid("Address is longer than 254 characters");
  }

  return { valid: true, local, domain: ascii };
}

/** Providers that deliver "user+tag" to "user". */
const PLUS_ADDRESSING = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "fastmail.com",
  "proton.me",
  "protonmail.com",
  "yandex.ru",
]);

/**
 * Deduplication key. Two addresses with the same key reach the same mailbox.
 * The key is only used to find duplicates; results always show the address
 * the user submitted.
 */
export function dedupKey(local: string, domain: string): string {
  let l = local.toLowerCase();
  let d = domain.toLowerCase();
  if (d === "googlemail.com") d = "gmail.com";
  if (PLUS_ADDRESSING.has(d)) l = l.split("+")[0];
  if (d === "gmail.com") l = l.replace(/\./g, "");
  return `${l}@${d}`;
}
