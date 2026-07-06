import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Fingerprint,
  Globe2,
  Link2,
  Mail,
  Network,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import api from "../../lib/api";
import { Badge, Button, Card } from "../../components/ui";

const TYPE_META = {
  seed: { label: "Seed", color: "#22d3ee", icon: Fingerprint },
  username: { label: "Username", color: "#38bdf8", icon: UserRound },
  email: { label: "Email", color: "#a78bfa", icon: Mail },
  phone: { label: "Phone", color: "#34d399", icon: Phone },
  ip: { label: "IP", color: "#fb7185", icon: Globe2 },
  upi: { label: "UPI", color: "#fbbf24", icon: Fingerprint },
  url: { label: "URL", color: "#38bdf8", icon: ExternalLink },
  keyword: { label: "Keyword", color: "#94a3b8", icon: Search },

  apify_actor: { label: "Apify Actor", color: "#22c55e", icon: Sparkles },
  public_result: { label: "Public Result", color: "#818cf8", icon: Globe2 },

  profile: { label: "Public Profile", color: "#f472b6", icon: UserRound },
  domain: { label: "Domain", color: "#f59e0b", icon: Globe2 },

  email_artifact: { label: "Email Artifact", color: "#c084fc", icon: Mail },
  phone_artifact: { label: "Phone Artifact", color: "#2dd4bf", icon: Phone },
  ip_artifact: { label: "IP Artifact", color: "#fb7185", icon: Globe2 },
  domain_artifact: { label: "Domain Artifact", color: "#f59e0b", icon: Globe2 },
  location: { label: "Location", color: "#4ade80", icon: Globe2 },
};

const IDENTIFIER_TYPES = new Set([
  "username",
  "email",
  "phone",
  "ip",
  "upi",
  "url",
  "keyword",
]);

const PUBLIC_LEAD_TYPES = new Set([
  "profile",
  "public_result",
  "domain",
]);

const ARTIFACT_TYPES = new Set([
  "email_artifact",
  "phone_artifact",
  "ip_artifact",
  "domain_artifact",
  "location",
]);

const RELATION_LABELS = {
  seed: "Seed link",
  related_to: "Related evidence",
  same_username: "Same username",
  similar_to: "Similar identity signal",
  possible_public_profile: "Possible public profile",
  apify_discovered: "Apify discovered",
  returned_dataset_item: "Actor result",
  found_on: "Found on",
  hosted_on: "Hosted on",
  mentions: "Mentions",
  located_at: "Location hint",
  owns: "Ownership lead",
};

