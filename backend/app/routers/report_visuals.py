"""Vector visuals for the TraceNet PDF report.

Everything here is drawn with reportlab.graphics primitives so the PDF stays
self-contained (no external image files, no network fetches). Provides:

  - tool_icon(name)          -> a small Drawing badge for a known tool/platform
  - source_bar_chart(data)   -> horizontal-ish bar chart of source counts
  - actor_donut(data)        -> donut chart of Apify actor usage
  - confidence_gauge(pct)    -> semicircular confidence gauge

Colors intentionally match the cyan/slate theme used by the web UI.
"""
from __future__ import annotations

from reportlab.graphics.shapes import Drawing, Rect, Circle, String, Line, Polygon, Wedge, Group
from reportlab.graphics.charts.barcharts import HorizontalBarChart
from reportlab.graphics.charts.piecharts import Pie
from reportlab.lib import colors

CYAN = colors.HexColor("#22d3ee")
CYAN_DK = colors.HexColor("#0891b2")
INK = colors.HexColor("#0f172a")
SLATE = colors.HexColor("#334155")
MUTED = colors.HexColor("#64748b")

# Brand-ish colors for tool badges (kept close to the frontend APP_META palette)
TOOL_COLORS = {
    "instagram": colors.HexColor("#ec4899"),
    "linkedin": colors.HexColor("#0ea5e9"),
    "github": colors.HexColor("#334155"),
    "twitter": colors.HexColor("#38bdf8"),
    "x": colors.HexColor("#38bdf8"),
    "telegram": colors.HexColor("#22d3ee"),
    "facebook": colors.HexColor("#3b82f6"),
    "reddit": colors.HexColor("#f97316"),
    "youtube": colors.HexColor("#ef4444"),
    "tiktok": colors.HexColor("#a78bfa"),
    "whatsapp": colors.HexColor("#22c55e"),
    "google": colors.HexColor("#fbbf24"),
    "apify": colors.HexColor("#97c93d"),
    "maigret": colors.HexColor("#8b5cf6"),
    "web": colors.HexColor("#06b6d4"),
    "email": colors.HexColor("#38bdf8"),
    "phone": colors.HexColor("#22c55e"),
    "ip": colors.HexColor("#f59e0b"),
    "domain": colors.HexColor("#a78bfa"),
    "whois": colors.HexColor("#a78bfa"),
    "default": colors.HexColor("#22d3ee"),
}

# A single glyph letter used inside the badge (kept simple + font-safe).
TOOL_GLYPH = {
    "instagram": "IG", "linkedin": "in", "github": "GH", "twitter": "X", "x": "X",
    "telegram": "TG", "facebook": "f", "reddit": "R", "youtube": "YT",
    "tiktok": "TT", "whatsapp": "WA", "google": "G", "apify": "AP",
    "maigret": "M", "web": "WEB", "email": "@", "phone": "#", "ip": "IP",
    "domain": "DN", "whois": "WI",
}

_ALIASES = [
    ("instagram", "instagram"), ("linkedin", "linkedin"), ("github", "github"),
    ("twitter", "twitter"), ("x (twitter)", "twitter"), ("x.com", "twitter"),
    ("telegram", "telegram"), ("t.me", "telegram"), ("facebook", "facebook"),
    ("reddit", "reddit"), ("youtube", "youtube"), ("tiktok", "tiktok"),
    ("whatsapp", "whatsapp"), ("google", "google"), ("maigret", "maigret"),
    ("web-scraper", "web"), ("web scraper", "web"), ("contact", "email"),
    ("email", "email"), ("phone", "phone"), ("whois", "whois"),
    ("domain", "domain"), ("ip", "ip"), ("apify", "apify"),
]


def tool_key(name: str) -> str:
    low = (name or "").lower()
    for needle, key in _ALIASES:
        if needle in low:
            return key
    return "default"


def tool_icon(name: str, size: int = 20) -> Drawing:
    """Return a small rounded-square badge Drawing for a tool/platform name."""
    key = tool_key(name)
    color = TOOL_COLORS.get(key, TOOL_COLORS["default"])
    glyph = TOOL_GLYPH.get(key, (name or "?")[:2].upper())

    d = Drawing(size, size)
    d.add(Rect(0, 0, size, size, rx=size * 0.28, ry=size * 0.28,
               fillColor=colors.Color(color.red, color.green, color.blue, alpha=0.16),
               strokeColor=color, strokeWidth=1.1))
    fs = size * 0.42 if len(glyph) <= 2 else size * 0.30
    d.add(String(size / 2, size / 2 - fs * 0.36, glyph,
                 fontName="Helvetica-Bold", fontSize=fs, fillColor=color,
                 textAnchor="middle"))
    return d


