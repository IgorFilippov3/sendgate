# SendGate — Self-Hosted Email Verification

SendGate checks whether an email address can receive mail and whether sending to it is risky. It is stateless: lists and results are processed in memory and never stored.

Built for developers, agencies, and privacy-sensitive businesses. **MIT Licensed.**

---

## What it checks

| Check | What it catches |
|---|---|
| Syntax | Malformed addresses, IDN domains (converted to punycode), length limits |
| Domain & MX | Non-existent domains, no mail server, null MX (RFC 7505), A/AAAA fallback, MX pointing to private IPs |
| Mailbox (SMTP, optional) | Mailbox does not exist, mailbox full or disabled, catch-all domains, greylisting |
| Disposable | ~10,000 bundled disposable domains (auto-updated), subdomains, disposable MX hosts |
| Typos | `gmial.com`, `hotmal.com`, `gmail.con` with a "did you mean" suggestion |
| Address type | Role accounts (`info@`), no-reply, placeholder/test addresses, reserved domains (`example.com`, `.test`) |
| Reputation | Domain on Spamhaus DBL, MX IP on DNSBLs, domains registered in the last 30 days (RDAP) |
| Domain auth | SPF (incl. 10-lookup limit) and DMARC, reported for information |

## Verdicts

Every result has a **verdict**, a **score** (0–100, higher is safer) and a list of **reasons** with machine-readable codes.

| Verdict | Meaning |
|---|---|
| `deliverable` | The mail server accepted the recipient and nothing else is wrong. Requires SMTP verification. |
| `risky` | Probably deliverable, but sending is likely to hurt: disposable, catch-all, typo, blocklisted or brand-new domain, no-reply. |
| `undeliverable` | Invalid syntax, the domain or mail server does not exist, or the server says the mailbox does not exist. |
| `unknown` | Nothing bad found, but the mailbox could not be confirmed: SMTP verification off, greylisting, DNS failure, or a provider that accepts every recipient (Yahoo, AOL). |

A failed lookup is never reported as a bad address: DNS timeouts and SMTP blocks give `unknown`, not `undeliverable`.

---

## Quick start

```bash
docker run -p 3000:3000 \
  -e SENDGATE_API_KEY=your_secret_key \
  ghcr.io/igorfilippov3/sendgate:latest
```

Or from source:

```bash
git clone https://github.com/IgorFilippov3/sendgate.git
cd sendgate
npm install
npm run build
npm start
```

Without SMTP verification SendGate runs anywhere, including Vercel. Addresses that pass every other check are then reported as `unknown` with score ~75.

### Enabling SMTP mailbox verification

Mailbox checks need a server with **outbound port 25 open** and a hostname with matching A and PTR records. Vercel, AWS, GCP and Azure block port 25. See **[docs/deploy.md](docs/deploy.md)** for a step-by-step VPS setup.

```bash
SMTP_PROBE_ENABLED=true
SMTP_HELO_NAME=verify.yourdomain.com
```

SendGate opens a session, issues `EHLO`, `MAIL FROM`, `RCPT TO` and `QUIT`. It never sends `DATA`, so no message is delivered. If port 25 turns out to be blocked, verification is skipped automatically and `/api/health` reports it.

---

## Configuration

All variables are optional. See [`env.example`](env.example) for the full list.

| Variable | Description | Default |
|---|---|---|
| `SENDGATE_API_KEY` | Enables the REST API. | – (API disabled) |
| `RATE_LIMIT_PER_MINUTE` | Requests per minute per client / API key. | `30` |
| `MAX_BULK_EMAILS` | Max emails per batch. | `100` |
| `SMTP_PROBE_ENABLED` | Turn on SMTP mailbox verification. | `false` |
| `SMTP_HELO_NAME` | EHLO hostname; required for SMTP verification. | – |
| `SMTP_MAIL_FROM` | Envelope sender. | `verify@<SMTP_HELO_NAME>` |
| `SMTP_CONCURRENCY` | Simultaneous SMTP sessions. | `5` |
| `DNS_SERVERS` | Comma-separated resolvers. | system resolver |
| `SPAMHAUS_DQS_KEY` | Free Spamhaus DQS key; makes Spamhaus lookups work with any resolver. | – |
| `DOMAIN_CACHE_TTL` | Seconds to cache per-domain results. | `900` |
| `DOMAIN_AGE_THRESHOLD_DAYS` | Domains younger than this are flagged. | `30` |

