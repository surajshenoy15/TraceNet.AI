import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import api from "../../lib/api";
import { Card, Badge, Button } from "../../components/ui";

const TYPE_META = {
  seed: { label: "Seed", color: "#22d3ee" },
  username: { label: "Username", color: "#38bdf8" },
  email: { label: "Email", color: "#a78bfa" },
  phone: { label: "Phone", color: "#34d399" },
  ip: { label: "IP", color: "#fb7185" },
  upi: { label: "UPI", color: "#fbbf24" },
  url: { label: "URL", color: "#38bdf8" },
  keyword: { label: "Keyword", color: "#94a3b8" },

  apify_actor: { label: "Apify Actor", color: "#22c55e" },
  public_result: { label: "Public Result", color: "#818cf8" },

  profile: { label: "Public Profile", color: "#f472b6" },
  domain: { label: "Domain", color: "#f59e0b" },

  email_artifact: { label: "Email Artifact", color: "#c084fc" },
  phone_artifact: { label: "Phone Artifact", color: "#2dd4bf" },
  ip_artifact: { label: "IP Artifact", color: "#fb7185" },
  domain_artifact: { label: "Domain Artifact", color: "#f59e0b" },
  location: { label: "Location", color: "#4ade80" },
};

const POSITIVE_WORDS = new Set([
  "good",
  "great",
  "best",
  "success",
  "successful",
  "happy",
  "love",
  "liked",
  "win",
  "winner",
  "trusted",
  "safe",
  "verified",
  "excellent",
  "official",
  "support",
]);

const NEGATIVE_WORDS = new Set([
  "fraud",
  "fake",
  "scam",
  "hack",
  "hacked",
  "leak",
  "leaked",
  "breach",
  "stolen",
  "spam",
  "threat",
  "attack",
  "malware",
  "phishing",
  "risk",
  "suspicious",
  "blacklist",
  "exposed",
  "compromised",
  "refund",
  "crypto",
]);

function getTypeMeta(type) {
  return TYPE_META[type] || {
    label: type || "Other",
    color: "#64748b",
  };
}

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

