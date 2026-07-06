"""Behaviour Analysis Agent
Computes posting-behaviour signals from timestamped posts. Fully deterministic
statistics (no AI) so every number is explainable to a reviewer / in court.

Outputs:
  - posts_per_week        : activity volume
  - hour_histogram[24]    : posts per hour-of-day (drives the activity chart)
  - active_window         : peak contiguous posting window, e.g. "21:00-02:00"
  - pattern_label         : Night Owl / Early Bird / Working Hours / Mixed
  - day_histogram[7]      : posts per weekday (Mon..Sun)
  - spikes                : days where post count > 2x daily mean
  - first_seen / last_seen
"""
from collections import Counter
from datetime import datetime

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _parse(ts: str):
    try:
        return datetime.fromisoformat(ts)
    except (ValueError, TypeError):
        return None


def analyze_behaviour(posts: list[dict]) -> dict:
    times = [_parse(p.get("timestamp")) for p in posts]
    times = [t for t in times if t]

    if not times:
        return {
            "post_count": 0, "posts_per_week": 0, "hour_histogram": [0] * 24,
            "active_window": None, "pattern_label": "No activity",
            "day_histogram": [0] * 7, "spikes": [], "first_seen": None, "last_seen": None,
        }

    times.sort()
    hour_hist = [0] * 24
    day_hist = [0] * 7
    per_day = Counter()

    for t in times:
        hour_hist[t.hour] += 1
        day_hist[t.weekday()] += 1
        per_day[t.date().isoformat()] += 1

    span_days = max((times[-1] - times[0]).days, 1)
    posts_per_week = round(len(times) / span_days * 7, 1)

    # Peak 6-hour window (wraps past midnight) to label chronotype.
    best_start, best_sum = 0, -1
    for start in range(24):
        window = sum(hour_hist[(start + i) % 24] for i in range(6))
        if window > best_sum:
            best_sum, best_start = window, start
    active_window = f"{best_start:02d}:00-{(best_start + 6) % 24:02d}:00"

    if best_start >= 20 or best_start <= 3:
        pattern = "Night Owl"
    elif 4 <= best_start <= 9:
        pattern = "Early Bird"
    elif 10 <= best_start <= 16:
        pattern = "Working Hours"
    else:
        pattern = "Evening Active"

    mean_daily = sum(per_day.values()) / max(len(per_day), 1)
    spikes = [{"date": d, "count": c} for d, c in per_day.items() if c > 2 * mean_daily and c >= 2]

    return {
        "post_count": len(times),
        "posts_per_week": posts_per_week,
        "hour_histogram": hour_hist,
        "active_window": active_window,
        "pattern_label": pattern,
        "day_histogram": day_hist,
        "day_labels": WEEKDAYS,
        "spikes": spikes,
        "first_seen": times[0].isoformat(),
        "last_seen": times[-1].isoformat(),
    }
