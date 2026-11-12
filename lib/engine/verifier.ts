import type { Config } from "./config";
import type { DnsClient } from "./net/dns";
import { recordsOf } from "./net/dns";
import type { SmtpConnector } from "./net/smtp";
import { checkSyntax, dedupKey } from "./checks/syntax";
import {
  isNoReply,
  isPlaceholder,
  isReservedDomain,
  isRoleAccount,
  suggestDomain,
} from "./checks/address";
import { providerInfo } from "./checks/providers";
import type { DisposableList } from "./checks/disposable";
import { resolveMailHosts } from "./checks/mail-hosts";
import { checkDmarc, checkSpf } from "./checks/auth";
import { checkBlocklists, domainAgeDays } from "./checks/reputation";
import { probeMailboxes, type RcptOutcome } from "./checks/smtp-probe";
import { score } from "./scoring";
import { TtlCache, createLimiter } from "./util/cache";
import type {
  BatchResult,
  BatchSummary,
  DomainAnalysis,
  EmailVerification,
  ReasonCode,
  SmtpCheck,
  Verdict,
} from "./types";

export interface VerifierDeps {
  config: Config;
  dns: DnsClient;
  smtpConnector: SmtpConnector;
  disposable: DisposableList;
  /** Used for RDAP lookups. */
  fetchFn?: typeof fetch;
  now?: () => number;
}

/** Host used to check whether outbound port 25 works at all. */
const PORT_CHECK_HOST = "gmail-smtp-in.l.google.com";
const PORT_CHECK_TTL_MS = 10 * 60_000;
/** DNS failures are cached briefly so a flapping resolver can recover. */
const ERROR_CACHE_TTL_MS = 60_000;
/**
 * A domain that always has MX records. If it fails to resolve too, an
 * NXDOMAIN answer says more about the resolver than about the domain.
 */
const DNS_CANARY = "gmail.com";
const CANARY_TTL_MS = 60_000;

export interface SmtpCapability {
  enabled: boolean;
  available: boolean | null;
  reason: string | null;
}

