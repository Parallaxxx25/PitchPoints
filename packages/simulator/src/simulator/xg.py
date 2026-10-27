"""Expected-goals model."""

import math

from contracts import PITCH_LENGTH, PITCH_WIDTH

GOAL_X, GOAL_Y = PITCH_LENGTH, PITCH_WIDTH / 2


def expected_goals(x: float, y: float) -> float:
    """Simple distance + angle xG model (from the attacker's perspective)."""
    dist = math.hypot(GOAL_X - x, GOAL_Y - y)
    angle_factor = 1.0 - min(abs(y - GOAL_Y) / 40.0, 0.85)
    return max(0.01, min(0.8, 0.9 * math.exp(-0.14 * dist) * angle_factor))
