import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import {
  LayoutDashboard, Share2, MapPin, FolderSearch, FileText, ShieldAlert, Fingerprint, ArrowLeft,
  Activity, Clock, Fingerprint as FpIcon, Target,
} from "lucide-react";
import api from "../../lib/api";
import { Badge, statusTone, priorityTone } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";

const NAV = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "conclusion", label: "Conclusion", icon: Target },
  { key: "graph", label: "Graph", icon: Share2 },
  { key: "identity", label: "Identity Links", icon: FpIcon },
  { key: "behaviour", label: "Behaviour", icon: Activity },
  { key: "timeline", label: "Timeline", icon: Clock },
  { key: "map", label: "Map", icon: MapPin },
  { key: "evidence", label: "Evidence", icon: FolderSearch },
  { key: "report", label: "Report", icon: FileText },
  { key: "audit", label: "Audit", icon: ShieldAlert },
];

export default function CaseLayout() {
  const { caseId } = useParams();
  const [caseData, setCaseData] = useState(null);
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    api.get(`/cases/${caseId}`).then((r) => setCaseData(r.data)).catch(() => {});
  }, [caseId]);

  return (
    <div className="flex h-screen">
      <aside className="w-56 shrink-0 h-full bg-panel border-r border-border flex flex-col">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-border">
          <Fingerprint className="text-cyan-400" size={20} />
          <span className="font-semibold">TraceNet <span className="text-cyan-400">AI</span></span>
        </div>
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 px-5 py-3 text-xs text-muted hover:text-slate-200 border-b border-border"
        >
          <ArrowLeft size={14} /> All cases
        </button>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.key}
              to={`/cases/${caseId}/${item.key}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/30"
                           : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`
              }
            >
              <item.icon size={16} /> {item.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={logout} className="text-[11px] text-muted hover:text-red-400 px-5 py-4 text-left border-t border-border">
          Sign out
        </button>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-border px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="font-semibold truncate">{caseData?.title || "Loading case…"}</h1>
            {caseData && (
              <span className="text-xs text-cyan-400 font-mono bg-cyan-500/10 px-2 py-1 rounded-md shrink-0">
                {caseData.reference_no}
              </span>
            )}
          </div>
          {caseData && (
            <div className="flex items-center gap-2 shrink-0">
              <Badge tone={priorityTone(caseData.priority)}>{caseData.priority}</Badge>
              <Badge tone={statusTone(caseData.status)}>{caseData.status.replace("_", " ")}</Badge>
            </div>
          )}
        </header>
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <Outlet context={{ caseData }} />
        </main>
      </div>
    </div>
  );
}
