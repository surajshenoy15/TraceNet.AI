import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { UploadCloud, CheckCircle2, XCircle, EyeOff, FileText, Image as ImageIcon, Globe } from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Card, Badge } from "../../components/ui";

const TYPE_ICON = { image: ImageIcon, profile: Globe, url: Globe, file: FileText, text: FileText, chat: FileText };

const STATUS_TONE = { unreviewed: "muted", verified: "success", rejected: "danger", excluded: "muted" };

export default function Evidence() {
  const { can } = useAuth();
  const { caseId } = useParams();
  const [items, setItems] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  function load() {
    api.get(`/cases/${caseId}/evidence`).then((r) => setItems(r.data)).catch(() => {});
  }

  useEffect(load, [caseId]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api.post(`/cases/${caseId}/evidence/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      load();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function setStatus(id, status) {
    await api.patch(`/cases/${caseId}/evidence/${id}`, { verification_status: status });
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">Evidence Registry</h2>
          <p className="text-sm text-muted">All collected and associated evidence for this case.</p>
        </div>
        <label className="cursor-pointer">
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
          <span className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded-lg px-4 py-2.5 text-sm flex items-center gap-2">
            <UploadCloud size={16} /> {uploading ? "Uploading…" : "Upload evidence"}
          </span>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => {
          const Icon = TYPE_ICON[item.type] || FileText;
          return (
            <Card key={item.id} className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className="text-cyan-400" />
                <p className="text-sm font-medium truncate flex-1">{item.title}</p>
              </div>
              <p className="text-[11px] text-muted">Source: {item.source}</p>
              {item.sha256 && <p className="text-[11px] text-muted font-mono truncate">SHA256: {item.sha256.slice(0, 24)}…</p>}
              {item.note && (
                <a href={item.note} target="_blank" rel="noreferrer" className="text-[11px] text-cyan-400 break-all block mt-1">
                  {item.note}
                </a>
              )}
              <div className="flex items-center justify-between mt-3">
                <Badge tone="accent">{Math.round((item.confidence || 0) * 100)}% confidence</Badge>
                <Badge tone={STATUS_TONE[item.verification_status] || "muted"}>{item.verification_status}</Badge>
              </div>
              {can("evidence.review") ? <div className="flex gap-2 mt-3">
                <button onClick={() => setStatus(item.id, "verified")} className="flex-1 text-xs flex items-center justify-center gap-1 py-1.5 rounded-md border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">
                  <CheckCircle2 size={13} /> Verify
                </button>
                <button onClick={() => setStatus(item.id, "rejected")} className="flex-1 text-xs flex items-center justify-center gap-1 py-1.5 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10">
                  <XCircle size={13} /> Reject
                </button>
                <button onClick={() => setStatus(item.id, "excluded")} className="flex-1 text-xs flex items-center justify-center gap-1 py-1.5 rounded-md border border-border text-muted hover:bg-slate-800/60">
                  <EyeOff size={13} /> Exclude
                </button>
              </div> : <p className="text-[11px] text-muted mt-3">Reviewer role required to verify or reject evidence.</p>}
            </Card>
          );
        })}
        {items.length === 0 && <p className="text-sm text-muted">No evidence yet. Run analysis or upload a file.</p>}
      </div>
    </div>
  );
}
