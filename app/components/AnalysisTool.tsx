"use client";

import { useState } from "react";
import Papa from "papaparse";
import { actionAnalyzeSingle, actionAnalyzeBatch } from "@/lib/actions";
import { AnalysisSummary, DomainAnalysis } from "@/lib/analysis-engine";

export default function AnalysisTool() {
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<
    (DomainAnalysis & { email: string }) | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [batchResult, setBatchResult] = useState<AnalysisSummary | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const res = await actionAnalyzeSingle(email);
    if (res.success && res.data) {
      setResult(res.data);
    } else {
      setError(res.error || "Analysis failed");
    }
    setLoading(false);
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
          .map((e: unknown) => String(e).trim())
          .filter((e) => e.includes("@"));

        if (emails.length === 0) {
          setError("No valid emails found in CSV");
          setLoading(false);
          return;
        }

        const res = await actionAnalyzeBatch(emails);
        if (res.success && res.data) {
          setBatchResult(res.data);
        } else {
          setError(res.error || "Batch analysis failed");
        }
        setLoading(false);
      },
      error: (err) => {
        setError("Failed to parse CSV: " + err.message);
        setLoading(false);
      },
    });
  };

  const downloadResults = (
    filter: "all" | "safe" | "risky" | "dangerous" = "all",
  ) => {
    if (!batchResult) return;

    let filteredEmails = batchResult.emails;
    if (filter !== "all") {
      filteredEmails = batchResult.emails.filter((e) => {
        const domainInfo = batchResult.details.find(
          (d) => d.domain === e.domain,
        );
        return domainInfo?.risk === filter;
      });
    }

    const csvData = filteredEmails.map((e) => {
      const domainInfo = batchResult.details.find((d) => d.domain === e.domain);
      return {
        Email: e.email,
        Domain: e.domain,
        Risk: domainInfo?.risk || "unknown",
        Score: domainInfo?.analysis.score || 0,
        "Is Role Based": e.isRoleBased ? "Yes" : "No",
        "Is Disposable": e.isDisposable ? "Yes" : "No",
      };
    });

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `sendgate_${filter}_${new Date().getTime()}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
                    className={`text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full ${
                      result.risk === "safe"
                        ? "bg-green-100 text-green-700"
                        : result.risk === "risky"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {result.risk} risk
                  </span>
                  <span className="text-2xl font-black">
                    {result.analysis.score} / 100
                  </span>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-black uppercase tracking-widest opacity-40 text-[#1a1c1e]">
                    Findings
                  </p>
                  <ul className="space-y-1">
                    {result.analysis.categories.auth.findings
                      .concat(
                        result.analysis.categories.infrastructure.findings,
                        result.analysis.categories.reputation.findings,
                        result.analysis.categories.behavioral.findings,
                      )
                      .map((f: string, i: number) => (
                        <li
                          key={i}
                          className="text-sm font-medium flex items-center gap-2 text-[#44474e]"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                          {f}
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
                  Limit: 100 emails
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
                <div className="grid grid-cols-3 gap-4">
                  <BatchStat
                    label="Safe"
                    value={batchResult.segments.safe}
                    color="bg-green-500"
                  />
                  <BatchStat
                    label="Risky"
                    value={batchResult.segments.risky}
                    color="bg-yellow-500"
                  />
                  <BatchStat
                    label="Dangerous"
                    value={batchResult.segments.dangerous}
                    color="bg-red-500"
                  />
                </div>
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
                className="flex items-center justify-between px-6 py-4 bg-base-50 hover:bg-base-100 rounded-2xl border border-base-200 transition-colors group"
              >
                <span className="font-bold text-[#1a1c1e]">All Emails</span>
                <span className="text-xs font-black opacity-40 uppercase">
                  {batchResult.totalEmails}
                </span>
              </button>

              <button
                onClick={() => downloadResults("safe")}
                disabled={batchResult.segments.safe === 0}
                className="flex items-center justify-between px-6 py-4 bg-green-50 hover:bg-green-100 rounded-2xl border border-green-100 transition-colors group disabled:opacity-50"
              >
                <span className="font-bold text-green-700">Safe Only</span>
                <span className="text-xs font-black opacity-40 uppercase">
                  {batchResult.segments.safe}
                </span>
              </button>

              <button
                onClick={() => downloadResults("risky")}
                disabled={batchResult.segments.risky === 0}
                className="flex items-center justify-between px-6 py-4 bg-yellow-50 hover:bg-yellow-100 rounded-2xl border border-yellow-100 transition-colors group disabled:opacity-50"
              >
                <span className="font-bold text-yellow-700">Risky Only</span>
                <span className="text-xs font-black opacity-40 uppercase">
                  {batchResult.segments.risky}
                </span>
              </button>

              <button
                onClick={() => downloadResults("dangerous")}
                disabled={batchResult.segments.dangerous === 0}
                className="flex items-center justify-between px-6 py-4 bg-red-50 hover:bg-red-100 rounded-2xl border border-red-100 transition-colors group disabled:opacity-50"
              >
                <span className="font-bold text-red-700">Dangerous Only</span>
                <span className="text-xs font-black opacity-40 uppercase">
                  {batchResult.segments.dangerous}
                </span>
              </button>
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
