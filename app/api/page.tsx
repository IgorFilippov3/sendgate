import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default async function ApiLandingPage() {
  return (
    <div className="min-h-screen bg-[#f3f6fc] font-sans selection:bg-primary/20 text-[#1a1c1e]">
      <Navbar />
      <main>
        <section className="max-w-6xl mx-auto px-6 pt-24 pb-24 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="inline-block bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                Developer API
              </div>
              <h1 className="text-5xl md:text-6xl font-black leading-[1.1] tracking-tight">
                Integrate email risk analysis{" "}
                <span className="text-primary">into your own apps</span>
              </h1>
              <p className="text-xl text-[#44474e] font-medium leading-relaxed max-w-lg">
                SendGate provides a robust REST API for self-hosted deployments.
                Automate list hygiene by checking risks in real-time within your
                own infrastructure.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <a
                  href="#docs"
                  className="btn btn-primary btn-lg rounded-xl px-10 font-bold normal-case shadow-sm hover:scale-[1.02] transition-all text-white border-none"
                >
                  View Documentation
                </a>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-4 border-t border-[#e1e7f5]">
              <TrustItem text="Standard REST API with Bearer auth" />
              <TrustItem text="Real-time technical & behavioral analysis" />
              <TrustItem text="Sandbox mode with deterministic results for testing" />
            </div>
          </div>

          <div className="relative">
            <div className="absolute -top-4 -left-4 z-20">
              <span className="bg-[#1a1c1e] text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg shadow-xl">
                JSON Response
              </span>
            </div>
            <div className="bg-[#1a1c1e] rounded-2xl border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.2)] p-8 space-y-6">
              <pre className="text-xs font-mono leading-relaxed text-white/90 overflow-x-auto">
                {`{
  "input": "jane@acme.dev",
  "email": "jane@acme.dev",
  "domain": "acme.dev",
  "verdict": "deliverable",
  "score": 95,
  "suggestion": null,
  "reasons": [
    {
      "code": "MAILBOX_ACCEPTED",
      "severity": "info",
      "message": "The mail server accepted this recipient"
    }
  ],
  "checks": {
    "syntax": { "valid": true, ... },
    "roleAccount": false,
    "smtp": { "status": "accepted", "catchAll": false, ... },
    "domain": { "mail": { "status": "ok", ... }, ... }
  }
}`}
              </pre>
              <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                <div className="flex gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                </div>
                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                  HTTP 200 OK
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white py-24 border-y border-base-200">
          <div className="max-w-6xl mx-auto px-6 space-y-12">
            <h2 className="text-3xl font-black tracking-tight">
              Built for developers
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <BenefitItem
                title="Single & batch verification"
                desc="Real-time checks for signup forms, and batch checks for lists."
              />
              <BenefitItem
                title="Sandbox Environment"
                desc="Test your integration without DNS or SMTP traffic: deliverable@, undeliverable@, full@ and greylisted@ return fixed results."
              />
              <BenefitItem
                title="Mailbox checks"
                desc="MX resolution, optional SMTP RCPT verification and catch-all detection."
              />
              <BenefitItem
                title="Behavioral Detection"
                desc="Identify typos, role-based, and disposable emails."
              />
            </div>
          </div>
        </section>

        <section
          id="docs"
          className="max-w-4xl mx-auto px-6 py-24 space-y-16 text-[#1a1c1e]"
        >
          <h2 className="text-3xl font-black text-center tracking-tight">
            API Reference
          </h2>

          <div className="space-y-12">
            <div className="space-y-4">
              <h3 className="text-xl font-bold">Authentication</h3>
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800">
                <strong>Self-Hosted Only:</strong> To enable API access, you
                must set the <code>SENDGATE_API_KEY</code> environment variable
                on your own instance. This public demo does not accept external
                API requests.
              </div>
              <p className="text-[#44474e]">
                Pass your configured key in the <code>Authorization</code>{" "}
                header:
              </p>
              <pre className="bg-[#1a1c1e] text-white p-4 rounded-xl text-sm overflow-x-auto">
                {`Authorization: Bearer YOUR_CONFIGURED_KEY`}
              </pre>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold">Verify an Email</h3>
              <div className="flex items-center gap-4">
                <span className="bg-primary text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-md">
                  POST
                </span>
                <code className="text-sm font-bold">/api/v2/verify</code>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                <div className="space-y-4">
                  <p className="text-sm font-bold uppercase tracking-widest opacity-40">
                    Request Body
                  </p>
                  <pre className="bg-[#1a1c1e] text-white p-4 rounded-xl text-xs overflow-x-auto">
                    {`{
  "email": "jane@acme.dev",
  "sandbox": false
}`}
                  </pre>
                </div>
                <div className="space-y-4">
                  <p className="text-sm font-bold uppercase tracking-widest opacity-40">
                    Response
                  </p>
                  <pre className="bg-[#1a1c1e] text-white p-4 rounded-xl text-xs overflow-x-auto">
                    {`{
  "input": "jane@acme.dev",
  "email": "jane@acme.dev",
  "domain": "acme.dev",
  "verdict": "deliverable",
  "score": 95,
  "suggestion": null,
  "reasons": [
    {
      "code": "MAILBOX_ACCEPTED",
      "severity": "info",
      "message": "The mail server accepted this recipient"
    }
  ],
  "checks": {
    "syntax": { "valid": true, ... },
    "roleAccount": false,
    "smtp": { "status": "accepted", "catchAll": false, ... },
    "domain": { "mail": { "status": "ok", ... }, ... }
  }
}`}
                  </pre>
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-8 border-t border-[#e1e7f5]">
              <h3 className="text-xl font-bold">Verify a Batch</h3>
              <div className="flex items-center gap-4">
                <span className="bg-primary text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-md">
                  POST
                </span>
                <code className="text-sm font-bold">/api/v2/verify/batch</code>
              </div>
              <p className="text-[#44474e]">
                Up to <code>MAX_BULK_EMAILS</code> addresses per request.
                Duplicates are removed; each domain is checked once.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                <pre className="bg-[#1a1c1e] text-white p-4 rounded-xl text-xs overflow-x-auto">
                  {`{
  "emails": ["a@acme.dev", "b@acme.dev"],
  "sandbox": false
}`}
                </pre>
                <pre className="bg-[#1a1c1e] text-white p-4 rounded-xl text-xs overflow-x-auto">
                  {`{
  "summary": {
    "total": 2, "unique": 2,
    "duplicates": 0, "invalid": 0,
    "verdicts": { "deliverable": 2, "risky": 0,
                  "undeliverable": 0, "unknown": 0 },
    "reasons": { "MAILBOX_ACCEPTED": 2 }
  },
  "results": [ ... ]
}`}
                </pre>
              </div>
            </div>

            <div className="space-y-4 pt-8 border-t border-[#e1e7f5]">
              <h3 className="text-xl font-bold">Verdicts</h3>
              <ul className="text-[#44474e] space-y-2 text-sm">
                <li><strong>deliverable</strong>: the mail server accepted the recipient and nothing else is wrong.</li>
                <li><strong>risky</strong>: deliverable, but likely to hurt (disposable, catch-all, typo, blocklisted domain, no-reply).</li>
                <li><strong>undeliverable</strong>: invalid syntax, missing domain or mail server, or the mailbox does not exist.</li>
                <li><strong>unknown</strong>: nothing bad found, but the mailbox could not be confirmed (SMTP verification off, greylisting, provider that accepts everything).</li>
              </ul>
            </div>

            <div className="space-y-4 pt-8 border-t border-[#e1e7f5]">
              <h3 className="text-xl font-bold">Health Check</h3>
              <div className="flex items-center gap-4">
                <span className="bg-green-600 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-md">
                  GET
                </span>
                <code className="text-sm font-bold">/api/health</code>
              </div>
              <p className="text-[#44474e]">
                Monitor instance status, version, and uptime. No authentication
                required.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                <div className="space-y-4">
                  <p className="text-sm font-bold uppercase tracking-widest opacity-40">
                    Sample Response
                  </p>
                  <pre className="bg-[#1a1c1e] text-white p-4 rounded-xl text-xs overflow-x-auto">
                    {`{
  "status": "healthy",
  "version": "0.2.0",
  "uptime": 3600.5,
  "capabilities": {
    "smtp": { "enabled": true, "available": true },
    "disposableDomains": 10181,
    "api": true,
    "maxBulkEmails": 100
  }
}`}
                  </pre>
                </div>
                <div className="flex flex-col justify-center space-y-4">
                  <div className="p-4 bg-green-50 border border-green-100 rounded-xl">
                    <p className="text-sm text-green-800 font-medium">
                      <strong>Pro tip:</strong> Use this endpoint for Docker
                      health checks or external monitoring services like
                      UptimeRobot.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function TrustItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 text-xs font-bold text-[#44474e] opacity-70">
      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1 flex-none" />
      {text}
    </div>
  );
}

function BenefitItem({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="space-y-2">
      <h3 className="text-base font-bold tracking-tight">{title}</h3>
      <p className="text-sm text-[#44474e] leading-relaxed font-medium">
        {desc}
      </p>
    </div>
  );
}
