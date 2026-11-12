/**
 * Knowledge about large mailbox providers.
 */

export interface ProviderInfo {
  /** Consumer mailbox provider (anyone can sign up for free). */
  free: boolean;
  /**
   * Whether an RCPT TO answer from this provider tells us anything. Some
   * providers accept every recipient during the SMTP dialogue and bounce
   * later, so a "250" from them is not proof that the mailbox exists.
   */
  rcptReliable: boolean;
}

const PROVIDERS: Record<string, ProviderInfo> = {
  "gmail.com": { free: true, rcptReliable: true },
  "googlemail.com": { free: true, rcptReliable: true },
  "outlook.com": { free: true, rcptReliable: true },
  "hotmail.com": { free: true, rcptReliable: true },
  "hotmail.co.uk": { free: true, rcptReliable: true },
  "hotmail.fr": { free: true, rcptReliable: true },
  "live.com": { free: true, rcptReliable: true },
  "msn.com": { free: true, rcptReliable: true },
  "icloud.com": { free: true, rcptReliable: true },
  "me.com": { free: true, rcptReliable: true },
  "mac.com": { free: true, rcptReliable: true },
  // Yahoo and AOL (same infrastructure) accept any recipient at RCPT time.
  "yahoo.com": { free: true, rcptReliable: false },
  "yahoo.co.uk": { free: true, rcptReliable: false },
  "yahoo.fr": { free: true, rcptReliable: false },
  "yahoo.de": { free: true, rcptReliable: false },
  "ymail.com": { free: true, rcptReliable: false },
  "rocketmail.com": { free: true, rcptReliable: false },
  "aol.com": { free: true, rcptReliable: false },
  "proton.me": { free: true, rcptReliable: true },
  "protonmail.com": { free: true, rcptReliable: true },
  "pm.me": { free: true, rcptReliable: true },
  "zoho.com": { free: true, rcptReliable: true },
  "gmx.com": { free: true, rcptReliable: true },
  "gmx.de": { free: true, rcptReliable: true },
  "gmx.net": { free: true, rcptReliable: true },
  "web.de": { free: true, rcptReliable: true },
  "mail.com": { free: true, rcptReliable: true },
  "email.com": { free: true, rcptReliable: true },
  "yandex.ru": { free: true, rcptReliable: true },
  "yandex.com": { free: true, rcptReliable: true },
  "ya.ru": { free: true, rcptReliable: true },
  "mail.ru": { free: true, rcptReliable: true },
  "bk.ru": { free: true, rcptReliable: true },
  "inbox.ru": { free: true, rcptReliable: true },
  "list.ru": { free: true, rcptReliable: true },
  "rambler.ru": { free: true, rcptReliable: true },
  "ukr.net": { free: true, rcptReliable: true },
  "i.ua": { free: true, rcptReliable: true },
  "meta.ua": { free: true, rcptReliable: true },
  "tutanota.com": { free: true, rcptReliable: true },
  "tuta.io": { free: true, rcptReliable: true },
  "fastmail.com": { free: false, rcptReliable: true },
  "hey.com": { free: false, rcptReliable: true },
  "qq.com": { free: true, rcptReliable: true },
  "163.com": { free: true, rcptReliable: true },
  "naver.com": { free: true, rcptReliable: true },
  "seznam.cz": { free: true, rcptReliable: true },
  "libero.it": { free: true, rcptReliable: true },
  "orange.fr": { free: true, rcptReliable: true },
  "free.fr": { free: true, rcptReliable: true },
  "t-online.de": { free: true, rcptReliable: true },
  "wp.pl": { free: true, rcptReliable: true },
  "o2.pl": { free: true, rcptReliable: true },
  "interia.pl": { free: true, rcptReliable: true },
};

export function providerInfo(domain: string): ProviderInfo | null {
  return PROVIDERS[domain] ?? null;
}

/** Domains used as reference points for typo detection. */
export const POPULAR_DOMAINS = Object.keys(PROVIDERS);

export function isKnownProvider(domain: string): boolean {
  return domain in PROVIDERS;
}
