# Deploying SendGate with SMTP mailbox verification

SMTP verification needs a server that can open outbound connections to port 25. Most clouds block it (Vercel, AWS, GCP, Azure, DigitalOcean, Hetzner Cloud for new accounts). Small VPS providers that allow it include OVH and Contabo; check the provider's current policy before buying.

## 1. Pick names

You need one hostname for the prober, ideally a subdomain you do not send real mail from, e.g. `verify.yourdomain.com`. Probing affects that IP's and hostname's reputation, so keep it away from your main sending domain.

## 2. Server

Any small VPS with Docker works (1 vCPU, 1–2 GB RAM).

Check that port 25 is open **from the server**:

```bash
nc -vz -w 5 gmail-smtp-in.l.google.com 25
# "succeeded" / "open" = good; a timeout means the provider blocks it
```

## 3. DNS

| Record | Name | Value |
|---|---|---|
| A | `verify.yourdomain.com` | server IPv4 |
| PTR (in the VPS panel, "reverse DNS") | server IPv4 | `verify.yourdomain.com` |
| TXT (SPF) | `verify.yourdomain.com` | `v=spf1 a -all` |

Many mail servers drop connections from IPs without matching forward and reverse DNS. Verify:

```bash
dig +short A verify.yourdomain.com
dig +short -x <server-ip>     # must print verify.yourdomain.com.
```

## 4. Run

```bash
git clone https://github.com/IgorFilippov3/sendgate.git && cd sendgate
cat > .env <<'EOF'
SENDGATE_API_KEY=change-me
SMTP_PROBE_ENABLED=true
SMTP_HELO_NAME=verify.yourdomain.com
APP_BASE_URL=https://sendgate.yourdomain.com
EOF
docker compose up -d --build
curl -s localhost:3000/api/health
```

Put a reverse proxy (Caddy, nginx) in front for HTTPS.

After the first verification, `/api/health` shows `"smtp": { "enabled": true, "available": true }`. If `available` is `false`, port 25 is blocked and SendGate keeps working without mailbox checks.

## 5. Optional: Spamhaus DQS

Spamhaus refuses DNSBL queries from large public resolvers and from many cloud IP ranges. Register a free Data Query Service key and set `SPAMHAUS_DQS_KEY`; blocklist lookups then go through DQS.

## Good practice

- Keep `SMTP_CONCURRENCY` low (default 5). Aggressive probing gets the IP blocklisted.
- Watch for `SMTP_BLOCKED` in results: a rise means mail servers started distrusting your IP.
- Some providers (Yahoo, AOL) accept every recipient; SendGate does not probe them and returns `unknown`.
