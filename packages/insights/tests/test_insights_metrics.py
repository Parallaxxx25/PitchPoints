"""Pure metric formulas: pass difficulty, momentum, control vs chaos, win probability."""

import pytest

from contracts import WinProbability
from contracts.testing import MatchBuilder
from insights import constants as c
from insights.metrics import (
    control_chaos,
    goal_rate,
    momentum,
    pass_difficulty,
    swing,
    win_probability,
)


def test_short_square_pass_is_easy() -> None:
    e = MatchBuilder().add("pass", "HOM-6", x=40.0, y=30.0, end_x=40.0, end_y=40.0)
    assert pass_difficulty(e) == pytest.approx(c.PASS_LENGTH_W * 10 / c.PASS_LENGTH_REF_M)


def test_long_pressured_cross_into_the_box_is_hardest() -> None:
    e = MatchBuilder().add(
        "pass", "HOM-6", x=50.0, y=5.0, end_x=95.0, end_y=34.0, under_pressure=True, cross=True
    )
    assert pass_difficulty(e) == 100.0


def test_backward_pass_earns_no_progress() -> None:
    forward = MatchBuilder().add("pass", "HOM-6", x=30.0, y=34.0, end_x=40.0, end_y=34.0)
    back = MatchBuilder().add("pass", "HOM-6", x=40.0, y=34.0, end_x=30.0, end_y=34.0)
    assert pass_difficulty(forward) - pass_difficulty(back) == pytest.approx(
        c.PASS_PROGRESS_W * 10 / c.PASS_PROGRESS_REF_M
    )


@pytest.mark.parametrize(
    ("home", "away", "expected"), [(10, 0, 100.0), (0, 0, 0.0), (3, 1, 50.0), (1, 3, -50.0)]
)
def test_momentum(home: int, away: int, expected: float) -> None:
    assert momentum(home, away) == expected


def test_control_chaos_is_neutral_at_reference_values() -> None:
    neutral = control_chaos(c.CONTROL_ACCURACY_REF, c.CONTROL_TURNOVERS_REF, c.CONTROL_FOULS_REF)
    assert neutral == pytest.approx(0.0)
    assert control_chaos(None, c.CONTROL_TURNOVERS_REF, c.CONTROL_FOULS_REF) == pytest.approx(0.0)


def test_control_chaos_spans_minus_to_plus_one_hundred() -> None:
    assert control_chaos(1.0, 0.0, 0.0) == pytest.approx(100.0)
    assert control_chaos(0.5, 6.0, 2.0) == pytest.approx(-100.0)


def test_red_cards_lower_a_team_rate_and_raise_the_opponents() -> None:
    assert goal_rate(0.5, 1, 0) < goal_rate(0.5, 0, 0) < goal_rate(0.5, 0, 1)


def test_more_recent_xg_means_a_higher_goal_rate() -> None:
    assert goal_rate(1.0, 0, 0) > goal_rate(0.0, 0, 0)


def test_level_teams_at_kickoff_are_symmetric() -> None:
    rate = goal_rate(0.0, 0, 0)
    wp = win_probability(0, 0, rate, rate, 90)
    assert wp.home == wp.away and 0.2 < wp.draw < 0.4
    assert wp.home + wp.draw + wp.away == pytest.approx(1.0, abs=0.002)


def test_a_late_lead_is_nearly_decisive() -> None:
    rate = goal_rate(0.0, 0, 0)
    assert win_probability(1, 0, rate, rate, 2).home > 0.95
    assert win_probability(1, 0, rate, rate, 0).home > 0.97  # stoppage time keeps a minute open


def test_swing_is_half_the_total_change() -> None:
    a = WinProbability(home=0.4, draw=0.3, away=0.3)
    b = WinProbability(home=0.8, draw=0.15, away=0.05)
    assert swing(a, a) == 0.0
    assert swing(a, b) == pytest.approx(0.4)