export function createVerifier(deps: VerifierDeps) {
  const { config, dns, disposable } = deps;
  const now = deps.now ?? Date.now;
  const cache = new TtlCache<DomainAnalysis>(config.domainCacheSize, now);
  const inflight = new Map<string, Promise<DomainAnalysis>>();
  const smtpLimit = createLimiter(config.smtpConcurrency);
  const domainLimit = createLimiter(config.domainConcurrency);
  let portCheck: { ok: boolean; at: number; pending?: Promise<boolean> } | null = null;
  let canary: { ok: boolean; at: number } | null = null;

  async function resolverHealthy(): Promise<boolean> {
    if (canary && now() - canary.at < CANARY_TTL_MS) return canary.ok;
    const res = await dns.mx(DNS_CANARY);
    canary = { ok: res.status === "ok", at: now() };
    return canary.ok;
  }

  async function analyzeDomainUncached(domain: string): Promise<DomainAnalysis> {
    const provider = providerInfo(domain);
    const base: DomainAnalysis = {
      domain,
      mail: { status: "ok", implicitMx: false, hosts: [] },
      spf: { status: "none", record: null, lookups: 0, allQualifier: null, warnings: [] },
      dmarc: { status: "none", record: null, policy: null, subdomainPolicy: null },
      blocklists: { status: "skipped", domainListings: [], ipListings: [] },
      domainAgeDays: null,
      disposable: false,
      disposableByMx: false,
      freeProvider: provider?.free ?? false,
      reserved: isReservedDomain(domain),
      typoSuggestion: suggestDomain(domain),
    };
    if (base.reserved) {
      base.mail = { status: "not_found", implicitMx: false, hosts: [] };
      return base;
    }

    const disposableByName = disposable.isDisposableDomain(domain);
    const [mail, spf, dmarc] = await Promise.all([
      resolveMailHosts(dns, domain),
      checkSpf(dns, domain),
      checkDmarc(dns, domain),
    ]);
    // Never call a domain non-existent on the word of a broken resolver.
    if (mail.status === "not_found" && !(await resolverHealthy())) {
      base.mail = {
        status: "dns_error",
        implicitMx: false,
        hosts: [],
        error: "Resolver returned NXDOMAIN for a known-good domain",
      };
      return base;
    }
    base.mail = mail;
    base.spf = spf;
    base.dmarc = dmarc;

    const exchanges = mail.hosts.map((h) => h.exchange);
    base.disposableByMx = !disposableByName && disposable.isDisposableMx(exchanges);
    base.disposable = disposableByName || base.disposableByMx;

    // Large providers are well known: skip reputation lookups for them.
    if (!provider && mail.status === "ok") {
      const [blocklists, age] = await Promise.all([
        checkBlocklists(
          dns,
          domain,
          mail.hosts.flatMap((h) => h.addresses),
          { domain: config.domainBlocklists, ip: config.ipBlocklists },
        ),
        config.rdapEnabled
          ? domainAgeDays(domain, { timeoutMs: config.rdapTimeoutMs, fetchFn: deps.fetchFn, now: now() })
          : Promise.resolve(null),
      ]);
      base.blocklists = blocklists;
      base.domainAgeDays = age;
    }
    return base;
  }

  async function analyzeDomain(domain: string): Promise<DomainAnalysis> {
    const cached = cache.get(domain);
    if (cached) return cached;
    const running = inflight.get(domain);
    if (running) return running;

    const task = analyzeDomainUncached(domain)
      .then((result) => {
        const ttl =
          result.mail.status === "dns_error"
            ? Math.min(ERROR_CACHE_TTL_MS, config.domainCacheTtlSec * 1000)
            : config.domainCacheTtlSec * 1000;
        cache.set(domain, result, ttl);
        return result;
      })
      .finally(() => inflight.delete(domain));
    inflight.set(domain, task);
    return task;
  }

  async function checkPort(): Promise<boolean> {
    const a = recordsOf(await dns.a(PORT_CHECK_HOST));
    if (a.length === 0) return false;
    try {
      const session = await deps.smtpConnector({
        address: a[0],
        hostname: PORT_CHECK_HOST,
        port: config.smtpPort,
        connectTimeoutMs: config.smtpConnectTimeoutMs,
        commandTimeoutMs: config.smtpCommandTimeoutMs,
      });
      await session.close();
      return true;
    } catch {
      return false;
    }
  }

  /** Whether SMTP probing is configured and outbound port 25 works. */
  async function smtpCapability(): Promise<SmtpCapability> {
    if (!config.smtpProbeEnabled) {
      return {
        enabled: false,
        available: null,
        reason: config.smtpProbeRequested
          ? "SMTP_PROBE_ENABLED is set but SMTP_HELO_NAME is missing"
          : "SMTP verification is disabled",
      };
    }
    if (!portCheck || now() - portCheck.at > PORT_CHECK_TTL_MS) {
      if (!portCheck?.pending) {
        const pending = checkPort().then((ok) => {
          portCheck = { ok, at: now() };
          return ok;
        });
        portCheck = { ok: portCheck?.ok ?? false, at: portCheck?.at ?? 0, pending };
      }
      await portCheck.pending;
    }
    return portCheck!.ok
      ? { enabled: true, available: true, reason: null }
      : { enabled: true, available: false, reason: "Outbound port 25 is blocked on this host" };
  }

  function skipped(reason: SmtpCheck["skipReason"]): SmtpCheck {
    return { status: "skipped", skipReason: reason, catchAll: null, startTls: null };
  }

  async function smtpChecks(
    analysis: DomainAnalysis,
    addresses: { email: string; asciiLocal: boolean }[],
  ): Promise<Map<string, SmtpCheck>> {
    const out = new Map<string, SmtpCheck>();
    const capability = await smtpCapability();

    let blanket: SmtpCheck | null = null;
    if (!capability.enabled) blanket = skipped("disabled");
    else if (!capability.available) blanket = skipped("port_unavailable");
    else if (analysis.mail.status !== "ok") blanket = skipped("no_mail_server");
    else if (providerInfo(analysis.domain)?.rcptReliable === false) {
      blanket = skipped("unreliable_provider");
    }

    if (blanket) {
      for (const a of addresses) out.set(a.email, blanket);
      return out;
    }

    const probeable = addresses.filter((a) => a.asciiLocal).map((a) => a.email);
    for (const a of addresses) if (!a.asciiLocal) out.set(a.email, skipped("non_ascii_address"));
    if (probeable.length === 0) return out;

    const result = await smtpLimit(() =>
      probeMailboxes(analysis.domain, analysis.mail.hosts, probeable, {
        heloName: config.smtpHeloName,
        mailFrom: config.smtpMailFrom,
        port: config.smtpPort,
        connectTimeoutMs: config.smtpConnectTimeoutMs,
        commandTimeoutMs: config.smtpCommandTimeoutMs,
        maxRcptPerSession: config.smtpMaxRcptPerSession,
        useStartTls: config.smtpUseStartTls,
        connector: deps.smtpConnector,
      }),
    );

    for (const email of probeable) {
      const o: RcptOutcome = result.outcomes.get(email) ?? { status: "unreachable" };
      out.set(email, {
        status: o.status,
        code: o.code,
        enhancedCode: o.enhancedCode,
        message: o.message,
        mx: o.mx ?? result.mx ?? undefined,
        catchAll: result.catchAll,
        startTls: result.startTls,
      });
    }
    return out;
  }

  async function verifyMany(inputs: string[]): Promise<BatchResult> {
    interface Parsed {
      input: string;
      syntax: ReturnType<typeof checkSyntax>;
      email: string | null;
    }

    const seen = new Set<string>();
    const parsed: Parsed[] = [];
    let duplicates = 0;
    let invalid = 0;

    for (const raw of inputs) {
      const input = String(raw ?? "").trim();
      if (!input) continue;
      const syntax = checkSyntax(input);
      if (!syntax.valid) {
        invalid++;
        parsed.push({ input, syntax, email: null });
        continue;
      }
      const key = dedupKey(syntax.local, syntax.domain);
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      parsed.push({ input, syntax, email: `${syntax.local.toLowerCase()}@${syntax.domain}` });
    }

    const byDomain = new Map<string, Parsed[]>();
    for (const p of parsed) {
      if (!p.syntax.valid) continue;
      const list = byDomain.get(p.syntax.domain) ?? [];
      list.push(p);
      byDomain.set(p.syntax.domain, list);
    }

    const domainResults = new Map<string, { analysis: DomainAnalysis; smtp: Map<string, SmtpCheck> }>();
    await Promise.all(
      [...byDomain.entries()].map(([domain, items]) =>
        domainLimit(async () => {
          const analysis = await analyzeDomain(domain);
          const smtp = await smtpChecks(
            analysis,
            items.map((p) => ({
              email: p.email!,
              asciiLocal: /^[\x00-\x7f]+$/.test(p.email!.split("@")[0]),
            })),
          );
          domainResults.set(domain, { analysis, smtp });
        }),
      ),
    );

    const results: EmailVerification[] = parsed.map((p) => {
      if (!p.syntax.valid) {
        const s = score({
          syntax: p.syntax,
          domain: null,
          smtp: skipped(undefined),
          roleAccount: false,
          noReply: false,
          placeholder: false,
          newDomainThresholdDays: config.domainAgeThresholdDays,
        });
        return {
          input: p.input,
          email: null,
          domain: null,
          ...s,
          suggestion: null,
          checks: {
            syntax: p.syntax,
            roleAccount: false,
            noReply: false,
            placeholder: false,
            smtp: skipped(undefined),
            domain: null,
          },
        };
      }

      const { local, domain } = p.syntax;
      const dr = domainResults.get(domain)!;
      const smtp = dr.smtp.get(p.email!) ?? skipped(undefined);
      const flags = {
        roleAccount: isRoleAccount(local),
        noReply: isNoReply(local),
        placeholder: isPlaceholder(local, domain),
      };
      const s = score({
        syntax: p.syntax,
        domain: dr.analysis,
        smtp,
        ...flags,
        newDomainThresholdDays: config.domainAgeThresholdDays,
      });
      return {
        input: p.input,
        email: p.email,
        domain,
        ...s,
        suggestion: dr.analysis.typoSuggestion ? `${local}@${dr.analysis.typoSuggestion}` : null,
        checks: { syntax: p.syntax, ...flags, smtp, domain: dr.analysis },
      };
    });

    return { summary: summarize(inputs.length, results, duplicates, invalid), results };
  }

  async function verifyEmail(input: string): Promise<EmailVerification> {
    const { results } = await verifyMany([input]);
    if (results.length === 0) {
      const syntax = checkSyntax(input);
      return {
        input: input.trim(),
        email: null,
        domain: null,
        verdict: "undeliverable",
        score: 0,
        reasons: score({
          syntax,
          domain: null,
          smtp: skipped(undefined),
          roleAccount: false,
          noReply: false,
          placeholder: false,
          newDomainThresholdDays: config.domainAgeThresholdDays,
        }).reasons,
        suggestion: null,
        checks: {
          syntax,
          roleAccount: false,
          noReply: false,
          placeholder: false,
          smtp: skipped(undefined),
          domain: null,
        },
      };
    }
    return results[0];
  }

  /** Last known SMTP capability, without triggering a port check. */
  function smtpSnapshot(): SmtpCapability {
    if (!config.smtpProbeEnabled) {
      return { enabled: false, available: null, reason: null };
    }
    if (!portCheck || portCheck.at === 0) {
      return { enabled: true, available: null, reason: "Port 25 not checked yet" };
    }
    return { enabled: true, available: portCheck.ok, reason: null };
  }

  return { verifyEmail, verifyMany, analyzeDomain, smtpCapability, smtpSnapshot };
}

export type Verifier = ReturnType<typeof createVerifier>;

function summarize(
  total: number,
  results: EmailVerification[],
  duplicates: number,
  invalid: number,
): BatchSummary {
  const verdicts: Record<Verdict, number> = {
    deliverable: 0,
    risky: 0,
    undeliverable: 0,
    unknown: 0,
  };
  const reasons: Partial<Record<ReasonCode, number>> = {};
  for (const r of results) {
    verdicts[r.verdict]++;
    for (const reason of r.reasons) reasons[reason.code] = (reasons[reason.code] ?? 0) + 1;
  }
  return { total, unique: results.length, duplicates, invalid, verdicts, reasons };
}
