import { getTxtRecords } from "../dns";
import { SpfResult } from "../types";

/**
 * Analyzes the SPF (Sender Policy Framework) record for a given domain.
 * 
 * Recursively follows 'include' and 'redirect' mechanisms to calculate the total
 * number of DNS lookups, ensuring compliance with the RFC 10-lookup limit.
 * 
 * @param domain - The domain to analyze.
 * @param depth - Internal recursion depth to prevent infinite loops (max 5).
 * @param state - Internal state to track the total number of DNS lookups across recursion.
 * @returns A promise resolving to an SpfResult object with findings and warnings.
 */
export async function analyzeSPF(
  domain: string,
  depth = 0,
  state = { lookups: 1 },
): Promise<SpfResult> {
  const result: SpfResult = {
    exists: false,
    record: null,
    lookups: 0,
    isStrict: false,
    warnings: [],
  };

  if (depth > 5) {
    result.warnings.push("SPF: Maximum recursion depth reached.");
    return result;
  }

  const txtRecords = await getTxtRecords(domain);
  const spf = txtRecords.flat().find((r) => r.startsWith("v=spf1"));

  if (!spf) return result;

  result.exists = true;
  result.record = spf;
  result.isStrict = spf.endsWith("-all");

  const mechanisms = spf.split(/\s+/);

  for (const mech of mechanisms) {
    if (mech.startsWith("include:")) {
      state.lookups++;
      const includeDomain = mech.split(":")[1];
      if (includeDomain) {
        await analyzeSPF(includeDomain, depth + 1, state);
      }
    } else if (mech === "a" || mech.startsWith("a:") || mech.startsWith("a/")) {
      state.lookups++;
    } else if (
      mech === "mx" ||
      mech.startsWith("mx:") ||
      mech.startsWith("mx/")
    ) {
      state.lookups++;
    } else if (mech === "ptr" || mech.startsWith("ptr:")) {
      state.lookups++;
      result.warnings.push(
        "SPF: 'ptr' mechanism is deprecated and discouraged.",
      );
    } else if (mech.startsWith("exists:")) {
      state.lookups++;
    } else if (mech.startsWith("redirect=")) {
      state.lookups++;
      const redirectDomain = mech.split("=")[1];
      if (redirectDomain) {
        await analyzeSPF(redirectDomain, depth + 1, state);
      }
    }
  }

  result.lookups = state.lookups;
  if (result.lookups > 10) {
    result.warnings.push(
      `SPF: DNS lookup limit exceeded (${result.lookups}/10).`,
    );
  }

  return result;
}