function shortText(value = "", limit = 120) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.ceil(limit * 0.7))}…${text.slice(-Math.ceil(limit * 0.15))}`;
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

function textForNode(node) {
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

function titleForNode(node) {
  const data = node?.data || {};

  return (
    data.search_title ||
    data.title ||
    data.platform ||
    data.domain ||
    domainFromUrl(data.url || node?.label || "") ||
    node?.label ||
    "Evidence item"
  );
}

function sourceForNode(node) {
  const data = node?.data || {};

  return (
    data.platform ||
    data.source ||
    data.source_type ||
    data.apify_actor ||
    data.domain ||
    domainFromUrl(data.url || node?.label || "") ||
    getTypeMeta(node?.node_type).label
  );
}

function extractTimestamp(node) {
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

  for (const candidate of candidates) {
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
}

function extractHashtags(text) {
  return String(text || "").match(/#[a-zA-Z0-9_]{3,}/g) || [];
}

function sentimentFor(text) {
  const tokens = String(text || "")
    .toLowerCase()
    .replace(/[^\w#@.-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  let positive = 0;
  let negative = 0;

  tokens.forEach((token) => {
    if (POSITIVE_WORDS.has(token)) positive += 1;
    if (NEGATIVE_WORDS.has(token)) negative += 1;
  });

  if (positive > negative) return "positive";
  if (negative > positive) return "negative";
  return "neutral";
}

function sentimentTone(sentiment) {
  if (sentiment === "positive") return "success";
  if (sentiment === "negative") return "danger";
  return "muted";
}

function buildTimelineEvents(nodes) {
  return nodes
    .map((node) => {
      const timestamp = extractTimestamp(node);
      if (!timestamp) return null;

      const text = textForNode(node);
      const meta = getTypeMeta(node.node_type);

      return {
        id: node.id,
        timestamp,
        node,
        type: node.node_type,
        typeLabel: meta.label,
        color: meta.color,
        title: titleForNode(node),
        source: sourceForNode(node),
        text,
        sentiment: sentimentFor(text),
        hashtags: extractHashtags(text),
        score: scoreOf(node),
        isApify: isApifyNode(node),
        url: node?.data?.url,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

function buildUntimedEvidence(nodes) {
  return nodes
    .filter((node) => !extractTimestamp(node))
    .sort((a, b) => {
      const apifyDiff = Number(isApifyNode(b)) - Number(isApifyNode(a));
      if (apifyDiff !== 0) return apifyDiff;
      return scoreOf(b) - scoreOf(a);
    });
}

function groupEventsByDate(events) {
  return events.reduce((acc, event) => {
    const key = event.timestamp.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    if (!acc[key]) acc[key] = [];
    acc[key].push(event);

    return acc;
  }, {});
}

function TimelineEventCard({ event }) {
  return (
    <div className="relative mb-5">
      <span
        className="absolute -left-[22px] top-5 h-3.5 w-3.5 rounded-full ring-4 ring-slate-950"
        style={{ backgroundColor: event.color }}
      />

      <Card className="p-4 bg-slate-950/35 hover:bg-slate-900/60 transition">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge tone="accent">{event.typeLabel}</Badge>
              {event.isApify && <Badge tone="success">Apify</Badge>}
              <Badge tone={toneOf(event.score)}>{event.score}%</Badge>
              <Badge tone={sentimentTone(event.sentiment)}>{event.sentiment}</Badge>
            </div>

            <h3 className="text-sm font-semibold text-slate-100 break-words">
              {shortText(event.title, 110)}
            </h3>

            <p className="text-xs text-muted mt-1 break-words">
              Source: {shortText(event.source, 120)}
            </p>
          </div>

          <div className="text-xs text-muted lg:text-right shrink-0">
            <p>{event.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
            <p>{event.timestamp.toLocaleDateString()}</p>
          </div>
        </div>

        {event.text && (
          <p className="text-sm text-slate-300 mt-3 leading-relaxed">
            {shortText(event.text, 260)}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-3">
          {event.hashtags.slice(0, 8).map((tag) => (
            <span key={tag} className="text-[11px] text-violet-300">
              {tag}
            </span>
          ))}

          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:underline"
            >
              Open source <ExternalLink size={12} />
            </a>
          )}
        </div>
      </Card>
    </div>
  );
}

function UntimedEvidenceCard({ node }) {
  const meta = getTypeMeta(node.node_type);
  const score = scoreOf(node);
  const text = textForNode(node);

  return (
    <Card className="p-4 bg-slate-950/35">
      <div className="flex items-start gap-3">
        <span
          className="h-3 w-3 rounded-full mt-1.5 shrink-0"
          style={{ backgroundColor: meta.color }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Badge tone="accent">{meta.label}</Badge>
            {isApifyNode(node) && <Badge tone="success">Apify</Badge>}
            <Badge tone={toneOf(score)}>{score}%</Badge>
          </div>

          <p className="text-sm font-semibold text-slate-100 break-words">
            {shortText(node.label, 100)}
          </p>

          <p className="text-xs text-muted mt-1">
            {shortText(sourceForNode(node), 120)}
          </p>

          {text && (
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              {shortText(text, 180)}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function Timeline() {
  const { caseId } = useParams();

  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const loadTimeline = useCallback(async () => {
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
      setError("Unable to load timeline. Run analysis first or check backend.");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  const runApifyScan = async () => {
    setScanLoading(true);
    setMessage("Running Apify analysis and rebuilding timeline...");
    setError("");

    try {
      try {
        await api.post(`/cases/${caseId}/launch`);
      } catch {
        // Case may already be launched.
      }

      await api.post(`/cases/${caseId}/analyze`);
      await loadTimeline();

      setMessage("Timeline updated from latest Apify graph evidence.");
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : detail?.message ||
              "Apify scan failed. Check APIFY_TOKEN, actor IDs, and backend logs."
      );
      setMessage("");
    } finally {
      setScanLoading(false);
    }
  };

  const timelineEvents = useMemo(
    () => buildTimelineEvents(graph.nodes),
    [graph.nodes]
  );

  const untimedEvidence = useMemo(
    () => buildUntimedEvidence(graph.nodes),
    [graph.nodes]
  );

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();

    return timelineEvents.filter((event) => {
      if (filter === "apify" && !event.isApify) return false;
      if (filter === "high" && event.score < 75) return false;
      if (filter === "negative" && event.sentiment !== "negative") return false;
      if (filter === "positive" && event.sentiment !== "positive") return false;

      if (q) {
        const haystack = JSON.stringify(event).toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [timelineEvents, query, filter]);

  const filteredUntimed = useMemo(() => {
    const q = query.trim().toLowerCase();

    return untimedEvidence.filter((node) => {
      if (filter === "apify" && !isApifyNode(node)) return false;
      if (filter === "high" && scoreOf(node) < 75) return false;
      if (filter === "negative" && sentimentFor(textForNode(node)) !== "negative") return false;
      if (filter === "positive" && sentimentFor(textForNode(node)) !== "positive") return false;

      if (q) {
        const haystack = JSON.stringify(node).toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [untimedEvidence, query, filter]);

  const groupedEvents = useMemo(
    () => groupEventsByDate(filteredEvents),
    [filteredEvents]
  );

  const stats = useMemo(
    () => ({
      totalNodes: graph.nodes.length,
      timestamped: timelineEvents.length,
      untimed: untimedEvidence.length,
      apify: graph.nodes.filter(isApifyNode).length,
      high: graph.nodes.filter((node) => scoreOf(node) >= 75).length,
    }),
    [graph.nodes, timelineEvents.length, untimedEvidence.length]
  );

  if (loading) {
    return <p className="text-muted text-sm">Loading activity timeline…</p>;
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 bg-slate-950/40 border-cyan-400/20">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarClock size={18} className="text-cyan-300" />
              <h2 className="text-lg font-semibold text-slate-100">
                Activity Timeline
              </h2>
            </div>
            <p className="text-sm text-muted mt-1">
              Chronological public-source activity from Apify graph evidence. Untimed evidence is shown separately.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={runApifyScan} disabled={scanLoading}>
              {scanLoading ? "Scanning..." : "Run Apify Scan"}
            </Button>
            <Button onClick={loadTimeline} disabled={loading || scanLoading}>
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

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted">Total Evidence</p>
          <p className="text-2xl font-semibold text-slate-100 mt-1">
            {stats.totalNodes}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted">Timestamped</p>
          <p className="text-2xl font-semibold text-cyan-300 mt-1">
            {stats.timestamped}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted">Untimed</p>
          <p className="text-2xl font-semibold text-amber-300 mt-1">
            {stats.untimed}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted">Apify Nodes</p>
          <p className="text-2xl font-semibold text-emerald-300 mt-1">
            {stats.apify}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted">High Confidence</p>
          <p className="text-2xl font-semibold text-violet-300 mt-1">
            {stats.high}
          </p>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-cyan-300" />
            <h3 className="font-medium text-slate-100">Filter Timeline</h3>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              ["all", "All"],
              ["apify", "Apify"],
              ["high", "High Confidence"],
              ["positive", "Positive"],
              ["negative", "Negative"],
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

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search timeline, snippets, URLs, platforms..."
          className="mt-4 w-full rounded-xl border border-border bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400/50"
        />
      </Card>

      {graph.nodes.length === 0 ? (
        <Card className="p-10 text-center">
          <AlertTriangle className="mx-auto text-amber-300 mb-3" size={30} />
          <p className="text-slate-300 font-medium">No graph evidence found.</p>
          <p className="text-sm text-muted mt-1">
            Add seed input and run Apify scan to generate activity evidence.
          </p>
          <Button className="mt-5" onClick={runApifyScan} disabled={scanLoading}>
            {scanLoading ? "Scanning..." : "Run Apify Scan"}
          </Button>
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={16} className="text-cyan-300" />
              <h3 className="font-medium text-slate-100">
                Timestamped Activity
              </h3>
            </div>

            {filteredEvents.length === 0 ? (
              <div className="rounded-xl border border-border bg-slate-950/40 p-5">
                <p className="text-sm text-slate-300">
                  No timestamped activity matches this filter.
                </p>
                <p className="text-xs text-muted mt-2">
                  Many Apify search/scrape results do not include post timestamps. Check Untimed Evidence below.
                </p>
              </div>
            ) : (
              <div className="relative pl-7">
                <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />

                {Object.entries(groupedEvents).map(([date, events]) => (
                  <div key={date} className="mb-8">
                    <div className="sticky top-0 z-10 mb-4">
                      <span className="inline-flex rounded-full border border-cyan-400/25 bg-slate-950 px-3 py-1 text-xs text-cyan-200">
                        {date}
                      </span>
                    </div>

                    {events.map((event) => (
                      <TimelineEventCard key={event.id} event={event} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={16} className="text-emerald-300" />
              <h3 className="font-medium text-slate-100">
                Untimed Evidence
              </h3>
              <span className="text-xs text-muted">
                public-source items without parseable timestamp
              </span>
            </div>

            {filteredUntimed.length === 0 ? (
              <p className="text-sm text-muted">
                No untimed evidence matches this filter.
              </p>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {filteredUntimed.slice(0, 80).map((node) => (
                  <UntimedEvidenceCard key={node.id} node={node} />
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck size={18} className="text-emerald-300 mt-0.5" />
              <p className="text-xs text-muted leading-relaxed">
                Timeline entries are generated only when public-source evidence contains a parseable timestamp.
                Untimed Apify search results and scrape artifacts are preserved separately so investigators can still inspect them.
                These are investigative leads and must be manually verified.
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}