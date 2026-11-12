import bundled from "../data/disposable-domains.json";

/**
 * MX hosts operated by disposable-mail services. Matched by whole labels
 * ("mx.mailinator.com" matches "mailinator.com"; "notmailinator.com" does
 * not), so legitimate hosts are never caught by substring accidents.
 */
const DISPOSABLE_MX_HOSTS = [
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamailblock.com",
  "sharklasers.com",
  "grr.la",
  "yopmail.com",
  "10minutemail.com",
  "dispostable.com",
  "temp-mail.org",
  "temp-mail.io",
  "temp-mail.ru",
  "tempmail.net",
  "tempmail.plus",
  "tmail.ws",
  "mail.tm",
  "mail.gw",
  "secmail.pro",
  "one-time.email",
  "dropmail.me",
  "eml.monster",
  "fexpost.com",
  "fextemp.com",
  "fexbox.org",
  "mailboxy.fun",
];

function suffixes(host: string): string[] {
  const labels = host.split(".");
  const out: string[] = [];
  for (let i = 0; i <= labels.length - 2; i++) out.push(labels.slice(i).join("."));
  return out;
}

export interface DisposableOptions {
  autoUpdate: boolean;
  updateIntervalHours: number;
  sourceUrl: string;
  fetchFn?: typeof fetch;
  logger?: Pick<Console, "info" | "warn">;
}

/** Below this size a downloaded list is treated as broken and ignored. */
const MIN_REMOTE_LIST_SIZE = 1000;

export class DisposableList {
  private domains: Set<string>;
  private readonly mxHosts = new Set(DISPOSABLE_MX_HOSTS);
  private lastUpdate = 0;
  private updating: Promise<void> | null = null;

  constructor(
    private readonly options: DisposableOptions,
    initial: string[] = bundled as string[],
  ) {
    this.domains = new Set(initial);
    // The bundled list is fresh as of the build; wait one interval before
    // the first remote refresh.
    this.lastUpdate = Date.now();
  }

  get size() {
    return this.domains.size;
  }

  /** Matches the domain and every parent domain (sub.mailinator.com). */
  isDisposableDomain(domain: string): boolean {
    this.maybeUpdate();
    return suffixes(domain).some((s) => this.domains.has(s));
  }

  isDisposableMx(exchanges: string[]): boolean {
    return exchanges.some((mx) => suffixes(mx).some((s) => this.mxHosts.has(s)));
  }

  private maybeUpdate() {
    if (!this.options.autoUpdate || this.updating) return;
    const interval = this.options.updateIntervalHours * 3600_000;
    if (Date.now() - this.lastUpdate < interval) return;
    this.updating = this.update().finally(() => {
      this.updating = null;
    });
  }

  /** Downloads the list and replaces the current one. Never throws. */
  async update(): Promise<void> {
    this.lastUpdate = Date.now();
    const log = this.options.logger ?? console;
    const fetchFn = this.options.fetchFn ?? fetch;
    try {
      const res = await fetchFn(this.options.sourceUrl, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      let list: string[];
      try {
        const json = JSON.parse(text);
        list = Array.isArray(json) ? json : Array.isArray(json?.domains) ? json.domains : [];
      } catch {
        list = text.split("\n");
      }
      const next = new Set(
        list
          .map((d) => String(d).trim().toLowerCase())
          .filter((d) => d && !d.startsWith("#") && d.includes(".")),
      );
      if (next.size < MIN_REMOTE_LIST_SIZE) {
        throw new Error(`list too small (${next.size} entries)`);
      }
      // Replace rather than merge, so domains removed upstream as false
      // positives stop being flagged.
      this.domains = next;
      log.info(`[disposable] list updated: ${next.size} domains`);
    } catch (err) {
      log.warn(
        `[disposable] update failed, keeping ${this.domains.size} domains:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
