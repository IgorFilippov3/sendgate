import { SiX, SiDevdotto } from "react-icons/si";

export default function Footer() {
  return (
    <footer className="py-12 border-t border-base-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="flex flex-col items-center md:items-start gap-2">
          <p className="text-xs font-black uppercase tracking-widest opacity-40">
            © {new Date().getFullYear()} SendGate • MIT Licensed
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-30">
            A privacy-first email validation utility
          </p>
        </div>

        <div className="flex flex-col items-center md:items-end gap-3">
          <p className="text-xs font-bold text-[#44474e]">
            Created by{" "}
            <span className="text-[#1a1c1e] font-black">Ihor Filippov</span>
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://x.com/tagtag193"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1a1c1e] hover:text-primary transition-colors"
              aria-label="Follow on X (Twitter)"
            >
              <SiX className="w-5 h-5" />
            </a>
            <a
              href="https://dev.to/igorfilippov3"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1a1c1e] hover:text-primary transition-colors"
              aria-label="Read on Dev.to"
            >
              <SiDevdotto className="w-6 h-6" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
