import { afterEach, describe, expect, it } from "vitest";
import net from "node:net";
import { ReplyParser, SmtpError, connectSmtp } from "@/lib/engine/net/smtp";

describe("ReplyParser", () => {
  it("joins a multi-line reply split across chunks", () => {
    const p = new ReplyParser();
    expect(p.push("250-mx.example.com Hello\r\n250-PIPEL")).toEqual([]);
    const replies = p.push("INING\r\n250 STARTTLS\r\n");
    expect(replies).toHaveLength(1);
    expect(replies[0].code).toBe(250);
    expect(replies[0].lines).toEqual([
      "250-mx.example.com Hello",
      "250-PIPELINING",
      "250 STARTTLS",
    ]);
  });

  it("extracts enhanced status codes", () => {
    const [r] = new ReplyParser().push("550 5.1.1 <x@y.com>: Recipient address rejected\r\n");
    expect(r).toMatchObject({ code: 550, enhanced: "5.1.1" });
    expect(r.text).toBe("<x@y.com>: Recipient address rejected");
  });

  it("returns several replies from one chunk", () => {
    const replies = new ReplyParser().push("250 OK\r\n550 nope\r\n");
    expect(replies.map((r) => r.code)).toEqual([250, 550]);
  });

  it("accepts bare LF line endings and a bare code", () => {
    const replies = new ReplyParser().push("220 ready\n250\n");
    expect(replies.map((r) => r.code)).toEqual([220, 250]);
  });

  it("throws on garbage", () => {
    expect(() => new ReplyParser().push("HTTP/1.1 400 Bad\r\n")).toThrow(SmtpError);
  });
});

/** Minimal SMTP server for socket-level tests. */
function startServer(handler: (line: string, socket: net.Socket) => void, greeting = "220 test ESMTP\r\n") {
  const server = net.createServer((socket) => {
    socket.write(greeting);
    let buffer = "";
    socket.on("data", (d) => {
      buffer += d.toString();
      let i;
      while ((i = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        handler(line, socket);
      }
    });
    socket.on("error", () => {});
  });
  return new Promise<{ port: number; close: () => void }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({ port, close: () => server.close() });
    });
  });
}

describe("connectSmtp", () => {
  let close: (() => void) | undefined;
  afterEach(() => close?.());

  const opts = (port: number) => ({
    address: "127.0.0.1",
    hostname: "localhost",
    port,
    connectTimeoutMs: 1000,
    commandTimeoutMs: 300,
  });

  it("runs a dialogue with fragmented multi-line replies", async () => {
    const srv = await startServer((line, s) => {
      if (line.startsWith("EHLO")) {
        // Deliberately split the multi-line reply over several writes.
        s.write("250-mx Hello\r\n250-SIZE 1000");
        setTimeout(() => s.write("\r\n250 STARTTLS\r\n"), 20);
      } else if (line.startsWith("RCPT")) s.write("550 5.1.1 No such user\r\n");
      else s.write("250 OK\r\n");
    });
    close = srv.close;
    const session = await connectSmtp(opts(srv.port));
    expect(session.greeting.code).toBe(220);
    await session.ehlo("probe.test");
    expect([...session.extensions]).toEqual(["SIZE", "STARTTLS"]);
    expect((await session.command("MAIL FROM:<a@b.test>")).code).toBe(250);
    const rcpt = await session.command("RCPT TO:<x@y.test>");
    expect(rcpt).toMatchObject({ code: 550, enhanced: "5.1.1" });
    await session.close();
  });

  it("rejects pending commands when the server hangs up", async () => {
    const srv = await startServer((line, s) => {
      if (line.startsWith("RCPT")) s.end();
      else s.write("250 OK\r\n");
    });
    close = srv.close;
    const session = await connectSmtp(opts(srv.port));
    await expect(session.command("RCPT TO:<x@y.test>")).rejects.toMatchObject({ kind: "closed" });
  });

  it("times out silent servers", async () => {
    const srv = await startServer(() => {});
    close = srv.close;
    const session = await connectSmtp(opts(srv.port));
    await expect(session.command("NOOP")).rejects.toMatchObject({ kind: "timeout" });
  });

  it("fails to connect to a closed port", async () => {
    const srv = await startServer(() => {});
    srv.close();
    await expect(connectSmtp(opts(srv.port))).rejects.toMatchObject({ kind: "connect" });
  });

  it("refuses commands containing line breaks", async () => {
    const srv = await startServer((_, s) => s.write("250 OK\r\n"));
    close = srv.close;
    const session = await connectSmtp(opts(srv.port));
    await expect(session.command("RCPT TO:<a@b>\r\nDATA")).rejects.toMatchObject({ kind: "protocol" });
    await session.close();
  });
});
