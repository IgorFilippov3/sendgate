import { getTxtRecords } from "../dns";
import { DmarcResult } from "../types";

/**
 * Analyzes the DMARC record for a given domain.
 * 
 * Checks for the existence of a DMARC record at `_dmarc.<domain>`,
 * parses the configured policy (p=), and identifies alignment requirements.
 * 
 * @param domain - The domain to analyze.
 * @returns A promise resolving to a DmarcResult object.
 */
export async function analyzeDMARC(domain: string): Promise<DmarcResult> {
  const result: DmarcResult = {
    exists: false,
    record: null,
    policy: "unknown",
    alignment: "relaxed",
  };

  try {
    const records = await getTxtRecords(`_dmarc.${domain}`);
    const dmarc = records.flat().find((r) => r.startsWith("v=DMARC1"));

    if (!dmarc) return result;

    result.exists = true;
    result.record = dmarc;

    if (dmarc.includes("p=reject")) result.policy = "reject";
    else if (dmarc.includes("p=quarantine")) result.policy = "quarantine";
    else if (dmarc.includes("p=none")) result.policy = "none";

    if (dmarc.includes("aspf=s") || dmarc.includes("adkim=s")) {
      result.alignment = "strict";
    }
  } catch {}

  return result;
}
