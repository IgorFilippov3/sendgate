"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import { actionLimits, actionVerifyBatch, actionVerifySingle } from "@/lib/actions";
import type { BatchResult, EmailVerification, Verdict } from "@/lib/engine/types";

const VERDICT_STYLE: Record<Verdict, { badge: string; label: string; bar: string }> = {
  deliverable: { badge: "bg-green-100 text-green-700", label: "Deliverable", bar: "bg-green-500" },
  risky: { badge: "bg-yellow-100 text-yellow-700", label: "Risky", bar: "bg-yellow-500" },
  undeliverable: { badge: "bg-red-100 text-red-700", label: "Undeliverable", bar: "bg-red-500" },
  unknown: { badge: "bg-slate-100 text-slate-600", label: "Unknown", bar: "bg-slate-400" },
};

const VERDICTS: Verdict[] = ["deliverable", "risky", "undeliverable", "unknown"];

const SEVERITY_DOT = {
  critical: "bg-red-500",
  warning: "bg-yellow-500",
  info: "bg-primary/40",
} as const;

export default function AnalysisTool() {
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EmailVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<number | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    actionLimits().then((l) => setLimit(l.maxBulkEmails)).catch(() => {});
  }, []);

  const verifySingle = async (address: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    const res = await actionVerifySingle(address);
    if (res.success) setResult(res.data);
    else setError(res.error);
    setLoading(false);
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await verifySingle(email);
  };

  const applySuggestion = async (suggestion: string) => {
    setEmail(suggestion);
    await verifySingle(suggestion);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setBatchResult(null);
      setError(null);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);

    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: async (results) => {
        const emails = results.data
          .flat()
          .map((cell: unknown) => String(cell).trim())
          .filter((cell) => cell.includes("@"));

        if (emails.length === 0) {
          setError("No email addresses found in the CSV");
          setLoading(false);
          return;
        }

        const res = await actionVerifyBatch(emails);
        if (res.success) setBatchResult(res.data);
        else setError(res.error);
        setLoading(false);
      },
      error: (err) => {
        setError("Failed to parse CSV: " + err.message);
        setLoading(false);
      },
    });
  };

  const downloadResults = (filter: Verdict | "all" = "all") => {
    if (!batchResult) return;

    const rows = batchResult.results
      .filter((r) => filter === "all" || r.verdict === filter)
      .map((r) => ({
        Email: r.input,
        Verdict: r.verdict,
        Score: r.score,
        Suggestion: r.suggestion ?? "",
        Reasons: r.reasons.map((x) => x.code).join(" "),
        "Role Account": r.checks.roleAccount ? "yes" : "no",
        Disposable: r.checks.domain?.disposable ? "yes" : "no",
        "Free Provider": r.checks.domain?.freeProvider ? "yes" : "no",
        "Catch-all": r.checks.smtp.catchAll === null ? "" : r.checks.smtp.catchAll ? "yes" : "no",
        "SMTP Status": r.checks.smtp.status,
      }));

    // escapeFormulae: addresses like "=cmd@x.com" are valid but must not run as
    // spreadsheet formulas when the CSV is opened in Excel.
    const csv = Papa.unparse(rows, { escapeFormulae: true });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `sendgate_${filter}_${Date.now()}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsModalOpen(false);
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-3xl shadow-xl border border-base-200 overflow-hidden relative">
      <div className="flex border-b border-base-200">
        <button
          onClick={() => setActiveTab("single")}
          className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest transition-colors ${
            activeTab === "single"
              ? "bg-primary text-white"
              : "hover:bg-base-100"
          }`}
        >
          Single Email
        </button>
        <button
          onClick={() => setActiveTab("bulk")}
          className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest transition-colors ${
            activeTab === "bulk" ? "bg-primary text-white" : "hover:bg-base-100"
          }`}
        >
          Bulk CSV
        </button>
      </div>

      <div className="p-8">
        {activeTab === "single" ? (
          <form onSubmit={handleSingleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest opacity-40">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hello@example.com"
                className="w-full px-4 py-3 rounded-xl border border-base-200 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-[#1a1c1e]"
              />
            </div>
            <button
              disabled={loading}
              className="btn btn-primary w-full rounded-xl font-bold normal-case text-white h-12"
            >
              {loading ? (
                <span className="loading loading-spinner loading-sm"></span>
              ) : (
                "Analyze Email"
              )}
            </button>

            {result && (
              <div className="mt-8 p-6 bg-base-50 rounded-2xl border border-base-200 space-y-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex justify-between items-center text-[#1a1c1e]">
                  <span
                    className={`text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full ${VERDICT_STYLE[result.verdict].badge}`}
                  >
                    {VERDICT_STYLE[result.verdict].label}
                  </span>
                  <span className="text-2xl font-black">{result.score} / 100</span>
                </div>

                {result.suggestion && (
                  <button
                    type="button"
                    onClick={() => applySuggestion(result.suggestion!)}
                    className="w-full text-left text-sm font-bold px-4 py-3 rounded-xl bg-yellow-50 border border-yellow-100 text-yellow-800 hover:bg-yellow-100 transition-colors"
                  >
                    Did you mean <span className="underline">{result.suggestion}</span>?
                  </button>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-black uppercase tracking-widest opacity-40 text-[#1a1c1e]">
                    Findings
                  </p>
                  <ul className="space-y-1">
                    {result.reasons.map((r, i) => (
                      <li
                        key={i}
                        className="text-sm font-medium flex items-start gap-2 text-[#44474e]"
                      >
                        <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-none ${SEVERITY_DOT[r.severity]}`} />
                        {r.message}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </form>
        ) : (
          <form onSubmit={handleBulkSubmit} className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <label className="text-xs font-black uppercase tracking-widest opacity-40">
                  CSV File (one email per line)
                </label>
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-30">
                  {limit ? `Limit: ${limit} emails` : ""}
                </span>
              </div>
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-base-300 rounded-2xl cursor-pointer hover:bg-base-100 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <p className="mb-2 text-sm font-bold text-[#1a1c1e]">
                      {file ? file.name : "Click to upload or drag and drop"}
                    </p>
                    <p className="text-xs opacity-40 uppercase tracking-widest font-black">
                      CSV only
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
            </div>
            <button
              disabled={loading || !file}
              className="btn btn-primary w-full rounded-xl font-bold normal-case text-white h-12"
            >
              {loading ? (
                <span className="loading loading-spinner loading-sm"></span>
              ) : (
                "Process List"
              )}
            </button>

            {batchResult && (
              <div className="mt-8 space-y-6 animate-in fade-in slide-in-from-top-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {VERDICTS.map((v) => (
                    <BatchStat
                      key={v}
                      label={VERDICT_STYLE[v].label}
                      value={batchResult.summary.verdicts[v]}
                      color={VERDICT_STYLE[v].bar}
                    />
                  ))}
                </div>
                {(batchResult.summary.duplicates > 0 || batchResult.summary.invalid > 0) && (
                  <p className="text-xs font-bold text-[#44474e] opacity-70 text-center">
                    {batchResult.summary.duplicates} duplicates removed · {batchResult.summary.invalid} invalid addresses
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="btn btn-outline w-full rounded-xl font-bold normal-case h-12 text-[#1a1c1e]"
                >
                  Download Results
                </button>
              </div>
            )}
          </form>
        )}

        {error && (
          <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold border border-red-100">
            {error}
          </div>
        )}
      </div>

      {/* Download Modal */}
      {isModalOpen && batchResult && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-white/95 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm space-y-6 text-center">
            <div className="space-y-2">
              <h3 className="text-xl font-black text-[#1a1c1e]">
                Download Results
              </h3>
              <p className="text-sm font-medium text-[#44474e]">
                Choose which segment you want to export
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => downloadResults("all")}
                className="flex items-center justify-between px-6 py-4 bg-base-50 hover:bg-base-100 rounded-2xl border border-base-200 transition-colors"
              >
                <span className="font-bold text-[#1a1c1e]">All Emails</span>
                <span className="text-xs font-black opacity-40 uppercase">
                  {batchResult.results.length}
                </span>
              </button>

              {VERDICTS.map((v) => (
                <button
                  key={v}
                  onClick={() => downloadResults(v)}
                  disabled={batchResult.summary.verdicts[v] === 0}
                  className="flex items-center justify-between px-6 py-4 bg-base-50 hover:bg-base-100 rounded-2xl border border-base-200 transition-colors disabled:opacity-50"
                >
                  <span className={`font-bold px-2 py-0.5 rounded-md ${VERDICT_STYLE[v].badge}`}>
                    {VERDICT_STYLE[v].label} only
                  </span>
                  <span className="text-xs font-black opacity-40 uppercase">
                    {batchResult.summary.verdicts[v]}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setIsModalOpen(false)}
              className="text-xs font-black uppercase tracking-widest text-[#44474e]/60 hover:text-[#1a1c1e] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BatchStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="p-4 bg-base-50 rounded-2xl border border-base-200 text-center space-y-1">
      <p className="text-[10px] font-black uppercase tracking-widest opacity-40 text-[#1a1c1e]">
        {label}
      </p>
      <p className="text-xl font-black text-[#1a1c1e]">{value}</p>
      <div className={`h-1 w-full ${color} rounded-full opacity-20`} />
    </div>
  );
}
