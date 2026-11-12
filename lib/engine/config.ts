/**
 * SendGate configuration.
 *
 * Every value can be overridden with an environment variable. Invalid values
 * fall back to the default instead of producing NaN.
 */

type Env = Record<string, string | undefined>;

function num(env: Env, key: string, fallback: number, min = 0): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min ? value : fallback;
}

function bool(env: Env, key: string, fallback: boolean): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function list(env: Env, key: string, fallback: string[]): string[] {
  const raw = env[key];
  if (raw === undefined) return fallback;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function str(env: Env, key: string, fallback: string): string {
  const raw = env[key]?.trim();
  return raw ? raw : fallback;
}

export function loadConfig(env: Env = process.env) {
  const smtpHeloName = str(env, "SMTP_HELO_NAME", "");
  const spamhausKey = env.SPAMHAUS_DQS_KEY?.trim() || "";

  return {
    // --- App ---
    appVersion: str(env, "APP_VERSION", "0.2.0"),
    appBaseUrl: str(
      env,
      "APP_BASE_URL",
      str(env, "NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
    ),
    apiKey: env.SENDGATE_API_KEY?.trim() || null,

    // --- Limits ---
    maxBulkEmails: num(env, "MAX_BULK_EMAILS", 100, 1),
    maxFileSizeMb: num(env, "MAX_FILE_SIZE_MB", 5, 0.1),
    /** Requests per minute per client IP for the web UI and API. 0 disables. */
    rateLimitPerMinute: num(env, "RATE_LIMIT_PER_MINUTE", 30),
    /** Max domains analysed in parallel within one batch. */
    domainConcurrency: num(env, "DOMAIN_CONCURRENCY", 8, 1),

    // --- DNS ---
    /** Empty list = use the system resolver. */
    dnsServers: list(env, "DNS_SERVERS", []),
    dnsTimeoutMs: num(env, "DNS_TIMEOUT", 2500, 100),
    dnsTries: num(env, "DNS_RETRIES", 2, 0) + 1,

    // --- Cache ---
    /** TTL for cached per-domain results, seconds. 0 disables the cache. */
    domainCacheTtlSec: num(env, "DOMAIN_CACHE_TTL", 900),
    domainCacheSize: num(env, "DOMAIN_CACHE_SIZE", 5000, 1),

    // --- SMTP mailbox verification ---
    smtpProbeEnabled: bool(env, "SMTP_PROBE_ENABLED", false) && !!smtpHeloName,
    smtpProbeRequested: bool(env, "SMTP_PROBE_ENABLED", false),
    /** Hostname used in EHLO. Must resolve to this server and match its PTR. */
    smtpHeloName,
    /** Envelope sender used in MAIL FROM. Defaults to verify@<helo name>. */
    smtpMailFrom: str(
      env,
      "SMTP_MAIL_FROM",
      smtpHeloName ? `verify@${smtpHeloName}` : "",
    ),
    smtpPort: num(env, "SMTP_PORT", 25, 1),
    smtpConnectTimeoutMs: num(env, "SMTP_CONNECT_TIMEOUT", 8000, 500),
    smtpCommandTimeoutMs: num(env, "SMTP_COMMAND_TIMEOUT", 10000, 500),
    /** Max simultaneous SMTP sessions for the whole process. */
    smtpConcurrency: num(env, "SMTP_CONCURRENCY", 5, 1),
    /** Max RCPT commands sent in a single SMTP session. */
    smtpMaxRcptPerSession: num(env, "SMTP_MAX_RCPT_PER_SESSION", 20, 1),
    /** Try STARTTLS when the server offers it. */
    smtpUseStartTls: bool(env, "SMTP_STARTTLS", true),

    // --- Disposable domains ---
    disposableAutoUpdate: bool(env, "DISPOSABLE_AUTO_UPDATE", true),
    disposableUpdateIntervalHours: num(
      env,
      "DISPOSABLE_UPDATE_INTERVAL_HOURS",
      24,
      1,
    ),
    disposableSourceUrl: str(
      env,
      "DISPOSABLE_SOURCE_URL",
      "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf",
    ),

    // --- Reputation ---
    /**
     * DNS blocklists for domains. Spamhaus public mirrors refuse queries that
     * come through big public resolvers (8.8.8.8, 1.1.1.1); set
     * SPAMHAUS_DQS_KEY to use the free Data Query Service instead.
     */
    domainBlocklists: list(
      env,
      "DOMAIN_BLOCKLISTS",
      spamhausKey ? [`${spamhausKey}.dbl.dq.spamhaus.net`] : ["dbl.spamhaus.org"],
    ),
    ipBlocklists: list(
      env,
      "IP_BLOCKLISTS",
      spamhausKey
        ? [`${spamhausKey}.zen.dq.spamhaus.net`, "bl.spamcop.net"]
        : ["zen.spamhaus.org", "bl.spamcop.net"],
    ),
    domainAgeThresholdDays: num(env, "DOMAIN_AGE_THRESHOLD_DAYS", 30),
    rdapEnabled: bool(env, "RDAP_ENABLED", true),
    rdapTimeoutMs: num(env, "RDAP_TIMEOUT", 3000, 100),
  };
}

export type Config = ReturnType<typeof loadConfig>;

export const CONFIG: Config = loadConfig();
