import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle,
  Award,
  Building2,
  CalendarDays,
  Database,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  Link2,
  Lock,
  Network,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import {
  FaFacebook,
  FaGithub,
  FaInstagram,
  FaLinkedin,
  FaReddit,
  FaTelegram,
  FaTiktok,
  FaWhatsapp,
  FaYoutube,
} from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { SiGoogle } from "react-icons/si";
import api, { API_BASE } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Card, Badge, Button } from "../../components/ui";

const LETTERHEAD = {
  org: "TraceNet AI",
  unit: "Public-Source Intelligence Investigation Report",
  department: "Authorized OSINT Investigation Desk",
  classification: "CONFIDENTIAL / AUTHORIZED DEMO USE ONLY",
  address: "Digital Evidence Review Unit",
};

const MIN_RELEVANT_SCORE = 60;
const PRIMARY_SCORE = 75;

const APP_META = [
  {
    key: "instagram",
    label: "Instagram",
    icon: FaInstagram,
    color: "#ec4899",
    target: "https://www.instagram.com",
    patterns: ["instagram.com", "instagram"],
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    icon: FaLinkedin,
    color: "#0ea5e9",
    target: "https://www.linkedin.com",
    patterns: ["linkedin.com", "linkedin"],
  },
  {
    key: "github",
    label: "GitHub",
    icon: FaGithub,
    color: "#94a3b8",
    target: "https://github.com",
    patterns: ["github.com", "github"],
  },
  {
    key: "twitter",
    label: "X / Twitter",
    icon: FaXTwitter,
    color: "#38bdf8",
    target: "https://x.com",
    patterns: ["twitter.com", "x.com", "twitter"],
  },
  {
    key: "telegram",
    label: "Telegram",
    icon: FaTelegram,
    color: "#22d3ee",
    target: "https://t.me",
    patterns: ["t.me", "telegram"],
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: FaFacebook,
    color: "#3b82f6",
    target: "https://www.facebook.com",
    patterns: ["facebook.com", "fb.com", "facebook"],
  },
  {
    key: "reddit",
    label: "Reddit",
    icon: FaReddit,
    color: "#f97316",
    target: "https://www.reddit.com",
    patterns: ["reddit.com", "reddit"],
  },
  {
    key: "youtube",
    label: "YouTube",
    icon: FaYoutube,
    color: "#ef4444",
    target: "https://www.youtube.com",
    patterns: ["youtube.com", "youtu.be", "youtube"],
  },
  {
    key: "tiktok",
    label: "TikTok",
    icon: FaTiktok,
    color: "#a78bfa",
    target: "https://www.tiktok.com",
    patterns: ["tiktok.com", "tiktok"],
  },
  {
    key: "whatsapp",
    label: "WhatsApp Mention",
    icon: FaWhatsapp,
    color: "#22c55e",
    target: "https://www.whatsapp.com",
    patterns: ["whatsapp", "wa.me"],
  },
  {
    key: "google",
    label: "Google Search",
    icon: SiGoogle,
    color: "#fbbf24",
    target: "https://www.google.com/search",
    patterns: ["google-search", "google search", "apify/google", "google"],
  },
  {
  key: "apify",
  label: "Apify",
  icon: Sparkles,
  color: "#97c93d",
  target: "https://apify.com",
  patterns: ["apify", "maigret", "google-search-scraper", "web-scraper"],
},
];

const NODE_LABELS = {
  seed: "Seed",
  username: "Username",
  email: "Email",
  phone: "Phone",
  ip: "IP",
  upi: "UPI",
  url: "URL",
  keyword: "Keyword",
  apify_actor: "Apify Actor",
  public_result: "Public Result",
  profile: "Public Profile",
  domain: "Domain",
  email_artifact: "Email Artifact",
  phone_artifact: "Phone Artifact",
  ip_artifact: "IP Artifact",
  domain_artifact: "Domain Artifact",
  location: "Location",
};

