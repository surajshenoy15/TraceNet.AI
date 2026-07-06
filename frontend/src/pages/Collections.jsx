import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Database } from "lucide-react";
import AppShell from "../components/AppShell";
import { Card, Badge } from "../components/ui";
import api from "../lib/api";

const STATUS_TONE = { unreviewed:"muted", verified:"success", rejected:"danger", excluded:"muted" };

export default function Collections() {
  const [rows, setRows] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/global/collections").then((r) => setRows(r.data)).catch(() => {});
  }, []);

  return (
    <AppShell title="Collections">
      <p className="text-sm text-muted mb-6">All evidence collected across every case.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.length === 0 && <p className="text-sm text-muted">No evidence collected yet.</p>}
        {rows.map((e) => (
          <Card key={e.id} className="p-4 cursor-pointer hover:border-cyan-500/40"
                onClick={() => navigate(`/cases/${e.case_id}/evidence`)}>
            <div className="flex items-center gap-2 mb-2">
              <Database size={15} className="text-cyan-400" />
              <p className="text-sm font-medium truncate flex-1">{e.title}</p>
            </div>
            <p className="text-[11px] text-muted">Source: {e.source} · {e.case_title}</p>
            {e.sha256 && <p className="text-[11px] text-muted font-mono truncate">SHA256: {e.sha256.slice(0,24)}…</p>}
            <div className="flex items-center justify-between mt-3">
              <Badge tone="accent">{Math.round((e.confidence||0)*100)}%</Badge>
              <Badge tone={STATUS_TONE[e.status]||"muted"}>{e.status}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
