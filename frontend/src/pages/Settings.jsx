import { useState } from "react";
import {
  LayoutGrid, Folder, Users, Database, Bell, FileText, ShieldAlert, Settings as SettingsIcon, ShieldCheck,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import { Card } from "../components/ui";
import { useAuth } from "../context/AuthContext";

import { useMainNav } from "../components/AppShell";

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${checked ? "bg-cyan-500" : "bg-slate-700"} ${disabled ? "opacity-50" : ""}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

export default function Settings() {
  const nav = useMainNav();
  const { can } = useAuth();
  // Demo/static controls — mirrors blueprint Section 15 safety boundaries.
  const [faceMatch, setFaceMatch] = useState(false);
  const [autoPurge, setAutoPurge] = useState(true);
  const [retention, setRetention] = useState(90);
  const [crossCase, setCrossCase] = useState(false);

  return (
    <div className="flex h-screen">
      <Sidebar items={nav} />
      <main className="flex-1 overflow-y-auto px-8 py-6">
        {!can("settings.manage") ? (
          <Card className="p-10 text-center text-muted">Your role does not have access to platform settings. Ethics controls are managed by an admin.</Card>
        ) : (<>
        <h1 className="text-2xl font-semibold mb-1">Ethics Controls</h1>
        <p className="text-sm text-muted mb-6">Configure ethical safeguards and compliance controls.</p>

        <Card className="p-6 max-w-2xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Enable face recognition matching</p>
              <p className="text-xs text-muted">Requires admin role and legal basis. Disabled in this MVP.</p>
            </div>
            <Toggle checked={faceMatch} onChange={setFaceMatch} disabled />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Auto-purge case data after closure</p>
              <p className="text-xs text-muted">Case data will be securely deleted after the retention period.</p>
            </div>
            <Toggle checked={autoPurge} onChange={setAutoPurge} />
          </div>

          <div>
            <p className="font-medium mb-2">Retention period after case closure</p>
            <input
              type="range" min={7} max={180} step={1} value={retention}
              onChange={(e) => setRetention(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted mt-1">
              <span>7 days</span><span className="text-cyan-300">{retention} days</span><span>180 days</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Allow cross-case correlation</p>
              <p className="text-xs text-muted">Link entities and patterns across multiple cases. Admin only.</p>
            </div>
            <Toggle checked={crossCase} onChange={setCrossCase} disabled />
          </div>

          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
            <ShieldCheck size={16} className="text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-300">
              Ethics by Design — these controls help ensure lawful, proportionate, and accountable use of TraceNet AI.
            </p>
          </div>
        </Card>
      </>)}
      </main>
    </div>
  );
}
