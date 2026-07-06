import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Radar, CheckCircle2, Loader2, Fingerprint, Scan } from "lucide-react";
import api from "../lib/api";

const AGENTS = [
  "Case Scope Agent — verifying lawful authorization",
  "Entity Extraction Agent — parsing seed clues",
  "Username Variant Agent — generating handle variants",
  "Public Source Agent — running Apify Actors (Maigret, Google Search, Web Scraper)",
  "Social Scraper Agents — Instagram, TikTok, X, LinkedIn, Reddit public profiles",
  "Contact & WHOIS Agents — public email/domain intelligence",
  "Profile Matching Agent — comparing signals",
  "Confidence Scoring Agent — computing explainable scores",
  "Regional Inference Agent — aggregating location text signals",
  "Behaviour Analysis Agent — profiling posting patterns",
  "Content Analysis Agent — keywords, sentiment, writing-style",
  "Image Reuse Agent — matching profile photos across platforms",
  "Interaction Network Agent — mapping frequently engaged users",
  "Graph Builder Agent — building the relationship graph",
  "Report Agent — preparing report draft",
];

export default function ScanProgress() {
  const { caseId } = useParams();
  const [activeIdx, setActiveIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const tick = setInterval(() => {
      setActiveIdx((i) => Math.min(i + 1, AGENTS.length - 1));
    }, 450);

    api.post(`/cases/${caseId}/analyze`)
      .then(() => {
        clearInterval(tick);
        setActiveIdx(AGENTS.length - 1);
        setDone(true);
        setTimeout(() => navigate(`/cases/${caseId}/overview`), 900);
      })
      .catch((err) => {
        clearInterval(tick);
        setError(err?.response?.data?.detail || "Analysis failed.");
      });

    return () => clearInterval(tick);
  }, [caseId, navigate]);

  const pct = Math.round(((activeIdx + (done ? 1 : 0)) / AGENTS.length) * 100);

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 scanner-surface">
      <div className="w-full max-w-xl relative z-10">
        <div className="flex items-center gap-2 justify-center mb-8">
          <Fingerprint className="text-cyan-400 glow-ring" size={20} />
          <span className="font-semibold tracking-wide">
            TraceNet <span className="text-cyan-400">AI</span>
          </span>
        </div>

        <div className="bg-panel border border-border rounded-2xl p-8 text-center scan-frame scanner-surface glow-breathe">
          {!error && !done && <div className="scanner-line" />}

          {/* Radar core with sweep + expanding rings */}
          <div className="relative w-24 h-24 mx-auto mb-5">
            <div className="radar-ring" />
            <div className="radar-ring delay-1" />
            <div className="radar-ring delay-2" />
            <Radar size={92} className="text-cyan-400/25 absolute inset-0 m-auto" />
            {!done && <div className="radar-sweep" />}
            <Scan
              size={30}
              className="text-cyan-300 absolute inset-0 m-auto scan-pulse"
            />
          </div>

          <h1 className="text-lg font-semibold text-flicker">
            Running Agentic Analysis Pipeline
          </h1>
          <p className="text-sm text-muted mt-1">
            Live Apify public-source investigative leads. Human review required.
          </p>

          {/* Progress bar */}
          {!error && (
            <div className="mt-5">
              <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    boxShadow: "0 0 12px rgba(34,211,238,0.7)",
                  }}
                />
              </div>
              <p className="text-[11px] text-cyan-300 mt-1.5 font-mono">{pct}% complete</p>
            </div>
          )}

          {error ? (
            <p className="text-sm text-red-400 mt-6">{error}</p>
          ) : (
            <div className="mt-6 space-y-2.5 text-left relative z-10">
              {AGENTS.map((label, i) => (
                <div
                  key={label}
                  className={`flex items-center gap-3 text-sm ${i <= activeIdx ? "fade-slide-in" : ""}`}
                >
                  {i < activeIdx || done ? (
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  ) : i === activeIdx ? (
                    <Loader2 size={16} className="text-cyan-400 animate-spin shrink-0" />
                  ) : (
                    <span className="w-4 h-4 rounded-full border border-border shrink-0" />
                  )}
                  <span
                    className={
                      i === activeIdx
                        ? "text-cyan-200"
                        : i < activeIdx || done
                          ? "text-slate-200"
                          : "text-muted"
                    }
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
