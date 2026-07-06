import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import { Card, Badge } from "../components/ui";
import api from "../lib/api";

const TYPE_TONE = { username:"accent", phone:"success", email:"purple", upi:"warning", url:"accent", keyword:"muted", location:"success" };

export default function Entities() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("all");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/global/entities").then((r) => setRows(r.data)).catch(() => {});
  }, []);

  const types = ["all", ...Array.from(new Set(rows.map((r) => r.type)))];
  const shown = filter === "all" ? rows : rows.filter((r) => r.type === filter);

  return (
    <AppShell title="Entities">
      <div className="flex flex-wrap gap-2 mb-4">
        {types.map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-xs border capitalize ${filter===t?"border-cyan-400 bg-cyan-500/10 text-cyan-300":"border-border text-muted"}`}>
            {t}
          </button>
        ))}
      </div>
      <Card className="p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted border-b border-border">
              <th className="py-2 pr-4 font-normal">Type</th>
              <th className="py-2 pr-4 font-normal">Value</th>
              <th className="py-2 pr-4 font-normal">Confidence</th>
              <th className="py-2 pr-4 font-normal">Case</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted">No entities surfaced yet.</td></tr>}
            {shown.map((e) => (
              <tr key={e.id} className="border-b border-border/60 hover:bg-slate-800/30 cursor-pointer"
                  onClick={() => navigate(`/cases/${e.case_id}/overview`)}>
                <td className="py-3 pr-4"><Badge tone={TYPE_TONE[e.type]||"muted"}>{e.type}</Badge></td>
                <td className="py-3 pr-4 font-mono text-xs">{e.value}</td>
                <td className="py-3 pr-4">{Math.round((e.confidence||0)*100)}%</td>
                <td className="py-3 pr-4 text-muted">{e.case_title}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </AppShell>
  );
}
