import { describe, expect, it, vi } from "vitest";
import { DisposableList } from "@/lib/engine/checks/disposable";
import { RateLimiter, TtlCache, createLimiter } from "@/lib/engine/util/cache";
import { loadConfig } from "@/lib/engine/config";
import { createSandboxVerifier } from "@/lib/engine/sandbox";
import { disposableList } from "./helpers";

describe("DisposableList", () => {
  const options = { autoUpdate: false, updateIntervalHours: 24, sourceUrl: "https://list.test" };

  it("ships a large bundled list", () => {
    const list = new DisposableList(options);
    expect(list.size).toBeGreaterThan(5000);
    expect(list.isDisposableDomain("mailinator.com")).toBe(true);
    expect(list.isDisposableDomain("gmail.com")).toBe(false);
  });

  it("matches subdomains of disposable domains", () => {
    const list = new DisposableList(options, ["mailinator.com"]);
    expect(list.isDisposableDomain("eu.mailinator.com")).toBe(true);
    expect(list.isDisposableDomain("notmailinator.com")).toBe(false);
  });

  it("matches MX hosts by whole labels, not substrings", () => {
    const list = new DisposableList(options, []);
    expect(list.isDisposableMx(["mx1.mailinator.com"])).toBe(true);
    expect(list.isDisposableMx(["mx.notmailinator.com"])).toBe(false);
    // Apple Hide My Email and Marketo are legitimate.
    expect(list.isDisposableMx(["mx01.mail.icloud.com", "privaterelay.appleid.com"])).toBe(false);
    expect(list.isDisposableMx(["mktomail.com"])).toBe(false);
  });

  it("replaces the list on update and ignores broken downloads", async () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    const big = Array.from({ length: 1500 }, (_, i) => `d${i}.test`).join("\n");
    const ok = (async () => ({ ok: true, text: async () => `# comment\n${big}\n` })) as unknown as typeof fetch;
    const list = new DisposableList({ ...options, fetchFn: ok, logger }, ["old.test"]);
    await list.update();
    expect(list.isDisposableDomain("d1.test")).toBe(true);
    expect(list.isDisposableDomain("old.test")).toBe(false);

    const tiny = (async () => ({ ok: true, text: async () => "a.test\n" })) as unknown as typeof fetch;
    const list2 = new DisposableList({ ...options, fetchFn: tiny, logger }, ["keep.test"]);
    await list2.update();
    expect(list2.isDisposableDomain("keep.test")).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe("TtlCache", () => {
  it("expires entries and evicts the least recently used", () => {
    let t = 0;
    const cache = new TtlCache<number>(2, () => t);
    cache.set("a", 1, 100);
    cache.set("b", 2, 100);
    cache.get("a");
    cache.set("c", 3, 100);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    t = 200;
    expect(cache.get("a")).toBeUndefined();
  });
});

describe("createLimiter", () => {
  it("never runs more tasks than allowed", async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        limit(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 5));
          active--;
        }),
      ),
    );
    expect(peak).toBe(2);
  });
});

describe("RateLimiter", () => {
  it("limits per key per minute", () => {
    let t = 0;
    const rl = new RateLimiter(2, () => t);
    expect(rl.take("ip")).toBe(0);
    expect(rl.take("ip")).toBe(0);
    expect(rl.take("ip")).toBeGreaterThan(0);
    expect(rl.take("other")).toBe(0);
    t = 60_000;
    expect(rl.take("ip")).toBe(0);
  });
});

describe("loadConfig", () => {
  it("falls back to defaults on invalid numbers", () => {
    const c = loadConfig({ MAX_BULK_EMAILS: "lots", DNS_TIMEOUT: "-5" });
    expect(c.maxBulkEmails).toBe(100);
    expect(c.dnsTimeoutMs).toBe(2500);
  });

  it("enables SMTP probing only with a HELO name", () => {
    expect(loadConfig({ SMTP_PROBE_ENABLED: "true" }).smtpProbeEnabled).toBe(false);
    const c = loadConfig({ SMTP_PROBE_ENABLED: "true", SMTP_HELO_NAME: "verify.acme.dev" });
    expect(c).toMatchObject({ smtpProbeEnabled: true, smtpMailFrom: "verify@verify.acme.dev" });
  });

  it("uses Spamhaus DQS zones when a key is set", () => {
    const c = loadConfig({ SPAMHAUS_DQS_KEY: "abc" });
    expect(c.domainBlocklists).toEqual(["abc.dbl.dq.spamhaus.net"]);
    expect(c.ipBlocklists[0]).toBe("abc.zen.dq.spamhaus.net");
  });
});

describe("sandbox", () => {
  it("returns deterministic results without network access", async () => {
    const sandbox = createSandboxVerifier(disposableList(), loadConfig({}));
    const { results } = await sandbox.verifyMany([
      "deliverable@acme.dev",
      "undeliverable@acme.dev",
      "full@acme.dev",
      "greylisted@acme.dev",
      "anyone@catchall.acme.dev",
      "x@mailinator.com",
    ]);
    expect(results.map((r) => r.verdict)).toEqual([
      "deliverable",
      "undeliverable",
      "risky",
      "unknown",
      "risky",
      "risky",
    ]);
  });
});
