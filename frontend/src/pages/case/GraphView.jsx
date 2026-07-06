import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import api from "../../lib/api";
import { Badge, Button, Card } from "../../components/ui";

const TYPE_META = {
  seed: { label: "Seed", color: "#22d3ee", icon: "◎" },
  username: { label: "Username", color: "#38bdf8", icon: "@" },
  email: { label: "Email", color: "#a78bfa", icon: "✉" },
  phone: { label: "Phone", color: "#34d399", icon: "☎" },
  ip: { label: "IP", color: "#fb7185", icon: "IP" },
  upi: { label: "UPI", color: "#fbbf24", icon: "₹" },
  url: { label: "URL", color: "#38bdf8", icon: "↗" },
  keyword: { label: "Keyword", color: "#94a3b8", icon: "#" },

  apify_actor: { label: "Apify Actor", color: "#22c55e", icon: "API" },
  public_result: { label: "Public Result", color: "#818cf8", icon: "SERP" },

  profile: { label: "Public Profile", color: "#f472b6", icon: "◉" },
  domain: { label: "Domain", color: "#f59e0b", icon: "DOM" },

  email_artifact: { label: "Email Artifact", color: "#c084fc", icon: "✉" },
  phone_artifact: { label: "Phone Artifact", color: "#2dd4bf", icon: "☎" },
  ip_artifact: { label: "IP Artifact", color: "#fb7185", icon: "IP" },
  domain_artifact: { label: "Domain Artifact", color: "#f59e0b", icon: "DOM" },
  location: { label: "Location", color: "#4ade80", icon: "⌖" },
};

const GROUPS = [
  {
    id: "seed",
    title: "Case Seed",
    subtitle: "Original input submitted by investigator",
    color: "#22d3ee",
    types: ["seed"],
    x: 40,
    y: 260,
  },
  {
    id: "identifiers",
    title: "Identifiers",
    subtitle: "Extracted emails, phones, usernames, URLs, IPs",
    color: "#38bdf8",
    types: ["username", "email", "phone", "ip", "upi", "url", "keyword"],
    x: 390,
    y: 120,
  },
  {
    id: "apify",
    title: "Apify Evidence",
    subtitle: "Actor runs, SERP items, scraped public pages",
    color: "#22c55e",
    types: ["apify_actor", "public_result"],
    x: 760,
    y: 120,
  },
  {
    id: "leads",
    title: "Public Leads",
    subtitle: "Profiles, domains and source locations",
    color: "#f472b6",
    types: ["profile", "domain"],
    x: 1130,
    y: 120,
  },
  {
    id: "artifacts",
    title: "Extracted Artifacts",
    subtitle: "Emails, phones, IPs, domains and location hints",
    color: "#f59e0b",
    types: ["email_artifact", "phone_artifact", "ip_artifact", "domain_artifact", "location"],
    x: 1500,
    y: 120,
  },
];

const EDGE_META = {
  seed: { label: "Seed", color: "#22d3ee" },
  related_to: { label: "Related", color: "#94a3b8" },
  same_username: { label: "Same username", color: "#38bdf8" },
  similar_to: { label: "Similar", color: "#a78bfa" },
  possible_public_profile: { label: "Profile lead", color: "#f472b6" },
  apify_discovered: { label: "Apify discovered", color: "#38bdf8" },
  returned_dataset_item: { label: "Actor result", color: "#22c55e" },
  found_on: { label: "Found on", color: "#f472b6" },
  hosted_on: { label: "Hosted on", color: "#f59e0b" },
  mentions: { label: "Mentions", color: "#fbbf24" },
  located_at: { label: "Location hint", color: "#4ade80" },
  owns: { label: "Ownership lead", color: "#34d399" },
};

function typeMeta(type) {
  return TYPE_META[type] || {
    label: type || "Other",
    color: "#64748b",
    icon: "•",
  };
}

function edgeMeta(relation) {
  return EDGE_META[relation] || EDGE_META.related_to;
}

function scoreOf(item, fallback = 50) {
  const value = item?.data?.score ?? item?.data?.confidence ?? item?.confidence;
  if (typeof value !== "number") return fallback;
  return value <= 1 ? Math.round(value * 100) : Math.round(value);
}

function tone(score) {
  if (score >= 75) return "success";
  if (score >= 45) return "warning";
  return "danger";
}

