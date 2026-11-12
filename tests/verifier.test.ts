import { describe, expect, it } from "vitest";
import {
  PUBLIC_IP,
  disposableList,
  healthyZone,
  mergeZones,
  reply,
  setup,
  smtpEnabled,
  testConfig,
} from "./helpers";
import type { EmailVerification, ReasonCode } from "@/lib/engine/types";

const codes = (r: EmailVerification) => r.reasons.map((x) => x.code);

describe("verifier without SMTP probing (default)", () => {
  it("reports a healthy address as unknown, not deliverable", async () => {
    const { verifier } = setup({ zone: healthyZone("acme.org") });
    const r = await verifier.verifyEmail("jane@acme.org");
    expect(r.verdict).toBe("unknown");
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(codes(r)).toContain("SMTP_NOT_VERIFIED");
  });

  it("marks a missing domain undeliverable", async () => {
    const { verifier } = setup({ zone: {} });
    const r = await verifier.verifyEmail("jane@no-such-domain-xyz.org");
    expect(r).toMatchObject({ verdict: "undeliverable", score: 0 });
    expect(codes(r)).toContain("DOMAIN_NOT_FOUND");
  });

  it("treats a DNS failure as unknown, never as undeliverable", async () => {
    const { verifier } = setup({ zone: { mx: { "acme.org": { error: "ETIMEOUT" } } } });
    const r = await verifier.verifyEmail("jane@acme.org");
    expect(r.verdict).toBe("unknown");
    expect(codes(r)).toContain("DNS_ERROR");
  });

  it("does not trust NXDOMAIN when the resolver fails for a known-good domain", async () => {
    const { verifier } = setup({ zone: { mx: { "gmail.com": "nxdomain" } } });
    const r = await verifier.verifyEmail("jane@acme.org");
    expect(r.verdict).toBe("unknown");
    expect(r.checks.domain?.mail.status).toBe("dns_error");
  });

  it("does not punish a domain for lacking SPF/DMARC", async () => {
    const zone = healthyZone("acme.org");
    zone.txt = {};
    const { verifier } = setup({ zone });
    const r = await verifier.verifyEmail("jane@acme.org");
    expect(r.verdict).toBe("unknown");
    expect(r.score).toBeGreaterThanOrEqual(65);
    expect(codes(r)).toEqual(expect.arrayContaining(["NO_SPF", "NO_DMARC"]));
  });

  it("flags disposable domains, including by MX host", async () => {
    const zone = mergeZones(healthyZone("mailinator.com"), {
      mx: { "burner.dev": [{ exchange: "mx2.mailinator.com", priority: 10 }] },
      a: { "mx2.mailinator.com": [PUBLIC_IP] },
    });
    const { verifier } = setup({ zone });
    const [byName, byMx] = await Promise.all([
      verifier.verifyEmail("x@mailinator.com"),
      verifier.verifyEmail("x@burner.dev"),
    ]);
    for (const r of [byName, byMx]) {
      expect(r.verdict).toBe("risky");
      expect(r.score).toBeLessThanOrEqual(10);
      expect(codes(r)).toContain("DISPOSABLE");
    }
    expect(byMx.checks.domain?.disposableByMx).toBe(true);
  });

  it("suggests a correction for typo domains", async () => {
    const { verifier } = setup({ zone: healthyZone("gmial.com") });
    const r = await verifier.verifyEmail("jane@gmial.com");
    expect(r.verdict).toBe("risky");
    expect(r.suggestion).toBe("jane@gmail.com");
  });

  it("keeps role accounts deliverable but lowers the score", async () => {
    const { verifier } = setup({ zone: healthyZone("acme.org") });
    const [person, role] = await Promise.all([
      verifier.verifyEmail("jane@acme.org"),
      verifier.verifyEmail("info@acme.org"),
    ]);
    expect(role.verdict).toBe(person.verdict);
    expect(role.score).toBeLessThan(person.score);
    expect(codes(role)).toContain("ROLE_ACCOUNT");
  });

  it("rejects reserved domains without any DNS lookup", async () => {
    const { verifier, dns } = setup({ zone: {} });
    const r = await verifier.verifyEmail("user@example.com");
    expect(r.verdict).toBe("undeliverable");
    expect(codes(r)).toEqual(["RESERVED_DOMAIN"]);
    expect(dns.queries).toEqual([]);
  });

  it("flags a domain listed on a domain blocklist", async () => {
    const zone = mergeZones(healthyZone("spammy.org"), { a: { "spammy.org.dbl.test-bl.org": ["127.0.1.2"] } });
    const { verifier } = setup({ zone });
    const r = await verifier.verifyEmail("jane@spammy.org");
    expect(r.verdict).toBe("risky");
    expect(codes(r)).toContain("DOMAIN_BLOCKLISTED");
  });

  it("flags newly registered domains", async () => {
    const fetchFn = (async () => ({
      ok: true,
      json: async () => ({ events: [{ eventAction: "registration", eventDate: new Date(Date.now() - 3 * 86_400_000).toISOString() }] }),
    })) as unknown as typeof fetch;
    const { verifier } = setup({ zone: healthyZone("fresh.org"), config: testConfig({ rdapEnabled: true }), fetchFn });
    const r = await verifier.verifyEmail("jane@fresh.org");
    expect(codes(r)).toContain("NEW_DOMAIN");
    expect(r.verdict).toBe("risky");
  });

  it("returns invalid syntax as undeliverable", async () => {
    const { verifier } = setup({ zone: {} });
    const r = await verifier.verifyEmail("not-an-email");
    expect(r).toMatchObject({ verdict: "undeliverable", email: null, score: 0 });
    expect(codes(r)).toEqual(["INVALID_SYNTAX"]);
  });
});

