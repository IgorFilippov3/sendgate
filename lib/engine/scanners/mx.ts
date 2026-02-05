import net from "node:net";
import { getMxRecords, getARecords } from "../dns";
import { MxResult } from "../types";

/**
 * Checks if a mail server supports STARTTLS encryption on port 25.
 * 
 * @param host - The hostname of the mail server to test.
 * @returns A promise resolving to true if STARTTLS is supported.
 */
async function checkTlsSupport(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(25, host);
    socket.setTimeout(2500);

    let step = 0;
    socket.on("data", (data) => {
      const response = data.toString();

      if (step === 0 && response.startsWith("220")) {
        socket.write("EHLO check.sendgate.com\r\n");
        step = 1;
      } else if (step === 1) {
        resolve(
          response.includes("STARTTLS") || response.includes("250-STARTTLS"),
        );
        socket.end("QUIT\r\n");
        socket.destroy();
      }
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Probes a mail server to determine if it is configured as a catch-all.
 * 
 * Performs an SMTP handshake and attempts to verify a non-existent, random recipient.
 * If the server accepts the recipient (250 OK), it is likely a catch-all domain.
 * 
 * @param host - The hostname of the mail server.
 * @param domain - The domain being tested.
 * @returns A promise resolving to true if the domain is a catch-all.
 */
export async function probeCatchAll(
  host: string,
  domain: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(25, host);
    socket.setTimeout(4000);

    const randomLocal = `check_${Math.random().toString(36).substring(2, 10)}`;
    const testEmail = `${randomLocal}@${domain}`;

    let step = 0;
    socket.on("data", (data) => {
      const response = data.toString();

      try {
        if (step === 0 && response.startsWith("220")) {
          socket.write(`EHLO check.sendgate.com\r\n`);
          step = 1;
        } else if (step === 1 && response.startsWith("250")) {
          socket.write(`MAIL FROM:<verify@sendgate.com>\r\n`);
          step = 2;
        } else if (step === 2 && response.startsWith("250")) {
          socket.write(`RCPT TO:<${testEmail}>\r\n`);
          step = 3;
        } else if (step === 3) {
          resolve(response.startsWith("250"));
          socket.end("QUIT\r\n");
          socket.destroy();
        }
      } catch (err) {
        socket.destroy();
        resolve(false);
      }
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Analyzes the email infrastructure for a given domain.
 * 
 * Fetches MX records, resolves their IP addresses, and checks for TLS support.
 * 
 * @param domain - The domain to analyze.
 * @returns A promise resolving to an MxResult containing detailed server information.
 */
export async function analyzeInfrastructure(domain: string): Promise<MxResult> {
  const mxRecords = await getMxRecords(domain);

  if (mxRecords.length === 0) {
    return { exists: false, records: [] };
  }

  const detailedRecords = await Promise.all(
    mxRecords.map(async (mx) => {
      const [ips, hasTls] = await Promise.all([
        getARecords(mx.exchange),
        checkTlsSupport(mx.exchange),
      ]);

      return {
        exchange: mx.exchange,
        priority: mx.priority,
        hasTls,
        ipAddresses: ips,
      };
    }),
  );

  return {
    exists: true,
    records: detailedRecords,
  };
}
