import type {
  DomainAnalysis,
  Reason,
  ReasonCode,
  Severity,
  SmtpCheck,
  SyntaxCheck,
  Verdict,
} from "./types";

const MESSAGES: Record<ReasonCode, [Severity, string]> = {
  INVALID_SYNTAX: ["critical", "The address is not syntactically valid"],
  DOMAIN_NOT_FOUND: ["critical", "The domain does not exist"],
  NO_MAIL_SERVER: ["critical", "The domain has no mail server"],
  NULL_MX: ["critical", "The domain explicitly accepts no email (null MX)"],
  MX_NOT_ROUTABLE: ["critical", "The mail server resolves only to private or reserved IP addresses"],
  DNS_ERROR: ["warning", "DNS lookup failed; the domain could not be checked"],
  IMPLICIT_MX: ["info", "No MX record; mail falls back to the domain's A/AAAA record"],
  RESERVED_DOMAIN: ["critical", "Reserved domain that can never receive email"],
  MAILBOX_NOT_FOUND: ["critical", "The mail server reports that this mailbox does not exist"],
  MAILBOX_FULL: ["warning", "The mailbox is full"],
  MAILBOX_DISABLED: ["critical", "The mailbox is disabled"],
  MAILBOX_ACCEPTED: ["info", "The mail server accepted this recipient"],
  CATCH_ALL: ["warning", "The domain accepts mail for any address (catch-all), so this mailbox cannot be confirmed"],
  SMTP_TEMPORARY_FAILURE: ["warning", "The mail server returned a temporary error (possibly greylisting)"],
  SMTP_BLOCKED: ["warning", "The mail server refused the verification request"],
  SMTP_UNREACHABLE: ["warning", "Could not connect to the mail server"],
  SMTP_NOT_VERIFIED: ["info", "Mailbox existence was not checked (SMTP verification is off)"],
  PROVIDER_ACCEPTS_ALL: ["info", "This provider accepts every recipient during SMTP, so the mailbox cannot be confirmed"],
  DISPOSABLE: ["critical", "Disposable (temporary) email provider"],
  ROLE_ACCOUNT: ["warning", "Role account (info@, support@, ...), usually shared by several people"],
  NO_REPLY_ADDRESS: ["warning", "No-reply address that is not meant to receive email"],
  PLACEHOLDER_ADDRESS: ["warning", "Looks like a placeholder or test address"],
  TYPO_SUSPECTED: ["warning", "The domain looks like a typo of a popular provider"],
  FREE_PROVIDER: ["info", "Free consumer mailbox provider"],
  DOMAIN_BLOCKLISTED: ["critical", "The domain is listed on a spam domain blocklist"],
  MX_IP_BLOCKLISTED: ["warning", "The domain's mail server IP is on a blocklist"],
  NEW_DOMAIN: ["warning", "The domain was registered very recently"],
  NO_SPF: ["info", "The domain publishes no SPF record"],
  NO_DMARC: ["info", "The domain publishes no DMARC policy"],
};

export function reason(code: ReasonCode, detail?: string): Reason {
  const [severity, message] = MESSAGES[code];
  return { code, severity, message: detail ? `${message}: ${detail}` : message };
}

export interface ScoreInput {
  syntax: SyntaxCheck;
  domain: DomainAnalysis | null;
  smtp: SmtpCheck;
  roleAccount: boolean;
  noReply: boolean;
  placeholder: boolean;
  newDomainThresholdDays: number;
}

export interface ScoreResult {
  verdict: Verdict;
  score: number;
  reasons: Reason[];
}

const DOMAIN_FAILURES: Partial<Record<string, ReasonCode>> = {
  not_found: "DOMAIN_NOT_FOUND",
  no_mail: "NO_MAIL_SERVER",
  null_mx: "NULL_MX",
  not_routable: "MX_NOT_ROUTABLE",
};

/**
 * Turns check results into a verdict, a 0–100 score and explanations.
 *
 * Verdict rules:
 *  - undeliverable: proven by syntax, DNS or an explicit SMTP rejection.
 *  - risky: deliverable, but sending is likely to hurt (disposable, typo,
 *    catch-all, blocklisted domain, ...).
 *  - deliverable: the mail server accepted the recipient and nothing else
 *    is wrong.
 *  - unknown: nothing bad found, but the mailbox could not be confirmed.
 *
 * Recipient SPF/DMARC only describe how the domain *sends* mail; they are
 * reported but barely affect the score.
 */
