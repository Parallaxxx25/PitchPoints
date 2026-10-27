"""Realism report: per-match averages over many seeds, checked against agreed ranges."""

import os
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor

from simulator import simulate
from simulator.positions import FRAME_INTERVAL_S

RANGES: dict[str, tuple[float, float]] = {
    "goals": (2.3, 3.5),
    "shots": (20, 32),
    "pass_accuracy": (0.78, 0.90),
    "yellows": (2.5, 5),
    "pressures": (120, 220),
    "distance_km": (9, 12.5),
    "top_speed_kmh": (28, 36),
}
"""Agreed per-match ranges (both teams combined; physical metrics per full-match outfield player)."""


def match_stats(seed: int) -> dict[str, float]:
    """Headline stats for one simulated match."""
    m = simulate(seed)
    types = Counter(e.type for e in m.events)
    shots = [e for e in m.events if e.type == "shot"]
    passes = [e for e in m.events if e.type == "pass"]
    cards = Counter(e.card for e in m.events if e.type == "card")

    distance: defaultdict[str, float] = defaultdict(float)
    top: defaultdict[str, float] = defaultdict(float)
    frames_on: Counter[str] = Counter()
    for frame in m.frames:
        for p in frame.players:
            distance[p.player_id] += p.speed_kmh / 3.6 * FRAME_INTERVAL_S
            top[p.player_id] = max(top[p.player_id], p.speed_kmh)
            frames_on[p.player_id] += 1
    keepers = {
        p.id
        for side in (m.metadata.home, m.metadata.away)
        for p in side.starters
        if p.position == "GK"
    }
    full = [pid for pid, n in frames_on.items() if n == len(m.frames) and pid not in keepers]

    return {
        "goals": types["goal"] + types["own_goal"],
        "shots": len(shots),
        "shots_on_target": sum(e.outcome in ("goal", "saved") for e in shots),
        "xg": sum(e.xg or 0.0 for e in shots),
        "passes": len(passes),
        "pass_accuracy": sum(e.outcome == "complete" for e in passes) / max(1, len(passes)),
        "pressures": types["pressure"],
        "tackles": types["tackle"],
        "interceptions": types["interception"],
        "clearances": types["clearance"],
        "corners": types["corner"],
        "saves": types["save"],
        "penalties": types["penalty_won"],
        "own_goals": types["own_goal"],
        "yellows": cards["yellow"] + cards["second_yellow"],
        "reds": cards["red"] + cards["second_yellow"],
        "distance_km": sum(distance[p] for p in full) / len(full) / 1000,
        "top_speed_kmh": sum(top[p] for p in full) / len(full),
    }


def realism(n: int) -> dict[str, float]:
    """Average `match_stats` over seeds 0..n-1, using every CPU core."""
    # Capped: spawning 20+ workers at once intermittently fails on Windows (WinError 1450).
    with ProcessPoolExecutor(max_workers=min(8, os.cpu_count() or 1)) as pool:
        per_match = list(pool.map(match_stats, range(n), chunksize=8))
    return {k: sum(s[k] for s in per_match) / n for k in per_match[0]}


def out_of_range(averages: dict[str, float]) -> list[str]:
    """Names of metrics outside their agreed range."""
    return [k for k, (lo, hi) in RANGES.items() if not lo <= averages[k] <= hi]


def report(averages: dict[str, float], n: int) -> str:
    """Human-readable realism report."""
    lines = [f"Averages per match over {n} simulated matches (both teams combined):"]
    for k, v in averages.items():
        value = f"{v:6.1%}" if k == "pass_accuracy" else f"{v:6.2f}"
        rng = RANGES.get(k)
        check = (
            ""
            if rng is None
            else f"  [{rng[0]:g} to {rng[1]:g}] " + ("ok" if rng[0] <= v <= rng[1] else "OUT")
        )
        lines.append(f"  {k:<16} {value}{check}")
    return "\n".join(lines)
