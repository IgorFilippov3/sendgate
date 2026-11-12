import { isIP } from "node:net";
import type { DnsClient, DnsResult } from "../net/dns";
import { recordsOf } from "../net/dns";
import { isPublicIp } from "../net/ip";
import type { DomainMailCheck, MailHost } from "../types";

const MAX_HOSTS = 5;

async function addressesOf(
  dns: DnsClient,
  host: string,
): Promise<{ addresses: string[]; error: boolean; nxdomain: boolean }> {
  if (isIP(host)) return { addresses: [host], error: false, nxdomain: false };
  const [a, aaaa] = await Promise.all([dns.a(host), dns.aaaa(host)]);
  const isError = (r: DnsResult<string>) => r.status === "error";
  return {
    addresses: [...recordsOf(a), ...recordsOf(aaaa)],
    error: isError(a) && isError(aaaa),
    nxdomain: a.status === "nxdomain" && aaaa.status === "nxdomain",
  };
}

/**
 * Finds where mail for `domain` is delivered, following RFC 5321 §5.1:
 * MX records sorted by preference, the implicit MX (A/AAAA) when no MX
 * exists, and RFC 7505 null MX ("MX 0 .") meaning the domain accepts no mail.
 */
export async function resolveMailHosts(
  dns: DnsClient,
  domain: string,
): Promise<DomainMailCheck> {
  const mx = await dns.mx(domain);

  if (mx.status === "nxdomain") {
    return { status: "not_found", implicitMx: false, hosts: [] };
  }
  if (mx.status === "error") {
    return { status: "dns_error", implicitMx: false, hosts: [], error: mx.code };
  }

  if (mx.status === "nodata") {
    const fallback = await addressesOf(dns, domain);
    if (fallback.addresses.length > 0) {
      return finish(true, [
        { exchange: domain, priority: 0, addresses: fallback.addresses },
      ]);
    }
    if (fallback.error) {
      return { status: "dns_error", implicitMx: false, hosts: [], error: "A/AAAA lookup failed" };
    }
    return { status: "no_mail", implicitMx: false, hosts: [] };
  }

  const records = mx.records;
  if (records.every((r) => r.exchange === "" || r.exchange === ".")) {
    return { status: "null_mx", implicitMx: false, hosts: [] };
  }

  const sorted = records
    .filter((r) => r.exchange !== "" && r.exchange !== ".")
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_HOSTS);

  const resolved = await Promise.all(
    sorted.map(async (r) => ({ record: r, result: await addressesOf(dns, r.exchange) })),
  );

  const hosts: MailHost[] = resolved
    .filter((r) => r.result.addresses.length > 0)
    .map((r) => ({
      exchange: r.record.exchange,
      priority: r.record.priority,
      addresses: r.result.addresses,
    }));

  if (hosts.length === 0) {
    if (resolved.some((r) => r.result.error)) {
      return { status: "dns_error", implicitMx: false, hosts: [], error: "MX host lookup failed" };
    }
    return { status: "no_mail", implicitMx: false, hosts: [] };
  }

  return finish(false, hosts);
}

function finish(implicitMx: boolean, hosts: MailHost[]): DomainMailCheck {
  const routable = hosts
    .map((h) => ({ ...h, addresses: h.addresses.filter(isPublicIp) }))
    .filter((h) => h.addresses.length > 0);
  if (routable.length === 0) {
    return { status: "not_routable", implicitMx, hosts };
  }
  return { status: "ok", implicitMx, hosts: routable };
}
