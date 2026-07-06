import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import AppShell from "../components/AppShell";
import { Card } from "../components/ui";
import api from "../lib/api";

export default function GlobalAudit() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api.get("/audit").then((r) => setLogs(r.data)).catch(() => {});
  }, []);

  return (
    <AppShell title="Audit Log">
      <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 text-sm text-emerald-300 mb-4">
        <ShieldCheck size={16} /> Immutable · Tamper-proof · Time-stamped.
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted border-b border-border">
              <th className="px-4 py-3 font-normal">Timestamp</th>
              <th className="px-4 py-3 font-normal">Action</th>
              <th className="px-4 py-3 font-normal">Target</th>
              <th className="px-4 py-3 font-normal">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No audit events yet.</td></tr>}
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-border/60 hover:bg-slate-800/30">
                <td className="px-4 py-2.5 text-xs text-muted whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-cyan-300">{l.action}</td>
                <td className="px-4 py-2.5 text-xs">{l.target_type?`${l.target_type}:${l.target_id}`:"—"}</td>
                <td className="px-4 py-2.5 text-xs text-muted">{l.ip_address}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </AppShell>
  );
}
