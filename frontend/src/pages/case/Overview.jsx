import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Users, MapPin, FolderSearch, Layers } from "lucide-react";
import api from "../../lib/api";
import { Card, ConfidenceRing, Badge } from "../../components/ui";

const ENTITY_LABEL = {
  username: "Username", phone: "Phone", email: "Email", upi: "UPI ID", url: "URL", keyword: "Keyword",
};

export default function Overview() {
  const { caseId } = useParams();
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    api.get(`/cases/${caseId}/overview`).then((r) => setOverview(r.data)).catch(() => {});
  }, [caseId]);

  if (!overview) {
    return <p className="text-muted text-sm">Loading overview…</p>;
  }

  const grouped = {};
  overview.entities.forEach((e) => {
    grouped[e.type] = grouped[e.type] || [];
    grouped[e.type].push(e.value);
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_1fr] gap-5">
        <Card className="p-6 flex flex-col items-center justify-center">
          <ConfidenceRing value={overview.cluster_confidence} label="cluster confidence" size={120} />
          <p className="text-xs text-muted mt-3 text-center">
            AI confidence score based on multi-signal correlation across behavioral, textual, and network indicators.
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 text-muted text-sm mb-3">
            <Layers size={16} /> Accounts Found
          </div>
          <p className="text-3xl font-bold">{overview.accounts_found}</p>
          <p className="text-sm text-muted mt-1">Across {overview.platforms_count} platform(s)</p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 text-muted text-sm mb-3">
            <MapPin size={16} /> Probable Region
          </div>
          <p className="text-2xl font-semibold">{overview.probable_locations[0] || "Insufficient signal"}</p>
          <p className="text-xs text-muted mt-1">Regional inference only — see Map tab for confidence breakdown.</p>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users size={16} className="text-cyan-400" />
          <h2 className="font-medium">Extracted Entities</h2>
          <span className="text-xs text-muted">({overview.entities_count})</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(grouped).map(([type, values]) => (
            <div key={type} className="bg-slate-900/40 border border-border rounded-lg p-4">
              <p className="text-xs text-muted uppercase mb-2">{ENTITY_LABEL[type] || type}</p>
              <div className="flex flex-wrap gap-1.5">
                {values.map((v) => (
                  <Badge key={v} tone="accent">{v}</Badge>
                ))}
              </div>
            </div>
          ))}
          {overview.entities_count === 0 && (
            <p className="text-sm text-muted">No entities extracted yet — add seed inputs and run analysis.</p>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-2">
          <FolderSearch size={16} className="text-cyan-400" />
          <h2 className="font-medium">Quick Insights</h2>
        </div>
        <p className="text-sm text-muted">
          {overview.evidence_count} evidence item(s) registered. Public-source only — requires human verification
          before any investigative or legal action.
        </p>
      </Card>
    </div>
  );
}
