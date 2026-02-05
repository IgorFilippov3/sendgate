import {
  SpfResult,
  DmarcResult,
  MxResult,
  ReputationResult,
  DetailedAnalysis,
  CategoryResult,
  BehavioralResult,
} from "./types";
import { CONFIG } from "./config";

/**
 * Calculates a comprehensive risk score and grade based on all analysis categories.
 * 
 * The scoring logic:
 * 1. Evaluates four categories: Auth, Infrastructure, Reputation, and Behavioral.
 * 2. Applies penalties if any single category score falls below a critical threshold.
 * 3. Weights the scores based on the global CONFIG.
 * 4. Assigns a letter grade (A-F) and predicts bounce rates.
 * 
 * @param spf - Result of SPF analysis.
 * @param dmarc - Result of DMARC analysis.
 * @param mx - Result of MX/Infrastructure analysis.
 * @param reputation - Result of Reputation/Blacklist analysis.
 * @param behavioral - Result of Behavioral/Pattern analysis.
 * @param isPublicProvider - Whether the domain is a known public provider (e.g., Gmail).
 * @returns A DetailedAnalysis object containing the final score, grade, and recommendations.
 */
export function calculateAnalysis(
  spf: SpfResult,
  dmarc: DmarcResult,
  mx: MxResult,
  reputation: ReputationResult,
  behavioral: BehavioralResult,
  isPublicProvider: boolean = false,
): DetailedAnalysis {
  const recommendations: DetailedAnalysis["recommendations"] = [];

  const auth: CategoryResult = { score: 100, status: "pass", findings: [] };

  if (isPublicProvider) {
    auth.findings.push("Verified provider configuration");
  } else {
    if (!spf.exists) {
      auth.score = 0;
      auth.findings.push("Critical: No SPF identity found");
      recommendations.push({
        risk: "No SPF record detected. Sending from this domain will likely result in immediate blocks.",
        action: "Configure SPF to establish sender identity.",
        impact: "Critical",
      });
    } else if (spf.lookups > 10) {
      auth.score = Math.min(auth.score, 40);
      auth.findings.push("Warning: Complex SPF chain (>10 lookups)");
      recommendations.push({
        risk: "SPF lookup limit exceeded. Some receivers will fail authentication.",
        action: "Flatten your SPF record to stay under the 10-lookup limit.",
        impact: "High",
      });
    }

    if (!dmarc.exists) {
      auth.score = Math.min(auth.score, 50);
      auth.findings.push("Critical: No DMARC policy");
      recommendations.push({
        risk: "Missing DMARC policy. Domain is vulnerable to spoofing and lacks reputation signals.",
        action: "Implement DMARC (p=none) to secure the domain.",
        impact: "High",
      });
    }
  }

  const infra: CategoryResult = { score: 100, status: "pass", findings: [] };

  if (!mx.exists) {
    infra.score = 0;
    infra.findings.push("Critical: No active mail servers");
    recommendations.push({
      risk: "Domain has no valid MX records. All emails to/from this domain will bounce.",
      action: "Set up valid MX records for the domain.",
      impact: "Critical",
    });
  } else if (isPublicProvider) {
    infra.findings.push("Standard shared infrastructure");
  } else {
    const noTls = mx.records.filter((r) => !r.hasTls);
    if (noTls.length > 0) {
      infra.score = Math.min(infra.score, 60);
      infra.findings.push("Incomplete TLS encryption path");
    }
  }

  const rep: CategoryResult = { score: 100, status: "pass", findings: [] };

  if (reputation.blacklisted) {
    rep.score = 0;
    rep.findings.push("Critical: Listed on major blocklists");
    recommendations.push({
      risk: "Active blocklist entries detected. Direct impact on deliverability.",
      action:
        "Request removal from listed blacklists and investigate sending sources.",
      impact: "Critical",
    });
  }

  if (
    reputation.domainAgeDays !== null &&
    reputation.domainAgeDays < CONFIG.domainAgeThresholdDays &&
    !isPublicProvider
  ) {
    rep.score = Math.min(rep.score, 30);
    rep.findings.push(
      `Warning: Very new domain (<${CONFIG.domainAgeThresholdDays} days)`,
    );
    recommendations.push({
      risk: "Extremely young domain. Most ESPs will filter this as potential spam.",
      action: "Warm up the domain or use an established one for high volume.",
      impact: "High",
    });
  }

  const beh: CategoryResult = { score: 100, status: "pass", findings: [] };

  if (behavioral.isDisposable) {
    beh.score = 0;
    beh.findings.push("Critical: Disposable email provider");
    recommendations.push({
      risk: "Disposable email detected. These addresses expire quickly and cause hard bounces.",
      action: "Remove disposable emails from your list.",
      impact: "Critical",
    });
  }

  if (behavioral.isBlacklisted) {
    beh.score = 0;
    beh.findings.push("Critical: Test/Internal address detected");
    recommendations.push({
      risk: "Detected a reserved or internal testing address (e.g., example.com, test@).",
      action: "Remove placeholder addresses from your list.",
      impact: "Critical",
    });
  }

  if (behavioral.isTypo) {
    beh.score = Math.min(beh.score, 20);
    beh.findings.push("Critical: Likely domain typo");
    recommendations.push({
      risk: "Detected a likely typo in the domain name (e.g., gnail.com).",
      action: "Fix the typo or remove the address.",
      impact: "High",
    });
  }

  if (behavioral.isRoleBased) {
    beh.score = Math.min(beh.score, 60);
    beh.findings.push("Warning: Role-based address (admin/info/etc)");
    recommendations.push({
      risk: "Role-based addresses often lead to higher complaint rates.",
      action: "Use these addresses only if you have explicit consent.",
      impact: "Medium",
    });
  }

  if (behavioral.isCatchAll) {
    const catchAllPenalty = infra.score < 100 || rep.score < 100 ? 40 : 70;
    beh.score = Math.min(beh.score, catchAllPenalty);
    beh.findings.push(
      catchAllPenalty <= 50
        ? "Critical: Catch-all on unverified infrastructure"
        : "Warning: Catch-all configuration",
    );
    recommendations.push({
      risk: "Domain accepts all mail (catch-all), making individual verification unreliable.",
      action: "Verify these addresses through other means if possible.",
      impact: catchAllPenalty <= 50 ? "High" : "Medium",
    });
  }

  let totalScore: number;
  const lowestCategoryScore = Math.min(
    auth.score,
    infra.score,
    rep.score,
    beh.score,
  );

  if (lowestCategoryScore <= CONFIG.penaltyThreshold) {
    totalScore = Math.min(lowestCategoryScore, CONFIG.scoreThresholdCritical);
  } else {
    totalScore =
      auth.score * CONFIG.weightAuth +
      infra.score * CONFIG.weightInfra +
      rep.score * CONFIG.weightRep +
      beh.score * CONFIG.weightBeh;
  }

  totalScore = Math.max(0, Math.min(100, totalScore));

  let grade: DetailedAnalysis["grade"] = "F";
  if (totalScore >= CONFIG.scoreThresholdSafe) grade = "A";
  else if (totalScore >= CONFIG.scoreThresholdRisky) grade = "B";
  else if (totalScore >= CONFIG.scoreThresholdDangerous) grade = "C";
  else if (totalScore >= CONFIG.scoreThresholdCritical) grade = "D";

  let bounceMin = 0;
  let bounceMax = 0;

  if (totalScore >= CONFIG.scoreThresholdSafe) {
    bounceMin = 0.1;
    bounceMax = 1.0;
  } else if (totalScore >= CONFIG.scoreThresholdRisky) {
    bounceMin = 1.0;
    bounceMax = 3.5;
  } else if (totalScore >= CONFIG.scoreThresholdDangerous) {
    bounceMin = 3.5;
    bounceMax = 8.0;
  } else if (totalScore >= CONFIG.scoreThresholdCritical) {
    bounceMin = 8.0;
    bounceMax = 20.0;
  } else {
    bounceMin = 20.0;
    bounceMax = 65.0;
  }

  if (behavioral.isDisposable || !mx.exists) {
    bounceMin = 80;
    bounceMax = 100;
  }
  if (behavioral.isTypo) {
    bounceMin = Math.max(bounceMin, 50);
    bounceMax = Math.max(bounceMax, 90);
  }

  let repImpact: DetailedAnalysis["predictions"]["reputationImpact"] = "low";
  if (totalScore < CONFIG.scoreThresholdCritical) repImpact = "critical";
  else if (totalScore < CONFIG.scoreThresholdDangerous) repImpact = "high";
  else if (totalScore < CONFIG.scoreThresholdRisky) repImpact = "medium";

  return {
    score: Math.round(totalScore),
    grade,
    predictions: {
      expectedBounceRate: { min: bounceMin, max: bounceMax },
      reputationImpact: repImpact,
    },
    categories: {
      auth,
      infrastructure: infra,
      reputation: rep,
      behavioral: beh,
    },
    recommendations: recommendations.slice(0, 3),
  };
}