function pctTone(value = 0) {
  const n = Number(value) || 0;
  if (n >= 75) return "success";
  if (n >= 45) return "warning";
  return "danger";
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

function short(value = "", max = 130) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function isApifyNode(node) {
  return (
    node?.node_type === "apify_actor" ||
    node?.node_type === "public_result" ||
    Boolean(node?.data?.apify_actor) ||
    Boolean(node?.data?.apify_live)
  );
}

function domainFromUrl(value = "") {
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizedText(item) {
  const data = item?.data || item || {};
  return [
    item?.label,
    item?.platform,
    item?.handle,
    item?.url,
    item?.source_type,
    item?.matched_entity_type,
    data.platform,
    data.source,
    data.source_type,
    data.apify_actor,
    data.apify_query,
    data.domain,
    data.url,
    data.search_title,
    data.search_snippet,
    data.text,
    data.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function detectApp(item) {
  const text = normalizedText(item);
  return APP_META.find((app) => app.patterns.some((p) => text.includes(p)));
}

function extractUrl(item) {
  return item?.url || item?.data?.url || "";
}

function extractPlatform(item) {
  const app = detectApp(item);
  if (app) return app.label;

  return (
    item?.platform ||
    item?.data?.platform ||
    item?.data?.source ||
    item?.data?.source_type ||
    domainFromUrl(extractUrl(item)) ||
    NODE_LABELS[item?.node_type] ||
    "Public Source"
  );
}

function extractTitle(item) {
  return (
    item?.search_title ||
    item?.data?.search_title ||
    item?.handle ||
    item?.label ||
    item?.value ||
    "Public evidence"
  );
}

function extractSnippet(item) {
  return (
    item?.search_snippet ||
    item?.data?.search_snippet ||
    item?.data?.description ||
    item?.data?.text ||
    ""
  );
}

function getReasonList(item) {
  const reasons = [];

  if (item?.reasons?.length) reasons.push(...item.reasons);
  if (item?.data?.matched_entity_type) {
    reasons.push(
      `Matched from ${item.data.matched_entity_type}: ${item.data.matched_entity_value || ""}`
    );
  }
  if (item?.matched_entity_type) {
    reasons.push(
      `Matched from ${item.matched_entity_type}: ${item.matched_entity_value || ""}`
    );
  }
  if (item?.data?.apify_actor || item?.apify_actor) {
    reasons.push(`Returned by Apify Actor: ${item.data?.apify_actor || item.apify_actor}`);
  }
  if (item?.node_type === "profile") reasons.push("Public profile candidate");
  if (item?.node_type === "public_result") reasons.push("Public search result evidence");
  if (scoreOf(item) >= 75) reasons.push("High confidence score");

  return [...new Set(reasons)].filter(Boolean).slice(0, 5);
}

function extractVisibleApps(nodes = [], leads = []) {
  const items = [...nodes, ...leads];
  const found = new Map();

  items.forEach((item) => {
    const app = detectApp(item);
    if (!app) return;

    const current = found.get(app.key) || {
      ...app,
      count: 0,
      bestScore: 0,
      urls: [],
    };

    current.count += 1;
    current.bestScore = Math.max(current.bestScore, scoreOf(item));
    const url = extractUrl(item);
    if (url && !current.urls.includes(url)) current.urls.push(url);

    found.set(app.key, current);
  });

  return Array.from(found.values()).sort(
    (a, b) => b.bestScore - a.bestScore || b.count - a.count
  );
}

function getSourceBreakdown(nodes = []) {
  return Object.entries(
    nodes.reduce((acc, node) => {
      const source =
        extractPlatform(node) ||
        node?.data?.domain ||
        domainFromUrl(node?.data?.url || node?.label || "") ||
        "unknown";

      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
}

function getActorBreakdown(nodes = []) {
  return Object.entries(
    nodes.reduce((acc, node) => {
      const actor = node?.data?.apify_actor;
      if (!actor) return acc;
      acc[actor] = (acc[actor] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
}

function buildRelevantLeads(reportLeads = [], graphNodes = []) {
  const reportItems = reportLeads.map((lead) => ({
    ...lead,
    node_type: lead.node_type || "profile",
  }));

  const graphItems = graphNodes
    .filter((node) =>
      ["profile", "public_result", "domain", "url"].includes(node.node_type)
    )
    .map((node) => ({
      ...node,
      score: scoreOf(node),
      platform: extractPlatform(node),
      handle: node.data?.handle || node.label,
      url: node.data?.url,
      search_title: node.data?.search_title,
      search_snippet: node.data?.search_snippet,
      apify_actor: node.data?.apify_actor,
      apify_query: node.data?.apify_query,
      source_type: node.data?.source_type,
      matched_entity_type: node.data?.matched_entity_type,
      matched_entity_value: node.data?.matched_entity_value,
    }));

  const merged = [...reportItems, ...graphItems];

  const unique = new Map();

  merged.forEach((item) => {
    const key =
      extractUrl(item) ||
      `${extractPlatform(item)}:${extractTitle(item)}`.toLowerCase();

    if (!key) return;

    const existing = unique.get(key);
    if (!existing || scoreOf(item) > scoreOf(existing)) {
      unique.set(key, item);
    }
  });

  return Array.from(unique.values())
    .filter((item) => scoreOf(item) >= MIN_RELEVANT_SCORE)
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .slice(0, 12);
}

function buildPrimaryLead(leads = []) {
  if (!leads.length) return null;

  const ranked = [...leads].sort((a, b) => {
    const scoreDiff = scoreOf(b) - scoreOf(a);
    if (scoreDiff !== 0) return scoreDiff;

    const bHasUrl = extractUrl(b) ? 1 : 0;
    const aHasUrl = extractUrl(a) ? 1 : 0;
    return bHasUrl - aHasUrl;
  });

  return ranked[0];
}

function buildArtifacts(reportArtifacts = [], graphNodes = []) {
  const graphArtifacts = graphNodes
    .filter((n) =>
      ["email_artifact", "phone_artifact", "ip_artifact", "domain_artifact", "location"].includes(
        n.node_type
      )
    )
    .map((n) => ({
      type: NODE_LABELS[n.node_type] || n.node_type,
      value:
        n.data?.email_pattern ||
        n.data?.phone_pattern ||
        n.data?.ip_address ||
        n.data?.domain ||
        n.label,
      origin: n.data?.source_type || n.data?.apify_actor || n.data?.domain || "graph evidence",
      score: scoreOf(n),
    }));

  const merged = [...reportArtifacts, ...graphArtifacts];

  const unique = new Map();
  merged.forEach((a) => {
    const key = `${a.type}:${a.value}`;
    if (!a.value) return;

    const existing = unique.get(key);
    if (!existing || Number(a.score || 50) > Number(existing.score || 50)) {
      unique.set(key, a);
    }
  });

  return Array.from(unique.values())
    .filter((a) => Number(a.score || 50) >= 45)
    .slice(0, 30);
}

function buildGraphStats(reportStats = {}, nodes = [], edges = []) {
  const leadNodes = nodes.filter((n) =>
    ["profile", "public_result", "domain", "url"].includes(n.node_type)
  ).length;

  const artifactNodes = nodes.filter((n) =>
    ["email_artifact", "phone_artifact", "ip_artifact", "domain_artifact", "location"].includes(
      n.node_type
    )
  ).length;

  const apifyNodes = nodes.filter(isApifyNode).length;
  const highConfidence = nodes.filter((n) => scoreOf(n) >= 75).length;

  return {
    nodes: reportStats.nodes ?? nodes.length,
    edges: reportStats.edges ?? edges.length,
    lead_nodes: reportStats.lead_nodes ?? leadNodes,
    artifact_nodes: reportStats.artifact_nodes ?? artifactNodes,
    apify_nodes: reportStats.apify_nodes ?? apifyNodes,
    high_confidence_nodes: reportStats.high_confidence_nodes ?? highConfidence,
    cluster_confidence:
      reportStats.cluster_confidence ??
      Math.min(95, Math.max(0, highConfidence * 12)),
  };
}

function StatCard({ icon: Icon, label, value, hint, tone = "accent" }) {
  const toneClass =
    tone === "success"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : tone === "warning"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
        : tone === "danger"
          ? "border-red-400/30 bg-red-400/10 text-red-300"
          : "border-cyan-400/30 bg-cyan-400/10 text-cyan-300";

  return (
    <div className="rounded-2xl border border-border bg-slate-950/40 p-4">
      <div className="flex items-center justify-between">
        <div className={`h-10 w-10 rounded-xl border flex items-center justify-center ${toneClass}`}>
          <Icon size={18} />
        </div>
        <p className="text-2xl font-semibold text-slate-100">{value}</p>
      </div>
      <p className="text-sm font-medium text-slate-200 mt-3">{label}</p>
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  );
}

function AppIconCard({ app }) {
  const Icon = app.icon;
  const mainUrl = app.urls?.[0] || app.target;

  return (
    <a
      href={mainUrl}
      target="_blank"
      rel="noreferrer"
      className="rounded-2xl border border-border bg-slate-950/40 p-4 flex items-center gap-3 hover:bg-slate-900/70 transition"
    >
      <div
        className="h-12 w-12 rounded-2xl grid place-items-center border"
        style={{
          color: app.color,
          borderColor: `${app.color}88`,
          backgroundColor: `${app.color}18`,
        }}
      >
        <Icon size={24} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-100">{app.label}</p>
        <p className="text-xs text-muted">
          {app.count} signal(s) · best {app.bestScore}%
        </p>
      </div>
      <ExternalLink size={14} className="text-cyan-300 ml-auto shrink-0" />
    </a>
  );
}

function PrimaryLeadCard({ lead }) {
  if (!lead) {
    return (
      <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-amber-300 mt-0.5" size={20} />
          <div>
            <h3 className="font-semibold text-amber-200">No primary suspect lead yet</h3>
            <p className="text-sm text-slate-300 mt-2">
              No high-confidence public profile or public result reached the relevance threshold.
              Add stronger public URLs/usernames or increase Apify search result count, then regenerate.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const app = detectApp(lead);
  const Icon = app?.icon || Globe2;
  const score = scoreOf(lead);
  const url = extractUrl(lead);
  const platform = extractPlatform(lead);
  const reasons = getReasonList(lead);

  return (
    <section className="rounded-3xl border border-cyan-400/25 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.13),transparent_35%),rgba(2,6,23,0.55)] p-6">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
        <div className="flex items-start gap-4 min-w-0">
          <div
            className="h-16 w-16 rounded-2xl border grid place-items-center shrink-0"
            style={{
              color: app?.color || "#22d3ee",
              borderColor: `${app?.color || "#22d3ee"}88`,
              backgroundColor: `${app?.color || "#22d3ee"}18`,
            }}
          >
            <Icon size={30} />
          </div>

          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">
              Primary suspect lead / strongest public match
            </p>
            <h3 className="text-xl font-semibold text-slate-100 mt-2 break-words">
              {extractTitle(lead)}
            </h3>
            <p className="text-sm text-muted mt-1">
              Platform/site: <span className="text-slate-200">{platform}</span>
            </p>

            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-cyan-300 hover:underline break-all mt-3"
              >
                Open targeted site <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-col items-start lg:items-end gap-2">
          <Badge tone={pctTone(score)}>{score}% confidence</Badge>
          {score >= PRIMARY_SCORE && <Badge tone="success">High-priority lead</Badge>}
          {(lead?.apify_actor || lead?.data?.apify_actor || isApifyNode(lead)) && (
            <Badge tone="success">Apify-backed</Badge>
          )}
        </div>
      </div>

      {extractSnippet(lead) && (
        <p className="text-sm text-slate-300 leading-relaxed mt-5">
          {short(extractSnippet(lead), 420)}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
        {reasons.map((reason) => (
          <div
            key={reason}
            className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs text-slate-300"
          >
            {reason}
          </div>
        ))}
      </div>

      <p className="text-xs text-amber-300 mt-5">
        Note: This is the strongest public-source lead, not a final identity conclusion. Manual verification is required.
      </p>
    </section>
  );
}

function LeadCard({ item, index }) {
  const app = detectApp(item);
  const Icon = app?.icon || Globe2;
  const score = scoreOf(item);
  const url = extractUrl(item);
  const title = extractTitle(item);
  const snippet = extractSnippet(item);
  const platform = extractPlatform(item);
  const actor = item.apify_actor || item.data?.apify_actor;
  const query = item.apify_query || item.data?.apify_query;
  const reasons = getReasonList(item);

  return (
    <div className="rounded-2xl border border-border bg-slate-950/35 p-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="h-12 w-12 rounded-2xl border grid place-items-center shrink-0"
            style={{
              color: app?.color || "#22d3ee",
              borderColor: `${app?.color || "#22d3ee"}88`,
              backgroundColor: `${app?.color || "#22d3ee"}18`,
            }}
          >
            <Icon size={22} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">#{index + 1}</Badge>
              <Badge tone={item.node_type === "public_result" ? "warning" : "accent"}>
                {NODE_LABELS[item.node_type] || item.node_type || "lead"}
              </Badge>
              <span className="text-xs text-muted">{platform}</span>
            </div>

            <p className="font-semibold text-slate-100 break-words mt-2">
              {title}
            </p>

            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline break-all mt-2"
              >
                {url} <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>

        <Badge tone={pctTone(score)}>{score}%</Badge>
      </div>

      {snippet && (
        <p className="text-xs text-muted mt-3 leading-relaxed">
          {short(snippet, 320)}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3 text-[11px]">
        <p className="rounded-lg bg-slate-900/60 border border-slate-800 px-3 py-2 text-slate-300">
          Targeted site: <span className="text-cyan-300">{platform}</span>
        </p>
        <p className="rounded-lg bg-slate-900/60 border border-slate-800 px-3 py-2 text-slate-300">
          Match score: <span className="text-cyan-300">{score}%</span>
        </p>
        {actor && (
          <p className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-3 py-2 text-emerald-300 md:col-span-2">
            Apify Actor: {actor}
            {query ? ` · query: ${short(query, 120)}` : ""}
          </p>
        )}
      </div>

      {reasons.length > 0 && (
        <ul className="list-disc list-inside text-xs text-slate-400 mt-3 space-y-1">
          {reasons.slice(0, 4).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Report() {
  const { can } = useAuth();
  const { caseId } = useParams();

  const [report, setReport] = useState(null);
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);

  async function load() {
    const [reportRes, graphRes] = await Promise.allSettled([
      api.get(`/cases/${caseId}/report`),
      api.get(`/cases/${caseId}/graph`),
    ]);

    setReport(reportRes.status === "fulfilled" ? reportRes.value.data : null);

    if (graphRes.status === "fulfilled") {
      setGraph({
        nodes: graphRes.value.data?.nodes || [],
        edges: graphRes.value.data?.edges || [],
      });
    } else {
      setGraph({ nodes: [], edges: [] });
    }
  }

  useEffect(() => {
    load();
  }, [caseId]);

  async function generate() {
    setLoading(true);
    try {
      try {
        await api.post(`/cases/${caseId}/launch`);
      } catch {
        // already launched
      }

      try {
        await api.post(`/cases/${caseId}/analyze`);
      } catch {
        // existing graph can still be reported
      }

      const res = await api.post(`/cases/${caseId}/report/generate`);
      setReport(res.data);

      const graphRes = await api.get(`/cases/${caseId}/graph`);
      setGraph({
        nodes: graphRes.data?.nodes || [],
        edges: graphRes.data?.edges || [],
      });
    } finally {
      setLoading(false);
    }
  }

  async function sign() {
    await api.post(`/cases/${caseId}/report/${report.id}/sign`);
    load();
  }

  async function exportPdf() {
    if (!report?.id) return;

    const token = localStorage.getItem("tracenet_token");
    const res = await fetch(`${API_BASE}/cases/${caseId}/report/${report.id}/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `TraceNet_${caseId}.pdf`;
    a.click();

    URL.revokeObjectURL(url);
  }

  function printReport() {
    window.print();
  }

  if (!report) {
    return (
      <Card className="p-10 text-center">
        <FileText className="mx-auto text-slate-500 mb-3" size={32} />
        <p className="text-slate-300 mb-2 font-medium">
          No final report generated yet.
        </p>
        <p className="text-sm text-muted mb-5">
          Generate a final suspect-lead report with app icons, targeted-site links, and high-confidence findings only.
        </p>
        <Button onClick={generate} disabled={loading}>
          {loading ? "Generating…" : "Generate Final Report"}
        </Button>
      </Card>
    );
  }

  const data = report.report_json || {};
  const stats = buildGraphStats(data.graph_stats || {}, graph.nodes, graph.edges);

  const reportLeads = data.identity_cluster || [];
  const leads = buildRelevantLeads(reportLeads, graph.nodes);
  const primaryLead = buildPrimaryLead(leads);

  const keyConclusions = data.key_conclusions || [];
  const bestConfidence =
    data.best_confidence ??
    data.graph_stats?.best_confidence ??
    (primaryLead ? scoreOf(primaryLead) : stats.cluster_confidence || 0);

  const artifacts = buildArtifacts(data.extracted_artifacts || [], graph.nodes);
  const apps = extractVisibleApps(graph.nodes, leads);

  const sourceBreakdown =
    Object.entries(data.source_breakdown || {}).length > 0
      ? Object.entries(data.source_breakdown || {}).sort((a, b) => b[1] - a[1])
      : getSourceBreakdown(graph.nodes);

  const actorBreakdown =
    Object.entries(data.actor_breakdown || {}).length > 0
      ? Object.entries(data.actor_breakdown || {}).sort((a, b) => b[1] - a[1])
      : getActorBreakdown(graph.nodes);

  const generatedAt = data.generated_at || report.created_at || new Date().toISOString();

  const legalPurpose =
    data.lawful_purpose ||
    data.legal_basis ||
    "Authorized public-source OSINT review. Findings are investigative leads and require human verification.";

  return (
    <div className="space-y-5 report-page">
      <style>{`
        @media print {
          body {
            background: white !important;
          }

          .no-print,
          nav,
          aside,
          .app-sidebar {
            display: none !important;
          }

          .report-shell {
            background: white !important;
            color: #0f172a !important;
            border: 1px solid #cbd5e1 !important;
          }

          .report-shell p,
          .report-shell h1,
          .report-shell h2,
          .report-shell h3,
          .report-shell li,
          .report-shell span {
            color: #0f172a !important;
          }

          .report-section {
            break-inside: avoid;
          }

          a {
            color: #0369a1 !important;
          }
        }
      `}</style>

      <div className="no-print flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-medium text-slate-100">
              Final Suspect-Lead Report
            </h2>
            <Badge tone={report.status === "signed" ? "success" : "muted"}>
              {report.status}
            </Badge>
            <Badge tone="success">High-confidence only</Badge>
          </div>
          <p className="text-xs text-muted mt-1">
            Shows only the most relevant public-source leads, targeted sites, and confidence-ranked evidence.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={generate} disabled={loading}>
            <RefreshCw size={14} /> {loading ? "Regenerating…" : "Regenerate"}
          </Button>

          {report.status !== "signed" && can("report.sign") && (
            <Button variant="ghost" onClick={sign}>
              <Lock size={14} /> Sign & Lock
            </Button>
          )}

          <Button variant="ghost" onClick={printReport}>
            <Printer size={14} /> Print / Save PDF
          </Button>

          <Button onClick={exportPdf}>
            <Download size={14} /> Export Backend PDF
          </Button>
        </div>
      </div>

      <Card className="report-shell overflow-hidden">
        <div className="relative p-7 border-b border-border bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))]">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-2xl border border-cyan-400/40 bg-cyan-400/10 grid place-items-center">
                <ShieldCheck className="text-cyan-300" size={30} />
              </div>

              <div>
                <p className="text-xs text-cyan-300 uppercase tracking-[0.24em]">
                  {LETTERHEAD.org}
                </p>
                <h1 className="text-2xl md:text-3xl font-semibold text-slate-50 mt-1">
                  {LETTERHEAD.unit}
                </h1>
                <p className="text-sm text-slate-400 mt-2">
                  {LETTERHEAD.department} · {LETTERHEAD.address}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-400/20 bg-slate-950/40 p-4 min-w-[260px]">
              <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">
                Classification
              </p>
              <p className="text-sm font-semibold text-slate-100 mt-1">
                {LETTERHEAD.classification}
              </p>
              <p className="text-xs text-slate-400 mt-3">
                Generated: {new Date(generatedAt).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="mt-7">
            <p className="text-xs text-slate-400 uppercase tracking-[0.18em]">
              Case title
            </p>
            <h2 className="text-xl md:text-2xl font-semibold text-slate-50 mt-1">
              {data.case_title || "TraceNet AI Public OSINT Case"}
            </h2>

            <div className="flex flex-wrap gap-2 mt-4 text-xs">
              <span className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-slate-300">
                Ref: {data.case_reference || data.case_ref || caseId}
              </span>
              <span className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-slate-300">
                Jurisdiction: {data.jurisdiction || "Not specified"}
              </span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-300">
                Public/authorized sources only
              </span>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <section className="report-section rounded-2xl border border-border bg-slate-950/35 p-5">
            <div className="flex items-start gap-3">
              <Building2 className="text-cyan-300 mt-0.5" size={20} />
              <div>
                <h3 className="font-semibold text-slate-100">
                  Legal Authority / Lawful Purpose
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed mt-2">
                  {legalPurpose}
                </p>
              </div>
            </div>
          </section>

          <section className="report-section">
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              <StatCard icon={Network} label="Graph nodes" value={stats.nodes || 0} hint="All evidence" />
              <StatCard icon={Search} label="Relevant leads" value={leads.length} hint={`Score ≥ ${MIN_RELEVANT_SCORE}%`} tone="success" />
              <StatCard icon={Target} label="Primary lead" value={primaryLead ? `${scoreOf(primaryLead)}%` : "—"} hint="Strongest match" tone={primaryLead ? pctTone(scoreOf(primaryLead)) : "warning"} />
              <StatCard icon={Sparkles} label="Apify nodes" value={stats.apify_nodes || 0} hint="Actor-backed" tone="success" />
              <StatCard icon={AlertTriangle} label="Artifacts" value={artifacts.length} hint="Extracted signals" tone="warning" />
              <StatCard icon={Award} label="Cluster" value={`${stats.cluster_confidence || 0}%`} hint="Overall lead score" tone={pctTone(stats.cluster_confidence)} />
            </div>
          </section>

          <PrimaryLeadCard lead={primaryLead} />

          <section className="report-section rounded-2xl border border-border bg-slate-950/35 p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-slate-100">Executive Summary</h3>
              <Badge tone={pctTone(stats.cluster_confidence)}>
                {stats.cluster_confidence || 0}% cluster
              </Badge>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed mt-3">
              {data.executive_summary ||
                "The case contains public-source evidence gathered from Apify connectors, public search results, graph analysis, and extracted artifacts. This report prioritizes only the most relevant high-confidence leads."}
            </p>
          </section>

          {keyConclusions.length > 0 && (
            <section className="report-section rounded-2xl border border-cyan-400/25 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.1),transparent_40%),rgba(2,6,23,0.5)] p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-cyan-300" />
                  <h3 className="font-semibold text-slate-100">Key Conclusions</h3>
                </div>
                <Badge tone={pctTone(bestConfidence)}>
                  Best {bestConfidence}%
                </Badge>
              </div>

              <div className="space-y-2.5">
                {keyConclusions.map((kc, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3"
                  >
                    <span
                      className="shrink-0 mt-0.5 text-[11px] font-semibold rounded-md px-2 py-1 border"
                      style={{
                        color:
                          kc.confidence >= 75
                            ? "#34d399"
                            : kc.confidence >= 45
                              ? "#fbbf24"
                              : "#f87171",
                        borderColor:
                          kc.confidence >= 75
                            ? "#34d39955"
                            : kc.confidence >= 45
                              ? "#fbbf2455"
                              : "#f8717155",
                        backgroundColor:
                          kc.confidence >= 75
                            ? "#34d39915"
                            : kc.confidence >= 45
                              ? "#fbbf2415"
                              : "#f8717115",
                      }}
                    >
                      {kc.confidence}%
                    </span>
                    <p className="text-sm text-slate-200 leading-relaxed">{kc.text}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="report-section">
            <div className="flex items-center gap-2 mb-3">
              <Globe2 size={18} className="text-cyan-300" />
              <h3 className="font-semibold text-slate-100">
                Targeted Sites / Visible Apps
              </h3>
            </div>

            {apps.length === 0 ? (
              <div className="rounded-2xl border border-border bg-slate-950/35 p-5 text-sm text-muted">
                No targeted app/site indicators were detected. Run Apify scan or add public URLs/usernames.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {apps.map((app) => (
                  <AppIconCard key={app.key} app={app} />
                ))}
              </div>
            )}
          </section>

          <section className="report-section">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Link2 size={18} className="text-cyan-300" />
                <h3 className="font-semibold text-slate-100">
                  Most Relevant High-Confidence Leads
                </h3>
              </div>
              <Badge tone="success">{leads.length} shown</Badge>
            </div>

            <div className="space-y-3">
              {leads.length === 0 && (
                <p className="text-sm text-muted rounded-2xl border border-border bg-slate-950/35 p-5">
                  No relevant lead passed the {MIN_RELEVANT_SCORE}% threshold. Increase Apify search results or provide stronger public URLs.
                </p>
              )}

              {leads.map((item, index) => (
                <LeadCard key={`${extractUrl(item) || extractTitle(item)}-${index}`} item={item} index={index} />
              ))}
            </div>
          </section>

          <section className="report-section grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-slate-950/35 p-5">
              <h3 className="font-semibold text-slate-100">Target Source Breakdown</h3>
              <div className="space-y-2 mt-4">
                {sourceBreakdown.slice(0, 10).map(([source, count]) => (
                  <div key={source} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2">
                    <span className="text-sm text-slate-300 break-all">{source}</span>
                    <Badge tone="accent">{count}</Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-slate-950/35 p-5">
              <h3 className="font-semibold text-slate-100">Apify Actors Used</h3>
              <div className="space-y-2 mt-4">
                {actorBreakdown.length === 0 && (
                  <p className="text-sm text-muted">No Apify actor metadata yet.</p>
                )}

                {actorBreakdown.map(([actor, count]) => (
                  <div key={actor} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                    <span className="text-sm text-emerald-200 break-all">{actor}</span>
                    <Badge tone="success">{count}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="report-section">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-100">Relevant Extracted Artifacts</h3>
              <Badge tone="warning">{artifacts.length} artifacts</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {artifacts.length === 0 && (
                <p className="text-sm text-muted md:col-span-2 xl:col-span-3">
                  No relevant artifacts found.
                </p>
              )}

              {artifacts.map((artifact, index) => (
                <div key={`${artifact.type}-${artifact.value}-${index}`} className="rounded-xl border border-border bg-slate-950/35 p-3">
                  <p className="text-[10px] text-muted uppercase tracking-[0.18em]">
                    {artifact.type}
                  </p>
                  <p className="text-sm text-slate-200 break-all mt-1">{artifact.value}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{artifact.origin}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="report-section grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-slate-950/35 p-5">
              <h3 className="font-semibold text-slate-100">Location Assessment</h3>
              <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                {data.location_assessment ||
                  "No strong location assessment is available. Treat any regional hints as public-source leads only."}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-slate-950/35 p-5">
              <h3 className="font-semibold text-slate-100">Behaviour / Content Assessment</h3>
              <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                {data.behaviour_summary ||
                  "Behavioural indicators depend on available public-source text, snippets, and timestamps."}
              </p>
              <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                {data.content_summary ||
                  "Content signals are derived from public search titles, snippets, and graph evidence."}
              </p>
            </div>
          </section>

          <section className="report-section rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5">
            <h3 className="font-semibold text-amber-200">Limitations</h3>
            <ul className="list-disc list-inside text-sm text-slate-300 space-y-1 mt-3">
              {(data.limitations || [
                "This report shows high-confidence public-source leads only.",
                "A matching username, public URL, or snippet does not prove account ownership.",
                "The Primary Suspect Lead is a ranked investigative lead, not a final identity conclusion.",
                "All targeted-site links must be manually opened, archived, and verified.",
                "Location indicators are regional hints, not real-time or exact geolocation.",
              ]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="report-section rounded-2xl border border-border bg-slate-950/35 p-5">
            <h3 className="font-semibold text-slate-100">Recommended Next Steps</h3>
            <ul className="list-disc list-inside text-sm text-slate-300 space-y-1 mt-3">
              {(data.recommended_next_steps || [
                "Open the Primary Suspect Lead and archive the public page.",
                "Verify all targeted-site links manually before making attribution claims.",
                "Compare profile username, bio, linked URLs, public snippets, and artifacts.",
                "Use additional lawful evidence sources before confirming identity.",
                "Regenerate this report after adding verified URLs or stronger identifiers.",
              ]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="report-section border-t border-border pt-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted">
              <div>
                <p className="uppercase tracking-[0.18em] text-slate-400">Prepared by</p>
                <p className="text-slate-200 mt-1">TraceNet AI Investigation Module</p>
              </div>
              <div>
                <p className="uppercase tracking-[0.18em] text-slate-400">Evidence basis</p>
                <p className="text-slate-200 mt-1">
                  Stored graph evidence, Apify metadata, and public-source snippets.
                </p>
              </div>
              <div>
                <p className="uppercase tracking-[0.18em] text-slate-400">Status</p>
                <p className="text-slate-200 mt-1">
                  {report.status === "signed" ? "Signed and locked" : "Draft / unsigned"}
                </p>
              </div>
            </div>

            <p className="text-[11px] text-muted text-center mt-6">
              {LETTERHEAD.classification} — Public-source investigative leads only.
            </p>
          </section>
        </div>
      </Card>
    </div>
  );
}