"""Approximate ball and player positions every 2 seconds, derived from the event stream.

Frames never influence events: they are computed after the match from its events
with their own seeded random generator. Each player moves toward a target (their
formation slot shifted with the ball; the carrier and the nearest defender go to
the ball) with jog noise and a sprint-speed cap. Coordinates are in the home
team's perspective.
"""

import math
import random

from contracts import PITCH_LENGTH, PITCH_WIDTH, MatchEvent, Period, PlayerPosition, PositionFrame
from simulator.teams import Team

FRAME_INTERVAL_S = 2.0
GAIN = 0.5  # share of the gap to the target closed each frame
JOG_M = 1.75  # off-ball movement noise per axis per frame, metres

Point = tuple[float, float]


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def position_frames(
    events: list[MatchEvent], home: Team, away: Team, rng: random.Random
) -> list[PositionFrame]:
    """Frames for both halves of a played match (teams as they were at kickoff)."""
    players = {p.id: p for t in (home, away) for p in (*t.starters, *t.bench)}
    base: dict[str, Point] = {
        p.id: (p.base_x, p.base_y) for t in (home, away) for p in t.starters[:11]
    }
    lineup = {t.id: [p.id for p in t.starters[:11]] for t in (home, away)}
    possession: str | None = None
    carrier: str | None = None
    frames: list[PositionFrame] = []

    periods: tuple[Period, ...] = (1, 2)
    for period in periods:
        evs = [e for e in events if e.period == period]
        keys = [(e.clock_s, *_home_view(e, home.id)) for e in evs if e.x is not None]
        pos = {
            pid: base[pid] for ids in lineup.values() for pid in ids
        }  # back to shape for kickoff
        i = k = 0
        t = evs[0].clock_s
        while t <= evs[-1].clock_s:
            while i < len(evs) and evs[i].clock_s <= t:
                e = evs[i]
                i += 1
                if e.type == "substitution" and e.player_id and e.player_in_id:
                    ids = lineup[e.team_id]
                    ids[ids.index(e.player_id)] = e.player_in_id
                    base[e.player_in_id], pos[e.player_in_id] = base[e.player_id], pos[e.player_id]
                elif e.type == "card" and e.card != "yellow" and e.player_id:
                    lineup[e.team_id].remove(e.player_id)
                if e.type == "possession_change":
                    possession = e.team_id
                if e.type == "pass" and e.outcome == "complete":
                    carrier = e.recipient_id
                elif e.team_id == possession and e.player_id:
                    carrier = e.player_id
            while k + 1 < len(keys) and keys[k + 1][0] <= t:
                k += 1
            bx, by = _ball_at(keys, k, t)

            out: list[PlayerPosition] = []
            for team in (home, away):
                flipped = team is away
                tbx, tby = (PITCH_LENGTH - bx, PITCH_WIDTH - by) if flipped else (bx, by)
                attacking = team.id == possession
                ids = lineup[team.id]
                outfield = [pid for pid in ids if players[pid].position != "GK"]
                presser = (
                    None
                    if attacking
                    else min(outfield, key=lambda pid: math.dist(pos[pid], (tbx, tby)))
                )
                for pid in ids:
                    player, (bx0, by0) = players[pid], base[pid]
                    if pid in (carrier, presser):
                        tx, ty = tbx, tby
                    elif player.position == "GK":
                        tx, ty = clamp(bx0 + (tbx - 52.5) * 0.1, 1, 20), 34 + (tby - 34) * 0.2
                    else:
                        tx = bx0 + (tbx - 52.5) * 0.5 + (6 if attacking else -4)
                        ty = by0 + (tby - 34) * 0.3
                    px, py = pos[pid]
                    dx = (tx - px) * GAIN + rng.gauss(0, JOG_M)
                    dy = (ty - py) * GAIN + rng.gauss(0, JOG_M)
                    step = math.hypot(dx, dy)
                    cap = player.top_speed_kmh / 3.6 * FRAME_INTERVAL_S
                    if step > cap:
                        dx, dy = dx * cap / step, dy * cap / step
                    nx, ny = clamp(px + dx, 0, PITCH_LENGTH), clamp(py + dy, 0, PITCH_WIDTH)
                    pos[pid] = nx, ny
                    hx, hy = (PITCH_LENGTH - nx, PITCH_WIDTH - ny) if flipped else (nx, ny)
                    speed = math.hypot(nx - px, ny - py) / FRAME_INTERVAL_S * 3.6
                    out.append(
                        PlayerPosition(
                            player_id=pid, x=round(hx, 1), y=round(hy, 1), speed_kmh=round(speed, 1)
                        )
                    )
            frames.append(
                PositionFrame(
                    match_id=evs[0].match_id,
                    period=period,
                    clock_s=round(t, 1),
                    ball_x=round(bx, 1),
                    ball_y=round(by, 1),
                    players=out,
                )
            )
            t += FRAME_INTERVAL_S
    return frames


def _home_view(e: MatchEvent, home_id: str) -> Point:
    x, y = e.x or 0.0, e.y or 0.0
    return (x, y) if e.team_id == home_id else (PITCH_LENGTH - x, PITCH_WIDTH - y)


def _ball_at(keys: list[tuple[float, float, float]], k: int, t: float) -> Point:
    """Ball position at `t`, linearly interpolated between event locations."""
    c0, x0, y0 = keys[k]
    if k + 1 < len(keys) and (c1 := keys[k + 1][0]) > c0:
        f = clamp((t - c0) / (c1 - c0), 0.0, 1.0)
        return x0 + (keys[k + 1][1] - x0) * f, y0 + (keys[k + 1][2] - y0) * f
    return x0, y0
