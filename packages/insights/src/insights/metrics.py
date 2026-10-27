"""Pure metric formulas. Their constants and documentation live in `insights.constants`."""

import math

from contracts import MatchEvent, WinProbability
from insights import constants as c


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def in_final_third(x: float) -> bool:
    return x >= c.FINAL_THIRD_X


def in_box(x: float, y: float) -> bool:
    return x >= c.BOX_X and c.BOX_Y_MIN <= y <= c.BOX_Y_MAX


def pass_length(e: MatchEvent) -> float:
    """Straight-line length of a pass or carry in metres."""
    return math.hypot((e.end_x or 0.0) - (e.x or 0.0), (e.end_y or 0.0) - (e.y or 0.0))


def pass_difficulty(e: MatchEvent) -> float:
    """0 to 100 difficulty rating of a pass from length, pressure, progress, destination, and cross."""
    end_x, end_y = e.end_x or 0.0, e.end_y or 0.0
    progress = end_x - (e.x or 0.0)
    score = (
        c.PASS_LENGTH_W * min(pass_length(e) / c.PASS_LENGTH_REF_M, 1.0)
        + c.PASS_PRESSURE_W * bool(e.under_pressure)
        + c.PASS_PROGRESS_W * clamp(progress / c.PASS_PROGRESS_REF_M, 0.0, 1.0)
        + c.PASS_FINAL_THIRD_W * in_final_third(end_x)
        + c.PASS_BOX_W * in_box(end_x, end_y)
        + c.PASS_CROSS_W * bool(e.cross)
    )
    return round(score, 1)


def momentum(home_actions: int, away_actions: int) -> float:
    """-100 (away on top) to +100 (home on top) from final-third action counts."""
    total = home_actions + away_actions
    return 100.0 * (home_actions - away_actions) / total if total else 0.0


def control_chaos(accuracy: float | None, turnovers_per_min: float, fouls_per_min: float) -> float:
    """-100 (chaos) to +100 (control); no passes leaves accuracy neutral."""
    a = 0.0
    if accuracy is not None:
        a = clamp((accuracy - c.CONTROL_ACCURACY_REF) / c.CONTROL_ACCURACY_SCALE, -1.0, 1.0)
    t = clamp((c.CONTROL_TURNOVERS_REF - turnovers_per_min) / c.CONTROL_TURNOVERS_SCALE, -1.0, 1.0)
    f = clamp((c.CONTROL_FOULS_REF - fouls_per_min) / c.CONTROL_FOULS_SCALE, -1.0, 1.0)
    return 100.0 * (c.CONTROL_ACCURACY_W * a + c.CONTROL_TURNOVER_W * t + c.CONTROL_FOUL_W * f)


def goal_rate(recent_xg: float, own_reds: int, opponent_reds: int) -> float:
    """Expected goals per minute for one team from the base rate, recent xG, and red cards."""
    rate = (1 - c.RECENT_XG_W) * c.BASE_GOALS_PER_90 / 90 + c.RECENT_XG_W * recent_xg / (
        c.XG_WINDOW_S / 60
    )
    return rate * c.RED_CARD_OWN_FACTOR**own_reds * c.RED_CARD_OPPONENT_FACTOR**opponent_reds


def _poisson(mean: float) -> list[float]:
    return [math.exp(-mean) * mean**k / math.factorial(k) for k in range(c.MAX_GOALS + 1)]


def win_probability(
    goals_home: int, goals_away: int, rate_home: float, rate_away: float, minutes_left: float
) -> WinProbability:
    """Home, draw, and away probabilities with remaining goals Poisson-distributed per team."""
    minutes = max(minutes_left, c.MIN_MINUTES_LEFT)
    home = draw = away = 0.0
    for i, p in enumerate(_poisson(rate_home * minutes)):
        for j, q in enumerate(_poisson(rate_away * minutes)):
            margin = goals_home + i - goals_away - j
            if margin > 0:
                home += p * q
            elif margin < 0:
                away += p * q
            else:
                draw += p * q
    total = home + draw + away
    return WinProbability(
        home=round(home / total, 3), draw=round(draw / total, 3), away=round(away / total, 3)
    )


def swing(before: WinProbability, after: WinProbability) -> float:
    """Half the summed absolute change in home, draw, and away probabilities (0 to 1)."""
    return 0.5 * (
        abs(after.home - before.home)
        + abs(after.draw - before.draw)
        + abs(after.away - before.away)
    )
