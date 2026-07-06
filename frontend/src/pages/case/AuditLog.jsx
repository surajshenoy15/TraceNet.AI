import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Download,
  Eye,
  FileText,
  Filter,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import api from "../../lib/api";
import { Badge, Button, Card } from "../../components/ui";

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = safeDate(value);
  if (!date) return "Unknown time";
  return date.toLocaleString();
}

function shortText(value = "", limit = 120) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

function scoreOf(item, fallback = 50) {
  const value =
    item?.data?.score ??
    item?.data?.confidence ??
    item?.confidence ??
    item?.score;

  if (typeof value !== "number") return fallback;
  return value <= 1 ? Math.round(value * 100) : Math.round(value);
}

function toneForAction(action = "") {
  const text = String(action).toLowerCase();

  if (text.includes("sign") || text.includes("approve") || text.includes("complete")) {
    return "success";
  }

  if (text.includes("fail") || text.includes("error") || text.includes("reject")) {
    return "danger";
  }

  if (text.includes("report") || text.includes("export")) {
    return "warning";
  }

  return "accent";
}

function sourceIcon(source = "") {
  const text = String(source).toLowerCase();

  if (text.includes("audit")) return ShieldCheck;
  if (text.includes("report")) return FileText;
  if (text.includes("graph")) return Network;
  if (text.includes("apify")) return Sparkles;
  return Activity;
}

function normalizeAuditLog(log) {
  return {
    id: `audit:${log.id || crypto.randomUUID()}`,
    timestamp: log.created_at || log.timestamp || log.time || null,
    action: log.action || "AUDIT_EVENT",
    target: log.target_type
      ? `${log.target_type}${log.target_id ? `:${log.target_id}` : ""}`
      : log.target || "case",
    source: "Backend Audit",
    severity: toneForAction(log.action),
    immutable: true,
    details: log.details || log.metadata || log,
    raw: log,
  };
}

function isApifyNode(node) {
  return (
    node?.node_type === "apify_actor" ||
    node?.node_type === "public_result" ||
    Boolean(node?.data?.apify_actor) ||
    Boolean(node?.data?.apify_live)
  );
}

function nodeLabel(node) {
  return node?.label || node?.data?.search_title || node?.data?.url || node?.id || "Evidence node";
}

function buildDerivedEvents(graph, report) {
  const events = [];

  if (graph.nodes.length > 0) {
    events.push({
      id: "derived:graph-summary",
      timestamp: report?.created_at || report?.updated_at || new Date().toISOString(),
      action: "GRAPH_EVIDENCE_AVAILABLE",
      target: "case:graph",
      source: "Derived Graph Activity",
      severity: "accent",
      immutable: false,
      details: {
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        note: "Derived from graph endpoint because backend audit log may be empty.",
      },
    });
  }

  const apifyActors = new Map();

  graph.nodes.forEach((node) => {
    const actor = node?.data?.apify_actor;
    if (!actor) return;

    const item = apifyActors.get(actor) || {
      actor,
      count: 0,
      queries: new Set(),
    };

    item.count += 1;

    if (node?.data?.apify_query) {
      item.queries.add(node.data.apify_query);
    }

    apifyActors.set(actor, item);
  });

  Array.from(apifyActors.values()).forEach((item, index) => {
    events.push({
      id: `derived:apify:${index}`,
      timestamp: report?.created_at || report?.updated_at || new Date().toISOString(),
      action: "APIFY_ACTOR_EVIDENCE",
      target: item.actor,
      source: "Derived Apify Activity",
      severity: "success",
      immutable: false,
      details: {
        actor: item.actor,
        evidence_items: item.count,
        queries: Array.from(item.queries).slice(0, 10),
      },
    });
  });

  graph.nodes
    .filter((node) => isApifyNode(node) || scoreOf(node) >= 75)
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .slice(0, 40)
    .forEach((node) => {
      events.push({
        id: `derived:evidence:${node.id}`,
        timestamp:
          node?.data?.created_at ||
          node?.data?.timestamp ||
          node?.data?.scraped_at ||
          report?.created_at ||
          new Date().toISOString(),
        action: isApifyNode(node) ? "APIFY_EVIDENCE_NODE" : "HIGH_CONFIDENCE_EVIDENCE",
        target: `${node.node_type}:${node.id}`,
        source: isApifyNode(node) ? "Derived Apify Activity" : "Derived Graph Activity",
        severity: scoreOf(node) >= 75 ? "success" : "accent",
        immutable: false,
        details: {
          label: nodeLabel(node),
          node_type: node.node_type,
          score: scoreOf(node),
          url: node?.data?.url,
          apify_actor: node?.data?.apify_actor,
          apify_query: node?.data?.apify_query,
          snippet: node?.data?.search_snippet,
        },
      });
    });

  if (report) {
    events.push({
      id: `derived:report:${report.id || "latest"}`,
      timestamp: report.created_at || report.updated_at || new Date().toISOString(),
      action: report.status === "signed" ? "REPORT_SIGNED_OR_AVAILABLE" : "REPORT_DRAFT_AVAILABLE",
      target: `report:${report.id || "latest"}`,
      source: "Report Activity",
      severity: report.status === "signed" ? "success" : "warning",
      immutable: false,
      details: {
        report_id: report.id,
        status: report.status,
        note: "Report state loaded from report endpoint.",
      },
    });
  }

  return events;
}

