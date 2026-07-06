import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutGrid, Folder, Users, Database, Bell, FileText, ShieldAlert, Settings as SettingsIcon,
  Plus, Eye, FolderKanban, BookOpen,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import { Card, Badge, priorityTone, statusTone } from "../components/ui";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

import { useMainNav } from "../components/AppShell";

function StatCard({ label, value, sub, icon: Icon }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
          <Icon size={18} className="text-cyan-400" />
        </div>
      </div>
      <p className="text-2xl font-bold mt-3">{value}</p>
      <p className="text-sm text-muted">{label}</p>
      {sub && <p className="text-xs text-emerald-400 mt-1">{sub}</p>}
    </Card>
  );
}

export default function Dashboard() {
  const nav = useMainNav();
  const [summary, setSummary] = useState(null);
  const [cases, setCases] = useState([]);
  const [audit, setAudit] = useState([]);
  const navigate = useNavigate();
  const { user, can } = useAuth();

  useEffect(() => {
    api.get("/dashboard/summary").then((r) => setSummary(r.data)).catch(() => {});
    api.get("/cases").then((r) => setCases(r.data)).catch(() => {});
    api.get("/audit").then((r) => setAudit(r.data.slice(0, 6))).catch(() => {});
  }, []);

  return (
    <div className="flex h-screen">
      <Sidebar items={nav} />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold">Welcome back, {user?.name?.split(" ")[0] || "Investigator"}</h1>
              <Badge tone="accent">{user?.unit || "Cybercrime Unit"}</Badge>
            </div>
            {can("case.create") && <button
              onClick={() => navigate("/cases/new")}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded-lg px-4 py-2.5 text-sm flex items-center gap-2"
            >
              <Plus size={16} /> New Investigation
            </button>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Active Cases" value={summary?.active_cases ?? "—"} icon={FolderKanban} />
            <StatCard label="Closed This Month" value={summary?.closed_this_month ?? "—"} icon={ShieldAlert} />
            <StatCard label="Entities Surfaced" value={summary?.entities_surfaced ?? "—"} icon={Users} />
            <StatCard label="Total Cases" value={summary?.total_cases ?? "—"} icon={Database} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-medium">Recent Cases</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted border-b border-border">
                      <th className="py-2 pr-4 font-normal">Case ID</th>
                      <th className="py-2 pr-4 font-normal">Title</th>
                      <th className="py-2 pr-4 font-normal">Priority</th>
                      <th className="py-2 pr-4 font-normal">Status</th>
                      <th className="py-2 pr-4 font-normal"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.length === 0 && (
                      <tr><td colSpan={5} className="py-8 text-center text-muted">No cases yet. Create your first investigation.</td></tr>
                    )}
                    {cases.map((c) => (
                      <tr key={c.id} className="border-b border-border/60 hover:bg-slate-800/30">
                        <td className="py-3 pr-4 text-cyan-400 font-mono text-xs">{c.reference_no}</td>
                        <td className="py-3 pr-4">{c.title}</td>
                        <td className="py-3 pr-4"><Badge tone={priorityTone(c.priority)}>{c.priority}</Badge></td>
                        <td className="py-3 pr-4"><Badge tone={statusTone(c.status)}>{c.status.replace("_", " ")}</Badge></td>
                        <td className="py-3 pr-2 text-right">
                          <button
                            onClick={() => navigate(`/cases/${c.id}/overview`)}
                            className="text-muted hover:text-cyan-400"
                          >
                            <Eye size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="font-medium mb-4">Recent Audit Events</h2>
              <div className="space-y-3">
                {audit.length === 0 && <p className="text-sm text-muted">No audit events yet.</p>}
                {audit.map((a) => (
                  <div key={a.id} className="text-sm">
                    <p className="text-slate-300">{a.action.replace(/\./g, " ").replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted">{new Date(a.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
