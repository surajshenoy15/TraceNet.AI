import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRightCircle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Fingerprint,
  Globe2,
  Link2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  User,
  XCircle,
} from "lucide-react";
import api from "../../lib/api";
import { Card, Badge, Button } from "../../components/ui";

const MIN_RELEVANT_SCORE = 60;

const PLATFORM_RULES = [
  { label: "Instagram", patterns: ["instagram.com", "instagram"] },
  { label: "LinkedIn", patterns: ["linkedin.com", "linkedin"] },
  { label: "GitHub", patterns: ["github.com", "github"] },
  { label: "X / Twitter", patterns: ["twitter.com", "x.com", "twitter"] },
  { label: "Telegram", patterns: ["t.me", "telegram"] },
  { label: "Facebook", patterns: ["facebook.com", "facebook", "fb.com"] },
  { label: "Reddit", patterns: ["reddit.com", "reddit"] },
  { label: "YouTube", patterns: ["youtube.com", "youtu.be", "youtube"] },
  { label: "TikTok", patterns: ["tiktok.com", "tiktok"] },
  { label: "Google Search", patterns: ["google-search", "google search", "apify/google"] },
];

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "have", "has", "are",
  "was", "were", "you", "your", "our", "their", "they", "them", "https",
  "http", "www", "com", "org", "net", "public", "profile", "search",
  "result", "page", "html", "instagram", "linkedin", "github", "twitter",
]);

const POSITIVE_WORDS = new Set([
  "good", "great", "best", "success", "successful", "happy", "love", "trusted",
  "verified", "excellent", "official", "support", "achievement", "award",
]);

const NEGATIVE_WORDS = new Set([
  "fraud", "fake", "scam", "hack", "hacked", "leak", "leaked", "breach",
  "stolen", "spam", "threat", "attack", "malware", "phishing", "risk",
  "suspicious", "exposed", "compromised",
]);

function scoreOf(item, fallback = 50) {
  const value =
    item?.data?.score ??
    item?.data?.confidence ??
    item?.confidence ??
    item?.score;

  if (typeof value !== "number") return fallback;
  return value <= 1 ? Math.round(value * 100) : Math.round(value);
}

function verdictTone(score) {
  if (score >= 85) return "danger";
  if (score >= 65) return "warning";
  if (score >= 40) return "accent";
  return "muted";
}

function scoreTone(score) {
  if (score >= 75) return "success";
  if (score >= 45) return "warning";
  return "danger";
}