describe("verifier with SMTP probing", () => {
  const server = () => ({
    rcpt: (a: string) => (a.startsWith("jane@") ? reply(250, "OK", "2.1.5") : reply(550, "No such user", "5.1.1")),
  });

  it("confirms an existing mailbox as deliverable", async () => {
    const { verifier } = setup({ zone: healthyZone("acme.org"), config: smtpEnabled(), server });
    const r = await verifier.verifyEmail("jane@acme.org");
    expect(r.verdict).toBe("deliverable");
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.checks.smtp).toMatchObject({ status: "accepted", catchAll: false, mx: "mx.acme.org" });
  });

  it("marks a non-existent mailbox undeliverable", async () => {
    const { verifier } = setup({ zone: healthyZone("acme.org"), config: smtpEnabled(), server });
    const r = await verifier.verifyEmail("ghost@acme.org");
    expect(r.verdict).toBe("undeliverable");
    expect(codes(r)).toContain("MAILBOX_NOT_FOUND");
  });

  it("marks catch-all domains risky", async () => {
    const { verifier } = setup({
      zone: healthyZone("acme.org"),
      config: smtpEnabled(),
      server: () => ({ rcpt: () => reply(250, "OK") }),
    });
    const r = await verifier.verifyEmail("anyone@acme.org");
    expect(r.verdict).toBe("risky");
    expect(codes(r)).toContain("CATCH_ALL");
  });

  it("returns unknown on greylisting", async () => {
    const { verifier } = setup({
      zone: healthyZone("acme.org"),
      config: smtpEnabled(),
      server: () => ({ rcpt: () => reply(451, "Greylisted", "4.7.1") }),
    });
    const r = await verifier.verifyEmail("jane@acme.org");
    expect(r.verdict).toBe("unknown");
    expect(codes(r)).toContain("SMTP_TEMPORARY_FAILURE");
  });

  it("never marks addresses invalid when the server blocks the prober", async () => {
    const { verifier } = setup({
      zone: healthyZone("acme.org"),
      config: smtpEnabled(),
      server: () => ({ rcpt: () => reply(550, "Rejected: your IP is listed at spamhaus", "5.7.1") }),
    });
    const r = await verifier.verifyEmail("jane@acme.org");
    expect(r.verdict).toBe("unknown");
    expect(codes(r)).toContain("SMTP_BLOCKED");
  });

  it("skips probing when outbound port 25 is blocked", async () => {
    const { verifier, smtp } = setup({
      zone: healthyZone("acme.org"),
      config: smtpEnabled(),
      server: () => ({ unreachable: ["142.250.1.1", PUBLIC_IP], rcpt: () => reply(250, "OK") }),
    });
    const r = await verifier.verifyEmail("jane@acme.org");
    expect(r.checks.smtp).toMatchObject({ status: "skipped", skipReason: "port_unavailable" });
    expect(r.verdict).toBe("unknown");
    expect((await verifier.smtpCapability()).available).toBe(false);
    expect(smtp.log.filter((l) => l.includes(PUBLIC_IP))).toEqual([]);
  });

  it("does not probe providers whose RCPT answers are meaningless", async () => {
    const { verifier, smtp } = setup({ zone: healthyZone("yahoo.com"), config: smtpEnabled(), server });
    const r = await verifier.verifyEmail("ghost@yahoo.com");
    expect(r.checks.smtp.skipReason).toBe("unreliable_provider");
    expect(r.verdict).toBe("unknown");
    expect(codes(r)).toContain("PROVIDER_ACCEPTS_ALL");
    expect(smtp.log.some((l) => l.includes("yahoo"))).toBe(false);
  });

  it("is disabled when SMTP_HELO_NAME is missing", async () => {
    const { verifier } = setup({
      zone: healthyZone("acme.org"),
      config: testConfig({ smtpProbeRequested: true, smtpProbeEnabled: false }),
    });
    const cap = await verifier.smtpCapability();
    expect(cap).toMatchObject({ enabled: false });
    expect(cap.reason).toContain("SMTP_HELO_NAME");
  });
});