function exportCsv(events) {
  const headers = ["timestamp", "source", "action", "target", "immutable", "details"];

  const rows = events.map((event) => [
    formatDate(event.timestamp),
    event.source,
    event.action,
    event.target,
    event.immutable ? "yes" : "derived",
    JSON.stringify(event.details || {}).replaceAll('"', '""'),
  ]);

  const csv = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${String(cell || "").replaceAll('"', '""')}"`).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "tracenet_audit_log.csv";
  link.click();

  URL.revokeObjectURL(url);
}

function DetailsPanel({ selected, onClear }) {
  if (!selected) {
    return (
      <Card className="p-5 h-fit">
        <div className="flex items-center gap-2">
          <Eye size={17} className="text-cyan-300" />
          <h3 className="font-semibold text-slate-100">Audit Details</h3>
        </div>

        <p className="text-sm text-muted mt-3 leading-relaxed">
          Select any audit event to inspect the full action details, source, target, and verification state.
        </p>

        <div className="rounded-xl border border-border bg-slate-950/40 p-4 mt-4">
          <p className="text-xs text-muted leading-relaxed">
            Backend audit events are shown as immutable. Derived events are reconstructed from graph/report evidence when the audit endpoint is empty.
          </p>
        </div>
      </Card>
    );
  }

  const Icon = sourceIcon(selected.source);

  return (
    <Card className="p-5 h-fit sticky top-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted uppercase tracking-[0.18em]">Selected Event</p>
          <h3 className="font-semibold text-slate-100 mt-2 break-words">
            {selected.action}
          </h3>
        </div>

        <div className="h-10 w-10 rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 grid place-items-center shrink-0">
          <Icon size={18} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <Badge tone={selected.severity}>{selected.source}</Badge>
        <Badge tone={selected.immutable ? "success" : "warning"}>
          {selected.immutable ? "Immutable audit" : "Derived activity"}
        </Badge>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-slate-950/40 p-4 text-xs text-slate-300 space-y-2">
        <p>
          <span className="text-muted">Timestamp:</span> {formatDate(selected.timestamp)}
        </p>
        <p>
          <span className="text-muted">Target:</span> {selected.target || "case"}
        </p>
        <p>
          <span className="text-muted">Source:</span> {selected.source}
        </p>
      </div>

      <div className="mt-4">
        <p className="text-xs text-muted uppercase tracking-[0.18em] mb-2">Details JSON</p>
        <pre className="max-h-[420px] overflow-auto rounded-xl border border-border bg-slate-950/70 p-4 text-[11px] text-slate-300 whitespace-pre-wrap">
          {JSON.stringify(selected.details || {}, null, 2)}
        </pre>
      </div>

      <Button className="w-full mt-4" onClick={onClear}>
        Clear Selection
      </Button>
    </Card>
  );
}

