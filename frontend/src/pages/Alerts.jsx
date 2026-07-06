import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, AlertTriangle } from "lucide-react";
import AppShell from "../components/AppShell";
import { Card, Badge } from "../components/ui";
import api from "../lib/api";

export default function Alerts() {
  const [rows, setRows] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/global/alerts").then((r) => setRows(r.data)).catch(() => {});
  }, []);

  return (
    <AppShell title="Alerts">
      <p className="text-sm text-muted mb-6">High-confidence matches flagged for reviewer attention.</p>
      <div className="space-y-3">
        {rows.length === 0 && (
          <Card className="p-10 text-center text-muted text-sm">No alerts. Run analysis to surface high-confidence matches.</Card>
        )}
        {rows.map((a) => (
          <Card key={a.id} className="p-4 flex items-center justify-between cursor-pointer hover:border-cyan-500/40"
                onClick={() => navigate(`/cases/${a.case_id}/graph`)}>
            <div className="flex items-center gap-3">
              <AlertTriangle size={18} className={a.level==="high"?"text-red-400":"text-amber-400"} />
              <div>
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-xs text-muted">{a.platform} · {a.case_title}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={a.level==="high"?"danger":"warning"}>{a.level}</Badge>
              <Badge tone="accent">{a.score}%</Badge>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
