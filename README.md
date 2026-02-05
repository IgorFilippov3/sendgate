# SendGate — Self-Hosted Email Validation Utility

SendGate is a lightweight, stateless utility for email validation and risk assessment. It identifies potential bounces, spam traps, and infrastructure patterns that could damage your domain reputation.

Built for developers, agencies, and privacy-sensitive businesses. **MIT Licensed.**

---

## Key Features

- **Privacy First**: SendGate does not store email lists or analysis results. All processing happens in-memory.
- **Stateless Analysis**: No database required. We don't store your emails.
- **REST API**: Real-time single email verification for your apps.
- **Bulk CSV Support**: Process lists with configurable size limits (`MAX_BULK_EMAILS`).
- **Infrastructure Signals**: Deep assessment of SPF, DMARC, MX records, and known provider patterns.
- **Self-Hosted**: Run it on your own infrastructure via Docker for total data control.

---

## Quick Start

### 1. Run with Docker

```bash
docker run -p 3000:3000 \
  -e SENDGATE_API_KEY=your_secret_key \
  -e APP_BASE_URL=http://localhost:3000 \
  ghcr.io/your-username/sendgate:latest
```

### 2. Manual Setup

```bash
git clone https://github.com/your-repo/sendgate.git
cd sendgate
npm install
npm run build
npm start
```

---

## Privacy

SendGate does not store email lists or analysis results. All processing happens in-memory unless explicitly modified by the host. This makes it ideal for handling PII and sensitive contact lists.

---

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `SENDGATE_API_KEY` | Key for API authentication. If not set, API is disabled. | - |
| `MAX_BULK_EMAILS` | Max emails per CSV upload. Use with caution (memory impact). | 100 |
| `APP_BASE_URL` | Base URL for absolute links and metadata. | `http://localhost:3000` |
| `APP_VERSION` | Current application version for health reporting. | `0.1.0` |

---

## API Reference

### Analyze Single Email

**POST** `/api/v1/analyze/single`

**Headers:**
`Authorization: Bearer YOUR_API_KEY`

**Request Body:**
```json
{
  "email": "test@example.com",
  "sandbox": false
}
```

**Response:**
```json
{
  "email": "test@example.com",
  "risk": "safe",
  "score": 95,
  "details": {
    "is_disposable": false,
    "has_mx": true,
    "has_spf": true,
    "has_dmarc": true
  },
  "findings": [
    "Verified provider configuration",
    "Standard shared infrastructure"
  ]
}
```

### Health Check

**GET** `/api/health`

No authentication required. Returns the current status and version of the instance.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-05T12:00:00.000Z",
  "version": "0.1.0",
  "uptime": 1234.56,
  "env": "production"
}
```

---

## How It Works

SendGate assesses risk based on four primary categories:

1. **Authentication**: Validation of SPF and DMARC policies.
2. **Infrastructure**: Analysis of MX records, TLS paths, and infrastructure signals.
3. **Reputation**: Checks against public blocklists and historical domain signals.
4. **Behavioral**: Identification of catch-alls, disposable domains, and role-based addresses.

---

## Relationship to Senlo

SendGate is an open-source utility built by the team at **Senlo**. 

Need a full-scale transactional email infrastructure and a beautiful drag-and-drop editor? Check out [Senlo.io](https://senlo.io).

---

## License

MIT License. Feel free to fork, modify, and use in your own projects.
