import { loadConfig, type Config } from "./config";
import { createFakeDns, createScriptedConnector, reply } from "./net/fake";
import { createVerifier, type Verifier } from "./verifier";
import type { DisposableList } from "./checks/disposable";

/**
 * Sandbox: the full verification pipeline running against fake DNS and a fake
 * mail server, so API integrations can be tested without network access.
 *
 * Every domain resolves and has a mail server. The mailbox answer depends on
 * the local part:
 *   deliverable@...   accepted
 *   undeliverable@... 550 5.1.1 mailbox does not exist
 *   full@...          552 5.2.2 mailbox full
 *   greylisted@...    451 4.7.1 try again later
 * Domains whose first label is "catchall" (anything@catchall.acme.dev)
 * accept every address.
 * Any other local part is accepted. Domain-level rules still apply, so
 * disposable domains, typo domains, role accounts and reserved domains
 * (*.invalid, example.com) behave as in production.
 */
export const SANDBOX_LOCAL_PARTS = [
  "deliverable",
  "undeliverable",
  "full",
  "greylisted",
] as const;

export function createSandboxVerifier(disposable: DisposableList, base: Config = loadConfig()): Verifier {
  const config: Config = {
    ...base,
    smtpProbeEnabled: true,
    smtpHeloName: "sandbox.sendgate.local",
    smtpMailFrom: "verify@sandbox.sendgate.local",
    rdapEnabled: false,
    domainBlocklists: [],
    ipBlocklists: [],
    domainCacheTtlSec: 0,
  };

  const dns = createFakeDns({}, (type, name) => {
    if (type === "mx") return { status: "ok", records: [{ exchange: `mx.${name}`, priority: 10 }] };
    if (type === "a") return { status: "ok", records: ["93.184.216.34"] };
    if (type === "txt") {
      return name.startsWith("_dmarc.")
        ? { status: "ok", records: ["v=DMARC1; p=none"] }
        : { status: "ok", records: ["v=spf1 mx -all"] };
    }
    return { status: "nodata" };
  }, { record: false });

  const connector = createScriptedConnector(() => ({
    rcpt: (address: string) => {
      const [local, domain] = address.split("@");
      if (domain.split(".")[0] === "catchall") return reply(250, "OK", "2.1.5");
      if (local.startsWith("sg-")) return reply(550, "No such user", "5.1.1");
      if (local === "undeliverable") return reply(550, "No such user", "5.1.1");
      if (local === "full") return reply(552, "Mailbox full", "5.2.2");
      if (local === "greylisted") return reply(451, "Greylisted, try again later", "4.7.1");
      return reply(250, "OK", "2.1.5");
    },
  }), { record: false });

  return createVerifier({ config, dns, smtpConnector: connector, disposable });
}
