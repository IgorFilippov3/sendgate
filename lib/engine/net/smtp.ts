import net from "node:net";
import tls from "node:tls";
import type { Duplex } from "node:stream";

export interface SmtpReply {
  code: number;
  /** Enhanced status code (RFC 3463), e.g. "5.1.1", when present. */
  enhanced: string | null;
  lines: string[];
  /** Reply text without codes, lines joined with spaces. */
  text: string;
}

export type SmtpErrorKind = "connect" | "timeout" | "closed" | "protocol";

export class SmtpError extends Error {
  constructor(
    public readonly kind: SmtpErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SmtpError";
  }
}

export interface SmtpSession {
  readonly greeting: SmtpReply;
  readonly extensions: ReadonlySet<string>;
  readonly tls: boolean;
  ehlo(name: string): Promise<SmtpReply>;
  /** Upgrades the connection. Returns false if the server declined. */
  startTls(servername: string): Promise<boolean>;
  command(line: string): Promise<SmtpReply>;
  /** Sends QUIT (best effort) and destroys the socket. */
  close(): Promise<void>;
}

export interface SmtpConnectOptions {
  /** IP address to connect to. */
  address: string;
  /** Hostname, used for TLS SNI. */
  hostname: string;
  port: number;
  connectTimeoutMs: number;
  commandTimeoutMs: number;
}

export type SmtpConnector = (opts: SmtpConnectOptions) => Promise<SmtpSession>;

const REPLY_LINE = /^(\d{3})([ -])(.*)$/;
const ENHANCED = /^([245]\.\d{1,3}\.\d{1,3})\b\s*/;

/**
 * Incremental SMTP reply parser. Handles replies split across TCP chunks and
 * multi-line replies ("250-..." continuation, "250 ..." final line).
 */
export class ReplyParser {
  private buffer = "";
  private pending: string[] = [];

  /** Feeds raw data and returns every reply completed by it. */
  push(chunk: string): SmtpReply[] {
    this.buffer += chunk;
    const replies: SmtpReply[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, idx).replace(/\r$/, "");
      this.buffer = this.buffer.slice(idx + 1);
      const match = REPLY_LINE.exec(line);
      if (!match) {
        // Some servers send a bare code ("250") as the final line.
        if (/^\d{3}$/.test(line)) {
          this.pending.push(line + " ");
          replies.push(this.finish(Number(line)));
        } else {
          throw new SmtpError("protocol", `Malformed reply line: ${line.slice(0, 80)}`);
        }
        continue;
      }
      this.pending.push(line);
      if (match[2] === " ") replies.push(this.finish(Number(match[1])));
    }
    return replies;
  }

  private finish(code: number): SmtpReply {
    const lines = this.pending;
    this.pending = [];
    const texts = lines.map((l) => l.slice(4));
    let enhanced: string | null = null;
    const cleaned = texts.map((t) => {
      const m = ENHANCED.exec(t);
      if (m) {
        enhanced ??= m[1];
        return t.slice(m[0].length);
      }
      return t;
    });
    return {
      code,
      enhanced,
      lines,
      text: cleaned.join(" ").replace(/\s+/g, " ").trim(),
    };
  }
}

class Connection implements SmtpSession {
  greeting!: SmtpReply;
  extensions = new Set<string>();
  tls = false;

  private parser = new ReplyParser();
  private queue: SmtpReply[] = [];
  private waiter: {
    resolve: (r: SmtpReply) => void;
    reject: (e: Error) => void;
    timer: NodeJS.Timeout;
  } | null = null;
  private failure: SmtpError | null = null;
  private socket!: Duplex;

  constructor(
    private readonly opts: SmtpConnectOptions,
  ) {}

  attach(socket: Duplex) {
    this.socket = socket;
    this.parser = new ReplyParser();
    socket.setEncoding?.("utf8");
    socket.on("data", this.onData);
    socket.on("error", this.onError);
    socket.on("close", this.onClose);
    socket.on("end", this.onClose);
  }

