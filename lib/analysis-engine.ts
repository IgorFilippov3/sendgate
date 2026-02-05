import { analyzeSPF } from "./engine/scanners/spf";
import { analyzeDMARC } from "./engine/scanners/dmarc";
import {
  analyzeInfrastructure,
  probeCatchAll,
} from "./engine/scanners/mx";
import { analyzeReputation } from "./engine/scanners/reputation";
import {
  analyzeBehavioral,
  checkRoleBased,
  checkDomainTypo,
  checkDisposable,
  checkBlacklisted,
} from "./engine/scanners/behavioral";
import { calculateAnalysis } from "./engine/scoring";
import {
  DetailedAnalysis,
  RiskLevel,
  BehavioralResult,
} from "./engine/types";
import { normalizeEmail } from "./utils/email-normalization";

/**
 * Represents the risk analysis result for a specific domain.
 */
export interface DomainAnalysis {
  /** The domain being analyzed */
  domain: string;
  /** Number of emails found for this domain in the current list */
  count: number;
  /** Categorized risk level (safe, risky, dangerous) */
  risk: RiskLevel;
  /** Detailed breakdown of technical and behavioral checks */
  analysis: DetailedAnalysis;
}

/**
 * Represents the simplified result for an individual email address.
 */
export interface EmailResult {
  /** The normalized email address */
  email: string;
  /** The domain part of the email */
  domain: string;
  /** True if the email is a role-based address (e.g., info@, admin@) */
  isRoleBased?: boolean;
  /** True if the domain appears to be a common typo (e.g., gnail.com) */
  isTypo?: boolean;
  /** True if the domain is a known disposable email provider */
  isDisposable?: boolean;
  /** True if the email or domain is on a local blacklist */
  isBlacklisted?: boolean;
}

/**
 * Summary of the entire email list analysis.
 */
export interface AnalysisSummary {
  /** Total number of unique valid emails processed */
  totalEmails: number;
  /** Number of unique domains found in the list */
  uniqueDomains: number;
  /** Statistical predictions based on the analysis results */
  predictions: {
    /** Estimated bounce rate range */
    expectedBounceRate: { min: number; max: number };
    /** Predicted impact on the sender's domain reputation */
    overallReputationImpact: "low" | "medium" | "high" | "critical";
    /** Suggested daily volume limits for warming up the domain */
    warmupPlan?: {
      day: number;
      count: number;
      segment: string;
    }[];
    /** Statistics about the cleanup process */
    stats?: {
      duplicatesRemoved: number;
      invalidEmailsRemoved: number;
    };
  };
  /** Counts of emails categorized by risk level */
  segments: {
    safe: number;
    risky: number;
    dangerous: number;
  };
  /** Metrics on data cleaning performed during analysis */
  stats: {
    duplicatesRemoved: number;
    invalidEmailsRemoved: number;
  };
  /** Detailed analysis results grouped by domain */
  details: DomainAnalysis[];
  /** List of individual email analysis results */
  emails: EmailResult[];
}

const PUBLIC_PROVIDERS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "mail.ru",
  "yandex.ru",
]);

/**
 * Processes a list of email addresses and performs a comprehensive risk analysis.
 * 
 * The analysis includes:
 * - Email normalization and deduplication
 * - DNS infrastructure checks (MX, SPF, DMARC)
 * - Domain reputation lookups against public blocklists
 * - Behavioral heuristics (disposable detection, role-based checks, typos)
 * - Probabilistic bounce rate estimation
 * 
 * @param emails - Array of raw email address strings to analyze.
 * @returns A promise resolving to a detailed AnalysisSummary.
 */