function shortText(value = "", max = 130) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function domainFromUrl(value = "") {
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function extractUrl(item) {
  return item?.url || item?.data?.url || "";
}

function itemText(item) {
  const data = item?.data || item || {};

  return [
    item?.label,
    item?.platform,
    item?.handle,
    item?.url,
    item?.source_type,
    data.platform,
    data.source,
    data.source_type,
    data.apify_actor,
    data.apify_query,
    data.domain,
    data.url,
    data.search_title,
    data.search_snippet,
    data.description,
    data.text,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function detectPlatform(item) {
  const text = itemText(item);

  const match = PLATFORM_RULES.find((platform) =>
    platform.patterns.some((pattern) => text.includes(pattern))
  );

  return (
    match?.label ||
    item?.platform ||
    item?.data?.platform ||
    item?.data?.source ||
    item?.data?.source_type ||
    domainFromUrl(extractUrl(item)) ||
    "Public Source"
  );
}

function titleFor(item) {
  return (
    item?.search_title ||
    item?.data?.search_title ||
    item?.handle ||
    item?.label ||
    item?.value ||
    "Public evidence"
  );
}

function snippetFor(item) {
  return (
    item?.search_snippet ||
    item?.data?.search_snippet ||
    item?.data?.description ||
    item?.data?.text ||
    ""
  );
}

function isApifyNode(node) {
  return (
    node?.node_type === "apify_actor" ||
    node?.node_type === "public_result" ||
    Boolean(node?.data?.apify_actor) ||
    Boolean(node?.data?.apify_live)
  );
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\w#@.-]+/g, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 3)
    .filter((x) => !STOPWORDS.has(x))
    .filter((x) => !/^\d+$/.test(x));
}

function countTerms(tokens) {
  const map = new Map();

  tokens.forEach((token) => {
    map.set(token, (map.get(token) || 0) + 1);
  });

  return Array.from(map.entries())
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}

function sentimentFromTokens(tokens) {
  let positive = 0;
  let negative = 0;

  tokens.forEach((token) => {
    if (POSITIVE_WORDS.has(token)) positive += 1;
    if (NEGATIVE_WORDS.has(token)) negative += 1;
  });

  if (positive > negative) return { label: "positive", positive, negative };
  if (negative > positive) return { label: "negative", positive, negative };
  return { label: "neutral", positive, negative };
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
      platform: detectPlatform(node),
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

  const unique = new Map();

  [...reportItems, ...graphItems].forEach((item) => {
    const key =
      extractUrl(item) ||
      `${detectPlatform(item)}:${titleFor(item)}`.toLowerCase();

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

function buildArtifacts(graphNodes = []) {
  return graphNodes
    .filter((n) =>
      ["email", "phone", "ip", "email_artifact", "phone_artifact", "ip_artifact", "domain_artifact", "location"].includes(
        n.node_type
      )
    )
    .map((n) => ({
      type: n.node_type,
      value:
        n.data?.email_pattern ||
        n.data?.phone_pattern ||
        n.data?.ip_address ||
        n.data?.domain ||
        n.label,
      score: scoreOf(n),
      origin: n.data?.source_type || n.data?.apify_actor || "graph evidence",
    }))
    .filter((a) => a.value);
}

function buildConclusion({ conclusionData, report, graph }) {
  if (conclusionData?.available) return conclusionData;

  const reportJson = report?.report_json || {};
  const leads = buildRelevantLeads(reportJson.identity_cluster || [], graph.nodes);
  const primary = leads[0] || null;
  const artifacts = buildArtifacts(graph.nodes);
  const emails = artifacts.filter((a) => a.type.includes("email")).map((a) => a.value);
  const phones = artifacts.filter((a) => a.type.includes("phone")).map((a) => a.value);

  const platforms = Array.from(new Set(leads.map(detectPlatform))).filter(Boolean);
  const apifyEvidence = graph.nodes.filter(isApifyNode).length;
  const highScoreLeads = leads.filter((lead) => scoreOf(lead) >= 75).length;

  const allText = graph.nodes.map(itemText).join(" ");
  const tokens = tokenize(allText);
  const topKeywords = countTerms(tokens).slice(0, 10).map((x) => x.term);
  const sentiment = sentimentFromTokens(tokens);

  const factors = [
    {
      factor: "High-confidence public profile/result",
      satisfied: Boolean(primary && scoreOf(primary) >= 75),
      weight: 25,
      evidence: primary
        ? `${titleFor(primary)} scored ${scoreOf(primary)}%`
        : "No public profile/result reached high-confidence threshold.",
    },
    {
      factor: "Multiple targeted sites/platforms visible",
      satisfied: platforms.length >= 2,
      weight: 20,
      evidence: platforms.length
        ? `Visible platforms: ${platforms.join(", ")}`
        : "No platform indicators detected.",
    },
    {
      factor: "Apify-backed provenance",
      satisfied: apifyEvidence > 0,
      weight: 20,
      evidence: apifyEvidence
        ? `${apifyEvidence} Apify-backed evidence node(s) found.`
        : "No Apify-backed metadata found.",
    },
    {
      factor: "Identifier/artifact corroboration",
      satisfied: artifacts.length > 0,
      weight: 15,
      evidence: artifacts.length
        ? `${artifacts.length} identifier/artifact signal(s) found.`
        : "No email, phone, IP, domain, or location artifacts found.",
    },
    {
      factor: "Cross-source graph correlation",
      satisfied: graph.edges.length >= 3,
      weight: 10,
      evidence: `${graph.edges.length} explainable graph relationship(s) available.`,
    },
    {
      factor: "Content/profile text available",
      satisfied: tokens.length >= 15,
      weight: 10,
      evidence: tokens.length >= 15
        ? `${tokens.length} analysable text token(s) found.`
        : "Insufficient public text for content comparison.",
    },
  ];

  const score = factors.reduce((sum, factor) => {
    return sum + (factor.satisfied ? factor.weight : 0);
  }, 0);

  let label = "Insufficient public-source correlation";
  if (score >= 85) label = "Strong suspect lead correlation";
  else if (score >= 65) label = "Moderate suspect lead correlation";
  else if (score >= 40) label = "Weak suspect lead correlation";

  const gaps = factors
    .filter((factor) => !factor.satisfied)
    .map((factor) => factor.factor);

  return {
    available: Boolean(graph.nodes.length || report),
    note: "No graph/report evidence is available yet.",
    primary_identity: {
      alias: primary ? titleFor(primary) : "No primary lead",
      likely_name: primary?.likely_name || primary?.data?.likely_name || "",
      accounts: leads.map((lead) => ({
        handle: titleFor(lead),
        platform: detectPlatform(lead),
        url: extractUrl(lead),
        score: scoreOf(lead),
      })),
      emails: Array.from(new Set(emails)).slice(0, 8),
      phones: Array.from(new Set(phones)).slice(0, 8),
    },
    verdict: {
      score,
      label,
    },
    factor_breakdown: factors,
    content_profile: {
      nature: platforms.length ? `Public footprint across ${platforms.length} site(s)` : "Limited public footprint",
      sentiment: sentiment.label,
      top_keywords: topKeywords,
    },
    gaps,
    recommended_action:
      score >= 75
        ? "Treat the primary match as a high-priority investigative lead. Open and archive the targeted site, verify profile ownership manually, and corroborate with additional lawful evidence before attribution."
        : score >= 50
          ? "Continue enrichment. Add stronger public URLs/usernames and regenerate the graph/report before making any attribution decision."
          : "Evidence is currently insufficient. Add verified identifiers, public URLs, or stronger seed data and rerun analysis.",
    limitations: [
      "This conclusion is a public-source correlation hypothesis, not a confirmed identity claim.",
      "A matching username, profile URL, or public search result does not prove ownership.",
      "All targeted-site links must be manually verified and archived.",
      "Location and behaviour signals are supporting leads only.",
      "No private account enumeration, login checks, OTP checks, or real-time tracking are used.",
    ],
  };
}

function ConfidenceRing({ value = 0, label = "score", size = 120 }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(Math.max(value, 0), 100) / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={radius}
          stroke="rgba(148,163,184,.18)"
          strokeWidth="10"
          fill="none"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          stroke="rgb(34,211,238)"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-2xl font-bold text-cyan-300">{value}%</p>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted">{label}</p>
        </div>
      </div>
    </div>
  );
}

function AccountCard({ account }) {
  return (
    <a
      href={account.url || "#"}
      target={account.url ? "_blank" : undefined}
      rel="noreferrer"
      className="rounded-2xl border border-border bg-slate-950/35 p-4 hover:bg-slate-900/70 transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Globe2 size={15} className="text-cyan-300" />
            <span className="text-xs text-muted">{account.platform}</span>
          </div>
          <p className="text-sm font-semibold text-slate-100 break-words">
            {shortText(account.handle, 90)}
          </p>
          {account.url && (
            <p className="text-xs text-cyan-300 break-all mt-2">
              {shortText(account.url, 120)}
            </p>
          )}
        </div>
        <Badge tone={scoreTone(account.score)}>{account.score}%</Badge>
      </div>
    </a>
  );
}

export default function Conclusion() {
  const { caseId } = useParams();

  const [conclusionData, setConclusionData] = useState(null);
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadConclusion = useCallback(async () => {
    setLoading(true);
    setError("");

    const [conclusionRes, graphRes, reportRes] = await Promise.allSettled([
      api.get(`/cases/${caseId}/conclusion`),
      api.get(`/cases/${caseId}/graph`),
      api.get(`/cases/${caseId}/report`),
    ]);

    if (conclusionRes.status === "fulfilled") {
      setConclusionData(conclusionRes.value.data);
    } else {
      setConclusionData(null);
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
    loadConclusion();
  }, [loadConclusion]);

  const runAnalysis = async () => {
    setScanLoading(true);
    setError("");
    setMessage("Running analysis and rebuilding conclusion...");

    try {
      try {
        await api.post(`/cases/${caseId}/launch`);
      } catch {
        // already launched
      }

      await api.post(`/cases/${caseId}/analyze`);

      try {
        await api.post(`/cases/${caseId}/report/generate`);
      } catch {
        // conclusion can still be derived from graph
      }

      await loadConclusion();
      setMessage("Conclusion updated from latest graph/report evidence.");
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

  const data = useMemo(
    () => buildConclusion({ conclusionData, report, graph }),
    [conclusionData, report, graph]
  );

  if (loading) {
    return <p className="text-muted text-sm">Loading conclusion…</p>;
  }

  if (!data.available) {
    return (
      <Card className="p-10 text-center">
        <AlertTriangle className="mx-auto text-amber-300 mb-3" size={30} />
        <p className="text-slate-300 font-medium">No conclusion available yet.</p>
        <p className="text-sm text-muted mt-1">
          Add seed input, run Apify analysis, and generate a report first.
        </p>
        <Button className="mt-5" onClick={runAnalysis} disabled={scanLoading}>
          {scanLoading ? "Running..." : "Run Analysis"}
        </Button>
      </Card>
    );
  }

  const {
    primary_identity: pid,
    verdict,
    factor_breakdown,
    content_profile,
    gaps,
    recommended_action,
    limitations,
  } = data;

  const primaryAccount = pid.accounts?.[0];

  return (
    <div className="space-y-5">
      <Card className="p-5 bg-slate-950/40 border-cyan-400/20">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Target size={18} className="text-cyan-300" />
              <h2 className="text-lg font-semibold text-slate-100">
                Final SOCMINT Conclusion
              </h2>
            </div>
            <p className="text-sm text-muted mt-1">
              Ranked suspect-lead hypothesis from graph evidence, report evidence, public results, and extracted artifacts.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={runAnalysis} disabled={scanLoading}>
              {scanLoading ? "Running..." : "Run Analysis"}
            </Button>
            <Button onClick={loadConclusion} disabled={loading || scanLoading}>
              <RefreshCw size={15} className="mr-2" />
              Refresh
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

      <Card className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          <ConfidenceRing value={verdict.score} label="correlation" size={128} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-muted text-sm mb-1">
              <Target size={15} />
              SOCMINT Verdict
            </div>

            <h2 className="text-2xl font-bold text-slate-100">
              {verdict.label}
            </h2>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <User size={16} className="text-cyan-400" />
              <span className="text-sm text-muted">Primary identity hypothesis:</span>
              <Badge tone={verdictTone(verdict.score)}>{pid.alias}</Badge>
              {pid.likely_name && <Badge tone="purple">{pid.likely_name}</Badge>}
            </div>

            {primaryAccount?.url && (
              <a
                href={primaryAccount.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-cyan-300 hover:underline break-all mt-4"
              >
                Open primary targeted site <ExternalLink size={14} />
              </a>
            )}

            <p className="text-xs text-amber-300 mt-4">
              This is an investigative correlation lead, not a confirmed identity claim.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="font-medium text-slate-100">
            Correlated Public Accounts / Targeted Sites ({pid.accounts.length})
          </h3>
          <Badge tone="accent">Score ≥ {MIN_RELEVANT_SCORE}%</Badge>
        </div>

        {pid.accounts.length === 0 ? (
          <p className="text-sm text-muted">
            No high-confidence public accounts found yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {pid.accounts.map((account, index) => (
              <AccountCard key={`${account.url}-${index}`} account={account} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-5">
          <div className="rounded-2xl border border-border bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-muted mb-2">
              Email artifacts
            </p>
            {pid.emails?.length ? (
              <div className="flex flex-wrap gap-2">
                {pid.emails.map((email) => (
                  <Badge key={email} tone="accent">{email}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No email artifacts found.</p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-muted mb-2">
              Phone artifacts
            </p>
            {pid.phones?.length ? (
              <div className="flex flex-wrap gap-2">
                {pid.phones.map((phone) => (
                  <Badge key={phone} tone="warning">{phone}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No phone artifacts found.</p>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck size={17} className="text-cyan-300" />
          <h3 className="font-medium text-slate-100">SOCMINT Factor Checklist</h3>
        </div>

        <div className="space-y-2">
          {factor_breakdown.map((factor) => (
            <div
              key={factor.factor}
              className="flex items-start gap-3 bg-slate-900/40 border border-border rounded-xl px-4 py-3"
            >
              {factor.satisfied ? (
                <CheckCircle2 size={18} className="text-emerald-400 mt-0.5 shrink-0" />
              ) : (
                <XCircle size={18} className="text-slate-600 mt-0.5 shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-sm font-medium ${factor.satisfied ? "text-slate-200" : "text-muted"}`}>
                    {factor.factor}
                  </span>
                  {factor.satisfied ? (
                    <Badge tone="success">+{factor.weight}</Badge>
                  ) : (
                    <Badge tone="muted">0</Badge>
                  )}
                </div>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  {factor.evidence}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={16} className="text-cyan-300" />
            <h3 className="font-medium text-slate-100">Content Profile</h3>
          </div>

          <p className="text-sm text-slate-300">
            Nature: <Badge tone="warning">{content_profile.nature}</Badge>
          </p>

          <p className="text-sm text-slate-300 mt-3">
            Sentiment:{" "}
            <Badge
              tone={
                content_profile.sentiment === "negative"
                  ? "danger"
                  : content_profile.sentiment === "positive"
                    ? "success"
                    : "muted"
              }
            >
              {content_profile.sentiment}
            </Badge>
          </p>

          <div className="flex flex-wrap gap-2 mt-4">
            {content_profile.top_keywords.map((keyword) => (
              <Badge key={keyword} tone="accent">{keyword}</Badge>
            ))}

            {content_profile.top_keywords.length === 0 && (
              <span className="text-xs text-muted">No strong keywords extracted.</span>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-400" />
            <h3 className="font-medium text-slate-100">Gaps to Resolve</h3>
          </div>

          {gaps.length === 0 ? (
            <p className="text-sm text-emerald-300">
              All key SOCMINT factors are satisfied.
            </p>
          ) : (
            <ul className="space-y-2">
              {gaps.map((gap) => (
                <li key={gap} className="text-sm text-muted flex items-center gap-2">
                  <XCircle size={13} className="text-slate-600 shrink-0" />
                  {gap}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-6 border-cyan-500/30">
        <div className="flex items-center gap-2 mb-2">
          <ArrowRightCircle size={18} className="text-cyan-400" />
          <h3 className="font-medium text-slate-100">Recommended Action</h3>
        </div>
        <p className="text-sm text-slate-200 leading-relaxed">
          {recommended_action}
        </p>
      </Card>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <Fingerprint size={18} className="text-emerald-300 mt-0.5" />
          <div>
            <p className="text-xs text-muted font-medium mb-2">Limitations</p>
            <ul className="text-xs text-muted space-y-1 leading-relaxed">
              {limitations.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}