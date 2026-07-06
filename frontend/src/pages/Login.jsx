import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Mail, Lock, KeyRound, ArrowRight } from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [step, setStep] = useState("credentials"); // credentials | mfa
  const [unit, setUnit] = useState("Maharashtra Cybercrime Cell");
  const [email, setEmail] = useState("rao@agency.gov.in");
  const [password, setPassword] = useState("demo1234");
  const [code, setCode] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { login } = useAuth();

  async function handleCredentials(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { email, password, unit });
      setPendingToken(res.data.pending_token);
      setStep("mfa");
    } catch (err) {
      setError(err?.response?.data?.detail || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/verify-mfa", { pending_token: pendingToken, code });
      login(res.data.access_token, res.data.user);
      navigate("/lawful-use");
    } catch (err) {
      setError(err?.response?.data?.detail || "Invalid MFA code");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-3">
              <ShieldCheck className="text-cyan-400" size={26} />
            </div>
            <h1 className="text-xl font-semibold">Investigator Sign-In</h1>
            <p className="text-sm text-muted mt-1">Authorized personnel only. All sessions logged.</p>
          </div>

          <div className="bg-panel border border-border rounded-2xl p-7">
            {step === "credentials" ? (
              <form onSubmit={handleCredentials} className="space-y-4">
                <div>
                  <label className="text-xs text-muted block mb-1.5">Select your unit</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full bg-slate-900/60 border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
                  >
                    <option>Maharashtra Cybercrime Cell</option>
                    <option>Karnataka Cyber Cell</option>
                    <option>Pune Cyber Lab</option>
                    <option>CERT-In</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1.5">Email address</label>
                  <div className="flex items-center gap-2 bg-slate-900/60 border border-border rounded-lg px-3 py-2.5">
                    <Mail size={16} className="text-muted" />
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@agency.gov.in"
                      className="bg-transparent outline-none text-sm flex-1"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1.5">Password</label>
                  <div className="flex items-center gap-2 bg-slate-900/60 border border-border rounded-lg px-3 py-2.5">
                    <Lock size={16} className="text-muted" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-transparent outline-none text-sm flex-1"
                      required
                    />
                  </div>
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <button
                  disabled={loading}
                  className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold rounded-lg py-2.5 flex items-center justify-center gap-2 text-sm"
                >
                  Continue <ArrowRight size={16} />
                </button>
                <p className="text-[11px] text-muted text-center pt-1">
                  Demo: rao@agency.gov.in / demo1234, MFA code 123456
                </p>
              </form>
            ) : (
              <form onSubmit={handleMfa} className="space-y-4">
                <div>
                  <label className="text-xs text-muted block mb-1.5">MFA Code (6 digits)</label>
                  <div className="flex items-center gap-2 bg-slate-900/60 border border-border rounded-lg px-3 py-2.5">
                    <KeyRound size={16} className="text-muted" />
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      maxLength={6}
                      placeholder="000000"
                      className="bg-transparent outline-none text-sm flex-1 tracking-widest"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-muted mt-1.5">Enter the 6-digit code from your authenticator app.</p>
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <button
                  disabled={loading}
                  className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold rounded-lg py-2.5 text-sm"
                >
                  Verify &amp; Continue
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-center gap-6 text-xs text-muted">
          <span>Lawful Use Only</span>
          <span>•</span>
          <span>Audit Trail Enforced</span>
          <span>•</span>
          <span>DPDP Aligned</span>
        </div>
      </div>
    </div>
  );
}
