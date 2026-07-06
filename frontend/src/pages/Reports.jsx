import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText } from "lucide-react";
import AppShell from "../components/AppShell";
import { Card, Badge } from "../components/ui";
import api from "../lib/api";

export default function Reports() {
  const [rows, setRows] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/global/reports").then((r) => setRows(r.data)).catch(() => {});
  }, []);

  return (
    <AppShell title="Reports">
      <Card className="p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted border-b border-border">
              <th className="py-2 pr-4 font-normal">Reference</th>
              <th className="py-2 pr-4 font-normal">Case</th>
              <th className="py-2 pr-4 font-normal">Status</th>
              <th className="py-2 pr-4 font-normal">Generated</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted">No reports generated yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 hover:bg-slate-800/30 cursor-pointer"
                  onClick={() => navigate(`/cases/${r.case_id}/report`)}>
                <td className="py-3 pr-4 text-cyan-400 font-mono text-xs">{r.reference_no}</td>
                <td className="py-3 pr-4">{r.case_title}</td>
                <td className="py-3 pr-4"><Badge tone={r.status==="signed"?"success":"muted"}>{r.status}</Badge></td>
                <td className="py-3 pr-4 text-muted text-xs">{new Date(r.generated_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </AppShell>
  );
}
