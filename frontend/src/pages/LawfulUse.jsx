import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, CheckCircle2, AlertTriangle, Fingerprint } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const SECTIONS = [
  {
    title: "Lawful Basis",
    body: "You will use TraceNet AI only under valid legal authority, including written authorization, court order, statutory mandate, or other applicable provisions under the Information Technology Act, 2000 and allied rules. No activity will be initiated without a lawful basis.",
  },
  {
    title: "Data Handling",
    body: "You will handle all data accessed through TraceNet AI in accordance with the Digital Personal Data Protection (DPDP) Act, 2023 — collecting only necessary data, maintaining purpose limitation, and adopting reasonable security safeguards.",
  },
  {
    title: "Investigator Responsibility",
    body: "You are responsible for the accuracy, legality, and relevance of all inputs, queries, and investigative actions. Misuse or actions beyond the scope of authority may result in disciplinary action or termination of access.",
  },
  {
    title: "DPDP Alignment",
    body: "You agree to align with the principles of lawfulness, fairness, transparency, purpose limitation, data minimization, accuracy, storage limitation, and accountability under the DPDP Act, 2023.",
  },
  {
    title: "Audit Record",
    body: "You acknowledge that all activities on TraceNet AI — searches, data access, exports, and reports — are logged, monitored, and retained as part of an immutable audit trail, subject to internal review or legal proceedings.",
  },
];

const CHECKLIST = [
  "Use TraceNet AI only for lawful investigative purposes under IT Act, 2000 and DPDP Act, 2023.",
  "Access or process data strictly on the basis of valid legal authority.",
  "Handle all data responsibly with privacy, security, and purpose limitation.",
  "Accept full accountability for all actions performed on the platform.",
  "Understand that all activities are logged and form part of your permanent audit record.",
];

export default function LawfulUse() {
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();

  const canContinue = agreed && signature.trim().length > 2;

  return (
    <div className="min-h-screen bg-bg px-6 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <Fingerprint className="text-cyan-400" size={22} />
          <span className="font-semibold text-lg">TraceNet <span className="text-cyan-400">AI</span></span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <div>
            <h1 className="text-2xl font-semibold">Onboarding / Lawful-Use Acknowledgment</h1>
            <p className="text-sm text-muted mt-1 max-w-2xl">
              TraceNet AI is an investigative intelligence platform. By proceeding, you acknowledge your legal
              obligations and agree to use the platform only for lawful purposes.
            </p>

            <div className="mt-6 space-y-3">
              {SECTIONS.map((s, i) => (
                <div key={s.title} className="bg-panel border border-border rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-800 text-xs flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <h3 className="font-medium">{s.title}</h3>
                  </div>
                  <p className="text-sm text-muted mt-2 pl-9">{s.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-panel border border-border rounded-xl p-6 h-fit">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="text-amber-400" size={18} />
              <h2 className="font-medium">What you must agree to</h2>
            </div>
            <ul className="space-y-3">
              {CHECKLIST.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
                  <CheckCircle2 size={16} className="text-amber-400 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-300">This declaration is part of your permanent audit record.</p>
            </div>

            <label className="flex items-start gap-2 mt-4 text-sm">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
              <span>I acknowledge I will use TraceNet AI only for lawful investigative purposes under IT Act and DPDP Act compliance.</span>
            </label>

            <label className="block text-xs text-muted mt-4 mb-1.5">Type your full name (will be used as signature)</label>
            <input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder={user?.name || "Full name"}
              className="w-full bg-slate-900/60 border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
            />

            <button
              disabled={!canContinue}
              onClick={() => navigate("/dashboard")}
              className="w-full mt-4 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-semibold rounded-lg py-2.5 text-sm"
            >
              Continue
            </button>
            <p className="text-[11px] text-muted text-center mt-2">Please complete all required fields to continue.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
