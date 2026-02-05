import { Resolver } from "node:dns/promises";
import { CONFIG } from "./config";

const resolver = new Resolver();
resolver.setServers(CONFIG.dnsServers);

const DEFAULT_TIMEOUT = CONFIG.dnsTimeout;
const MAX_RETRIES = CONFIG.dnsRetries;

/**
 * Executes a DNS query with built-in timeout and retry logic.
 *
 * @template T - The expected return type of the DNS query.
 * @param fn - The async function performing the DNS resolution.
 * @param retries - Number of retry attempts. Defaults to CONFIG.dnsRetries.
 * @returns A promise resolving to the query result.
 * @throws The last encountered error if all retries fail.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i <= retries; i++) {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("DNS_TIMEOUT")),
        DEFAULT_TIMEOUT,
      );
    });

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      clearTimeout(timeoutId!);
      return result as T;
    } catch (err: unknown) {
      clearTimeout(timeoutId!);
      lastError = err;

      const isTimeout =
        err instanceof Error &&
        (err.message === "DNS_TIMEOUT" ||
          (err as { code?: string }).code?.includes("ETIMEOUT"));

      if (!isTimeout) {
        throw err;
      }

      if (i < retries) {
        await new Promise((res) => setTimeout(res, 500 * (i + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * Resolves MX (Mail Exchange) records for a given domain.
 *
 * @param domain - The domain to lookup MX records for.
 * @returns A promise resolving to an array of MX records, or an empty array on failure.
 */
export async function getMxRecords(domain: string) {
  try {
    return await withRetry(() => resolver.resolveMx(domain));
  } catch {
    return [];
  }
}

/**
 * Resolves TXT records for a given domain.
 * Commonly used for SPF and DMARC record retrieval.
 *
 * @param domain - The domain to lookup TXT records for.
 * @returns A promise resolving to an array of TXT records, or an empty array on failure.
 */
export async function getTxtRecords(domain: string) {
  try {
    return await withRetry(() => resolver.resolveTxt(domain));
  } catch {
    return [];
  }
}

/**
 * Resolves IPv4 (A) records for a given domain.
 *
 * @param domain - The domain to lookup A records for.
 * @returns A promise resolving to an array of IP addresses, or an empty array on failure.
 */
export async function getARecords(domain: string) {
  try {
    return await withRetry(() => resolver.resolve4(domain));
  } catch {
    return [];
  }
}

/**
 * Resolves PTR (Reverse DNS) records for a given IP address.
 *
 * @param ip - The IP address to lookup PTR records for.
 * @returns A promise resolving to an array of hostnames, or an empty array on failure.
 */
export async function getPtrRecords(ip: string) {
  try {
    return await withRetry(() => resolver.reverse(ip));
  } catch {
    return [];
  }
}
