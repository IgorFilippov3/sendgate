/**
 * Public result model of the verification engine.
 *
 * The central idea: a verdict is about the address, and "we could not check"
 * (unknown) is kept separate from "we checked and it is bad" (undeliverable).
 */

export type Verdict = "deliverable" | "risky" | "undeliverable" | "unknown";

export type Severity = "info" | "warning" | "critical";

export type ReasonCode =
  // Syntax
  | "INVALID_SYNTAX"
  // Domain / DNS
  | "DOMAIN_NOT_FOUND"
  | "NO_MAIL_SERVER"
  | "NULL_MX"
  | "MX_NOT_ROUTABLE"
  | "DNS_ERROR"
  | "IMPLICIT_MX"
  | "RESERVED_DOMAIN"
  // Mailbox (SMTP)
  | "MAILBOX_NOT_FOUND"
  | "MAILBOX_FULL"
  | "MAILBOX_DISABLED"
  | "MAILBOX_ACCEPTED"
  | "CATCH_ALL"
  | "SMTP_TEMPORARY_FAILURE"
  | "SMTP_BLOCKED"
  | "SMTP_UNREACHABLE"
  | "SMTP_NOT_VERIFIED"
  | "PROVIDER_ACCEPTS_ALL"
  // Address heuristics
  | "DISPOSABLE"
  | "ROLE_ACCOUNT"
  | "NO_REPLY_ADDRESS"
  | "PLACEHOLDER_ADDRESS"
  | "TYPO_SUSPECTED"
  | "FREE_PROVIDER"
  // Reputation
  | "DOMAIN_BLOCKLISTED"
  | "MX_IP_BLOCKLISTED"
  | "NEW_DOMAIN"
  // Domain authentication (informational for recipients)
  | "NO_SPF"
  | "NO_DMARC";

export interface Reason {
  code: ReasonCode;
  severity: Severity;
  message: string;
}

export type SyntaxCheck =
  | {
      valid: true;
      local: string;
      /** ASCII (punycode) form of the domain, lowercased. */
      domain: string;
    }
  | { valid: false; error: string };

export interface MailHost {
  exchange: string;
  priority: number;
  addresses: string[];
}

export type DomainStatus =
  | "ok"
  | "not_found"
  | "no_mail"
  | "null_mx"
  | "not_routable"
  | "dns_error";

export interface DomainMailCheck {
  status: DomainStatus;
  /** True when no MX exists and the A/AAAA record is used (RFC 5321 §5.1). */
  implicitMx: boolean;
  hosts: MailHost[];
  error?: string;
}

export interface SpfCheck {
  status: "none" | "valid" | "permerror" | "error";
  record: string | null;
  lookups: number;
  allQualifier: "+" | "-" | "~" | "?" | null;
  warnings: string[];
}

export interface DmarcCheck {
  status: "none" | "found" | "invalid" | "error";
  record: string | null;
  policy: "none" | "quarantine" | "reject" | null;
  subdomainPolicy: "none" | "quarantine" | "reject" | null;
}

export type ListingStatus = "ok" | "partial" | "unavailable" | "skipped";

export interface BlocklistCheck {
  status: ListingStatus;
  domainListings: string[];
  ipListings: string[];
}

export type SmtpStatus =
  | "skipped"
  | "accepted"
  | "rejected"
  | "full"
  | "disabled"
  | "temporary_failure"
  | "blocked"
  | "unreachable";

export interface SmtpCheck {
  status: SmtpStatus;
  /** Why the probe was skipped, if it was. */
  skipReason?:
    | "disabled"
    | "port_unavailable"
    | "no_mail_server"
    | "unreliable_provider"
    | "non_ascii_address";
  /** Basic reply code of the RCPT command. */
  code?: number;
  /** Enhanced status code, e.g. 5.1.1. */
  enhancedCode?: string;
  /** Server reply text, trimmed. */
  message?: string;
  mx?: string;
  catchAll: boolean | null;
  startTls: boolean | null;
}

export interface DomainAnalysis {
  domain: string;
  mail: DomainMailCheck;
  spf: SpfCheck;
  dmarc: DmarcCheck;
  blocklists: BlocklistCheck;
  domainAgeDays: number | null;
  disposable: boolean;
  /** Matched by MX host rather than by domain name. */
  disposableByMx: boolean;
  freeProvider: boolean;
  reserved: boolean;
  typoSuggestion: string | null;
}

export interface EmailVerification {
  /** Address as submitted, trimmed. */
  input: string;
  /** Lowercase address with ASCII domain, or null if syntax is invalid. */
  email: string | null;
  domain: string | null;
  verdict: Verdict;
  /** 0–100. Higher is safer to send. */
  score: number;
  reasons: Reason[];
  /** "Did you mean" correction for likely typos. */
  suggestion: string | null;
  checks: {
    syntax: SyntaxCheck;
    roleAccount: boolean;
    noReply: boolean;
    placeholder: boolean;
    smtp: SmtpCheck;
    domain: DomainAnalysis | null;
  };
}

export interface BatchSummary {
  total: number;
  unique: number;
  duplicates: number;
  invalid: number;
  verdicts: Record<Verdict, number>;
  reasons: Partial<Record<ReasonCode, number>>;
}

export interface BatchResult {
  summary: BatchSummary;
  results: EmailVerification[];
}
