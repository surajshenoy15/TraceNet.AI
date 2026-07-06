import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Eye } from "lucide-react";
import AppShell from "../components/AppShell";
import { Card, Badge, priorityTone, statusTone } from "../components/ui";
import api from "../lib/api";

export default function Cases() {
  const [cases, setCases] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/cases").then((r) => setCases(r.data)).catch(() => {});
  }, []);

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Cases</h1>
        <button onClick={() => navigate("/cases/new")}
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded-lg px-4 py-2.5 text-sm flex items-center gap-2">
          <Plus size={16} /> New Investigation
        </button>
      </div>
      <Card className="p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b border-border">
                <th className="py-2 pr-4 font-normal">Reference</th>
                <th className="py-2 pr-4 font-normal">Title</th>
                <th className="py-2 pr-4 font-normal">Jurisdiction</th>
                <th className="py-2 pr-4 font-normal">Priority</th>
                <th className="py-2 pr-4 font-normal">Status</th>
                <th className="py-2 pr-4 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {cases.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-muted">No cases yet.</td></tr>
              )}
              {cases.map((c) => (
                <tr key={c.id} className="border-b border-border/60 hover:bg-slate-800/30">
                  <td className="py-3 pr-4 text-cyan-400 font-mono text-xs">{c.reference_no}</td>
                  <td className="py-3 pr-4">{c.title}</td>
                  <td className="py-3 pr-4 text-muted">{c.jurisdiction}</td>
                  <td className="py-3 pr-4"><Badge tone={priorityTone(c.priority)}>{c.priority}</Badge></td>
                  <td className="py-3 pr-4"><Badge tone={statusTone(c.status)}>{c.status.replace("_", " ")}</Badge></td>
                  <td className="py-3 pr-2 text-right">
                    <button onClick={() => navigate(`/cases/${c.id}/overview`)} className="text-muted hover:text-cyan-400">
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