export async function analyzeEmailList(
  emails: string[],
): Promise<AnalysisSummary> {
  const uniqueEmailsMap = new Map<string, EmailResult>();
  let duplicatesRemoved = 0;
  let invalidEmailsRemoved = 0;

  for (const rawEmail of emails) {
    if (!rawEmail || !rawEmail.includes("@")) {
      invalidEmailsRemoved++;
      continue;
    }

    const { key, normalized } = normalizeEmail(rawEmail);

    if (uniqueEmailsMap.has(key)) {
      duplicatesRemoved++;
      continue;
    }

    const domain = normalized.split("@")[1];
    uniqueEmailsMap.set(key, {
      email: normalized,
      domain: domain,
      isRoleBased: checkRoleBased(normalized),
      isTypo: checkDomainTypo(domain),
      isDisposable: checkDisposable(domain),
      isBlacklisted: checkBlacklisted(normalized, domain),
    });
  }

  const normalizedEmails = Array.from(uniqueEmailsMap.values());
  const domainGroups = new Map<string, string[]>();

  for (const item of normalizedEmails) {
    if (!domainGroups.has(item.domain)) {
      domainGroups.set(item.domain, []);
    }
    domainGroups.get(item.domain)!.push(item.email);
  }

  const domains = Array.from(domainGroups.keys());

  const details = await Promise.all(
    domains.map(async (domain): Promise<DomainAnalysis> => {
      const emailsInDomain = domainGroups.get(domain) || [];
      const count = emailsInDomain.length;
      const isPublic = PUBLIC_PROVIDERS.has(domain);

      const [spf, dmarc, infra] = await Promise.all([
        analyzeSPF(domain),
        analyzeDMARC(domain),
        analyzeInfrastructure(domain),
      ]);

      const mxIps = infra.records.flatMap((r) => r.ipAddresses);
      const mxExchanges = infra.records.map((r) => r.exchange);
      const reputation = await analyzeReputation(domain, mxIps);

      let isCatchAll = false;
      if (!isPublic && infra.exists && infra.records.length > 0) {
        isCatchAll = await probeCatchAll(infra.records[0].exchange, domain);
      }

      const behavioral: BehavioralResult = await analyzeBehavioral(
        emailsInDomain[0],
        domain,
        mxExchanges,
        isCatchAll,
      );

      const analysis = calculateAnalysis(
        spf,
        dmarc,
        infra,
        reputation,
        behavioral,
        isPublic,
      );

      let risk: RiskLevel = "dangerous";
      if (analysis.score >= 75) {
        risk = "safe";
      } else if (analysis.score >= 60) {
        risk = "risky";
      } else {
        risk = "dangerous";
      }

      return {
        domain,
        count,
        risk,
        analysis,
      };
    }),
  );

  const segments: { [key in RiskLevel]: number } = {
    safe: 0,
    risky: 0,
    dangerous: 0,
  };
  for (const detail of details) {
    segments[detail.risk] += detail.count;
  }

  const weightedBounceMin =
    details.reduce(
      (acc, d) => acc + d.analysis.predictions.expectedBounceRate.min * d.count,
      0,
    ) / normalizedEmails.length;
  const weightedBounceMax =
    details.reduce(
      (acc, d) => acc + d.analysis.predictions.expectedBounceRate.max * d.count,
      0,
    ) / normalizedEmails.length;

  const impactScores = { low: 0, medium: 1, high: 2, critical: 3 };
  const maxImpactIdx = details.reduce(
    (max, d) =>
      Math.max(max, impactScores[d.analysis.predictions.reputationImpact]),
    0,
  );
  const impactLabels: ("low" | "medium" | "high" | "critical")[] = [
    "low",
    "medium",
    "high",
    "critical",
  ];

  const stats = {
    duplicatesRemoved,
    invalidEmailsRemoved,
  };

  const predictions: AnalysisSummary["predictions"] = {
    expectedBounceRate: {
      min: Number(weightedBounceMin.toFixed(1)),
      max: Number(weightedBounceMax.toFixed(1)),
    },
    overallReputationImpact: impactLabels[maxImpactIdx],
    warmupPlan: [],
    stats: stats,
  };

  const summary: AnalysisSummary = {
    totalEmails: normalizedEmails.length,
    uniqueDomains: domains.length,
    segments,
    stats,
    details,
    emails: normalizedEmails,
    predictions,
  };

  summary.predictions.warmupPlan = generateWarmupPlan(summary);

  return summary;
}

/**
 * Performs a real-time risk analysis for a single email address.
 * 
 * Useful for real-time validation in signup forms or lead capture widgets.
 * Performs deep infrastructure and behavioral scans for the specific domain.
 * 
 * @param rawEmail - The raw email address string to analyze.
 * @returns A promise resolving to the domain analysis combined with the normalized email.
 * @throws Error if the email format is invalid.
 */
export async function analyzeSingleEmail(
  rawEmail: string,
): Promise<DomainAnalysis & { email: string }> {
  if (!rawEmail || !rawEmail.includes("@")) {
    throw new Error("Invalid email format");
  }

  const { normalized } = normalizeEmail(rawEmail);
  const domain = normalized.split("@")[1];
  const isPublic = PUBLIC_PROVIDERS.has(domain);

  const [spf, dmarc, infra] = await Promise.all([
    analyzeSPF(domain),
    analyzeDMARC(domain),
    analyzeInfrastructure(domain),
  ]);

  const mxIps = infra.records.flatMap((r) => r.ipAddresses);
  const mxExchanges = infra.records.map((r) => r.exchange);
  const reputation = await analyzeReputation(domain, mxIps);

  let isCatchAll = false;
  if (!isPublic && infra.exists && infra.records.length > 0) {
    isCatchAll = await probeCatchAll(infra.records[0].exchange, domain);
  }

  const behavioral = await analyzeBehavioral(
    normalized,
    domain,
    mxExchanges,
    isCatchAll,
  );

  const analysis = calculateAnalysis(
    spf,
    dmarc,
    infra,
    reputation,
    behavioral,
    isPublic,
  );

  let risk: RiskLevel = "dangerous";
  if (analysis.score >= 75) {
    risk = "safe";
  } else if (analysis.score >= 60) {
    risk = "risky";
  }

  return {
    email: normalized,
    domain,
    count: 1,
    risk,
    analysis,
  };
}

/**
 * Generates a recommended volume ramp-up plan based on the number of "safe" emails found.
 * 
 * @param summary - The analysis summary to base the plan on.
 * @returns An array of objects representing daily sending volume targets.
 */
function generateWarmupPlan(summary: AnalysisSummary) {
  const safeCount = summary.segments.safe;
  if (safeCount === 0) return [];

  const plan = [];
  const startCount = Math.min(safeCount, 500);

  plan.push({ day: 1, count: startCount, segment: "Safe" });

  let currentDay = 2;
  let currentCount = startCount * 2;

  while (currentCount < safeCount && currentDay <= 5) {
    plan.push({ day: currentDay, count: currentCount, segment: "Safe" });
    currentCount *= 2;
    currentDay++;
  }

  if (currentCount >= safeCount || currentDay === 6) {
    const lastDayIdx = plan.length - 1;
    if (plan[lastDayIdx].count < safeCount) {
      plan.push({ day: currentDay, count: safeCount, segment: "Safe (Full)" });
    }
  }

  return plan;
}
