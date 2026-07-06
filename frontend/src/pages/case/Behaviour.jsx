import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Clock,
  Database,
  Fingerprint,
  Hash,
  RefreshCw,
  Search,
  ShieldCheck,
  Smile,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import api from "../../lib/api";
import { Card, Badge, Button } from "../../components/ui";

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "have", "has", "are", "was",
  "were", "you", "your", "our", "their", "they", "them", "his", "her", "she", "him",
  "not", "but", "all", "any", "can", "will", "about", "into", "than", "then", "also",
  "https", "http", "www", "com", "org", "net", "html", "profile", "login", "page",
  "public", "result", "search", "instagram", "linkedin", "github", "twitter", "telegram",
]);

const POSITIVE_WORDS = new Set([
  "good", "great", "best", "success", "successful", "happy", "love", "liked", "win",
  "winner", "trusted", "safe", "verified", "excellent", "positive", "support", "help",
  "secure", "official", "professional", "achievement", "award", "build", "created",
]);

const NEGATIVE_WORDS = new Set([
  "fraud", "fake", "scam", "abuse", "hack", "hacked", "leak", "leaked", "breach",
  "stolen", "spam", "threat", "attack", "malware", "phishing", "risk", "danger",
  "illegal", "suspicious", "blacklist", "exposed", "compromised", "refund", "crypto",
]);

