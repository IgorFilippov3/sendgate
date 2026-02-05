/**
 * Normalizes an email address for consistent analysis and deduplication.
 * 
 * Performs the following operations:
 * 1. Trims whitespace.
 * 2. Converts domain and local part to lowercase.
 * 3. Handles Gmail-specific normalization (removes dots, strips '+' aliases).
 * 
 * @param email - The raw email address string.
 * @returns Object containing the original, normalized email, and a unique key for deduplication.
 */
export function normalizeEmail(email: string): {
  /** The original input string, trimmed */
  original: string;
  /** The normalized email address for display */
  normalized: string;
  /** A unique key for map-based deduplication */
  key: string;
} {
  const trimmed = email.trim();
  const [localPart, domain] = trimmed.split("@");

  if (!localPart || !domain) {
    return {
      original: trimmed,
      normalized: trimmed.toLowerCase(),
      key: trimmed.toLowerCase(),
    };
  }

  const cleanDomain = domain.toLowerCase();
  let cleanLocal = localPart.toLowerCase();

  if (cleanDomain === "gmail.com" || cleanDomain === "googlemail.com") {
    cleanLocal = cleanLocal.split("+")[0];
    cleanLocal = cleanLocal.replace(/\./g, "");
  }

  const normalized = `${cleanLocal}@${cleanDomain}`;

  return {
    original: trimmed,
    normalized: normalized,
    key: normalized,
  };
}
