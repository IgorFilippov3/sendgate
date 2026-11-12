import { describe, expect, it } from "vitest";
import { classifyRcpt, probeMailboxes } from "@/lib/engine/checks/smtp-probe";
import { createScriptedConnector, reply } from "@/lib/engine/net/fake";
import type { MailHost } from "@/lib/engine/types";

describe("classifyRcpt", () => {
  it.each([
    [reply(250, "OK", "2.1.5"), "accepted"],
    [reply(251, "will forward"), "accepted"],
    [reply(252, "cannot verify"), "blocked"],
    [reply(450, "mailbox busy"), "temporary_failure"],
    [reply(451, "greylisted", "4.7.1"), "temporary_failure"],
    [reply(550, "No such user", "5.1.1"), "rejected"],
    [reply(550, "Address unknown", "5.1.0"), "rejected"],
    [reply(550, "Mailbox disabled", "5.2.1"), "disabled"],
    [reply(552, "Mailbox full", "5.2.2"), "full"],
    [reply(552, "over quota"), "full"],
    [reply(550, "Service unavailable; client host blocked using Spamhaus", "5.7.1"), "blocked"],
    [reply(550, "Message rejected due to poor IP reputation"), "blocked"],
    [reply(554, "Transaction failed"), "blocked"],
    [reply(550, "User unknown"), "rejected"],
    [reply(550, "Recipient address rejected: User unknown in local recipient table"), "rejected"],
    [reply(553, "sorry, that domain isn't in my list of allowed rcpthosts"), "rejected"],
  ])("%j -> %s", (r, expected) => {
    expect(classifyRcpt(r)).toBe(expected);
  });
});

const host = (exchange: string, ...addresses: string[]): MailHost => ({
  exchange,
  priority: 10,
  addresses: addresses.length ? addresses : ["93.184.216.34"],
});

const opts = (connector: ReturnType<typeof createScriptedConnector>, extra = {}) => ({
  heloName: "probe.test",
  mailFrom: "verify@probe.test",
  port: 25,
  connectTimeoutMs: 1000,
  commandTimeoutMs: 1000,
  maxRcptPerSession: 20,
  useStartTls: true,
  connector,
  ...extra,
});

describe("probeMailboxes", () => {
  it("tests real recipients before the random catch-all address", async () => {
    const connector = createScriptedConnector(() => ({
      extensions: ["STARTTLS"],
      rcpt: (a) => (a.startsWith("good") ? reply(250, "OK") : reply(550, "No such user", "5.1.1")),
    }));
    const res = await probeMailboxes("acme.org", [host("mx.acme.org")], ["good@acme.org", "bad@acme.org"], opts(connector));

    expect(res.outcomes.get("good@acme.org")?.status).toBe("accepted");
    expect(res.outcomes.get("bad@acme.org")?.status).toBe("rejected");
    expect(res.catchAll).toBe(false);
    expect(res.startTls).toBe(true);
    const rcpts = connector.log.filter((l) => l.startsWith("RCPT"));
    expect(rcpts[0]).toBe("RCPT TO:<good@acme.org>");
    expect(rcpts[2]).toMatch(/^RCPT TO:<sg-[0-9a-f]{12}@acme\.org>$/);
    expect(connector.log).not.toContain("DATA");
  });

  it("detects catch-all domains", async () => {
    const connector = createScriptedConnector(() => ({ rcpt: () => reply(250, "OK") }));
    const res = await probeMailboxes("acme.org", [host("mx.acme.org")], ["a@acme.org"], opts(connector));
    expect(res.catchAll).toBe(true);
  });

  it("falls back to the next MX when the first is unreachable", async () => {
    const connector = createScriptedConnector(() => ({
      unreachable: ["10.0.0.1"],
      rcpt: () => reply(250, "OK"),
    }));
    const res = await probeMailboxes(
      "acme.org",
      [host("mx1.acme.org", "10.0.0.1"), host("mx2.acme.org", "93.184.216.35")],
      ["a@acme.org"],
      opts(connector),
    );
    expect(res.outcomes.get("a@acme.org")).toMatchObject({ status: "accepted", mx: "mx2.acme.org" });
  });

  it("reports unreachable when no MX answers", async () => {
    const connector = createScriptedConnector(() => ({ unreachable: ["93.184.216.34"], rcpt: () => reply(250, "OK") }));
    const res = await probeMailboxes("acme.org", [host("mx.acme.org")], ["a@acme.org"], opts(connector));
    expect(res.outcomes.get("a@acme.org")?.status).toBe("unreachable");
    expect(res.catchAll).toBeNull();
  });

  it("marks everything blocked when MAIL FROM is refused, not rejected", async () => {
    const connector = createScriptedConnector(() => ({
      mailFrom: reply(554, "Your IP is on a blocklist", "5.7.1"),
      rcpt: () => reply(550, "No such user", "5.1.1"),
    }));
    const res = await probeMailboxes("acme.org", [host("mx.acme.org")], ["a@acme.org"], opts(connector));
    expect(res.outcomes.get("a@acme.org")?.status).toBe("blocked");
  });

  it("treats a 4xx greeting as a temporary failure", async () => {
    const connector = createScriptedConnector(() => ({
      greeting: reply(421, "Too busy"),
      rcpt: () => reply(250, "OK"),
    }));
    const res = await probeMailboxes("acme.org", [host("mx.acme.org")], ["a@acme.org"], opts(connector));
    expect(res.outcomes.get("a@acme.org")?.status).toBe("temporary_failure");
  });

  it("keeps answers received before the server dropped the connection", async () => {
    const connector = createScriptedConnector(() => ({ dropAfterRcpt: 1, rcpt: () => reply(250, "OK") }));
    const res = await probeMailboxes(
      "acme.org",
      [host("mx.acme.org")],
      ["a@acme.org", "b@acme.org"],
      opts(connector),
    );
    expect(res.outcomes.get("a@acme.org")?.status).toBe("accepted");
    expect(res.outcomes.get("b@acme.org")?.status).toBe("unreachable");
  });

  it("splits large batches into several sessions", async () => {
    const connector = createScriptedConnector(() => ({ rcpt: () => reply(250, "OK") }));
    const recipients = Array.from({ length: 5 }, (_, i) => `u${i}@acme.org`);
    const res = await probeMailboxes("acme.org", [host("mx.acme.org")], recipients, opts(connector, { maxRcptPerSession: 2 }));
    expect(connector.sessions).toBe(3);
    expect([...res.outcomes.values()].every((o) => o.status === "accepted")).toBe(true);
  });
});
