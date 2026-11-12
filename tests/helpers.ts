import { loadConfig, type Config } from "@/lib/engine/config";
import { DisposableList } from "@/lib/engine/checks/disposable";
import { createFakeDns, createScriptedConnector, reply, type FakeZone, type ScriptedServer } from "@/lib/engine/net/fake";
import { createVerifier } from "@/lib/engine/verifier";

export const PUBLIC_IP = "93.184.216.34";
export const PUBLIC_IP_2 = "93.184.216.35";

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...loadConfig({}),
    rdapEnabled: false,
    domainBlocklists: ["dbl.test-bl.org"],
    ipBlocklists: ["zen.test-bl.org"],
    ...overrides,
  };
}

export function smtpEnabled(overrides: Partial<Config> = {}): Config {
  return testConfig({
    smtpProbeEnabled: true,
    smtpProbeRequested: true,
    smtpHeloName: "probe.sendgate.test",
    smtpMailFrom: "verify@probe.sendgate.test",
    ...overrides,
  });
}

export function disposableList(domains = ["mailinator.com", "tempmail.dev"]) {
  return new DisposableList({ autoUpdate: false, updateIntervalHours: 24, sourceUrl: "" }, domains);
}

/** A healthy domain: MX, A for the MX, SPF and DMARC. */
export function healthyZone(domain: string, ip = PUBLIC_IP): FakeZone {
  return {
    mx: { [domain]: [{ exchange: `mx.${domain}`, priority: 10 }] },
    a: { [`mx.${domain}`]: [ip], "gmail-smtp-in.l.google.com": ["142.250.1.1"] },
    txt: { [domain]: ["v=spf1 mx -all"], [`_dmarc.${domain}`]: ["v=DMARC1; p=reject"] },
  };
}

export function mergeZones(...zones: FakeZone[]): FakeZone {
  const out: FakeZone = {};
  for (const z of zones) {
    for (const key of ["mx", "txt", "a", "aaaa"] as const) {
      out[key] = { ...(out[key] ?? {}), ...(z[key] ?? {}) } as never;
    }
  }
  return out;
}

export function setup(options: {
  zone: FakeZone;
  config?: Config;
  server?: (address: string, hostname: string) => ScriptedServer;
  disposable?: DisposableList;
  fetchFn?: typeof fetch;
}) {
  // Unlisted names: NXDOMAIN for MX/A/TXT, which also means "not listed" for DNSBLs.
  // The verifier checks resolver health against gmail.com before trusting
  // an NXDOMAIN answer.
  const zone = mergeZones(
    { mx: { "gmail.com": [{ exchange: "gmail-smtp-in.l.google.com", priority: 5 }] } },
    options.zone,
  );
  const dns = createFakeDns(zone, (type) =>
    type === "aaaa" ? { status: "nodata" } : { status: "nxdomain" },
  );
  const smtp = createScriptedConnector(
    options.server ?? (() => ({ rcpt: () => reply(250, "OK", "2.1.5") })),
  );
  const verifier = createVerifier({
    config: options.config ?? testConfig(),
    dns,
    smtpConnector: smtp,
    disposable: options.disposable ?? disposableList(),
    fetchFn: options.fetchFn,
  });
  return { verifier, dns, smtp };
}

export { reply };
