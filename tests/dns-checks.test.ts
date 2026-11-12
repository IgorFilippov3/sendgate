import { describe, expect, it } from "vitest";
import { createFakeDns } from "@/lib/engine/net/fake";
import { resolveMailHosts } from "@/lib/engine/checks/mail-hosts";
import { checkDmarc, checkSpf } from "@/lib/engine/checks/auth";
import { checkBlocklists, domainAgeDays, interpretDnsblAnswer } from "@/lib/engine/checks/reputation";
import { isPublicIp } from "@/lib/engine/net/ip";

const nx = () => ({ status: "nxdomain" as const });

describe("resolveMailHosts", () => {
  it("sorts MX records by preference and resolves addresses", async () => {
    const dns = createFakeDns({
      mx: { "acme.org": [{ exchange: "b.acme.org", priority: 20 }, { exchange: "a.acme.org", priority: 10 }] },
      a: { "a.acme.org": ["93.184.216.1"], "b.acme.org": ["93.184.216.2"] },
      aaaa: { "a.acme.org": ["2606:2800:220:1::1"] },
    }, nx);
    const res = await resolveMailHosts(dns, "acme.org");
    expect(res.status).toBe("ok");
    expect(res.hosts.map((h) => h.exchange)).toEqual(["a.acme.org", "b.acme.org"]);
    expect(res.hosts[0].addresses).toEqual(["93.184.216.1", "2606:2800:220:1::1"]);
  });

  it("detects a null MX (RFC 7505)", async () => {
    const dns = createFakeDns({ mx: { "acme.org": [{ exchange: "", priority: 0 }] } }, nx);
    expect((await resolveMailHosts(dns, "acme.org")).status).toBe("null_mx");
  });

  it("falls back to the A record when there is no MX", async () => {
    const dns = createFakeDns({ mx: { "acme.org": "nodata" }, a: { "acme.org": ["93.184.216.1"] } }, nx);
    const res = await resolveMailHosts(dns, "acme.org");
    expect(res).toMatchObject({ status: "ok", implicitMx: true });
  });

  it("reports no_mail when neither MX nor A exist", async () => {
    const dns = createFakeDns({ mx: { "acme.org": "nodata" }, a: { "acme.org": "nodata" }, aaaa: { "acme.org": "nodata" } }, nx);
    expect((await resolveMailHosts(dns, "acme.org")).status).toBe("no_mail");
  });

  it("reports not_found for NXDOMAIN", async () => {
    expect((await resolveMailHosts(createFakeDns({}, nx), "acme.org")).status).toBe("not_found");
  });

  it("does not confuse a resolver error with a missing domain", async () => {
    const dns = createFakeDns({ mx: { "acme.org": { error: "ETIMEOUT" } } }, nx);
    expect(await resolveMailHosts(dns, "acme.org")).toMatchObject({ status: "dns_error", error: "ETIMEOUT" });
  });

  it("flags MX hosts that point to private addresses", async () => {
    const dns = createFakeDns({
      mx: { "acme.org": [{ exchange: "mx.acme.org", priority: 10 }] },
      a: { "mx.acme.org": ["10.0.0.5"] },
    }, nx);
    expect((await resolveMailHosts(dns, "acme.org")).status).toBe("not_routable");
  });

  it("drops private addresses but keeps public ones", async () => {
    const dns = createFakeDns({
      mx: { "acme.org": [{ exchange: "mx.acme.org", priority: 10 }] },
      a: { "mx.acme.org": ["127.0.0.1", "93.184.216.1"] },
    }, nx);
    const res = await resolveMailHosts(dns, "acme.org");
    expect(res.hosts[0].addresses).toEqual(["93.184.216.1"]);
  });
});

describe("isPublicIp", () => {
  it.each([
    ["8.8.8.8", true],
    ["93.184.216.34", true],
    ["2606:4700::1111", true],
    ["10.1.2.3", false],
    ["172.16.0.1", false],
    ["192.168.1.1", false],
    ["127.0.0.1", false],
    ["169.254.169.254", false],
    ["100.64.0.1", false],
    ["0.0.0.0", false],
    ["::1", false],
    ["fd00::1", false],
    ["fe80::1", false],
    ["::ffff:127.0.0.1", false],
    ["not-an-ip", false],
  ])("%s -> %s", (ip, expected) => {
    expect(isPublicIp(ip)).toBe(expected);
  });
});

