import { CONFIG } from "./config";
import initialDomains from "./data/disposable-domains.json";

/**
 * DisposableProvider
 * 
 * A singleton service that manages the list of disposable email domains.
 * It loads a base list from a local JSON file and performs periodic 
 * background updates from a remote source to stay up-to-date.
 */
class DisposableProvider {
  private static instance: DisposableProvider;
  private domains: Set<string>;
  private lastUpdate: number = 0;
  private isUpdating: boolean = false;

  private constructor() {
    this.domains = new Set(initialDomains);
  }

  /**
   * Returns the singleton instance of the provider.
   */
  public static getInstance(): DisposableProvider {
    if (!DisposableProvider.instance) {
      DisposableProvider.instance = new DisposableProvider();
    }
    return DisposableProvider.instance;
  }

  /**
   * Retrieves the current set of known disposable domains.
   * Triggers a background update check if needed.
   * 
   * @returns A promise resolving to a Set of domain strings.
   */
  public async getDomains(): Promise<Set<string>> {
    this.checkAutoUpdate();
    return this.domains;
  }

  /**
   * Checks if a specific domain is in the disposable list.
   * Triggers a background update check if needed.
   * 
   * @param domain - The domain string to check (e.g., "example.com").
   * @returns True if the domain is identified as disposable.
   */
  public isDisposable(domain: string): boolean {
    this.checkAutoUpdate();
    return this.domains.has(domain.toLowerCase());
  }

  /**
   * Internal method to check if the auto-update interval has passed.
   * If yes, initiates a non-blocking background update.
   */
  private checkAutoUpdate() {
    if (!CONFIG.disposableAutoUpdate || this.isUpdating) return;

    const now = Date.now();
    const intervalMs = CONFIG.disposableUpdateIntervalHours * 60 * 60 * 1000;

    if (now - this.lastUpdate > intervalMs) {
      this.updateBackground();
    }
  }

  /**
   * Fetches the latest disposable domain list from the configured remote source.
   * Supports both JSON arrays and plain-text files (one domain per line).
   * Updates the internal Set in-memory without blocking.
   */
  private async updateBackground() {
    this.isUpdating = true;
    this.lastUpdate = Date.now();

    console.log("[DisposableProvider] Checking for updates...");

    try {
      const response = await fetch(CONFIG.disposableSourceUrl, {
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (!response.ok) {
        throw new Error(
          `Fetch failed: ${response.statusText} (${response.status})`,
        );
      }

      const contentType = response.headers.get("content-type");
      let domainsArray: string[] = [];

      if (contentType && contentType.includes("application/json")) {
        const json = await response.json();
        domainsArray = Array.isArray(json)
          ? json
          : json.domains && Array.isArray(json.domains)
            ? json.domains
            : [];
      } else {
        // Fallback to text parsing (one domain per line)
        const text = await response.text();
        domainsArray = text
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith("#")); // Remove empty lines and comments
      }

      if (domainsArray.length > 0) {
        let addedCount = 0;
        domainsArray.forEach((d) => {
          const domain = d.toLowerCase();
          if (!this.domains.has(domain)) {
            this.domains.add(domain);
            addedCount++;
          }
        });
        console.log(
          `[DisposableProvider] Update complete. Added ${addedCount} new domains. Total: ${this.domains.size}`,
        );
      } else {
        throw new Error(
          "Invalid format or empty list: could not find domains in response",
        );
      }
    } catch (error) {
      console.error(
        "[DisposableProvider] Background update failed:",
        error instanceof Error ? error.message : error,
      );
    } finally {
      this.isUpdating = false;
    }
  }
}

/**
 * Exported instance of the DisposableProvider.
 */
export const disposableProvider = DisposableProvider.getInstance();
