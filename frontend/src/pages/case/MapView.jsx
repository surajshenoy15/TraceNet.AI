import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle,
  ExternalLink,
  Globe2,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import api from "../../lib/api";
import { Badge, Button, Card } from "../../components/ui";

const KNOWN_PLACES = [
  { keys: ["bengaluru", "bangalore"], name: "Bengaluru, Karnataka, India", lat: 12.9716, lng: 77.5946 },
  { keys: ["karnataka"], name: "Karnataka, India", lat: 15.3173, lng: 75.7139 },
  { keys: ["mangalore", "mangaluru"], name: "Mangaluru, Karnataka, India", lat: 12.9141, lng: 74.8560 },
  { keys: ["udupi"], name: "Udupi, Karnataka, India", lat: 13.3409, lng: 74.7421 },
  { keys: ["mysore", "mysuru"], name: "Mysuru, Karnataka, India", lat: 12.2958, lng: 76.6394 },
  { keys: ["delhi", "new delhi"], name: "New Delhi, India", lat: 28.6139, lng: 77.2090 },
  { keys: ["mumbai", "bombay"], name: "Mumbai, Maharashtra, India", lat: 19.0760, lng: 72.8777 },
  { keys: ["pune"], name: "Pune, Maharashtra, India", lat: 18.5204, lng: 73.8567 },
  { keys: ["hyderabad"], name: "Hyderabad, Telangana, India", lat: 17.3850, lng: 78.4867 },
  { keys: ["chennai"], name: "Chennai, Tamil Nadu, India", lat: 13.0827, lng: 80.2707 },
  { keys: ["kochi", "cochin"], name: "Kochi, Kerala, India", lat: 9.9312, lng: 76.2673 },
  { keys: ["kerala"], name: "Kerala, India", lat: 10.8505, lng: 76.2711 },
  { keys: ["goa"], name: "Goa, India", lat: 15.2993, lng: 74.1240 },
  { keys: ["india", "in"], name: "India", lat: 20.5937, lng: 78.9629 },
  { keys: ["united states", "usa", "us"], name: "United States", lat: 39.8283, lng: -98.5795 },
  { keys: ["california"], name: "California, United States", lat: 36.7783, lng: -119.4179 },
  { keys: ["london"], name: "London, United Kingdom", lat: 51.5072, lng: -0.1276 },
  { keys: ["united kingdom", "uk"], name: "United Kingdom", lat: 55.3781, lng: -3.4360 },
];

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

