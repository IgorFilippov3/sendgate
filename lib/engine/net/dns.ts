import { Resolver } from "node:dns/promises";

/**
 * Outcome of a single DNS query. Unlike the previous implementation, a failed
 * lookup is never silently turned into "no records": NXDOMAIN, NODATA and
 * resolver errors are distinct states.
 */
export type DnsResult<T> =
  | { status: "ok"; records: T[] }
  /** The name does not exist (NXDOMAIN). */
  | { status: "nxdomain" }
  /** The name exists but has no records of this type. */
  | { status: "nodata" }
  /** Timeout, SERVFAIL, refused, etc. We do not know the answer. */
  | { status: "error"; code: string };

export interface MxRecord {
  exchange: string;
  priority: number;
}

export interface DnsClient {
  mx(name: string): Promise<DnsResult<MxRecord>>;
  /** Each TXT record with its character-strings already joined. */
  txt(name: string): Promise<DnsResult<string>>;
  a(name: string): Promise<DnsResult<string>>;
  aaaa(name: string): Promise<DnsResult<string>>;
}

const NXDOMAIN_CODES = new Set(["ENOTFOUND"]);
const NODATA_CODES = new Set(["ENODATA"]);

function errorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code: unknown }).code);
  }
  return "EUNKNOWN";
}

export async function query<T>(
  fn: () => Promise<T[]>,
): Promise<DnsResult<T>> {
  try {
    const records = await fn();
    return records.length > 0
      ? { status: "ok", records }
      : { status: "nodata" };
  } catch (err) {
    const code = errorCode(err);
    if (NXDOMAIN_CODES.has(code)) return { status: "nxdomain" };
    if (NODATA_CODES.has(code)) return { status: "nodata" };
    return { status: "error", code };
  }
}

export function createNodeDnsClient(options: {
  servers: string[];
  timeoutMs: number;
  tries: number;
}): DnsClient {
  const resolver = new Resolver({
    timeout: options.timeoutMs,
    tries: options.tries,
  });
  if (options.servers.length > 0) resolver.setServers(options.servers);

  return {
    mx: (name) =>
      query(async () =>
        (await resolver.resolveMx(name)).map((r) => ({
          exchange: r.exchange.replace(/\.$/, "").toLowerCase(),
          priority: r.priority,
        })),
      ),
    txt: (name) =>
      query(async () => (await resolver.resolveTxt(name)).map((c) => c.join(""))),
    a: (name) => query(() => resolver.resolve4(name)),
    aaaa: (name) => query(() => resolver.resolve6(name)),
  };
}

/** Records of a result, or an empty list for any non-ok status. */
export function recordsOf<T>(result: DnsResult<T>): T[] {
  return result.status === "ok" ? result.records : [];
}
