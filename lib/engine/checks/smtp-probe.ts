import { randomBytes } from "node:crypto";
import type { SmtpConnector, SmtpReply, SmtpSession } from "../net/smtp";
import { SmtpError } from "../net/smtp";
import type { MailHost, SmtpStatus } from "../types";

export interface RcptOutcome {
  status: SmtpStatus;
  code?: number;
  enhancedCode?: string;
  message?: string;
  mx?: string;
}

export interface ProbeResult {
  outcomes: Map<string, RcptOutcome>;
  catchAll: boolean | null;
  startTls: boolean | null;
  mx: string | null;
}

export interface ProbeOptions {
  heloName: string;
  mailFrom: string;
  port: number;
  connectTimeoutMs: number;
  commandTimeoutMs: number;
  maxRcptPerSession: number;
  useStartTls: boolean;
  connector: SmtpConnector;
}

const NOT_FOUND_TEXT =
  /(user|recipient|mailbox|address|account)\s*(is\s*)?(unknown|not found|does ?n[o']t exist|unavailable|invalid|rejected|disabled)|no such (user|mailbox|recipient|address)|unknown (user|recipient|mailbox)|invalid (recipient|mailbox|address)|does not exist|doesn't exist|not a valid|unrouteable|no mailbox/i;
const BLOCK_TEXT =
  /spam|block|black ?list|blocklist|reputation|banned|\brbl\b|spamhaus|listed|not permitted|access denied|client host|helo|reverse dns|\bptr\b|too many|rate|policy/i;

/**
 * Maps a RCPT TO reply to a mailbox status.
 *
 * Enhanced status codes (RFC 3463) are trusted first; reply text is only a
 * fallback. Anything that looks like the server refusing *us* rather than
 * the recipient is "blocked", never "rejected", so a blocked prober can not
 * mark good addresses as invalid.
 */
export function classifyRcpt(reply: SmtpReply): SmtpStatus {
  const { code, enhanced, text } = reply;
  if (code === 250 || code === 251) return "accepted";
  if (code === 252) return "blocked"; // "cannot verify, will try"
  if (code >= 400 && code < 500) return "temporary_failure";

  if (enhanced) {
    if (/^5\.1\.(0|1|3|6|10)$/.test(enhanced)) return "rejected";
    if (enhanced === "5.2.1") return "disabled";
    if (enhanced === "5.2.2") return "full";
    if (enhanced.startsWith("5.7.")) return "blocked";
  }
  if (code === 552) return "full";
  if (BLOCK_TEXT.test(text) && !NOT_FOUND_TEXT.test(text)) return "blocked";
  if (code === 550 || code === 551 || code === 553) return "rejected";
  return "blocked";
}

function outcomeFrom(reply: SmtpReply, mx: string, status = classifyRcpt(reply)): RcptOutcome {
  return {
    status,
    code: reply.code,
    enhancedCode: reply.enhanced ?? undefined,
    message: reply.text.slice(0, 300),
    mx,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function openSession(
  host: MailHost,
  opts: ProbeOptions,
  tls: boolean,
): Promise<{ session: SmtpSession; startTls: boolean } | { error: RcptOutcome }> {
  let lastError: RcptOutcome = { status: "unreachable", mx: host.exchange };
  for (const address of host.addresses.slice(0, 2)) {
    let session: SmtpSession;
    try {
      session = await opts.connector({
        address,
        hostname: host.exchange,
        port: opts.port,
        connectTimeoutMs: opts.connectTimeoutMs,
        commandTimeoutMs: opts.commandTimeoutMs,
      });
    } catch (err) {
      lastError = {
        status: "unreachable",
        message: err instanceof Error ? err.message : String(err),
        mx: host.exchange,
      };
      continue;
    }

    try {
      if (session.greeting.code !== 220) {
        const status: SmtpStatus =
          session.greeting.code >= 400 && session.greeting.code < 500
            ? "temporary_failure"
            : "blocked";
        await session.close();
        return { error: outcomeFrom(session.greeting, host.exchange, status) };
      }
      await session.ehlo(opts.heloName);
      let startTls = false;
      if (tls && session.extensions.has("STARTTLS")) {
        startTls = await session.startTls(host.exchange);
        if (startTls) await session.ehlo(opts.heloName);
      }
      return { session, startTls };
    } catch (err) {
      await session.close();
      if (tls && err instanceof SmtpError) {
        // TLS negotiation failed; retry this host once without it.
        return openSession(host, opts, false);
      }
      lastError = {
        status: "unreachable",
        message: err instanceof Error ? err.message : String(err),
        mx: host.exchange,
      };
    }
  }
  return { error: lastError };
}

/**
 * Checks whether recipients exist by opening an SMTP session to the domain's
 * MX and issuing RCPT TO, without sending any message (no DATA command).
 *
 * Real recipients are tested before the random catch-all probe, because
 * some servers drop the connection after the first unknown recipient.
 */
export async function probeMailboxes(
  domain: string,
  hosts: MailHost[],
  recipients: string[],
  opts: ProbeOptions,
): Promise<ProbeResult> {
  const outcomes = new Map<string, RcptOutcome>();
  let catchAll: boolean | null = null;
  let startTls: boolean | null = null;
  let usedMx: string | null = null;

  const randomRecipient = `sg-${randomBytes(6).toString("hex")}@${domain}`;
  let pending = [...recipients];
  let catchAllPending = true;
  let lastError: RcptOutcome = { status: "unreachable" };

  for (const host of hosts) {
    if (pending.length === 0 && !catchAllPending) break;

    // Each chunk of recipients gets its own session; the catch-all probe
    // rides along with the last one.
    const batches = chunk(pending, opts.maxRcptPerSession);
    if (batches.length === 0) batches.push([]);
    let hostFailed = false;

    for (let i = 0; i < batches.length && !hostFailed; i++) {
      const opened = await openSession(host, opts, opts.useStartTls);
      if ("error" in opened) {
        lastError = opened.error;
        hostFailed = true;
        break;
      }
      const { session } = opened;
      startTls = opened.startTls;
      usedMx = host.exchange;

      try {
        const from = await session.command(`MAIL FROM:<${opts.mailFrom}>`);
        if (from.code !== 250) {
          const status: SmtpStatus = from.code < 500 ? "temporary_failure" : "blocked";
          lastError = outcomeFrom(from, host.exchange, status);
          hostFailed = true;
          break;
        }

        for (const rcpt of batches[i]) {
          const reply = await session.command(`RCPT TO:<${rcpt}>`);
          outcomes.set(rcpt, outcomeFrom(reply, host.exchange));
        }

        if (i === batches.length - 1 && catchAllPending) {
          const reply = await session.command(`RCPT TO:<${randomRecipient}>`);
          const status = classifyRcpt(reply);
          if (status === "accepted") catchAll = true;
          else if (status === "rejected") catchAll = false;
          catchAllPending = false;
        }
      } catch (err) {
        lastError = {
          status: "unreachable",
          message: err instanceof Error ? err.message : String(err),
          mx: host.exchange,
        };
        hostFailed = true;
      } finally {
        await session.close();
      }
    }

    pending = pending.filter((r) => !outcomes.has(r));
    // A clear per-recipient answer from one MX is final; only move on to the
    // next MX for recipients we could not ask about.
  }

  for (const rcpt of pending) outcomes.set(rcpt, { ...lastError });
  return { outcomes, catchAll, startTls, mx: usedMx };
}