function shortText(value = "", limit = 110) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.ceil(limit * 0.72))}…${text.slice(-Math.ceil(limit * 0.14))}`;
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
    data.region,
    data.location,
    data.city,
    data.state,
    data.country,
    data.address,
    data.search_title,
    data.search_snippet,
    data.text,
    data.description,
    data.domain,
    data.url,
    data.apify_query,
  ]
    .filter(Boolean)
    .join(" ");
}

function validNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function coordsFromObject(obj = {}) {
  const lat =
    validNumber(obj.lat) ??
    validNumber(obj.latitude) ??
    validNumber(obj.geo_lat) ??
    validNumber(obj.location_lat) ??
    validNumber(obj?.geo?.lat) ??
    validNumber(obj?.coordinates?.lat);

  const lng =
    validNumber(obj.lng) ??
    validNumber(obj.lon) ??
    validNumber(obj.long) ??
    validNumber(obj.longitude) ??
    validNumber(obj.geo_lng) ??
    validNumber(obj.geo_lon) ??
    validNumber(obj.location_lng) ??
    validNumber(obj.location_lon) ??
    validNumber(obj?.geo?.lng) ??
    validNumber(obj?.geo?.lon) ??
    validNumber(obj?.coordinates?.lng) ??
    validNumber(obj?.coordinates?.lon);

  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

function inferKnownPlace(text = "") {
  const lower = String(text || "").toLowerCase();

  for (const place of KNOWN_PLACES) {
    if (place.keys.some((key) => lower.includes(key))) {
      return place;
    }
  }

  return null;
}

function domainFromUrl(value = "") {
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
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
    TYPE_LABELS[node?.node_type] ||
    "Public evidence"
  );
}

function addLocationCandidate(map, item) {
  if (!item?.lat || !item?.lng) return;

  const key = `${item.name}|${item.lat.toFixed(3)}|${item.lng.toFixed(3)}`;
  const existing = map.get(key);

  if (existing) {
    existing.signals += item.signals || 1;
    existing.confidence = Math.max(existing.confidence, item.confidence || 45);
    existing.evidence.push(...(item.evidence || []));
    existing.apify = existing.apify || item.apify;
    return;
  }

  map.set(key, {
    id: key,
    name: item.name,
    lat: item.lat,
    lng: item.lng,
    confidence: item.confidence || 45,
    signals: item.signals || 1,
    evidence: item.evidence || [],
    apify: Boolean(item.apify),
    sourceType: item.sourceType || "public-source",
    exact: Boolean(item.exact),
  });
}

function buildMapLocations(mapData, graph) {
  const merged = new Map();

  (mapData?.locations || []).forEach((loc) => {
    const directCoords = coordsFromObject(loc);
    const inferred = directCoords ? null : inferKnownPlace(loc.region || loc.name || loc.label || "");

    const coords = directCoords || inferred;
    if (!coords) return;

    addLocationCandidate(merged, {
      name: loc.region || loc.name || inferred?.name || "Location signal",
      lat: coords.lat,
      lng: coords.lng,
      confidence: loc.confidence_pct ?? loc.confidence ?? 50,
      signals: loc.signals ?? 1,
      sourceType: "map-endpoint",
      exact: Boolean(directCoords),
      evidence: [
        {
          title: loc.region || loc.name || "Map endpoint signal",
          text: loc.reason || loc.note || loc.source || "Regional location signal from backend map endpoint.",
          url: loc.url,
          type: "map",
          score: loc.confidence_pct ?? loc.confidence ?? 50,
        },
      ],
    });
  });

  (graph?.nodes || []).forEach((node) => {
    const data = node.data || {};
    const directCoords = coordsFromObject(data) || coordsFromObject(node);

    const text = nodeText(node);
    const inferred = directCoords ? null : inferKnownPlace(text);

    if (!directCoords && !inferred) return;

    const coords = directCoords || inferred;

    addLocationCandidate(merged, {
      name:
        data.region ||
        data.location ||
        data.city ||
        data.state ||
        data.country ||
        inferred?.name ||
        node.label ||
        "Location signal",
      lat: coords.lat,
      lng: coords.lng,
      confidence: scoreOf(node, directCoords ? 75 : 50),
      signals: 1,
      apify: isApifyNode(node),
      sourceType: node.node_type,
      exact: Boolean(directCoords),
      evidence: [
        {
          title: node.label,
          text: data.search_snippet || data.search_title || text || node.label,
          url: data.url,
          type: node.node_type,
          score: scoreOf(node),
          apifyActor: data.apify_actor,
          apifyQuery: data.apify_query,
        },
      ],
    });
  });

  return Array.from(merged.values()).sort(
    (a, b) => b.confidence - a.confidence || b.signals - a.signals
  );
}

function FitBounds({ locations }) {
  const map = useMap();

  useEffect(() => {
    if (!locations.length) {
      map.setView([20.5937, 78.9629], 4);
      return;
    }

    if (locations.length === 1) {
      map.setView([locations[0].lat, locations[0].lng], 9);
      return;
    }

    const bounds = locations.map((loc) => [loc.lat, loc.lng]);
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 9 });
  }, [locations, map]);

  return null;
}

function confidenceRadius(confidence) {
  if (confidence >= 80) return 22000;
  if (confidence >= 60) return 36000;
  return 52000;
}

function LocationListItem({ loc, selected, onSelect, index }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(loc)}
      className={`w-full text-left rounded-2xl border p-4 transition ${
        selected?.id === loc.id
          ? "border-cyan-400/50 bg-cyan-400/10"
          : "border-border bg-slate-950/35 hover:bg-slate-900/70"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="h-7 w-7 rounded-full bg-cyan-500/15 text-cyan-300 text-xs flex items-center justify-center">
              {index + 1}
            </span>
            <p className="text-sm font-semibold text-slate-100 break-words">
              {loc.name}
            </p>
          </div>

          <p className="text-xs text-muted">
            {loc.signals} signal(s) · {loc.exact ? "coordinate-backed" : "regional inference"}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <Badge tone={toneOf(loc.confidence)}>{loc.confidence}%</Badge>
          {loc.apify && <Badge tone="success">Apify</Badge>}
        </div>
      </div>

      <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400"
          style={{ width: `${Math.min(loc.confidence, 100)}%` }}
        />
      </div>
    </button>
  );
}

