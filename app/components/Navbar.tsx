import Link from "next/link";
import Image from "next/image";

export default async function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="w-full bg-primary py-2 px-4 text-center">
        <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-white/90">
          Built by{" "}
          <a
            href="https://senlo.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:underline underline-offset-4"
          >
            Senlo.io
          </a>{" "}
          — Need full transactional email infrastructure?{" "}
          <a
            href="https://senlo.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:underline underline-offset-4"
          >
            Explore Senlo →
          </a>
        </p>
      </div>
      <div className="w-full bg-[#f3f6fc]/80 backdrop-blur-md border-b border-[#e1e7f5]/50 shadow-[0_4px_20px_-1px_rgba(0,0,0,0.05),0_2px_4px_-2px_rgba(0,0,0,0.05)]">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 flex items-center justify-center transition-transform group-hover:rotate-6">
              <Image src={"/favicon.png"} alt="Logo" width={28} height={28} />
            </div>
            <span className="text-lg font-black tracking-tight text-[#1a1c1e]">
              Send<span className="text-primary">Gate</span>
            </span>
          </Link>

          <div className="flex items-center gap-3 md:gap-6">
            <nav className="flex items-center gap-6">
              <Link
                href="/api"
                className="text-xs font-black uppercase tracking-widest text-[#44474e] hover:text-primary transition-colors"
              >
                API
              </Link>
              <a
                href="https://github.com/IgorFilippov3/sendgate"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm rounded-xl px-6 font-black text-white shadow-lg shadow-primary/20 normal-case border-none flex items-center gap-2"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.041-1.416-4.041-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                GitHub
              </a>
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}