function shortText(value = "", max = 44) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, Math.ceil(max * 0.58))}…${text.slice(-Math.ceil(max * 0.25))}`;
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
    typeMeta(node?.node_type).label
  );
}

function groupForNode(node) {
  return GROUPS.find((group) => group.types.includes(node.node_type)) || GROUPS[GROUPS.length - 1];
}

function GroupNode({ data, selected }) {
  const group = data.group;
  const items = data.items || [];
  const highCount = items.filter((item) => scoreOf(item) >= 75).length;
  const apifyCount = items.filter(isApifyNode).length;

  return (
    <div
      className={`tn-group-node ${selected ? "tn-group-node--selected" : ""}`}
      style={{ "--group-color": group.color }}
    >
      <Handle type="target" position={Position.Left} className="tn-handle" />

      <div className="tn-group-head">
        <div className="tn-group-icon">{group.id === "seed" ? "◎" : group.id === "apify" ? "API" : "●"}</div>
        <div>
          <div className="tn-group-title">{group.title}</div>
          <div className="tn-group-subtitle">{group.subtitle}</div>
        </div>
      </div>

      <div className="tn-group-stats">
        <div>
          <strong>{items.length}</strong>
          <span>items</span>
        </div>
        <div>
          <strong>{highCount}</strong>
          <span>high</span>
        </div>
        <div>
          <strong>{apifyCount}</strong>
          <span>apify</span>
        </div>
      </div>

      <div className="tn-group-preview">
        {items.slice(0, 4).map((item) => {
          const meta = typeMeta(item.node_type);
          return (
            <div key={item.id} className="tn-mini-row">
              <span style={{ background: meta.color }} />
              <p>{shortText(item.label, 34)}</p>
            </div>
          );
        })}
        {items.length > 4 && <div className="tn-more">+{items.length - 4} more evidence items</div>}
      </div>

      <Handle type="source" position={Position.Right} className="tn-handle" />
    </div>
  );
}

function EvidenceNode({ data, selected }) {
  const node = data.node;
  const meta = typeMeta(node.node_type);
  const score = scoreOf(node);

  return (
    <div
      className={`tn-evidence-node ${selected ? "tn-evidence-node--selected" : ""}`}
      style={{ "--node-color": meta.color }}
    >
      <Handle type="target" position={Position.Left} className="tn-handle" />

      <div className="tn-evidence-main">
        <div className="tn-evidence-icon">{meta.icon}</div>
        <div className="tn-evidence-body">
          <div className="tn-evidence-top">
            <span>{meta.label}</span>
            {isApifyNode(node) && <b className="tn-apify">Apify</b>}
            <b className={`tn-score tn-score--${tone(score)}`}>{score}%</b>
          </div>
          <div className="tn-evidence-title" title={node.label}>
            {shortText(node.label, 46)}
          </div>
          <div className="tn-evidence-sub" title={subtitleFor(node)}>
            {shortText(subtitleFor(node), 54)}
          </div>
        </div>
      </div>

      {node.data?.search_snippet && (
        <div className="tn-snippet" title={node.data.search_snippet}>
          {shortText(node.data.search_snippet, 90)}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="tn-handle" />
    </div>
  );
}

function buildGroupNodes(nodes) {
  return GROUPS.map((group) => ({
    id: `group:${group.id}`,
    type: "groupNode",
    position: { x: group.x, y: group.y },
    data: {
      group,
      items: nodes.filter((node) => group.types.includes(node.node_type)),
    },
  })).filter((node) => node.data.items.length > 0);
}

function buildGroupEdges(nodes, edges) {
  const presentGroups = new Set(buildGroupNodes(nodes).map((node) => node.id));

  const groupEdgeMap = new Map();

  edges.forEach((edge) => {
    const sourceNode = nodes.find((node) => node.id === edge.source);
    const targetNode = nodes.find((node) => node.id === edge.target);
    if (!sourceNode || !targetNode) return;

    const sourceGroup = groupForNode(sourceNode);
    const targetGroup = groupForNode(targetNode);

    if (sourceGroup.id === targetGroup.id) return;

    const sourceId = `group:${sourceGroup.id}`;
    const targetId = `group:${targetGroup.id}`;

    if (!presentGroups.has(sourceId) || !presentGroups.has(targetId)) return;

    const key = `${sourceId}->${targetId}`;
    const existing = groupEdgeMap.get(key);

    if (existing) {
      existing.count += 1;
      existing.confidence = Math.max(existing.confidence, edge.confidence || 0.35);
    } else {
      groupEdgeMap.set(key, {
        id: `group-edge:${key}`,
        source: sourceId,
        target: targetId,
        relation: edge.relation || "related_to",
        confidence: edge.confidence || 0.35,
        count: 1,
      });
    }
  });

  return Array.from(groupEdgeMap.values());
}

function buildDetailedLayout(nodes, edges) {
  const degree = {};
  edges.forEach((edge) => {
    degree[edge.source] = (degree[edge.source] || 0) + 1;
    degree[edge.target] = (degree[edge.target] || 0) + 1;
  });

  const grouped = {};
  nodes.forEach((node) => {
    const group = groupForNode(node);
    if (!grouped[group.id]) grouped[group.id] = [];
    grouped[group.id].push(node);
  });

  const placed = [];

  GROUPS.forEach((group) => {
    const list = grouped[group.id] || [];
    const sorted = [...list].sort((a, b) => {
      const scoreDiff = scoreOf(b) - scoreOf(a);
      if (scoreDiff !== 0) return scoreDiff;
      return (degree[b.id] || 0) - (degree[a.id] || 0);
    });

    sorted.forEach((node, index) => {
      placed.push({
        ...node,
        position: {
          x: group.x,
          y: 70 + index * 145,
        },
      });
    });
  });

  return placed;
}

export default function GraphView() {
  const { caseId } = useParams();

  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [selected, setSelected] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [mode, setMode] = useState("board");
  const [minScore, setMinScore] = useState(0);
  const [query, setQuery] = useState("");
  const [showEdgeLabels, setShowEdgeLabels] = useState(false);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/cases/${caseId}/graph`);
      setGraph({
        nodes: response.data?.nodes || [],
        edges: response.data?.edges || [],
      });
    } catch {
      setGraph({ nodes: [], edges: [] });
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  const runApifyScan = async () => {
    setScanLoading(true);
    setError("");
    setMessage("Running Apify public-source scan...");

    try {
      try {
        await api.post(`/cases/${caseId}/launch`);
      } catch {
        // Case may already be launched.
      }

      await api.post(`/cases/${caseId}/analyze`);
      await loadGraph();
      setMessage("Apify scan complete. Evidence graph updated.");
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : detail?.message || "Scan failed. Check APIFY_TOKEN, actor IDs, and backend logs."
      );
      setMessage("");
    } finally {
      setScanLoading(false);
    }
  };

  const stats = useMemo(() => {
    const counts = {};
    graph.nodes.forEach((node) => {
      counts[node.node_type] = (counts[node.node_type] || 0) + 1;
    });

    return {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      apify: graph.nodes.filter(isApifyNode).length,
      high: graph.nodes.filter((node) => scoreOf(node) >= 75).length,
      counts,
    };
  }, [graph]);

  const filteredNodes = useMemo(() => {
    const q = query.trim().toLowerCase();

    return graph.nodes.filter((node) => {
      if (scoreOf(node) < minScore) return false;

      if (selectedGroupId) {
        const group = GROUPS.find((item) => item.id === selectedGroupId);
        if (group && !group.types.includes(node.node_type)) return false;
      }

      if (q) {
        const haystack = JSON.stringify(node).toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [graph.nodes, minScore, query, selectedGroupId]);

  const visibleIds = useMemo(
    () => new Set(filteredNodes.map((node) => node.id)),
    [filteredNodes]
  );

  const filteredEdges = useMemo(() => {
    return graph.edges.filter((edge) => {
      if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) return false;
      return scoreOf(edge, 35) >= minScore;
    });
  }, [graph.edges, visibleIds, minScore]);

  const nodeTypes = useMemo(
    () => ({
      groupNode: GroupNode,
      evidenceNode: EvidenceNode,
    }),
    []
  );

  const flowNodes = useMemo(() => {
    if (mode === "board") {
      return buildGroupNodes(filteredNodes);
    }

    return buildDetailedLayout(filteredNodes, filteredEdges).map((node) => ({
      id: node.id,
      type: "evidenceNode",
      position: node.position,
      data: { node },
      style: { borderColor: typeMeta(node.node_type).color },
    }));
  }, [mode, filteredNodes, filteredEdges]);

  const flowEdges = useMemo(() => {
    const sourceEdges = mode === "board" ? buildGroupEdges(filteredNodes, filteredEdges) : filteredEdges;

    return sourceEdges.map((edge) => {
      const meta = edgeMeta(edge.relation);
      const score = scoreOf(edge, 35);
      const selectedEdge =
        selected && (edge.source === selected.id || edge.target === selected.id);

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        animated: selectedEdge || edge.relation === "apify_discovered",
        markerEnd: { type: MarkerType.ArrowClosed, color: meta.color },
        label:
          showEdgeLabels || mode === "board"
            ? `${meta.label}${edge.count ? ` · ${edge.count}` : ` · ${score}%`}`
            : "",
        labelBgPadding: [8, 4],
        labelBgBorderRadius: 10,
        labelBgStyle: { fill: "#020617", fillOpacity: 0.95 },
        labelStyle: { fill: "#e2e8f0", fontSize: 11, fontWeight: 700 },
        style: {
          stroke: meta.color,
          strokeWidth: mode === "board" ? 3 : selectedEdge ? 3 : score >= 75 ? 2.4 : 1.5,
          opacity: mode === "board" ? 0.9 : selectedEdge ? 1 : score >= 75 ? 0.76 : 0.42,
        },
      };
    });
  }, [mode, filteredNodes, filteredEdges, selected, showEdgeLabels]);

  const selectedEdges = useMemo(() => {
    if (!selected) return [];
    return graph.edges.filter(
      (edge) => edge.source === selected.id || edge.target === selected.id
    );
  }, [selected, graph.edges]);

  const selectedGroup = selectedGroupId
    ? GROUPS.find((group) => group.id === selectedGroupId)
    : null;

  const selectedGroupItems = selectedGroup
    ? graph.nodes.filter((node) => selectedGroup.types.includes(node.node_type))
    : [];

  return (
    <div className="tn-page">
      <style>{`
        .tn-page {
          height: calc(100vh - 140px);
          min-height: 720px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 410px;
          gap: 16px;
        }

        @media (max-width: 1280px) {
          .tn-page {
            grid-template-columns: 1fr;
            height: auto;
          }
        }

        .tn-canvas {
          position: relative;
          overflow: hidden;
          min-height: 720px;
          background:
            radial-gradient(circle at top left, rgba(34,211,238,.08), transparent 34%),
            radial-gradient(circle at bottom right, rgba(167,139,250,.08), transparent 36%),
            #020617;
        }

        .tn-group-node {
          width: 310px;
          border: 1px solid rgba(148,163,184,.22);
          border-top: 4px solid var(--group-color);
          border-radius: 22px;
          background: linear-gradient(145deg, rgba(15,23,42,.98), rgba(15,23,42,.9));
          box-shadow: 0 22px 60px rgba(0,0,0,.45);
          padding: 16px;
          cursor: pointer;
        }

        .tn-group-node--selected {
          box-shadow: 0 0 0 2px rgba(34,211,238,.28), 0 26px 70px rgba(0,0,0,.58);
        }

        .tn-group-head {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }

        .tn-group-icon {
          width: 42px;
          height: 42px;
          border-radius: 15px;
          display: grid;
          place-items: center;
          color: var(--group-color);
          border: 1px solid color-mix(in srgb, var(--group-color) 55%, transparent);
          background: color-mix(in srgb, var(--group-color) 12%, transparent);
          font-size: 12px;
          font-weight: 900;
        }

        .tn-group-title {
          color: #f8fafc;
          font-weight: 900;
          font-size: 15px;
        }

        .tn-group-subtitle {
          color: #94a3b8;
          font-size: 11px;
          margin-top: 4px;
          line-height: 1.45;
        }

        .tn-group-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 15px;
        }

        .tn-group-stats div {
          border: 1px solid rgba(148,163,184,.14);
          background: rgba(2,6,23,.38);
          border-radius: 14px;
          padding: 10px;
        }

        .tn-group-stats strong {
          display: block;
          color: #f8fafc;
          font-size: 20px;
        }

        .tn-group-stats span {
          color: #94a3b8;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .08em;
        }

        .tn-group-preview {
          margin-top: 14px;
          display: grid;
          gap: 7px;
        }

        .tn-mini-row {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #cbd5e1;
          font-size: 11px;
          min-width: 0;
        }

        .tn-mini-row span {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          flex: 0 0 auto;
        }

        .tn-mini-row p {
          margin: 0;
          min-width: 0;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .tn-more {
          color: #67e8f9;
          font-size: 11px;
          margin-top: 2px;
        }

        .tn-evidence-node {
          width: 300px;
          border: 1px solid rgba(148,163,184,.22);
          border-left: 4px solid var(--node-color);
          border-radius: 18px;
          background: linear-gradient(135deg, rgba(15,23,42,.98), rgba(15,23,42,.9));
          box-shadow: 0 18px 42px rgba(0,0,0,.42);
          padding: 13px;
        }

        .tn-evidence-node--selected {
          border-color: var(--node-color);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--node-color) 30%, transparent), 0 24px 60px rgba(0,0,0,.56);
        }

        .tn-evidence-main {
          display: flex;
          gap: 11px;
          align-items: flex-start;
        }

        .tn-evidence-icon {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          color: var(--node-color);
          border: 1px solid color-mix(in srgb, var(--node-color) 55%, transparent);
          background: color-mix(in srgb, var(--node-color) 12%, transparent);
          border-radius: 13px;
          font-size: 11px;
          font-weight: 900;
          flex: 0 0 auto;
        }

        .tn-evidence-body {
          min-width: 0;
          flex: 1;
        }

        .tn-evidence-top {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #94a3b8;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .13em;
          margin-bottom: 5px;
        }

        .tn-apify {
          color: #86efac;
          background: rgba(34,197,94,.12);
          border: 1px solid rgba(34,197,94,.25);
          border-radius: 999px;
          padding: 2px 7px;
          font-size: 9px;
          text-transform: none;
          letter-spacing: 0;
        }

        .tn-score {
          margin-left: auto;
          border-radius: 999px;
          padding: 2px 7px;
          font-size: 10px;
          letter-spacing: 0;
        }

        .tn-score--success {
          color: #86efac;
          background: rgba(34,197,94,.12);
        }

        .tn-score--warning {
          color: #fde68a;
          background: rgba(245,158,11,.12);
        }

        .tn-score--danger {
          color: #fca5a5;
          background: rgba(239,68,68,.12);
        }

        .tn-evidence-title {
          color: #f8fafc;
          font-size: 13px;
          font-weight: 850;
          line-height: 1.35;
          word-break: break-word;
        }

        .tn-evidence-sub {
          color: #94a3b8;
          font-size: 11px;
          margin-top: 5px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tn-snippet {
          margin-top: 10px;
          padding-top: 9px;
          border-top: 1px solid rgba(148,163,184,.14);
          color: #cbd5e1;
          font-size: 11px;
          line-height: 1.45;
        }

        .tn-handle {
          width: 9px !important;
          height: 9px !important;
          background: #64748b !important;
          border: 2px solid #cbd5e1 !important;
        }

        .tn-panel {
          border: 1px solid rgba(148,163,184,.18);
          background: rgba(15,23,42,.92);
          color: #e2e8f0;
          border-radius: 18px;
          padding: 14px;
          box-shadow: 0 18px 45px rgba(0,0,0,.35);
          backdrop-filter: blur(14px);
        }

        .tn-toolbar {
          width: 440px;
        }

        .tn-panel-title {
          color: #f8fafc;
          font-weight: 900;
          font-size: 14px;
          margin: 0;
        }

        .tn-panel-sub {
          color: #94a3b8;
          font-size: 11px;
          margin-top: 3px;
        }

        .tn-mode-row {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin-top: 13px;
        }

        .tn-mode-btn {
          border: 1px solid rgba(148,163,184,.18);
          background: rgba(2,6,23,.5);
          color: #94a3b8;
          border-radius: 12px;
          padding: 9px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }

        .tn-mode-btn--active {
          color: #ecfeff;
          background: rgba(34,211,238,.13);
          border-color: rgba(34,211,238,.42);
        }

        .tn-search {
          width: 100%;
          margin-top: 12px;
          border: 1px solid rgba(148,163,184,.18);
          background: rgba(2,6,23,.6);
          color: #e2e8f0;
          border-radius: 12px;
          padding: 10px 11px;
          font-size: 12px;
          outline: none;
        }

        .tn-range {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 10px;
          align-items: center;
          margin-top: 12px;
          color: #94a3b8;
          font-size: 11px;
        }

        .tn-range input,
        .tn-check input {
          accent-color: #22d3ee;
        }

        .tn-check {
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #cbd5e1;
          font-size: 11px;
        }

        .tn-side {
          padding: 18px;
          overflow-y: auto;
          background:
            radial-gradient(circle at top, rgba(34,211,238,.06), transparent 36%),
            rgba(15,23,42,.62);
        }

        .tn-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
          margin-bottom: 14px;
        }

        .tn-msg {
          border: 1px solid rgba(34,211,238,.22);
          background: rgba(34,211,238,.08);
          color: #a5f3fc;
          border-radius: 13px;
          padding: 10px;
          font-size: 12px;
          line-height: 1.45;
          margin-bottom: 12px;
        }

        .tn-error {
          border: 1px solid rgba(248,113,113,.28);
          background: rgba(248,113,113,.08);
          color: #fecaca;
          border-radius: 13px;
          padding: 10px;
          font-size: 12px;
          line-height: 1.45;
          margin-bottom: 12px;
        }

        .tn-kicker {
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: .18em;
          font-size: 11px;
          margin: 0;
        }

        .tn-title {
          color: #f8fafc;
          margin: 8px 0 0;
          font-size: 18px;
          line-height: 1.3;
          font-weight: 900;
          word-break: break-word;
        }

        .tn-stats {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          margin-top: 16px;
        }

        .tn-stat {
          border: 1px solid rgba(148,163,184,.16);
          background: rgba(2,6,23,.4);
          border-radius: 16px;
          padding: 12px;
        }

        .tn-stat span {
          color: #94a3b8;
          font-size: 11px;
        }

        .tn-stat strong {
          color: #f8fafc;
          display: block;
          font-size: 24px;
          margin-top: 4px;
        }

        .tn-box {
          border: 1px solid rgba(148,163,184,.16);
          background: rgba(2,6,23,.42);
          border-radius: 16px;
          padding: 13px;
          margin-top: 14px;
          color: #cbd5e1;
          font-size: 12px;
          line-height: 1.55;
        }

        .tn-box p {
          margin: 0 0 8px;
        }

        .tn-box p:last-child {
          margin-bottom: 0;
        }

        .tn-box span {
          color: #94a3b8;
        }

        .tn-list {
          margin-top: 14px;
          display: grid;
          gap: 9px;
        }

        .tn-list-item {
          border: 1px solid rgba(148,163,184,.16);
          background: rgba(2,6,23,.42);
          border-radius: 14px;
          padding: 11px;
          cursor: pointer;
        }

        .tn-list-item-top {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tn-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          flex: 0 0 auto;
        }

        .tn-list-title {
          color: #e2e8f0;
          font-size: 13px;
          font-weight: 800;
          margin: 0;
          min-width: 0;
          flex: 1;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .tn-list-sub {
          color: #94a3b8;
          font-size: 11px;
          margin: 6px 0 0;
          line-height: 1.45;
        }

        .tn-url {
          display: block;
          color: #67e8f9;
          word-break: break-all;
          font-size: 12px;
          margin-top: 12px;
        }

        .tn-connection {
          border: 1px solid rgba(148,163,184,.16);
          background: rgba(2,6,23,.42);
          border-radius: 14px;
          padding: 11px;
          margin-top: 9px;
        }

        .tn-connection-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .tn-connection-title {
          margin: 0;
          color: #e2e8f0;
          font-size: 13px;
        }

        .tn-connection-reason {
          color: #94a3b8;
          font-size: 11px;
          line-height: 1.5;
          margin: 7px 0 0;
        }

        .tn-empty {
          height: 100%;
          display: grid;
          place-items: center;
          text-align: center;
          padding: 30px;
        }

        .tn-empty-box {
          max-width: 460px;
        }

        .tn-empty-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 15px;
          display: grid;
          place-items: center;
          border-radius: 22px;
          color: #67e8f9;
          border: 1px solid rgba(34,211,238,.35);
          background: rgba(34,211,238,.08);
          font-size: 24px;
        }

        .tn-empty-title {
          color: #f8fafc;
          font-weight: 900;
          font-size: 18px;
          margin: 0;
        }

        .tn-empty-text {
          color: #94a3b8;
          font-size: 14px;
          line-height: 1.6;
          margin: 8px 0 18px;
        }

        .react-flow__edge-path {
          filter: drop-shadow(0 0 5px rgba(2,6,23,.8));
        }

        .react-flow__controls button {
          background: rgba(15,23,42,.95) !important;
          color: #cbd5e1 !important;
          border-bottom: 1px solid rgba(148,163,184,.16) !important;
        }
      `}</style>

      <Card className="tn-canvas">
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-muted">
            Loading graph...
          </div>
        ) : graph.nodes.length === 0 ? (
          <div className="tn-empty">
            <div className="tn-empty-box">
              <div className="tn-empty-icon">◎</div>
              <p className="tn-empty-title">No graph generated</p>
              <p className="tn-empty-text">
                Add seed input, then run Apify scan. The graph will organize evidence into clean investigator sections.
              </p>
              <Button onClick={runApifyScan} disabled={scanLoading}>
                {scanLoading ? "Running..." : "Run Apify Scan"}
              </Button>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => {
              if (node.id.startsWith("group:")) {
                const groupId = node.id.replace("group:", "");
                setSelected(null);
                setSelectedGroupId(groupId);
                return;
              }
              setSelected(node.data.node);
              setSelectedGroupId(null);
            }}
            onPaneClick={() => {
              setSelected(null);
              setSelectedGroupId(null);
            }}
            fitView
            fitViewOptions={{ padding: 0.18, duration: 500 }}
            minZoom={0.1}
            maxZoom={1.35}
            defaultEdgeOptions={{ interactionWidth: 22 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#1e293b" gap={28} size={1} />
            <Controls />
            <MiniMap
              pannable
              zoomable
              nodeColor={(node) => {
                if (node.id?.startsWith("group:")) {
                  const group = GROUPS.find((item) => `group:${item.id}` === node.id);
                  return group?.color || "#64748b";
                }
                return node?.style?.borderColor || "#64748b";
              }}
              style={{
                background: "#0d1424",
                border: "1px solid #1e293b",
                borderRadius: 14,
              }}
              maskColor="rgba(7,11,20,.66)"
            />

            <Panel position="top-left" className="tn-panel tn-toolbar">
              <p className="tn-panel-title">Investigator Evidence Map</p>
              <p className="tn-panel-sub">
                {stats.nodes} nodes · {stats.edges} links · {stats.apify} Apify evidence nodes
              </p>

              <div className="tn-mode-row">
                <button
                  type="button"
                  onClick={() => setMode("board")}
                  className={`tn-mode-btn ${mode === "board" ? "tn-mode-btn--active" : ""}`}
                >
                  Board View
                </button>
                <button
                  type="button"
                  onClick={() => setMode("detail")}
                  className={`tn-mode-btn ${mode === "detail" ? "tn-mode-btn--active" : ""}`}
                >
                  Detail View
                </button>
              </div>

              <input
                className="tn-search"
                placeholder="Search evidence, URLs, snippets..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />

              <div className="tn-range">
                <span>Min confidence</span>
                <input
                  type="range"
                  min="0"
                  max="90"
                  step="5"
                  value={minScore}
                  onChange={(event) => setMinScore(Number(event.target.value))}
                />
                <strong>{minScore}%</strong>
              </div>

              <label className="tn-check">
                <input
                  type="checkbox"
                  checked={showEdgeLabels}
                  onChange={(event) => setShowEdgeLabels(event.target.checked)}
                />
                Show edge labels
              </label>
            </Panel>
          </ReactFlow>
        )}
      </Card>

      <Card className="tn-side">
        <div className="tn-actions">
          <Button onClick={runApifyScan} disabled={scanLoading}>
            {scanLoading ? "Scanning..." : "Run Apify Scan"}
          </Button>
          <Button onClick={loadGraph} disabled={loading || scanLoading}>
            Refresh
          </Button>
        </div>

        {message && <div className="tn-msg">{message}</div>}
        {error && <div className="tn-error">{error}</div>}

        {!selected && !selectedGroup && (
          <div>
            <p className="tn-kicker">Overview</p>
            <h3 className="tn-title">Organized for investigators</h3>
            <p className="text-sm text-muted mt-2 leading-relaxed">
              Board View groups noisy Apify data into readable evidence sections. Use Detail View only when you need to inspect every individual node.
            </p>

            <div className="tn-stats">
              <div className="tn-stat">
                <span>Total nodes</span>
                <strong>{stats.nodes}</strong>
              </div>
              <div className="tn-stat">
                <span>Total links</span>
                <strong>{stats.edges}</strong>
              </div>
              <div className="tn-stat">
                <span>Apify nodes</span>
                <strong>{stats.apify}</strong>
              </div>
              <div className="tn-stat">
                <span>High confidence</span>
                <strong>{stats.high}</strong>
              </div>
            </div>

            <div className="tn-box">
              <p><span>Recommended:</span> Keep Board View for demos and investigator review.</p>
              <p><span>Workflow:</span> Seed → Identifiers → Apify Evidence → Public Leads → Artifacts.</p>
            </div>

            <div className="tn-list">
              {GROUPS.map((group) => {
                const items = graph.nodes.filter((node) => group.types.includes(node.node_type));
                if (!items.length) return null;

                return (
                  <div
                    key={group.id}
                    className="tn-list-item"
                    onClick={() => {
                      setSelected(null);
                      setSelectedGroupId(group.id);
                    }}
                  >
                    <div className="tn-list-item-top">
                      <span className="tn-dot" style={{ background: group.color }} />
                      <p className="tn-list-title">{group.title}</p>
                      <Badge tone="accent">{items.length}</Badge>
                    </div>
                    <p className="tn-list-sub">{group.subtitle}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selectedGroup && (
          <div>
            <p className="tn-kicker">Evidence group</p>
            <h3 className="tn-title">{selectedGroup.title}</h3>
            <p className="text-sm text-muted mt-2 leading-relaxed">{selectedGroup.subtitle}</p>

            <div className="tn-box">
              <p><span>Total items:</span> {selectedGroupItems.length}</p>
              <p><span>High confidence:</span> {selectedGroupItems.filter((item) => scoreOf(item) >= 75).length}</p>
              <p><span>Apify-backed:</span> {selectedGroupItems.filter(isApifyNode).length}</p>
            </div>

            <div className="tn-list">
              {selectedGroupItems
                .filter((item) => scoreOf(item) >= minScore)
                .slice(0, 80)
                .map((item) => {
                  const meta = typeMeta(item.node_type);
                  return (
                    <div
                      key={item.id}
                      className="tn-list-item"
                      onClick={() => {
                        setSelected(item);
                        setSelectedGroupId(null);
                        setMode("detail");
                      }}
                    >
                      <div className="tn-list-item-top">
                        <span className="tn-dot" style={{ background: meta.color }} />
                        <p className="tn-list-title">{shortText(item.label, 42)}</p>
                        <Badge tone={tone(scoreOf(item))}>{scoreOf(item)}%</Badge>
                      </div>
                      <p className="tn-list-sub">{shortText(subtitleFor(item), 88)}</p>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {selected && (
          <div>
            <p className="tn-kicker">Selected evidence</p>
            <h3 className="tn-title">{selected.label}</h3>

            <div className="flex flex-wrap gap-2 mt-3">
              <Badge tone="accent">{typeMeta(selected.node_type).label}</Badge>
              <Badge tone={tone(scoreOf(selected))}>{scoreOf(selected)}%</Badge>
              {isApifyNode(selected) && <Badge tone="success">Apify-backed</Badge>}
            </div>

            {selected.data?.url && (
              <a href={selected.data.url} target="_blank" rel="noreferrer" className="tn-url">
                {selected.data.url}
              </a>
            )}

            <div className="tn-box">
              {selected.data?.source_type && <p><span>Source:</span> {selected.data.source_type}</p>}
              {selected.data?.platform && <p><span>Platform:</span> {selected.data.platform}</p>}
              {selected.data?.apify_actor && <p><span>Apify Actor:</span> {selected.data.apify_actor}</p>}
              {selected.data?.apify_query && <p><span>Apify Query:</span> {selected.data.apify_query}</p>}
              {selected.data?.actor_run_id && <p><span>Actor Run ID:</span> {selected.data.actor_run_id}</p>}
              {selected.data?.dataset_item_index !== undefined && <p><span>Dataset Item:</span> #{selected.data.dataset_item_index}</p>}
              {selected.data?.domain && <p><span>Domain:</span> {selected.data.domain}</p>}
              {selected.data?.email_pattern && <p><span>Email:</span> {selected.data.email_pattern}</p>}
              {selected.data?.phone_pattern && <p><span>Phone:</span> {selected.data.phone_pattern}</p>}
              {selected.data?.ip_address && <p><span>IP:</span> {selected.data.ip_address}</p>}
              {selected.data?.search_title && <p><span>Title:</span> {selected.data.search_title}</p>}
              {selected.data?.search_snippet && <p><span>Snippet:</span> {selected.data.search_snippet}</p>}
              {!selected.data || Object.keys(selected.data).length === 0 ? (
                <p><span>No metadata:</span> Backend returned only label/type.</p>
              ) : null}
            </div>

            <div className="mt-5">
              <p className="tn-kicker">Connections</p>

              {selectedEdges.length === 0 && (
                <p className="text-sm text-muted mt-2">No direct connections found.</p>
              )}

              {selectedEdges.map((edge) => {
                const meta = edgeMeta(edge.relation);
                const otherId = edge.source === selected.id ? edge.target : edge.source;
                const other = graph.nodes.find((node) => node.id === otherId);
                const score = scoreOf(edge, 35);

                return (
                  <div key={edge.id} className="tn-connection">
                    <div className="tn-connection-top">
                      <p className="tn-connection-title">
                        {meta.label} → {shortText(other?.label || otherId, 34)}
                      </p>
                      <Badge tone={tone(score)}>{score}%</Badge>
                    </div>
                    {edge.reason && <p className="tn-connection-reason">{edge.reason}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}