export function score(input: ScoreInput): ScoreResult {
  const reasons: Reason[] = [];

  if (!input.syntax.valid) {
    return {
      verdict: "undeliverable",
      score: 0,
      reasons: [reason("INVALID_SYNTAX", input.syntax.error)],
    };
  }

  const d = input.domain;
  if (d?.reserved) {
    return { verdict: "undeliverable", score: 0, reasons: [reason("RESERVED_DOMAIN")] };
  }

  let hard = false;
  let risky = false;
  let base = 75;
  let penalty = 0;
  let cap = 100;

  if (d) {
    const failure = DOMAIN_FAILURES[d.mail.status];
    if (failure) {
      reasons.push(reason(failure));
      hard = true;
    } else if (d.mail.status === "dns_error") {
      reasons.push(reason("DNS_ERROR", d.mail.error));
      base = 50;
    } else if (d.mail.implicitMx) {
      reasons.push(reason("IMPLICIT_MX"));
      penalty += 5;
    }
  }

  const smtp = input.smtp;
  switch (smtp.status) {
    case "rejected":
      reasons.push(reason("MAILBOX_NOT_FOUND", smtp.message));
      hard = true;
      break;
    case "disabled":
      reasons.push(reason("MAILBOX_DISABLED", smtp.message));
      hard = true;
      break;
    case "full":
      reasons.push(reason("MAILBOX_FULL"));
      risky = true;
      cap = Math.min(cap, 30);
      break;
    case "accepted":
      if (smtp.catchAll) {
        reasons.push(reason("CATCH_ALL"));
        risky = true;
        base = 60;
      } else {
        reasons.push(reason("MAILBOX_ACCEPTED"));
        base = 95;
      }
      break;
    case "temporary_failure":
      reasons.push(reason("SMTP_TEMPORARY_FAILURE"));
      base = Math.min(base, 65);
      break;
    case "blocked":
      reasons.push(reason("SMTP_BLOCKED"));
      base = Math.min(base, 65);
      break;
    case "unreachable":
      reasons.push(reason("SMTP_UNREACHABLE"));
      base = Math.min(base, 60);
      break;
    case "skipped":
      if (smtp.skipReason === "unreliable_provider") reasons.push(reason("PROVIDER_ACCEPTS_ALL"));
      else if (smtp.skipReason === "disabled" || smtp.skipReason === "port_unavailable") {
        reasons.push(reason("SMTP_NOT_VERIFIED"));
      }
      break;
  }

  if (d?.disposable) {
    reasons.push(reason("DISPOSABLE"));
    risky = true;
    cap = Math.min(cap, 10);
  }
  if (d?.typoSuggestion) {
    reasons.push(reason("TYPO_SUSPECTED", `did you mean ${d.typoSuggestion}?`));
    risky = true;
    cap = Math.min(cap, 30);
  }
  if (input.placeholder) {
    reasons.push(reason("PLACEHOLDER_ADDRESS"));
    risky = true;
    cap = Math.min(cap, 30);
  }
  if (input.noReply) {
    reasons.push(reason("NO_REPLY_ADDRESS"));
    risky = true;
    cap = Math.min(cap, 30);
  }
  if (input.roleAccount) {
    reasons.push(reason("ROLE_ACCOUNT"));
    penalty += 15;
  }
  if (d?.freeProvider) reasons.push(reason("FREE_PROVIDER"));

  if (d && d.blocklists.domainListings.length > 0) {
    reasons.push(reason("DOMAIN_BLOCKLISTED", d.blocklists.domainListings.join(", ")));
    risky = true;
    cap = Math.min(cap, 25);
  }
  if (d && d.blocklists.ipListings.length > 0) {
    reasons.push(reason("MX_IP_BLOCKLISTED", d.blocklists.ipListings.join(", ")));
    penalty += 10;
  }
  if (d && d.domainAgeDays !== null && d.domainAgeDays < input.newDomainThresholdDays) {
    reasons.push(reason("NEW_DOMAIN", `${d.domainAgeDays} days old`));
    risky = true;
    penalty += 15;
  }
  if (d && !d.freeProvider) {
    if (d.spf.status === "none") reasons.push(reason("NO_SPF"));
    if (d.dmarc.status === "none") reasons.push(reason("NO_DMARC"));
    if (d.spf.status === "none" && d.dmarc.status === "none") penalty += 5;
  }

  if (hard) {
    // Informational notes (no SPF, not verified, ...) are noise next to a
    // definitive failure.
    const relevant = reasons.filter((r) => r.severity !== "info");
    return { verdict: "undeliverable", score: 0, reasons: sortReasons(relevant) };
  }

  const value = Math.max(0, Math.min(cap, base - penalty));
  let verdict: Verdict;
  if (risky) verdict = "risky";
  else if (smtp.status === "accepted") verdict = "deliverable";
  else verdict = "unknown";

  return { verdict, score: Math.round(value), reasons: sortReasons(reasons) };
}

const ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

function sortReasons(reasons: Reason[]): Reason[] {
  return [...reasons].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