describe("checkSpf", () => {
  it("joins split TXT strings and counts includes", async () => {
    const dns = createFakeDns({
      txt: {
        "acme.org": ["v=spf1 include:_spf.google.com include:mailgun.org ~all"],
        "_spf.google.com": ["v=spf1 include:_netblocks.google.com ~all"],
        "_netblocks.google.com": ["v=spf1 ip4:35.190.247.0/24 ~all"],
        "mailgun.org": ["v=spf1 ip4:1.2.3.4 -all"],
      },
    }, nx);
    const res = await checkSpf(dns, "acme.org");
    expect(res).toMatchObject({ status: "valid", lookups: 3, allQualifier: "~" });
  });

  it("detects more than 10 lookups", async () => {
    const txt: Record<string, string[]> = {
      "acme.org": [`v=spf1 ${Array.from({ length: 11 }, (_, i) => `include:s${i}.acme.org`).join(" ")} -all`],
    };
    for (let i = 0; i < 11; i++) txt[`s${i}.acme.org`] = ["v=spf1 ip4:1.1.1.1 -all"];
    const res = await checkSpf(createFakeDns({ txt }, nx), "acme.org");
    expect(res.status).toBe("permerror");
  });

  it("flags multiple SPF records and include loops", async () => {
    const multi = await checkSpf(createFakeDns({ txt: { "acme.org": ["v=spf1 -all", "v=spf1 mx -all"] } }, nx), "acme.org");
    expect(multi.status).toBe("permerror");
    const loop = await checkSpf(
      createFakeDns({ txt: { "acme.org": ["v=spf1 include:b.org -all"], "b.org": ["v=spf1 include:acme.org -all"] } }, nx),
      "acme.org",
    );
    expect(loop.status).toBe("permerror");
  });

  it("is case-insensitive and ignores redirect when all is present", async () => {
    const res = await checkSpf(
      createFakeDns({ txt: { "acme.org": ["V=SPF1 mx a redirect=other.org -all"] } }, nx),
      "acme.org",
    );
    expect(res).toMatchObject({ status: "valid", lookups: 2 });
  });

  it("separates no record from a DNS error", async () => {
    expect((await checkSpf(createFakeDns({}, nx), "acme.org")).status).toBe("none");
    expect((await checkSpf(createFakeDns({ txt: { "acme.org": { error: "ESERVFAIL" } } }, nx), "acme.org")).status).toBe("error");
  });
});

describe("checkDmarc", () => {
  it("parses p and sp tags without substring confusion", async () => {
    const dns = createFakeDns({ txt: { "_dmarc.acme.org": ["v=DMARC1; sp=reject; p=none; rua=mailto:x@acme.org"] } }, nx);
    expect(await checkDmarc(dns, "acme.org")).toMatchObject({ status: "found", policy: "none", subdomainPolicy: "reject" });
  });

  it("marks records without a valid policy as invalid", async () => {
    const dns = createFakeDns({ txt: { "_dmarc.acme.org": ["v=DMARC1; p=maybe"] } }, nx);
    expect((await checkDmarc(dns, "acme.org")).status).toBe("invalid");
  });
});

describe("DNS blocklists", () => {
  it("interprets listing and error codes", () => {
    expect(interpretDnsblAnswer("zen.spamhaus.org", ["127.0.0.2"])).toBe("listed");
    expect(interpretDnsblAnswer("zen.spamhaus.org", ["127.255.255.254"])).toBe("error");
    expect(interpretDnsblAnswer("dbl.spamhaus.org", ["127.0.1.255"])).toBe("error");
    expect(interpretDnsblAnswer("zen.spamhaus.org", ["127.0.0.10"])).toBe("clean");
    expect(interpretDnsblAnswer("bl.example", ["10.0.0.1"])).toBe("error");
  });

  it("queries domains and reversed IPs on separate lists", async () => {
    const dns = createFakeDns({
      a: { "spammy.org.dbl.test": ["127.0.1.2"], "4.3.2.1.zen.test": ["127.0.0.4"] },
    }, nx);
    const res = await checkBlocklists(dns, "spammy.org", ["1.2.3.4", "2606::1"], { domain: ["dbl.test"], ip: ["zen.test"] });
    expect(res).toEqual({
      status: "ok",
      domainListings: ["spammy.org on dbl.test"],
      ipListings: ["1.2.3.4 on zen.test"],
    });
  });

  it("reports unavailable instead of clean when the list refuses queries", async () => {
    const dns = createFakeDns({}, () => ({ status: "ok", records: ["127.255.255.254"] }));
    const res = await checkBlocklists(dns, "acme.org", [], { domain: ["dbl.spamhaus.org"], ip: [] });
    expect(res).toMatchObject({ status: "unavailable", domainListings: [] });
  });
});

describe("domainAgeDays", () => {
  const json = (body: unknown, ok = true) =>
    (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

  it("reads the RDAP registration eventDate", async () => {
    const now = Date.parse("2026-11-12T00:00:00Z");
    const days = await domainAgeDays("acme.org", {
      timeoutMs: 1000,
      now,
      fetchFn: json({ events: [{ eventAction: "registration", eventDate: "2026-11-02T00:00:00Z" }] }),
    });
    expect(days).toBe(10);
  });

  it("returns null when RDAP fails", async () => {
    expect(await domainAgeDays("acme.org", { timeoutMs: 1000, fetchFn: json({}, false) })).toBeNull();
    const boom = (async () => { throw new Error("network"); }) as unknown as typeof fetch;
    expect(await domainAgeDays("acme.org", { timeoutMs: 1000, fetchFn: boom })).toBeNull();
  });
});
