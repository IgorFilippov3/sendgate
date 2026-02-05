import Link from "next/link";
import Navbar from "./components/Navbar";
import AnalysisTool from "./components/AnalysisTool";
import Footer from "./components/Footer";

export default async function Home() {
  return (
    <div className="min-h-screen bg-[#f3f6fc] font-sans selection:bg-primary/20 text-[#1a1c1e]">
      <Navbar />
      <main>
        <section className="max-w-6xl mx-auto px-6 pt-24 pb-24 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl font-black leading-[1.1] tracking-tight">
                Self-Hosted{" "}
                <span className="text-primary">Email Validation</span>
              </h1>
              <p className="text-xl text-[#44474e] font-medium leading-relaxed max-w-lg">
                Stateless utility for email risk analysis. Upload your contact
                list or use API to get a clear risk breakdown.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <Link
                  href="/api"
                  className="btn btn-primary btn-lg rounded-xl px-10 font-bold normal-case shadow-sm hover:scale-[1.02] transition-all text-white border-none"
                >
                  Explore API Docs
                </Link>
                <a
                  href="https://github.com/your-repo/sendgate"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-lg rounded-xl px-10 font-bold normal-case transition-all flex items-center gap-2"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-6 h-6"
                  >
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.041-1.416-4.041-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  GitHub
                </a>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-4">
              <TrustItem text="Passive infrastructure inspection: zero SMTP probes or recipient engagement" />
              <TrustItem text="Stateless architecture: data is processed in-memory and never persisted" />
              <TrustItem text="Heuristic scoring: probabilistic assessment based on infrastructure signals" />
            </div>
          </div>

          <div className="relative">
            <div className="absolute -top-4 -left-4 z-20">
              <span className="bg-[#1a1c1e] text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg shadow-xl">
                Try it now
              </span>
            </div>
            <AnalysisTool />
          </div>
        </section>

        <section className="bg-white py-24 border-y border-base-200">
          <div className="max-w-6xl mx-auto px-6 space-y-12">
            <h2 className="text-3xl font-black tracking-tight">
              Analysis capabilities
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <BenefitItem
                title="Risk classification"
                desc="Automated categorization based on DNS health, MX reputation, and behavioral heuristics."
              />
              <BenefitItem
                title="Infrastructure telemetry"
                desc="Deep inspection of SPF/DMARC policies and mail server delivery signals."
              />
              <BenefitItem
                title="Anomaly detection"
                desc="Identification of disposable providers, catch-alls, and misconfigured hosts."
              />
              <BenefitItem
                title="Schema-aware export"
                desc="Structured CSV output with risk scores and classification tags for ingestion."
              />
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="max-w-4xl mx-auto px-6 py-24 space-y-16"
        >
          <h2 className="text-3xl font-black text-center tracking-tight">
            How it works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
            <StepItem
              number="01"
              title="Self-host"
              desc="Deploy via Docker or run locally. Total control over your data."
            />
            <StepItem
              number="02"
              title="Analyze signals"
              desc="Submit emails via API or CLI. We assess authentication patterns, domain signals, and risk indicators."
            />
            <StepItem
              number="03"
              title="Get recommendations"
              desc="You receive a risk breakdown and guidance on how to approach your next send."
            />
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

function StepItem({
  number,
  title,
  desc,
}: {
  number: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="space-y-4">
      <div className="text-4xl font-black text-primary/20">{number}</div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="text-sm text-[#44474e] font-medium leading-relaxed">
        {desc}
      </p>
    </div>
  );
}
