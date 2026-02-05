/**
 * Represents the overall risk assessment level for an email or domain.
 */
export type RiskLevel = "safe" | "risky" | "dangerous";

/**
 * Result of an analysis category (e.g., authentication, infrastructure).
 */
export interface CategoryResult {
  /** Numerical score for the category (0-100) */
  score: number;
  /** Pass/warn/fail status based on the score and findings */
  status: "pass" | "warn" | "fail";
  /** List of specific observations or issues found */
  findings: string[];
}

/**
 * Comprehensive analysis result including scores, predictions, and recommendations.
 */
export interface DetailedAnalysis {
  /** Overall calculated score (0-100) */
  score: number;
  /** Letter grade based on the score (A-F) */
  grade: "A" | "B" | "C" | "D" | "F";
  /** Predictive metrics for deliverability */
  predictions: {
    /** Estimated probability of email bouncing */
    expectedBounceRate: { min: number; max: number };
    /** Potential impact on sender reputation */
    reputationImpact: "low" | "medium" | "high" | "critical";
  };
  /** Breakdown of results by analysis category */
  categories: {
    /** SPF and DMARC verification */
    auth: CategoryResult;
    /** MX records and server configuration */
    infrastructure: CategoryResult;
    /** Blocklist status and domain age */
    reputation: CategoryResult;
    /** Disposable detection, role-based checks, and patterns */
    behavioral: CategoryResult;
  };
  /** Actionable steps to improve deliverability */
  recommendations: {
    /** Description of the identified risk */
    risk: string;
    /** Suggested corrective action */
    action: string;
    /** Severity of the risk (e.g., Critical, High, Medium) */
    impact: string;
  }[];
}

/**
 * Results of SPF (Sender Policy Framework) record analysis.
 */
export interface SpfResult {
  /** Whether an SPF record was found */
  exists: boolean;
  /** The raw SPF record string */
  record: string | null;
  /** Number of DNS lookups required to evaluate the record */
  lookups: number;
  /** Whether the policy is strictly enforced (-all) */
  isStrict: boolean;
  /** List of potential issues or warnings */
  warnings: string[];
}

/**
 * Results of DMARC (Domain-based Message Authentication, Reporting, and Conformance) analysis.
 */
export interface DmarcResult {
  /** Whether a DMARC record was found */
  exists: boolean;
  /** The raw DMARC record string */
  record: string | null;
  /** Configured policy (none, quarantine, reject) */
  policy: "none" | "quarantine" | "reject" | "unknown";
  /** Alignment mode for SPF/DKIM */
  alignment: "strict" | "relaxed";
}

/**
 * Results of MX (Mail Exchanger) record analysis.
 */
export interface MxResult {
  /** Whether valid MX records were found */
  exists: boolean;
  /** List of detected mail servers */
  records: {
    /** Hostname of the mail server */
    exchange: string;
    /** Priority level of the server */
    priority: number;
    /** Whether the server supports TLS encryption */
    hasTls: boolean;
    /** List of IP addresses associated with the exchange */
    ipAddresses: string[];
  }[];
}

/**
 * Results of reputation and blocklist checks.
 */
export interface ReputationResult {
  /** Whether the domain or its IPs are blacklisted */
  blacklisted: boolean;
  /** List of specific blocklists where entries were found */
  listings: string[];
  /** Calculated age of the domain in days */
  domainAgeDays: number | null;
}

/**
 * Results of behavioral and pattern-based heuristics.
 */
export interface BehavioralResult {
  /** Whether the email is a role-based address (e.g., support@) */
  isRoleBased: boolean;
  /** Whether the domain belongs to a disposable email provider */
  isDisposable: boolean;
  /** Whether the domain appears to be a common typo */
  isTypo: boolean;
  /** Whether the email or domain is on a local blacklist */
  isBlacklisted: boolean;
  /** Whether the domain is configured as a catch-all */
  isCatchAll: boolean;
  /** Detailed findings from behavioral analysis */
  details: string[];
}