const TYPE_LABELS = {
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

const TYPE_COLORS = {
  seed: "#22d3ee",
  username: "#38bdf8",
  email: "#a78bfa",
  phone: "#34d399",
  ip: "#fb7185",
  upi: "#fbbf24",
  url: "#38bdf8",
  keyword: "#94a3b8",
  apify_actor: "#22c55e",
  public_result: "#818cf8",
  profile: "#f472b6",
  domain: "#f59e0b",
  email_artifact: "#c084fc",
  phone_artifact: "#2dd4bf",
  ip_artifact: "#fb7185",
  domain_artifact: "#f59e0b",
  location: "#4ade80",
};

function scoreOf(item, fallback = 50) {
  const value = item?.data?.score ?? item?.data?.confidence ?? item?.confidence;
  if (typeof value !== "number") return fallback;
  return value <= 1 ? Math.round(value * 100) : Math.round(value);
}

function toneOf(score) {
  if (score >= 75) return "success";
  if (score >= 45) return "warning";
  return "danger";
}

function shortText(value = "", limit = 90) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.ceil(limit * 0.66))}…${text.slice(-Math.ceil(limit * 0.18))}`;
}

function isApifyNode(node) {
  return (
    node?.node_type === "apify_actor" ||
    node?.node_type === "public_result" ||
    Boolean(node?.data?.apify_actor) ||
    Boolean(node?.data?.apify_live)
  );
}

function nodeText(node) {
  const data = node?.data || {};

  return [
    node?.label,
    data.search_title,
    data.search_snippet,
    data.text,
    data.description,
    data.bio,
    data.about,
    data.platform,
    data.source,
    data.source_type,
    data.apify_query,
    data.domain,
    data.url,
  ]
    .filter(Boolean)
    .join(" ");
}

function extractDate(node) {
  const data = node?.data || {};

  const candidates = [
    data.timestamp,
    data.posted_at,
    data.created_at,
    data.updated_at,
    data.published_at,
    data.scraped_at,
    data.crawled_at,
    data.date,
    data.time,
    data.datetime,
  ].filter(Boolean);

  for (const item of candidates) {
    const date = new Date(item);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
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

function extractHashtags(text) {
  const matches = String(text || "").match(/#[a-zA-Z0-9_]{3,}/g) || [];
  return matches.map((x) => x.toLowerCase());
}

function countTerms(items) {
  const map = new Map();

  items.forEach((term) => {
    map.set(term, (map.get(term) || 0) + 1);
  });

  return Array.from(map.entries())
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}

function buildHourHistogram(nodes) {
  const hist = Array.from({ length: 24 }, () => 0);

  nodes.forEach((node) => {
    const date = extractDate(node);
    if (!date) return;
    hist[date.getHours()] += 1;
  });

  return hist;
}

function buildDayHistogram(nodes) {
  const hist = Array.from({ length: 7 }, () => 0);

  nodes.forEach((node) => {
    const date = extractDate(node);
    if (!date) return;
    hist[date.getDay()] += 1;
  });

  return hist;
}

function peakWindow(hourHistogram) {
  let max = 0;
  let peak = 0;

  hourHistogram.forEach((count, hour) => {
    if (count > max) {
      max = count;
      peak = hour;
    }
  });

  if (max === 0) return "No timestamped activity";

  const end = (peak + 2) % 24;
  return `${String(peak).padStart(2, "0")}:00–${String(end).padStart(2, "0")}:00`;
}

function patternLabel(hourHistogram) {
  const total = hourHistogram.reduce((a, b) => a + b, 0);
  if (!total) return "No timestamp pattern";

  const night = hourHistogram.slice(21).reduce((a, b) => a + b, 0) + hourHistogram.slice(0, 5).reduce((a, b) => a + b, 0);
  const workday = hourHistogram.slice(9, 18).reduce((a, b) => a + b, 0);
  const evening = hourHistogram.slice(18, 23).reduce((a, b) => a + b, 0);

  if (night / total >= 0.45) return "Night-heavy activity";
  if (workday / total >= 0.45) return "Work-hour activity";
  if (evening / total >= 0.4) return "Evening activity";
  return "Mixed activity";
}

function sentimentFromTerms(tokens) {
  let positive = 0;
  let negative = 0;

  tokens.forEach((token) => {
    if (POSITIVE_WORDS.has(token)) positive += 1;
    if (NEGATIVE_WORDS.has(token)) negative += 1;
  });

  let label = "neutral";
  if (positive > negative) label = "positive";
  if (negative > positive) label = "negative";

  return { label, positive_hits: positive, negative_hits: negative };
}

function behaviourSummary(nodes, edges) {
  const texts = nodes.map(nodeText).filter(Boolean);
  const tokens = texts.flatMap(tokenize);
  const hashtags = texts.flatMap(extractHashtags);

  const timestampedNodes = nodes.filter((node) => extractDate(node));
  const hourHistogram = buildHourHistogram(timestampedNodes);
  const dayHistogram = buildDayHistogram(timestampedNodes);

  const sourceCounts = Object.entries(
    nodes.reduce((acc, node) => {
      const type = node.node_type || "other";
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([type, count]) => ({
      type,
      label: TYPE_LABELS[type] || type,
      count,
      color: TYPE_COLORS[type] || "#64748b",
    }))
    .sort((a, b) => b.count - a.count);

  const actorCounts = Object.entries(
    nodes.reduce((acc, node) => {
      const actor = node?.data?.apify_actor;
      if (!actor) return acc;
      acc[actor] = (acc[actor] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count);

  const highConfidence = nodes.filter((node) => scoreOf(node) >= 75).length;
  const apifyNodes = nodes.filter(isApifyNode).length;

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    apifyNodes,
    highConfidence,
    timestampedCount: timestampedNodes.length,
    textEvidenceCount: texts.length,
    patternLabel: patternLabel(hourHistogram),
    activeWindow: peakWindow(hourHistogram),
    hourHistogram,
    dayHistogram,
    dayLabels: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    topKeywords: countTerms(tokens).slice(0, 16),
    topHashtags: countTerms(hashtags).slice(0, 16),
    sentiment: sentimentFromTerms(tokens),
    sourceCounts,
    actorCounts,
    tokens,
  };
}

function HourChart({ hist }) {
  const max = Math.max(...hist, 1);

  return (
    <div className="flex items-end gap-1 h-36">
      {hist.map((value, hour) => (
        <div key={hour} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-gradient-to-t from-cyan-700 to-cyan-300"
            style={{
              height: `${(value / max) * 100}%`,
              minHeight: value ? 5 : 0,
              opacity: value ? 1 : 0.16,
            }}
            title={`${hour}:00 — ${value} timestamped items`}
          />
          {hour % 3 === 0 && <span className="text-[9px] text-muted">{hour}</span>}
        </div>
      ))}
    </div>
  );
}

function DayChart({ hist, labels }) {
  const max = Math.max(...hist, 1);

  return (
    <div className="flex items-end gap-2 h-28">
      {hist.map((value, index) => (
        <div key={index} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-violet-500/70"
            style={{
              height: `${(value / max) * 100}%`,
              minHeight: value ? 5 : 0,
              opacity: value ? 1 : 0.16,
            }}
            title={`${labels[index]} — ${value} timestamped items`}
          />
          <span className="text-[10px] text-muted">{labels[index]}</span>
        </div>
      ))}
    </div>
  );
}

function HorizontalBars({ data, labelKey = "label", valueKey = "count" }) {
  const max = Math.max(...data.map((x) => x[valueKey]), 1);

  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item[labelKey]}>
          <div className="flex items-center justify-between gap-3 text-xs mb-1">
            <span className="text-slate-300 truncate">{item[labelKey]}</span>
            <span className="text-muted">{item[valueKey]}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-cyan-400"
              style={{ width: `${(item[valueKey] / max) * 100}%` }}
            />
          </div>
        </div>
      ))}

      {data.length === 0 && (
        <p className="text-sm text-muted">No data available for this section.</p>
      )}
    </div>
  );
}

function EvidenceRow({ node }) {
  const text = nodeText(node);
  const score = scoreOf(node);
  const isApify = isApifyNode(node);

  return (
    <div className="rounded-xl border border-border bg-slate-950/35 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: TYPE_COLORS[node.node_type] || "#64748b" }}
            />
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted">
              {TYPE_LABELS[node.node_type] || node.node_type}
            </span>
            {isApify && <Badge tone="success">Apify</Badge>}
          </div>
          <p className="text-sm font-medium text-slate-100 break-words">
            {shortText(node.label, 95)}
          </p>
          {text && (
            <p className="text-xs text-muted mt-1 leading-relaxed">
              {shortText(text, 160)}
            </p>
          )}
        </div>

        <Badge tone={toneOf(score)}>{score}%</Badge>
      </div>
    </div>
  );
}

export default function Behaviour() {
  const { caseId } = useParams();

  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const loadBehaviour = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get(`/cases/${caseId}/graph`);
      setGraph({
        nodes: response.data?.nodes || [],
        edges: response.data?.edges || [],
      });
    } catch {
      setGraph({ nodes: [], edges: [] });
      setError("Unable to load behaviour intelligence. Run analysis first or check backend.");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadBehaviour();
  }, [loadBehaviour]);

  const runApifyScan = async () => {
    setScanLoading(true);
    setError("");
    setMessage("Running Apify analysis and rebuilding behaviour signals...");

    try {
      try {
        await api.post(`/cases/${caseId}/launch`);
      } catch {
        // Case may already be launched.
      }

      await api.post(`/cases/${caseId}/analyze`);
      await loadBehaviour();

      setMessage("Behaviour signals updated from latest Apify graph evidence.");
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : detail?.message || "Apify scan failed. Check APIFY_TOKEN, actor IDs, and backend logs."
      );
      setMessage("");
    } finally {
      setScanLoading(false);
    }
  };

  const summary = useMemo(
    () => behaviourSummary(graph.nodes, graph.edges),
    [graph.nodes, graph.edges]
  );

  const filteredEvidence = useMemo(() => {
    let nodes = graph.nodes;

    if (filter === "apify") nodes = nodes.filter(isApifyNode);
    if (filter === "text") nodes = nodes.filter((node) => nodeText(node).length > 20);
    if (filter === "timestamped") nodes = nodes.filter((node) => extractDate(node));
    if (filter === "high") nodes = nodes.filter((node) => scoreOf(node) >= 75);

    return nodes
      .sort((a, b) => scoreOf(b) - scoreOf(a))
      .slice(0, 40);
  }, [graph.nodes, filter]);

  const sentimentTone =
    summary.sentiment.label === "negative"
      ? "danger"
      : summary.sentiment.label === "positive"
        ? "success"
        : "muted";

  if (loading) {
    return <p className="text-muted text-sm">Loading behaviour analysis…</p>;
  }

  if (graph.nodes.length === 0) {
    return (
      <Card className="p-10 text-center">
        <AlertTriangle className="mx-auto text-amber-300 mb-3" size={30} />
        <p className="text-slate-300 font-medium">No behaviour evidence found.</p>
        <p className="text-sm text-muted mt-1">
          Add seed input and run Apify scan to generate public-source evidence.
        </p>
        <Button className="mt-5" onClick={runApifyScan} disabled={scanLoading}>
          {scanLoading ? "Scanning..." : "Run Apify Scan"}
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 bg-slate-950/40 border-cyan-400/20">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-cyan-300" />
              <h2 className="text-lg font-semibold text-slate-100">
                Behaviour Intelligence
              </h2>
            </div>
            <p className="text-sm text-muted mt-1">
              Deterministic behavioural summary from Apify graph evidence, snippets, public results, timestamps, and artifacts.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={runApifyScan} disabled={scanLoading}>
              {scanLoading ? "Scanning..." : "Run Apify Scan"}
            </Button>
            <Button onClick={loadBehaviour} disabled={loading || scanLoading}>
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted text-sm mb-2">
            <Clock size={15} />
            Activity Pattern
          </div>
          <p className="text-2xl font-bold text-cyan-300">{summary.patternLabel}</p>
          <p className="text-sm text-muted mt-1">
            Peak window: {summary.activeWindow}
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted text-sm mb-2">
            <Smile size={15} />
            Content Sentiment
          </div>
          <Badge tone={sentimentTone}>{summary.sentiment.label}</Badge>
          <p className="text-sm text-muted mt-2">
            {summary.sentiment.positive_hits} positive / {summary.sentiment.negative_hits} negative lexicon hits
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted text-sm mb-2">
            <Sparkles size={15} />
            Apify Evidence
          </div>
          <p className="text-2xl font-bold text-emerald-300">{summary.apifyNodes}</p>
          <p className="text-sm text-muted mt-1">
            Public actor/search/scrape evidence nodes
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted text-sm mb-2">
            <Fingerprint size={15} />
            Evidence Strength
          </div>
          <p className="text-2xl font-bold text-violet-300">{summary.highConfidence}</p>
          <p className="text-sm text-muted mt-1">
            High-confidence nodes out of {summary.totalNodes}
          </p>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-cyan-400" />
          <h2 className="font-medium">Activity by Hour</h2>
        </div>

        {summary.timestampedCount === 0 ? (
          <div className="rounded-xl border border-border bg-slate-950/40 p-5">
            <p className="text-sm text-slate-300">
              No timestamped public activity was returned by the current Apify results.
            </p>
            <p className="text-xs text-muted mt-2">
              The rest of this page still analyzes text, snippets, source types, confidence, and extracted artifacts.
            </p>
          </div>
        ) : (
          <>
            <HourChart hist={summary.hourHistogram} />
            <p className="text-xs text-muted mt-3">
              Counts are based only on graph nodes that include a parseable timestamp. This is a behavioural lead, not proof of identity.
            </p>
          </>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} className="text-violet-300" />
            <h2 className="font-medium">Activity by Day</h2>
          </div>

          {summary.timestampedCount === 0 ? (
            <p className="text-sm text-muted">No timestamped day-of-week data available.</p>
          ) : (
            <DayChart hist={summary.dayHistogram} labels={summary.dayLabels} />
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Database size={16} className="text-cyan-400" />
            <h2 className="font-medium">Evidence Source Mix</h2>
          </div>
          <HorizontalBars data={summary.sourceCounts.slice(0, 10)} />
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Hash size={16} className="text-cyan-400" />
            <h2 className="font-medium">Top Keywords</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {summary.topKeywords.map((item) => (
              <Badge key={item.term} tone="accent">
                {item.term} · {item.count}
              </Badge>
            ))}

            {summary.topKeywords.length === 0 && (
              <span className="text-xs text-muted">No useful keywords found in graph evidence.</span>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Hash size={16} className="text-violet-300" />
            <h2 className="font-medium">Hashtags</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {summary.topHashtags.map((item) => (
              <Badge key={item.term} tone="purple">
                {item.term} · {item.count}
              </Badge>
            ))}

            {summary.topHashtags.length === 0 && (
              <span className="text-xs text-muted">No hashtags found in graph evidence.</span>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-cyan-400" />
            <h2 className="font-medium">Behaviour Evidence Items</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              ["all", "All"],
              ["apify", "Apify"],
              ["text", "Text"],
              ["timestamped", "Timestamped"],
              ["high", "High Confidence"],
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

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {filteredEvidence.map((node) => (
            <EvidenceRow key={node.id} node={node} />
          ))}

          {filteredEvidence.length === 0 && (
            <p className="text-sm text-muted">No evidence items match this filter.</p>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} className="text-emerald-300 mt-0.5" />
          <p className="text-xs text-muted leading-relaxed">
            Behaviour metrics are computed deterministically from available public-source graph evidence.
            If Apify results do not include timestamps, the activity charts stay empty, but keyword,
            sentiment, source mix, confidence, and evidence summaries still work. These are investigative
            leads and require manual verification.
          </p>
        </div>
      </Card>
    </div>
  );
}