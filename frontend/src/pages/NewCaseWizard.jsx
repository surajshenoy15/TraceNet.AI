import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Fingerprint, FilePlus2, Sparkles, ArrowLeft, Rocket, CheckCircle2 } from "lucide-react";
import api from "../lib/api";
import { Button } from "../components/ui";

const STEPS = [
  { n: 1, label: "Case Details", hint: "Basic information" },
  { n: 2, label: "Seed Inputs", hint: "Provide initial leads" },
  { n: 3, label: "Review & Launch", hint: "Confirm and begin" },
];

const ENTITY_COLORS = {
  username: "text-cyan-300 bg-cyan-500/10 border-cyan-500/30",
  phone: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  email: "text-violet-300 bg-violet-500/10 border-violet-500/30",
  upi: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  url: "text-sky-300 bg-sky-500/10 border-sky-500/30",
  keyword: "text-slate-300 bg-slate-700/30 border-slate-600/40",
};

export default function NewCaseWizard() {
  const [step, setStep] = useState(1);
  const [caseId, setCaseId] = useState(null);
  const [referenceNo, setReferenceNo] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: "",
    jurisdiction: "",
    priority: "medium",
    legal_authority_ref: "",
    lawful_purpose: "",
  });

  const [seedText, setSeedText] = useState("");
  const [entities, setEntities] = useState([]);
  const [confirmed, setConfirmed] = useState(false);

  const navigate = useNavigate();

  async function handleCreateCase(e) {
    e.preventDefault();
    setError("");
    if (form.lawful_purpose.trim().length < 50) {
      setError("Lawful purpose must be at least 50 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/cases", form);
      setCaseId(res.data.id);
      setReferenceNo(res.data.reference_no);
      setStep(2);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not create case.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePreview(text) {
    setSeedText(text);
    if (!text.trim()) {
      setEntities([]);
      return;
    }
    try {
      const res = await api.post(`/cases/${caseId}/inputs/preview`, { raw_value: text });
      setEntities(res.data.entities);
    } catch {
      /* preview is best-effort */
    }
  }

  async function handleSubmitSeed() {
    setError("");
    if (!seedText.trim()) {
      setError("Add at least one seed input before continuing.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/cases/${caseId}/inputs`, { input_type: "text", raw_value: seedText });
      setStep(3);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not save seed inputs.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLaunch() {
    setError("");
    setSubmitting(true);
    try {
      await api.post(`/cases/${caseId}/launch`);
      navigate(`/cases/${caseId}/scan`);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not launch investigation.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Fingerprint className="text-cyan-400" size={20} />
          <span className="font-semibold">TraceNet <span className="text-cyan-400">AI</span></span>
          <span className="text-muted text-sm ml-2">New Case</span>
        </div>
        <button onClick={() => navigate("/dashboard")} className="text-sm text-muted hover:text-slate-200 flex items-center gap-1.5">
          <ArrowLeft size={14} /> Back to dashboard
        </button>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-6 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex items-center gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border ${
                  step === s.n ? "border-cyan-400 text-cyan-400" :
                  step > s.n ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" : "border-border text-muted"
                }`}>
                  {step > s.n ? <CheckCircle2 size={16} /> : s.n}
                </div>
                <div>
                  <p className={`text-sm font-medium ${step === s.n ? "text-cyan-300" : "text-slate-300"}`}>{s.label}</p>
                  <p className="text-xs text-muted">{s.hint}</p>
                </div>
              </div>
              {i < STEPS.length - 1 && <div className="w-16 h-px bg-border" />}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5">
            {error}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleCreateCase} className="bg-panel border border-border rounded-xl p-7 space-y-5">
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="text-sm font-medium block mb-1.5">Case Title *</label>
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Enter case title"
                  className="w-full bg-slate-900/60 border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">Jurisdiction *</label>
                <input required value={form.jurisdiction} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })}
                  placeholder="e.g. Maharashtra Cybercrime Cell"
                  className="w-full bg-slate-900/60 border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-cyan-500" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">Priority *</label>
              <div className="flex gap-2">
                {["low", "medium", "high", "critical"].map((p) => (
                  <button type="button" key={p} onClick={() => setForm({ ...form, priority: p })}
                    className={`px-4 py-2 rounded-lg text-sm border capitalize ${
                      form.priority === p ? "border-cyan-400 bg-cyan-500/10 text-cyan-300" : "border-border text-muted"
                    }`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">Legal Authority Reference</label>
              <input value={form.legal_authority_ref} onChange={(e) => setForm({ ...form, legal_authority_ref: e.target.value })}
                placeholder="FIR / court order / internal memo"
                className="w-full bg-slate-900/60 border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-cyan-500" />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">Lawful Purpose *</label>
              <textarea required rows={4} value={form.lawful_purpose}
                onChange={(e) => setForm({ ...form, lawful_purpose: e.target.value })}
                placeholder="Describe the lawful purpose and scope of this investigation in detail. (Minimum 50 characters)"
                className="w-full bg-slate-900/60 border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-cyan-500 resize-none" />
              <p className="text-xs text-muted mt-1">{form.lawful_purpose.length} / 50 minimum characters</p>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-xs text-amber-300">
              This declaration becomes part of the immutable audit log for this case. False declarations carry legal consequences.
            </div>

            <div className="flex justify-end">
              <Button disabled={submitting} type="submit">Continue to Inputs</Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
            <div className="bg-panel border border-border rounded-xl p-7">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-medium">Seed Inputs</h2>
                <Sparkles size={15} className="text-violet-400" />
              </div>
              <p className="text-sm text-muted mb-4">Provide authorized leads. TraceNet extracts usernames, emails, phone numbers, UPI IDs, URLs, and public clues for OSINT analysis.</p>

              <textarea
                rows={4}
                value={seedText}
                onChange={(e) => handlePreview(e.target.value)}
                placeholder="Paste username, phone, email, UPI, URL, or chat excerpt... e.g. @handle name@example.com +91 98765 43210"
                className="w-full bg-slate-900/60 border border-cyan-500/40 rounded-lg px-4 py-3 text-sm outline-none focus:border-cyan-500 resize-none"
              />
              <p className="text-xs text-muted mt-1">{seedText.length} / 5000</p>

              <div className="mt-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted">Extracted in real time · {entities.length} entities detected</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {entities.map((e, i) => (
                    <span key={i} className={`text-xs px-2.5 py-1 rounded-full border ${ENTITY_COLORS[e.type] || ENTITY_COLORS.keyword}`}>
                      {e.value} <span className="opacity-60 ml-1">{e.type}</span>
                    </span>
                  ))}
                  {entities.length === 0 && <p className="text-xs text-muted">Start typing to see detected entities.</p>}
                </div>
              </div>

              <div className="mt-8 border-2 border-dashed border-border rounded-xl p-8 text-center text-muted text-sm">
                <FilePlus2 className="mx-auto mb-2 text-slate-500" size={26} />
                Drop screenshots, evidence images, or chat logs here (handled via Evidence upload after launch)
              </div>
            </div>

            <div className="bg-panel border border-border rounded-xl p-5 h-fit">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-sm">Detected Entities</h3>
                <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full">{entities.length}</span>
              </div>
              <div className="space-y-2">
                {entities.map((e, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-900/40 border border-border rounded-lg px-3 py-2">
                    <span className="text-sm truncate">{e.value}</span>
                    <span className="text-[10px] uppercase text-muted">{e.type}</span>
                  </div>
                ))}
                {entities.length === 0 && <p className="text-xs text-muted">No entities detected yet.</p>}
              </div>
              <p className="text-xs text-muted mt-4">Apify checks only public sources: Maigret for usernames, email-localpart username discovery, and exact public-web mentions for email/phone. No private login, OTP, Truecaller, Amazon, or Flipkart checks.</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex justify-between mt-6">
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button disabled={submitting} onClick={handleSubmitSeed}>Continue to Review</Button>
          </div>
        )}

        {step === 3 && (
          <div className="bg-panel border border-border rounded-xl p-7">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-6">
              <div>
                <p className="text-xs text-muted uppercase">Case Title</p>
                <h2 className="text-lg font-semibold mt-1">{form.title}</h2>
                <p className="text-xs text-muted mt-3 uppercase">Case Reference</p>
                <p className="text-cyan-400 font-mono text-sm mt-1">{referenceNo}</p>
                <p className="text-xs text-muted mt-3 uppercase">Lawful Purpose (excerpt)</p>
                <p className="text-sm text-slate-300 mt-1">{form.lawful_purpose}</p>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted uppercase">Seed Inputs</p>
                  <p className="text-sm mt-1">{entities.length} entities detected from provided clues</p>
                </div>
                <div>
                  <p className="text-xs text-muted uppercase">Estimated Scan Time</p>
                  <p className="text-sm mt-1">~10–120 seconds depending on Apify settings and number of public-source results</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/40 border border-border rounded-lg p-4 mb-5">
              <p className="text-xs text-muted uppercase mb-3">Pre-flight checklist</p>
              {["Authorization verified", "Inputs validated", "Lawful purpose recorded", "Public-source only boundary accepted", "Audit log primed"].map((c) => (
                <div key={c} className="flex items-center gap-2 text-sm py-1">
                  <CheckCircle2 size={15} className="text-emerald-400" /> {c}
                </div>
              ))}
            </div>

            <label className="flex items-start gap-2 text-sm mb-5">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />
              <span>I confirm this investigation has lawful basis and is authorized, necessary, and proportionate to a lawful purpose.</span>
            </label>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
              <Button disabled={!confirmed || submitting} onClick={handleLaunch}>
                <Rocket size={16} /> Begin Lawful Investigation
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
