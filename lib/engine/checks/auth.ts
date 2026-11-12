import type { DnsClient } from "../net/dns";
import type { DmarcCheck, SpfCheck } from "../types";

const SPF_PREFIX = /^v=spf1(\s|$)/i;
const DMARC_PREFIX = /^v=DMARC1\s*(;|$)/i;
const MAX_LOOKUPS = 10;
const MAX_DEPTH = 10;

type Qualifier = "+" | "-" | "~" | "?";

interface SpfState {
  lookups: number;
  visited: Set<string>;
  warnings: string[];
  permerror: boolean;
}

/** Splits an SPF term into qualifier, name and value ("~include:x" → ~, include, x). */
function parseTerm(term: string): { qualifier: Qualifier; name: string; value: string } {
  let qualifier: Qualifier = "+";
  let rest = term;
  if ("+-~?".includes(rest[0])) {
    qualifier = rest[0] as Qualifier;
    rest = rest.slice(1);
  }
  const m = /^([a-z0-9_.-]+)([:=/](.*))?$/i.exec(rest);
  if (!m) return { qualifier, name: rest.toLowerCase(), value: "" };
  const sep = m[2]?.[0];
  return {
    qualifier,
    name: m[1].toLowerCase() + (sep === "=" ? "=" : ""),
    value: sep === "/" ? "" : (m[3] ?? ""),
  };
}

async function fetchSpf(
  dns: DnsClient,
  domain: string,
): Promise<{ record: string | null; error: string | null; multiple: boolean }> {
  const res = await dns.txt(domain);
  if (res.status === "error") return { record: null, error: res.code, multiple: false };
  if (res.status !== "ok") return { record: null, error: null, multiple: false };
  const spf = res.records.filter((r) => SPF_PREFIX.test(r.trim()));
  return { record: spf[0]?.trim() ?? null, error: null, multiple: spf.length > 1 };
}

async function walk(
  dns: DnsClient,
  record: string,
  state: SpfState,
  depth: number,
): Promise<void> {
  const terms = record.split(/\s+/).slice(1).filter(Boolean);
  const hasAll = terms.some((t) => parseTerm(t).name === "all");

  for (const raw of terms) {
    if (state.lookups > MAX_LOOKUPS) return;
    const { name, value } = parseTerm(raw);

    switch (name) {
      case "a":
      case "mx":
      case "ptr":
      case "exists":
        state.lookups++;
        if (name === "ptr") state.warnings.push("'ptr' mechanism is deprecated (RFC 7208 §5.5)");
        break;
      case "include":
      case "redirect=": {
        if (name === "redirect=" && hasAll) break; // ignored when "all" exists
        state.lookups++;
        const target = value.toLowerCase();
        if (!target || target.includes("%{")) break; // macros: count only
        if (depth >= MAX_DEPTH || state.visited.has(target)) {
          state.warnings.push(`SPF include loop or excessive nesting at ${target}`);
          state.permerror = true;
          break;
        }
        state.visited.add(target);
        const child = await fetchSpf(dns, target);
        if (!child.record) {
          if (!child.error) {
            state.warnings.push(`${target} referenced by SPF has no SPF record`);
            state.permerror = true;
          }
          break;
        }
        await walk(dns, child.record, state, depth + 1);
        break;
      }
    }
  }
}

/**
 * Validates the domain's SPF record: existence, single record, and the
 * 10-DNS-lookup limit (RFC 7208 §4.6.4), following include/redirect.
 */
export async function checkSpf(dns: DnsClient, domain: string): Promise<SpfCheck> {
  const top = await fetchSpf(dns, domain);
  if (top.error) {
    return { status: "error", record: null, lookups: 0, allQualifier: null, warnings: [] };
  }
  if (!top.record) {
    return { status: "none", record: null, lookups: 0, allQualifier: null, warnings: [] };
  }

  const state: SpfState = { lookups: 0, visited: new Set([domain]), warnings: [], permerror: false };
  if (top.multiple) {
    state.permerror = true;
    state.warnings.push("Multiple SPF records published");
  }

  await walk(dns, top.record, state, 0);

  if (state.lookups > MAX_LOOKUPS) {
    state.permerror = true;
    state.warnings.push(`SPF requires more than ${MAX_LOOKUPS} DNS lookups`);
  }

  const allTerm = top.record
    .split(/\s+/)
    .map(parseTerm)
    .find((t) => t.name === "all");

  return {
    status: state.permerror ? "permerror" : "valid",
    record: top.record,
    lookups: Math.min(state.lookups, MAX_LOOKUPS + 1),
    allQualifier: allTerm?.qualifier ?? null,
    warnings: state.warnings,
  };
}

const POLICIES = new Set(["none", "quarantine", "reject"]);

export async function checkDmarc(dns: DnsClient, domain: string): Promise<DmarcCheck> {
  const empty = { record: null, policy: null, subdomainPolicy: null };
  const res = await dns.txt(`_dmarc.${domain}`);
  if (res.status === "error") return { status: "error", ...empty };
  if (res.status !== "ok") return { status: "none", ...empty };

  const records = res.records.map((r) => r.trim()).filter((r) => DMARC_PREFIX.test(r));
  if (records.length === 0) return { status: "none", ...empty };
  if (records.length > 1) return { status: "invalid", ...empty, record: records[0] };

  const tags = new Map<string, string>();
  for (const part of records[0].split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    tags.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim().toLowerCase());
  }

  const p = tags.get("p");
  if (!p || !POLICIES.has(p)) {
    return { status: "invalid", ...empty, record: records[0] };
  }
  const sp = tags.get("sp");
  return {
    status: "found",
    record: records[0],
    policy: p as DmarcCheck["policy"],
    subdomainPolicy: sp && POLICIES.has(sp) ? (sp as DmarcCheck["policy"]) : null,
  };
}