export default function MapView() {
  const { caseId } = useParams();

  const [mapData, setMapData] = useState({ locations: [], disclaimer: "" });
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [minConfidence, setMinConfidence] = useState(0);

  const loadMap = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [mapResponse, graphResponse] = await Promise.allSettled([
        api.get(`/cases/${caseId}/map`),
        api.get(`/cases/${caseId}/graph`),
      ]);

      if (mapResponse.status === "fulfilled") {
        setMapData(mapResponse.value.data || { locations: [], disclaimer: "" });
      } else {
        setMapData({ locations: [], disclaimer: "" });
      }

      if (graphResponse.status === "fulfilled") {
        setGraph({
          nodes: graphResponse.value.data?.nodes || [],
          edges: graphResponse.value.data?.edges || [],
        });
      } else {
        setGraph({ nodes: [], edges: [] });
      }
    } catch {
      setError("Unable to load map intelligence. Run analysis first or check backend.");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadMap();
  }, [loadMap]);

  const runApifyScan = async () => {
    setScanLoading(true);
    setMessage("Running Apify analysis and rebuilding map signals...");
    setError("");

    try {
      try {
        await api.post(`/cases/${caseId}/launch`);
      } catch {
        // Case may already be launched.
      }

      await api.post(`/cases/${caseId}/analyze`);
      await loadMap();

      setMessage("Map signals updated from latest Apify graph evidence.");
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

  const locations = useMemo(
    () => buildMapLocations(mapData, graph),
    [mapData, graph]
  );

  const filteredLocations = useMemo(() => {
    const q = query.trim().toLowerCase();

    return locations.filter((loc) => {
      if (loc.confidence < minConfidence) return false;

      if (q) {
        const haystack = JSON.stringify(loc).toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [locations, query, minConfidence]);

  const stats = useMemo(
    () => ({
      total: locations.length,
      visible: filteredLocations.length,
      apify: locations.filter((loc) => loc.apify).length,
      exact: locations.filter((loc) => loc.exact).length,
      regional: locations.filter((loc) => !loc.exact).length,
    }),
    [locations, filteredLocations]
  );

  useEffect(() => {
    if (!selected && filteredLocations.length) {
      setSelected(filteredLocations[0]);
    }

    if (selected && !filteredLocations.some((loc) => loc.id === selected.id)) {
      setSelected(filteredLocations[0] || null);
    }
  }, [filteredLocations, selected]);

  if (loading) {
    return <p className="text-muted text-sm">Loading map intelligence…</p>;
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 bg-slate-950/40 border-cyan-400/20">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-cyan-300" />
              <h2 className="text-lg font-semibold text-slate-100">
                Real Map View
              </h2>
            </div>
            <p className="text-sm text-muted mt-1">
              OpenStreetMap-based location view from public graph evidence, map endpoint signals, and Apify-discovered regional hints.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={runApifyScan} disabled={scanLoading}>
              {scanLoading ? "Scanning..." : "Run Apify Scan"}
            </Button>
            <Button onClick={loadMap} disabled={loading || scanLoading}>
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

      <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-300">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">Regional confidence inference. Not real-time location.</p>
          <p className="text-xs text-amber-200/80 mt-1">
            Markers represent public-source location hints or explicit coordinates returned by evidence. Do not treat as live GPS.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted">Location Signals</p>
          <p className="text-2xl font-semibold text-slate-100 mt-1">{stats.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Visible</p>
          <p className="text-2xl font-semibold text-cyan-300 mt-1">{stats.visible}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Apify-backed</p>
          <p className="text-2xl font-semibold text-emerald-300 mt-1">{stats.apify}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Coordinate-backed</p>
          <p className="text-2xl font-semibold text-violet-300 mt-1">{stats.exact}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Regional</p>
          <p className="text-2xl font-semibold text-amber-300 mt-1">{stats.regional}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_390px] gap-5">
        <Card className="overflow-hidden">
          <div className="h-[620px] w-full">
            <MapContainer
              center={[20.5937, 78.9629]}
              zoom={4}
              scrollWheelZoom
              className="h-full w-full"
              style={{ background: "#020617" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <FitBounds locations={filteredLocations} />

              {filteredLocations.map((loc, index) => (
                <CircleMarker
                  key={loc.id}
                  center={[loc.lat, loc.lng]}
                  radius={Math.max(9, Math.min(24, loc.confidence / 4))}
                  pathOptions={{
                    color: loc.apify ? "#22c55e" : "#22d3ee",
                    fillColor: loc.apify ? "#22c55e" : "#22d3ee",
                    fillOpacity: 0.34,
                    weight: selected?.id === loc.id ? 4 : 2,
                  }}
                  eventHandlers={{
                    click: () => setSelected(loc),
                  }}
                >
                  <Tooltip direction="top" offset={[0, -4]}>
                    {index + 1}. {loc.name} · {loc.confidence}%
                  </Tooltip>

                  <Popup>
                    <div style={{ minWidth: 220 }}>
                      <strong>{loc.name}</strong>
                      <br />
                      Confidence: {loc.confidence}%
                      <br />
                      Signals: {loc.signals}
                      <br />
                      Type: {loc.exact ? "Coordinate-backed" : "Regional inference"}
                      <br />
                      {loc.apify ? "Apify-backed" : "Public-source"}
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Search size={16} className="text-cyan-300" />
              <h3 className="font-medium text-slate-100">Filter Map</h3>
            </div>

            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search location, source, snippet..."
              className="w-full rounded-xl border border-border bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400/50"
            />

            <div className="mt-4 grid grid-cols-[auto_1fr_auto] gap-3 items-center text-xs text-muted">
              <span>Min confidence</span>
              <input
                type="range"
                min="0"
                max="90"
                step="5"
                value={minConfidence}
                onChange={(event) => setMinConfidence(Number(event.target.value))}
                className="accent-cyan-400"
              />
              <span className="text-slate-200 font-medium">{minConfidence}%</span>
            </div>
          </Card>

          <Card className="p-5 max-h-[520px] overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <LocateFixed size={16} className="text-cyan-300" />
              <h3 className="font-medium text-slate-100">Ranked Locations</h3>
            </div>

            <div className="space-y-3">
              {filteredLocations.map((loc, index) => (
                <LocationListItem
                  key={loc.id}
                  loc={loc}
                  index={index}
                  selected={selected}
                  onSelect={setSelected}
                />
              ))}

              {filteredLocations.length === 0 && (
                <div className="rounded-xl border border-border bg-slate-950/40 p-5 text-center">
                  <Globe2 className="mx-auto text-muted mb-2" size={26} />
                  <p className="text-sm text-slate-300">No map markers found.</p>
                  <p className="text-xs text-muted mt-1">
                    Add location-bearing seed input or public URLs that contain city, region, country, or coordinate hints.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {selected && (
        <Card className="p-5">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-cyan-300" />
                <h3 className="font-medium text-slate-100">Selected Location Evidence</h3>
              </div>

              <h2 className="text-xl font-semibold text-slate-100 mt-3">
                {selected.name}
              </h2>

              <p className="text-sm text-muted mt-1">
                {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)} · {selected.exact ? "coordinate-backed" : "regional inference"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge tone={toneOf(selected.confidence)}>{selected.confidence}% confidence</Badge>
              <Badge tone="accent">{selected.signals} signal(s)</Badge>
              {selected.apify && <Badge tone="success">Apify-backed</Badge>}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-5">
            {selected.evidence.slice(0, 10).map((item, index) => (
              <div
                key={`${selected.id}-${index}`}
                className="rounded-xl border border-border bg-slate-950/35 p-4"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <Badge tone="accent">{TYPE_LABELS[item.type] || item.type || "Evidence"}</Badge>
                  <Badge tone={toneOf(item.score || selected.confidence)}>
                    {item.score || selected.confidence}%
                  </Badge>
                </div>

                <p className="text-sm font-medium text-slate-100 break-words">
                  {shortText(item.title, 110)}
                </p>

                {item.text && (
                  <p className="text-xs text-muted mt-2 leading-relaxed">
                    {shortText(item.text, 220)}
                  </p>
                )}

                {item.apifyActor && (
                  <p className="text-xs text-emerald-300 mt-2">
                    Apify Actor: {item.apifyActor}
                  </p>
                )}

                {item.apifyQuery && (
                  <p className="text-xs text-cyan-300 mt-1">
                    Query: {shortText(item.apifyQuery, 120)}
                  </p>
                )}

                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline mt-3"
                  >
                    Open source <ExternalLink size={12} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} className="text-emerald-300 mt-0.5" />
          <div>
            <p className="text-sm text-amber-300">
              {mapData.disclaimer || "Results are derived from available public-source signals and regional inference. Do not interpret as real-time or exact geolocation."}
            </p>
            <p className="text-xs text-muted mt-2 leading-relaxed">
              Exact GPS tracking, live location grabbing, or deceptive IP collection is not used. This map visualizes public-source clues such as profile locations, page text, public search snippets, explicit coordinates, city/country mentions, and backend map endpoint results.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}