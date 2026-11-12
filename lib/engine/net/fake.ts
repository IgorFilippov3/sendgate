/**
 * In-memory DNS and SMTP implementations. Used by the API sandbox mode and by
 * the test suite; they never touch the network.
 */
import type { DnsClient, DnsResult, MxRecord } from "./dns";
import type { SmtpConnector, SmtpReply, SmtpSession } from "./smtp";
import { SmtpError } from "./smtp";

export type Answer<T> = T[] | "nxdomain" | "nodata" | { error: string };

export interface FakeZone {
  mx?: Record<string, Answer<MxRecord>>;
  txt?: Record<string, Answer<string>>;
  a?: Record<string, Answer<string>>;
  aaaa?: Record<string, Answer<string>>;
}

function toResult<T>(answer: Answer<T> | undefined, fallback: DnsResult<T>): DnsResult<T> {
  if (answer === undefined) return fallback;
  if (answer === "nxdomain") return { status: "nxdomain" };
  if (answer === "nodata") return { status: "nodata" };
  if (!Array.isArray(answer)) return { status: "error", code: answer.error };
  return answer.length ? { status: "ok", records: answer } : { status: "nodata" };
}

/**
 * DNS client backed by a static zone. Names missing from a table resolve via
 * `fallback` (default NXDOMAIN), or via a function for wildcard behaviour.
 */
export function createFakeDns(
  zone: FakeZone,
  fallback: (type: keyof FakeZone, name: string) => DnsResult<unknown> = () => ({
    status: "nxdomain",
  }),
  options: { record?: boolean } = {},
): DnsClient & { queries: string[] } {
  const queries: string[] = [];
  const record = options.record ?? true;
  const lookup = <T>(type: keyof FakeZone, name: string): Promise<DnsResult<T>> => {
    if (record) queries.push(`${type} ${name}`);
    const table = zone[type] as Record<string, Answer<T>> | undefined;
    return Promise.resolve(toResult(table?.[name], fallback(type, name) as DnsResult<T>));
  };
  return {
    queries,
    mx: (n) => lookup("mx", n),
    txt: (n) => lookup("txt", n),
    a: (n) => lookup("a", n),
    aaaa: (n) => lookup("aaaa", n),
  };
}

export function reply(code: number, text = "", enhanced: string | null = null): SmtpReply {
  const line = `${code} ${enhanced ? enhanced + " " : ""}${text}`;
  return { code, enhanced, lines: [line], text };
}

export interface ScriptedServer {
  greeting?: SmtpReply;
  extensions?: string[];
  mailFrom?: SmtpReply;
  /** Reply for a RCPT TO address. */
  rcpt: (address: string) => SmtpReply;
  /** Throw a connect error for these IP addresses. */
  unreachable?: string[];
  /** Drop the connection after this many RCPT commands. */
  dropAfterRcpt?: number;
}

export interface ScriptedConnector extends SmtpConnector {
  log: string[];
  sessions: number;
}

/** SMTP connector that answers from a script, per connected IP address. */
export function createScriptedConnector(
  servers: (address: string, hostname: string) => ScriptedServer,
  options: { record?: boolean } = {},
): ScriptedConnector {
  const entries: string[] = [];
  const log = options.record === false ? { push: () => 0 } : entries;
  const connector = (async (opts) => {
    const server = servers(opts.address, opts.hostname);
    log.push(`CONNECT ${opts.hostname} ${opts.address}`);
    if (server.unreachable?.includes(opts.address)) {
      throw new SmtpError("connect", "ECONNREFUSED");
    }
    connector.sessions++;
    let rcptCount = 0;
    let closed = false;
    const session: SmtpSession = {
      greeting: server.greeting ?? reply(220, "fake ESMTP"),
      extensions: new Set(server.extensions ?? []),
      tls: false,
      async ehlo(name) {
        log.push(`EHLO ${name}`);
        return reply(250, "hello");
      },
      async startTls() {
        log.push("STARTTLS");
        return true;
      },
      async command(line) {
        if (closed) throw new SmtpError("closed", "closed");
        log.push(line);
        if (line.startsWith("MAIL FROM")) return server.mailFrom ?? reply(250, "OK", "2.1.0");
        const m = /^RCPT TO:<(.+)>$/.exec(line);
        if (m) {
          rcptCount++;
          if (server.dropAfterRcpt !== undefined && rcptCount > server.dropAfterRcpt) {
            closed = true;
            throw new SmtpError("closed", "Connection closed by server");
          }
          return server.rcpt(m[1]);
        }
        return reply(250, "OK");
      },
      async close() {
        closed = true;
        log.push("QUIT");
      },
    };
    return session;
  }) as ScriptedConnector;
  connector.log = entries;
  connector.sessions = 0;
  return connector;
}