function getMeta(type) {
  return TYPE_META[type] || {
    label: type || "Other",
    color: "#64748b",
    icon: Link2,
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

function shortText(value = "", limit = 72) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.ceil(limit * 0.62))}…${text.slice(-Math.ceil(limit * 0.22))}`;
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

function subtitleFor(node) {
  const data = node?.data || {};
  return (
    data.platform ||
    data.source ||
    data.source_type ||
    data.apify_actor ||
    data.domain ||
    data.search_title ||
    domainFromUrl(data.url || node?.label || "") ||
    getMeta(node?.node_type).label
  );
}

function makeNodeMap(nodes = []) {
  return nodes.reduce((acc, node) => {
    acc[node.id] = node;
    return acc;
  }, {});
}

function EvidenceItem({ node, onSelect }) {
  const meta = getMeta(node.node_type);
  const Icon = meta.icon;
  const score = scoreOf(node);

  return (
    <button
      type="button"
      onClick={() => onSelect(node)}
      className="w-full text-left rounded-2xl border border-border bg-slate-950/35 hover:bg-slate-900/70 transition p-4"
    >
      <div className="flex items-start gap-3">
        <div
          className="h-10 w-10 rounded-xl border grid place-items-center shrink-0"
          style={{
            borderColor: `${meta.color}88`,
            color: meta.color,
            backgroundColor: `${meta.color}18`,
          }}
        >
          <Icon size={17} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted">
              {meta.label}
            </span>
            {isApifyNode(node) && <Badge tone="success">Apify</Badge>}
            <Badge tone={toneOf(score)}>{score}%</Badge>
          </div>

          <p className="text-sm font-semibold text-slate-100 mt-1 break-words">
            {shortText(node.label, 90)}
          </p>

          <p className="text-xs text-muted mt-1 break-words">
            {shortText(subtitleFor(node), 110)}
          </p>

          {node.data?.url && (
            <p className="text-xs text-cyan-300 mt-2 break-all">
              {shortText(node.data.url, 120)}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

function LinkCard({ edge, nodeMap, onSelect }) {
  const source = nodeMap[edge.source];
  const target = nodeMap[edge.target];

  if (!source || !target) return null;

  const sourceMeta = getMeta(source.node_type);
  const targetMeta = getMeta(target.node_type);
  const score = scoreOf(edge, 35);
  const relation = RELATION_LABELS[edge.relation] || edge.relation || "Related";

  return (
    <div className="rounded-2xl border border-border bg-slate-950/35 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <Badge tone={toneOf(score)}>{score}% confidence</Badge>
        <span className="text-xs text-muted">{relation}</span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
        <button
          type="button"
          onClick={() => onSelect(source)}
          className="min-w-0 text-left rounded-xl border border-border bg-slate-900/50 p-3 hover:bg-slate-800/70"
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: sourceMeta.color }}
            />
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted">
              {sourceMeta.label}
            </span>
          </div>
          <p className="text-sm text-slate-100 font-medium break-words">
            {shortText(source.label, 54)}
          </p>
        </button>

        <ArrowRight size={18} className="text-cyan-300" />

        <button
          type="button"
          onClick={() => onSelect(target)}
          className="min-w-0 text-left rounded-xl border border-border bg-slate-900/50 p-3 hover:bg-slate-800/70"
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: targetMeta.color }}
            />
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted">
              {targetMeta.label}
            </span>
          </div>
          <p className="text-sm text-slate-100 font-medium break-words">
            {shortText(target.label, 54)}
          </p>
        </button>
      </div>

      {edge.reason && (
        <p className="text-xs text-muted mt-3 leading-relaxed">
          {edge.reason}
        </p>
      )}
    </div>
  );
}

export default function Identity() {
  const { caseId } = useParams();

  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  const loadIdentity = useCallback(async () => {
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
      setError("Unable to load identity links. Run analysis first or check the backend.");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadIdentity();
  }, [loadIdentity]);

  const runApifyScan = async () => {
    setScanLoading(true);
    setMessage("Running Apify analysis and rebuilding identity links...");
    setError("");

    try {
      try {
        await api.post(`/cases/${caseId}/launch`);
      } catch {
        // Case may already be launched.
      }

      await api.post(`/cases/${caseId}/analyze`);
      await loadIdentity();

      setMessage("Identity links updated from the latest graph evidence.");
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

  const nodeMap = useMemo(() => makeNodeMap(graph.nodes), [graph.nodes]);

  const grouped = useMemo(() => {
    const identifiers = graph.nodes.filter((n) => IDENTIFIER_TYPES.has(n.node_type));
    const publicLeads = graph.nodes.filter((n) => PUBLIC_LEAD_TYPES.has(n.node_type));
    const artifacts = graph.nodes.filter((n) => ARTIFACT_TYPES.has(n.node_type));
    const apify = graph.nodes.filter(isApifyNode);

    const identityLinks = graph.edges
      .filter((edge) => {
        const source = nodeMap[edge.source];
        const target = nodeMap[edge.target];

        if (!source || !target) return false;

        const usefulRelation = [
          "same_username",
          "similar_to",
          "possible_public_profile",
          "apify_discovered",
          "found_on",
          "mentions",
          "owns",
          "related_to",
          "returned_dataset_item",
        ].includes(edge.relation);

        return usefulRelation;
      })
      .sort((a, b) => scoreOf(b, 35) - scoreOf(a, 35));

    return {
      identifiers,
      publicLeads,
      artifacts,
      apify,
      identityLinks,
    };
  }, [graph.nodes, graph.edges, nodeMap]);

  const visibleNodes = useMemo(() => {
    let list = graph.nodes;

    if (filter === "identifiers") list = grouped.identifiers;
    if (filter === "leads") list = grouped.publicLeads;
    if (filter === "artifacts") list = grouped.artifacts;
    if (filter === "apify") list = grouped.apify;

    const q = query.trim().toLowerCase();
    if (!q) return list;

    return list.filter((node) => JSON.stringify(node).toLowerCase().includes(q));
  }, [graph.nodes, grouped, filter, query]);

  const stats = useMemo(
    () => ({
      identifiers: grouped.identifiers.length,
      links: grouped.identityLinks.length,
      leads: grouped.publicLeads.length,
      artifacts: grouped.artifacts.length,
      apify: grouped.apify.length,
      highConfidence: graph.nodes.filter((n) => scoreOf(n) >= 75).length,
    }),
    [grouped, graph.nodes]
  );

  return (
    <div className="space-y-5">
      <Card className="p-5 bg-slate-950/40 border-cyan-400/20">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Fingerprint size={18} className="text-cyan-300" />
              <h2 className="text-lg font-semibold text-slate-100">
                Identity Links
              </h2>
            </div>
            <p className="text-sm text-muted mt-1">
              Investigator view of identifiers, public profiles, Apify evidence, and extracted artifacts.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={runApifyScan} disabled={scanLoading}>
              {scanLoading ? "Scanning..." : "Run Apify Scan"}
            </Button>
            <Button onClick={loadIdentity} disabled={loading || scanLoading}>
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

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted">Identifiers</p>
          <p className="text-2xl font-semibold text-slate-100 mt-1">{stats.identifiers}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Identity Links</p>
          <p className="text-2xl font-semibold text-slate-100 mt-1">{stats.links}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Public Leads</p>
          <p className="text-2xl font-semibold text-slate-100 mt-1">{stats.leads}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Artifacts</p>
          <p className="text-2xl font-semibold text-slate-100 mt-1">{stats.artifacts}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Apify Nodes</p>
          <p className="text-2xl font-semibold text-emerald-300 mt-1">{stats.apify}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">High Confidence</p>
          <p className="text-2xl font-semibold text-cyan-300 mt-1">{stats.highConfidence}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Network size={17} className="text-cyan-300" />
                <h3 className="font-semibold text-slate-100">Strong Identity Connections</h3>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  ["all", "All"],
                  ["identifiers", "Identifiers"],
                  ["leads", "Public Leads"],
                  ["artifacts", "Artifacts"],
                  ["apify", "Apify"],
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
              placeholder="Search identity evidence, URLs, snippets, usernames..."
              className="w-full rounded-xl border border-border bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400/50"
            />

            {loading ? (
              <div className="py-12 text-center text-sm text-muted">
                Loading identity links...
              </div>
            ) : graph.nodes.length === 0 ? (
              <div className="py-12 text-center">
                <AlertTriangle className="mx-auto text-amber-300 mb-3" size={28} />
                <p className="font-medium text-slate-200">No identity graph found</p>
                <p className="text-sm text-muted mt-1">
                  Add seed input and run Apify scan to generate identity evidence.
                </p>
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-3">
                {visibleNodes.slice(0, 80).map((node) => (
                  <EvidenceItem key={node.id} node={node} onSelect={setSelected} />
                ))}

                {visibleNodes.length === 0 && (
                  <div className="lg:col-span-2 py-10 text-center text-sm text-muted">
                    No matching evidence for this filter.
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Link2 size={17} className="text-cyan-300" />
              <h3 className="font-semibold text-slate-100">Relationship Evidence</h3>
            </div>

            {grouped.identityLinks.length === 0 ? (
              <p className="text-sm text-muted">
                No relationship links available yet. Run Apify scan and check that graph edges are being created by the backend.
              </p>
            ) : (
              <div className="space-y-3">
                {grouped.identityLinks.slice(0, 30).map((edge) => (
                  <LinkCard
                    key={edge.id}
                    edge={edge}
                    nodeMap={nodeMap}
                    onSelect={setSelected}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card className="p-5 h-fit sticky top-4">
          {!selected ? (
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck size={17} className="text-emerald-300" />
                <h3 className="font-semibold text-slate-100">Investigator Notes</h3>
              </div>

              <div className="mt-4 space-y-3 text-sm text-muted leading-relaxed">
                <p>
                  This page now uses the graph evidence, so it will show Apify-discovered usernames, profiles, URLs, domains, and artifacts.
                </p>
                <p>
                  Click any evidence card to inspect metadata such as Apify actor, query, snippet, URL, and extracted artifact.
                </p>
                <p>
                  These are investigative leads, not final identity claims. Verify each source manually before using it in a report.
                </p>
              </div>

              <div className="mt-5 rounded-xl border border-border bg-slate-950/40 p-4">
                <div className="flex items-center gap-2 text-sm text-slate-200">
                  <Activity size={15} className="text-cyan-300" />
                  Current filter
                </div>
                <p className="text-xs text-muted mt-2">
                  Showing <span className="text-slate-200 font-medium">{visibleNodes.length}</span> evidence items.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">
                    Selected Evidence
                  </p>
                  <h3 className="text-slate-100 font-semibold mt-2 break-words">
                    {selected.label}
                  </h3>
                </div>
                <Badge tone={toneOf(scoreOf(selected))}>{scoreOf(selected)}%</Badge>
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                <Badge tone="accent">{getMeta(selected.node_type).label}</Badge>
                {isApifyNode(selected) && <Badge tone="success">Apify-backed</Badge>}
              </div>

              {selected.data?.url && (
                <a
                  href={selected.data.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs text-cyan-300 break-all mt-3 hover:underline"
                >
                  {selected.data.url}
                </a>
              )}

              <div className="mt-4 rounded-xl border border-border bg-slate-950/40 p-4 text-xs text-slate-300 space-y-2">
                {selected.data?.source_type && <p><span className="text-muted">Source:</span> {selected.data.source_type}</p>}
                {selected.data?.platform && <p><span className="text-muted">Platform:</span> {selected.data.platform}</p>}
                {selected.data?.apify_actor && <p><span className="text-muted">Apify Actor:</span> {selected.data.apify_actor}</p>}
                {selected.data?.apify_query && <p><span className="text-muted">Apify Query:</span> {selected.data.apify_query}</p>}
                {selected.data?.actor_run_id && <p><span className="text-muted">Actor Run ID:</span> {selected.data.actor_run_id}</p>}
                {selected.data?.dataset_item_index !== undefined && <p><span className="text-muted">Dataset Item:</span> #{selected.data.dataset_item_index}</p>}
                {selected.data?.domain && <p><span className="text-muted">Domain:</span> {selected.data.domain}</p>}
                {selected.data?.email_pattern && <p><span className="text-muted">Email:</span> {selected.data.email_pattern}</p>}
                {selected.data?.phone_pattern && <p><span className="text-muted">Phone:</span> {selected.data.phone_pattern}</p>}
                {selected.data?.ip_address && <p><span className="text-muted">IP:</span> {selected.data.ip_address}</p>}
                {selected.data?.search_title && <p><span className="text-muted">Title:</span> {selected.data.search_title}</p>}
                {selected.data?.search_snippet && <p className="leading-relaxed"><span className="text-muted">Snippet:</span> {selected.data.search_snippet}</p>}

                {(!selected.data || Object.keys(selected.data).length === 0) && (
                  <p><span className="text-muted">Metadata:</span> Backend returned only node type and label.</p>
                )}
              </div>

              <Button className="w-full mt-4" onClick={() => setSelected(null)}>
                Clear Selection
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}