---

## API

All endpoints except health require `Authorization: Bearer YOUR_API_KEY`.

### Verify one address

**POST** `/api/v2/verify`

```json
{ "email": "jane@acme.dev", "sandbox": false }
```

```json
{
  "input": "jane@acme.dev",
  "email": "jane@acme.dev",
  "domain": "acme.dev",
  "verdict": "deliverable",
  "score": 95,
  "suggestion": null,
  "reasons": [
    { "code": "MAILBOX_ACCEPTED", "severity": "info", "message": "The mail server accepted this recipient" }
  ],
  "checks": {
    "syntax": { "valid": true, "local": "jane", "domain": "acme.dev" },
    "roleAccount": false,
    "noReply": false,
    "placeholder": false,
    "smtp": { "status": "accepted", "catchAll": false, "mx": "mx.acme.dev", "code": 250, "enhancedCode": "2.1.5" },
    "domain": { "mail": { "status": "ok", "hosts": [] }, "disposable": false, "freeProvider": false, "spf": {}, "dmarc": {}, "blocklists": {}, "domainAgeDays": 2140 }
  },
  "sandbox": false
}
```

### Verify a batch

**POST** `/api/v2/verify/batch`

```json
{ "emails": ["a@acme.dev", "b@acme.dev"], "sandbox": false }
```

Returns `{ "summary": {...}, "results": [...] }`. The summary counts verdicts and reason codes, duplicates and invalid addresses. Each domain is analysed once and all of its addresses are checked in a single SMTP session.

### Sandbox

With `"sandbox": true` the full pipeline runs against fake DNS and a fake mail server; nothing touches the network. The local part decides the mailbox answer: `deliverable@`, `undeliverable@`, `full@`, `greylisted@`. Any address at a domain whose first label is `catchall` (e.g. `x@catchall.acme.dev`) is a catch-all. Disposable, typo, role and reserved-domain rules behave as in production.

### Errors

```json
{ "error": { "code": "rate_limited", "message": "Too many requests. Retry in 12s." } }
```

Codes: `api_disabled` (403), `unauthorized` (401), `invalid_json` / `invalid_body` / `invalid_email` / `invalid_emails` (400), `batch_too_large` (413), `rate_limited` (429, with `Retry-After`), `internal_error` (500).

### Reason codes

`INVALID_SYNTAX`, `DOMAIN_NOT_FOUND`, `NO_MAIL_SERVER`, `NULL_MX`, `MX_NOT_ROUTABLE`, `DNS_ERROR`, `IMPLICIT_MX`, `RESERVED_DOMAIN`, `MAILBOX_NOT_FOUND`, `MAILBOX_FULL`, `MAILBOX_DISABLED`, `MAILBOX_ACCEPTED`, `CATCH_ALL`, `SMTP_TEMPORARY_FAILURE`, `SMTP_BLOCKED`, `SMTP_UNREACHABLE`, `SMTP_NOT_VERIFIED`, `PROVIDER_ACCEPTS_ALL`, `DISPOSABLE`, `ROLE_ACCOUNT`, `NO_REPLY_ADDRESS`, `PLACEHOLDER_ADDRESS`, `TYPO_SUSPECTED`, `FREE_PROVIDER`, `DOMAIN_BLOCKLISTED`, `MX_IP_BLOCKLISTED`, `NEW_DOMAIN`, `NO_SPF`, `NO_DMARC`.

### Health

**GET** `/api/health` (no auth) returns status, version, uptime and capabilities: whether SMTP verification is enabled and port 25 is reachable, the size of the disposable list, and limits.

---

## Development

```bash
npm test          # unit and integration tests (no network needed)
npm run typecheck
npm run lint
```

Network access is abstracted (`lib/engine/net`), so every check is tested against in-memory DNS and SMTP fakes, and the SMTP client against a local TCP server.

---

## Relationship to Senlo

SendGate is an open-source utility built by the team at **Senlo**. Need transactional email infrastructure and a drag-and-drop editor? Check out [Senlo.io](https://senlo.io).

## License

MIT License. The bundled disposable domain list comes from [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains) (CC0).