describe("batch verification", () => {
  it("evaluates every address on its own, not by the first address of the domain", async () => {
    // The old engine used the first address of each domain for all others,
    // so one test@ address poisoned every gmail.com contact in the list.
    const { verifier } = setup({ zone: healthyZone("gmail.com") });
    const { results } = await verifier.verifyMany(["test@gmail.com", "jane@gmail.com"]);
    const [test, jane] = results;
    expect(codes(test)).toContain("PLACEHOLDER_ADDRESS");
    expect(codes(jane)).not.toContain("PLACEHOLDER_ADDRESS");
    expect(jane.verdict).not.toBe("risky");
  });

  it("deduplicates and counts invalid input while keeping the original address", async () => {
    const { verifier } = setup({ zone: healthyZone("gmail.com") });
    const { summary, results } = await verifier.verifyMany([
      "John.Doe@gmail.com",
      "johndoe+promo@gmail.com",
      "broken@",
      "",
    ]);
    expect(summary).toMatchObject({ total: 4, unique: 2, duplicates: 1, invalid: 1 });
    expect(results[0].input).toBe("John.Doe@gmail.com");
    expect(results[0].email).toBe("john.doe@gmail.com");
  });

  it("probes each domain once with all of its addresses in one session", async () => {
    const { verifier, smtp } = setup({
      zone: healthyZone("acme.org"),
      config: smtpEnabled(),
      server: () => ({ rcpt: (a) => (a.startsWith("sg-") ? reply(550, "no", "5.1.1") : reply(250, "OK")) }),
    });
    const { summary } = await verifier.verifyMany(["a@acme.org", "b@acme.org", "c@acme.org"]);
    expect(summary.verdicts.deliverable).toBe(3);
    // One port check session plus one session for acme.org.
    expect(smtp.sessions).toBe(2);
  });

  it("caches domain analysis between calls", async () => {
    const { verifier, dns } = setup({ zone: healthyZone("acme.org") });
    await verifier.verifyEmail("a@acme.org");
    const before = dns.queries.length;
    await verifier.verifyEmail("b@acme.org");
    expect(dns.queries.length).toBe(before);
  });

  it("aggregates verdicts and reasons", async () => {
    const { verifier } = setup({
      zone: mergeZones(healthyZone("acme.org"), healthyZone("tempmail.dev")),
      disposable: disposableList(["tempmail.dev"]),
    });
    const { summary } = await verifier.verifyMany(["a@acme.org", "x@tempmail.dev", "bad"]);
    expect(summary.verdicts).toEqual({ deliverable: 0, risky: 1, undeliverable: 1, unknown: 1 });
    const reasons = summary.reasons as Record<ReasonCode, number>;
    expect(reasons.INVALID_SYNTAX).toBe(1);
    expect(reasons.DISPOSABLE).toBe(1);
  });
});
