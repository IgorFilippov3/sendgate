import { CONFIG } from "./config";
import { createNodeDnsClient } from "./net/dns";
import { connectSmtp } from "./net/smtp";
import { DisposableList } from "./checks/disposable";
import { createVerifier, type Verifier } from "./verifier";
import { createSandboxVerifier } from "./sandbox";

/**
 * Process-wide singletons. Kept on globalThis so Next.js dev-mode hot reloads
 * do not create a new cache and disposable list on every change.
 */
const globalStore = globalThis as unknown as {
  __sendgate?: { verifier: Verifier; sandbox: Verifier; disposable: DisposableList };
};

function init() {
  const disposable = new DisposableList({
    autoUpdate: CONFIG.disposableAutoUpdate,
    updateIntervalHours: CONFIG.disposableUpdateIntervalHours,
    sourceUrl: CONFIG.disposableSourceUrl,
  });
  const verifier = createVerifier({
    config: CONFIG,
    dns: createNodeDnsClient({
      servers: CONFIG.dnsServers,
      timeoutMs: CONFIG.dnsTimeoutMs,
      tries: CONFIG.dnsTries,
    }),
    smtpConnector: connectSmtp,
    disposable,
  });
  const sandbox = createSandboxVerifier(disposable, CONFIG);
  return { verifier, sandbox, disposable };
}

export function engine() {
  globalStore.__sendgate ??= init();
  return globalStore.__sendgate;
}

export type * from "./types";