  detach() {
    this.socket.off("data", this.onData);
    this.socket.off("error", this.onError);
    this.socket.off("close", this.onClose);
    this.socket.off("end", this.onClose);
  }

  private onData = (chunk: string | Buffer) => {
    let replies: SmtpReply[];
    try {
      replies = this.parser.push(chunk.toString());
    } catch (err) {
      this.fail(err as SmtpError);
      return;
    }
    for (const reply of replies) {
      if (this.waiter) {
        const w = this.waiter;
        this.waiter = null;
        clearTimeout(w.timer);
        w.resolve(reply);
      } else {
        this.queue.push(reply);
      }
    }
  };

  private onError = (err: Error) => {
    this.fail(new SmtpError("closed", err.message));
  };

  private onClose = () => {
    this.fail(new SmtpError("closed", "Connection closed by server"));
  };

  private fail(error: SmtpError) {
    if (this.failure) return;
    this.failure = error;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      clearTimeout(w.timer);
      w.reject(error);
    }
    this.socket.destroy();
  }

  read(): Promise<SmtpReply> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        this.fail(new SmtpError("timeout", "SMTP command timed out"));
        reject(this.failure);
      }, this.opts.commandTimeoutMs);
      this.waiter = { resolve, reject, timer };
    });
  }

  async command(line: string): Promise<SmtpReply> {
    if (this.failure) throw this.failure;
    if (/[\r\n]/.test(line)) {
      throw new SmtpError("protocol", "Command must not contain line breaks");
    }
    this.socket.write(line + "\r\n");
    return this.read();
  }

  async ehlo(name: string): Promise<SmtpReply> {
    let reply = await this.command(`EHLO ${name}`);
    if (reply.code !== 250) {
      reply = await this.command(`HELO ${name}`);
      this.extensions = new Set();
      return reply;
    }
    this.extensions = new Set(
      reply.lines.slice(1).map((l) => l.slice(4).split(" ")[0].toUpperCase()),
    );
    return reply;
  }

  async startTls(servername: string): Promise<boolean> {
    const reply = await this.command("STARTTLS");
    if (reply.code !== 220) return false;

    this.detach();
    const plain = this.socket as net.Socket;
    // Errors on the raw socket surface through the TLS socket; keep a no-op
    // listener so they never become uncaught exceptions.
    plain.on("error", () => {});
    const secure = await new Promise<tls.TLSSocket>((resolve, reject) => {
      const s = tls.connect({
        socket: plain,
        servername: net.isIP(servername) ? undefined : servername,
        // We only verify mailboxes; many MX hosts use certificates that do
        // not match their hostname. Do not reject them.
        rejectUnauthorized: false,
      });
      const timer = setTimeout(() => {
        s.destroy();
        reject(new SmtpError("timeout", "TLS handshake timed out"));
      }, this.opts.commandTimeoutMs);
      s.once("secureConnect", () => {
        clearTimeout(timer);
        resolve(s);
      });
      s.once("error", (err) => {
        clearTimeout(timer);
        reject(new SmtpError("closed", `TLS error: ${err.message}`));
      });
    });
    this.attach(secure);
    this.tls = true;
    return true;
  }

  async close(): Promise<void> {
    if (!this.failure) {
      try {
        this.socket.write("QUIT\r\n");
      } catch {
        // ignore
      }
    }
    this.failure ??= new SmtpError("closed", "Session closed");
    this.socket.destroy();
  }
}

/** Opens a TCP connection to an SMTP server and reads the greeting. */
export const connectSmtp: SmtpConnector = (opts) =>
  new Promise((resolve, reject) => {
    const socket = net.connect({ host: opts.address, port: opts.port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new SmtpError("connect", "Connection timed out"));
    }, opts.connectTimeoutMs);

    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(new SmtpError("connect", err.message));
    });

    socket.once("connect", async () => {
      clearTimeout(timer);
      socket.removeAllListeners("error");
      const conn = new Connection(opts);
      conn.attach(socket);
      try {
        conn.greeting = await conn.read();
        resolve(conn);
      } catch (err) {
        socket.destroy();
        reject(err);
      }
    });
  });
