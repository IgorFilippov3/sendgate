/**
 * SendGate Configuration Utility
 * Handles environment variables with default fallbacks for self-hosted instances.
 */
export const CONFIG = {
  /** Maximum number of emails allowed in a single bulk analysis request */
  maxBulkEmails: Number(process.env.MAX_BULK_EMAILS) || 100,
  /** Maximum allowed file size for CSV uploads in megabytes */
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB) || 5,

  /** Current application version */
  appVersion: process.env.APP_VERSION || "0.1.0",
  /** Base URL for the application, used for metadata and absolute links */
  appBaseUrl:
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000",
  /** List of DNS servers to use for infrastructure lookups */
  dnsServers: process.env.DNS_SERVERS
    ? process.env.DNS_SERVERS.split(",")
    : ["8.8.8.8", "1.1.1.1", "9.9.9.9"],
  /** Timeout in milliseconds for DNS queries */
  dnsTimeout: Number(process.env.DNS_TIMEOUT) || 2500,
  /** Number of retries for failed DNS queries */
  dnsRetries: Number(process.env.DNS_RETRIES) || 2,

  /** Minimum age of a domain in days to be considered established */
  domainAgeThresholdDays: Number(process.env.DOMAIN_AGE_THRESHOLD_DAYS) || 30,
  /** Timeout in milliseconds for RDAP (domain age) lookups */
  rdapTimeout: Number(process.env.RDAP_TIMEOUT) || 3000,

  /** Weight of authentication (SPF/DMARC) in the total score (0.0 to 1.0) */
  weightAuth: Number(process.env.WEIGHT_AUTH) || 0.3,
  /** Weight of infrastructure (MX/TLS) in the total score (0.0 to 1.0) */
  weightInfra: Number(process.env.WEIGHT_INFRA) || 0.2,
  /** Weight of reputation (Blacklists/Age) in the total score (0.0 to 1.0) */
  weightRep: Number(process.env.WEIGHT_REP) || 0.2,
  /** Weight of behavioral heuristics in the total score (0.0 to 1.0) */
  weightBeh: Number(process.env.WEIGHT_BEH) || 0.3,

  /** Score above which an email is considered 'safe' */
  scoreThresholdSafe: Number(process.env.SCORE_THRESHOLD_SAFE) || 90,
  /** Score above which an email is considered 'risky' but not yet dangerous */
  scoreThresholdRisky: Number(process.env.SCORE_THRESHOLD_RISKY) || 75,
  /** Score above which an email is considered 'dangerous' */
  scoreThresholdDangerous: Number(process.env.SCORE_THRESHOLD_DANGEROUS) || 60,
  /** Score below which an email is considered in 'critical' condition */
  scoreThresholdCritical: Number(process.env.SCORE_THRESHOLD_CRITICAL) || 40,
  /** Minimum category score before applying a global penalty to the total score */
  penaltyThreshold: Number(process.env.PENALTY_THRESHOLD) || 50,

  /** Whether to automatically fetch updated disposable domain lists */
  disposableAutoUpdate: process.env.DISPOSABLE_AUTO_UPDATE !== "false",
  /** Interval in hours for updating the disposable domains list */
  disposableUpdateIntervalHours:
    Number(process.env.DISPOSABLE_UPDATE_INTERVAL_HOURS) || 24,
  /** Remote URL for the disposable domains blocklist */
  disposableSourceUrl:
    process.env.DISPOSABLE_SOURCE_URL ||
    "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf",

  /** Secret key for REST API authentication */
  apiKey: process.env.SENDGATE_API_KEY || null,
};