def source_bar_chart(data: list[tuple[str, int]], width: int = 460, height: int = 190) -> Drawing:
    """Horizontal bar chart of top source counts."""
    data = [(str(k)[:26], int(v)) for k, v in data][:8]
    if not data:
        data = [("no data", 0)]

    d = Drawing(width, height)
    chart = HorizontalBarChart()
    chart.x = 120
    chart.y = 12
    chart.width = width - 150
    chart.height = height - 30
    chart.data = [[v for _, v in data]]
    chart.categoryAxis.categoryNames = [k for k, _ in data]
    chart.categoryAxis.labels.fontName = "Helvetica"
    chart.categoryAxis.labels.fontSize = 8
    chart.categoryAxis.labels.fillColor = SLATE
    chart.categoryAxis.labels.boxAnchor = "e"
    chart.categoryAxis.labels.dx = -4
    chart.valueAxis.valueMin = 0
    chart.valueAxis.labels.fontName = "Helvetica"
    chart.valueAxis.labels.fontSize = 7
    chart.valueAxis.labels.fillColor = MUTED
    chart.bars[0].fillColor = CYAN
    chart.bars[0].strokeColor = CYAN_DK
    chart.barWidth = 9
    chart.groupSpacing = 6
    d.add(chart)
    return d


def actor_donut(data: list[tuple[str, int]], width: int = 250, height: int = 190) -> Drawing:
    """Donut chart of Apify actor usage with a small legend."""
    data = [(str(k).split("/")[-1][:18], int(v)) for k, v in data if int(v) > 0][:6]
    d = Drawing(width, height)
    if not data:
        d.add(String(width / 2, height / 2, "No actor data",
                     fontName="Helvetica", fontSize=9, fillColor=MUTED, textAnchor="middle"))
        return d

    palette = [CYAN, colors.HexColor("#a78bfa"), colors.HexColor("#22c55e"),
               colors.HexColor("#f59e0b"), colors.HexColor("#ef4444"), colors.HexColor("#38bdf8")]

    pie = Pie()
    pie.x = 20
    pie.y = 30
    pie.width = 120
    pie.height = 120
    pie.data = [v for _, v in data]
    pie.innerRadiusFraction = 0.55
    pie.slices.strokeColor = INK
    pie.slices.strokeWidth = 1
    for i in range(len(data)):
        pie.slices[i].fillColor = palette[i % len(palette)]
    d.add(pie)

    # legend
    ly = height - 22
    for i, (label, value) in enumerate(data):
        d.add(Rect(150, ly - i * 20, 9, 9, fillColor=palette[i % len(palette)], strokeColor=None))
        d.add(String(163, ly - i * 20 + 1, f"{label} ({value})",
                     fontName="Helvetica", fontSize=8, fillColor=SLATE))
    return d


def confidence_gauge(pct: int, width: int = 210, height: int = 130) -> Drawing:
    """Semicircular gauge showing cluster / best confidence."""
    pct = max(0, min(100, int(pct or 0)))
    d = Drawing(width, height)
    cx, cy, r = width / 2, 30, 70

    if pct >= 75:
        arc_color = colors.HexColor("#22c55e")
    elif pct >= 45:
        arc_color = colors.HexColor("#f59e0b")
    else:
        arc_color = colors.HexColor("#ef4444")

    # track
    d.add(Wedge(cx, cy, r, 0, 180, yradius=r, fillColor=None,
                strokeColor=colors.HexColor("#1e293b"), strokeWidth=12))
    # value arc (180 deg = 0%, 0 deg = 100%)
    end_angle = 180 - (pct / 100.0) * 180
    d.add(Wedge(cx, cy, r, end_angle, 180, yradius=r, fillColor=None,
                strokeColor=arc_color, strokeWidth=12))

    d.add(String(cx, cy + 8, f"{pct}%", fontName="Helvetica-Bold", fontSize=26,
                 fillColor=arc_color, textAnchor="middle"))
    d.add(String(cx, cy - 12, "confidence", fontName="Helvetica", fontSize=8,
                 fillColor=MUTED, textAnchor="middle"))
    return d