export default function AuditLog() {
  const { caseId } = useParams();

  const [auditLogs, setAuditLogs] = useState([]);
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError("");

    const [auditRes, graphRes, reportRes] = await Promise.allSettled([
      api.get(`/cases/${caseId}/audit`),
      api.get(`/cases/${caseId}/graph`),
      api.get(`/cases/${caseId}/report`),
    ]);

    if (auditRes.status === "fulfilled") {
      setAuditLogs(Array.isArray(auditRes.value.data) ? auditRes.value.data : []);
    } else {
      setAuditLogs([]);
    }

    if (graphRes.status === "fulfilled") {
      setGraph({
        nodes: graphRes.value.data?.nodes || [],
        edges: graphRes.value.data?.edges || [],
      });
    } else {
      setGraph({ nodes: [], edges: [] });
    }

    if (reportRes.status === "fulfilled") {
      setReport(reportRes.value.data);
    } else {
      setReport(null);
    }

    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  const runAnalysis = async () => {
    setScanLoading(true);
    setError("");
    setMessage("Running analysis and refreshing audit activity...");

    try {
      try {
        await api.post(`/cases/${caseId}/launch`);
      } catch {
        // Case may already be launched.
      }

      await api.post(`/cases/${caseId}/analyze`);
      await loadAudit();

      setMessage("Audit activity refreshed from latest case evidence.");
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : detail?.message || "Analysis failed. Check backend logs."
      );
      setMessage("");
    } finally {
      setScanLoading(false);
    }
  };

  const events = useMemo(() => {
    const backendEvents = auditLogs.map(normalizeAuditLog);
    const derivedEvents = buildDerivedEvents(graph, report);

    return [...backendEvents, ...derivedEvents].sort((a, b) => {
      const da = safeDate(a.timestamp)?.getTime() || 0;
      const db = safeDate(b.timestamp)?.getTime() || 0;
      return db - da;
    });
  }, [auditLogs, graph, report]);

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();

    return events.filter((event) => {
      if (filter === "audit" && !event.immutable) return false;
      if (filter === "derived" && event.immutable) return false;
      if (filter === "apify" && !String(event.source + event.action + JSON.stringify(event.details)).toLowerCase().includes("apify")) return false;
      if (filter === "report" && !String(event.source + event.action).toLowerCase().includes("report")) return false;
      if (filter === "high" && event.severity !== "success") return false;

      if (q) {
        const haystack = JSON.stringify(event).toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [events, query, filter]);

  const stats = useMemo(
    () => ({
      total: events.length,
      backend: events.filter((e) => e.immutable).length,
      derived: events.filter((e) => !e.immutable).length,
      apify: events.filter((e) =>
        String(e.source + e.action + JSON.stringify(e.details)).toLowerCase().includes("apify")
      ).length,
      success: events.filter((e) => e.severity === "success").length,
    }),
    [events]
  );

  return (
    <div className="space-y-5">
      <Card className="p-5 bg-slate-950/40 border-emerald-400/20">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-emerald-300" />
              <h2 className="text-lg font-semibold text-slate-100">Audit Log</h2>
            </div>
            <p className="text-sm text-muted mt-1">
              Backend audit events plus derived graph/report activity for investigator review.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={runAnalysis} disabled={scanLoading}>
              {scanLoading ? "Running..." : "Run Analysis"}
            </Button>

            <Button onClick={loadAudit} disabled={loading || scanLoading}>
              <RefreshCw size={15} className="mr-2" />
              Refresh
            </Button>

            <Button variant="ghost" onClick={() => exportCsv(filteredEvents)} disabled={!filteredEvents.length}>
              <Download size={15} className="mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {message && (
          <div className="mt-4 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
            {message}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted">Total Events</p>
          <p className="text-2xl font-semibold text-slate-100 mt-1">{stats.total}</p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted">Backend Audit</p>
          <p className="text-2xl font-semibold text-emerald-300 mt-1">{stats.backend}</p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted">Derived Activity</p>
          <p className="text-2xl font-semibold text-amber-300 mt-1">{stats.derived}</p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted">Apify Events</p>
          <p className="text-2xl font-semibold text-cyan-300 mt-1">{stats.apify}</p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted">Success/Strong</p>
          <p className="text-2xl font-semibold text-violet-300 mt-1">{stats.success}</p>
        </Card>
      </div>

      {stats.backend === 0 && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">No backend audit events were returned.</p>
            <p className="text-xs text-amber-200/80 mt-1">
              This page is showing derived activity from graph/report data. For true immutable audit logging, backend must write events whenever actions occur.
            </p>
          </div>
        </div>
      )}

      <Card className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-cyan-300" />
            <h3 className="font-medium text-slate-100">Filter Events</h3>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              ["all", "All"],
              ["audit", "Backend Audit"],
              ["derived", "Derived"],
              ["apify", "Apify"],
              ["report", "Report"],
              ["high", "Strong"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  filter === key
                    ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-100"
                    : "border-border bg-slate-900/40 text-muted hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mt-4">
          <Search size={16} className="absolute left-3 top-3.5 text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search action, target, actor, details..."
            className="w-full rounded-xl border border-border bg-slate-950/60 pl-10 pr-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400/50"
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_390px] gap-5">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-border bg-slate-950/50">
                  <th className="px-4 py-3 font-normal">Timestamp</th>
                  <th className="px-4 py-3 font-normal">Source</th>
                  <th className="px-4 py-3 font-normal">Action</th>
                  <th className="px-4 py-3 font-normal">Target</th>
                  <th className="px-4 py-3 font-normal">Verification</th>
                  <th className="px-4 py-3 font-normal text-right">View</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted">
                      Loading audit activity...
                    </td>
                  </tr>
                ) : filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted">
                      No audit events match this filter.
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((event) => {
                    const Icon = sourceIcon(event.source);

                    return (
                      <tr
                        key={event.id}
                        className="border-b border-border/60 hover:bg-slate-800/30 cursor-pointer"
                        onClick={() => setSelected(event)}
                      >
                        <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Clock size={13} />
                            {formatDate(event.timestamp)}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Icon size={14} className="text-cyan-300" />
                            <span className="text-xs text-slate-300 whitespace-nowrap">
                              {event.source}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3 font-mono text-xs text-cyan-300">
                          {event.action}
                        </td>

                        <td className="px-4 py-3 text-xs text-slate-300">
                          {shortText(event.target || "case", 46)}
                        </td>

                        <td className="px-4 py-3">
                          {event.immutable ? (
                            <Badge tone="success">
                              <CheckCircle2 size={12} className="mr-1" />
                              Backend audit
                            </Badge>
                          ) : (
                            <Badge tone="warning">Derived</Badge>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(event);
                            }}
                          >
                            <Eye size={14} />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <DetailsPanel selected={selected} onClear={() => setSelected(null)} />
      </div>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <Database size={18} className="text-emerald-300 mt-0.5" />
          <p className="text-xs text-muted leading-relaxed">
            Backend audit entries are treated as the authoritative log. Derived activity is reconstructed from graph, Apify, and report data only to keep investigator screens useful when the audit endpoint is empty. Do not describe derived events as cryptographically signed unless your backend actually signs and stores them.
          </p>
        </div>
      </Card>
    </div>
  );
}