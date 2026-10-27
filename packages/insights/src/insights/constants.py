"""Every insight threshold and weight, with the formula it feeds.

Coordinates are in the acting team's perspective: attacking left to right on a
105 x 68 pitch. Rolling windows use played time, stoppage time included.
Reference values were calibrated on simulated matches (`--validate`).
"""

from contracts import CueTemplate, MomentKind

# ---------- pitch zones ----------
FINAL_THIRD_X = 70.0  # an action at x >= this is in the final third
BOX_X = 88.5  # the penalty box is x >= BOX_X and BOX_Y_MIN <= y <= BOX_Y_MAX
BOX_Y_MIN = 13.84
BOX_Y_MAX = 54.16

# ---------- possession ----------
# Possession is each team's share of in-play time, split at `possession_change` events.
MAX_IN_PLAY_GAP_S = 7.0  # an event gap longer than this includes a stoppage; only this much counts

# ---------- pass difficulty (0 to 100) ----------
# difficulty = LENGTH_W * min(length / LENGTH_REF_M, 1) + PRESSURE_W * under_pressure
#            + PROGRESS_W * clamp(forward metres / PROGRESS_REF_M, 0, 1)
#            + FINAL_THIRD_W * ends in final third + BOX_W * ends in box + CROSS_W * cross
PASS_LENGTH_W = 30.0
PASS_LENGTH_REF_M = 40.0
PASS_PRESSURE_W = 20.0
PASS_PROGRESS_W = 20.0
PASS_PROGRESS_REF_M = 25.0
PASS_FINAL_THIRD_W = 10.0
PASS_BOX_W = 10.0
PASS_CROSS_W = 10.0

# ---------- player defending ----------
DEFENSIVE_ACTIONS = ("tackle", "interception", "clearance", "block", "ball_recovery")

# ---------- pressing ----------
# PPDA = opponent passes in their own 60% / defensive actions (tackle, interception, foul)
# at x >= PPDA_ZONE_X. Pressing intensity = pressures per opponent possession in the window.
PPDA_ZONE_X = 42.0
PPDA_ACTIONS = ("tackle", "interception", "foul")

# ---------- rolling windows ----------
WINDOW_S = 5 * 60.0  # momentum, tempo, pressing intensity, control vs chaos
MIN_WINDOW_S = 60.0  # rates divide by at least this much time, so early values stay sane

# Momentum = 100 * (home - away) / (home + away) over final-third passes, carries, and shots
# in the window, from -100 (away on top) to +100 (home on top). Field tilt is the
# whole-match share of those actions.
MOMENTUM_ACTIONS = ("pass", "carry", "shot")

# ---------- control vs chaos (-100 chaos to +100 control) ----------
# index = 100 * (ACCURACY_W * a + TURNOVER_W * t + FOUL_W * f), each part clamped to [-1, 1]:
#   a = (window pass accuracy - ACCURACY_REF) / ACCURACY_SCALE
#   t = (TURNOVERS_REF - possession changes per minute) / TURNOVERS_SCALE
#   f = (FOULS_REF - fouls per minute) / FOULS_SCALE
CONTROL_ACCURACY_W = 0.4
CONTROL_ACCURACY_REF = 0.82
CONTROL_ACCURACY_SCALE = 0.07
CONTROL_TURNOVER_W = 0.4
CONTROL_TURNOVERS_REF = 2.2
CONTROL_TURNOVERS_SCALE = 0.7
CONTROL_FOUL_W = 0.2
CONTROL_FOULS_REF = 0.2
CONTROL_FOULS_SCALE = 0.2

# ---------- win probability ----------
# Each team's remaining goals ~ Poisson(rate * minutes left), with rate per minute =
# (1 - RECENT_XG_W) * BASE_GOALS_PER_90 / 90 + RECENT_XG_W * (xG in the last XG_WINDOW_S) / 15,
# times RED_CARD_OWN_FACTOR per own player sent off and RED_CARD_OPPONENT_FACTOR per
# opponent sent off. Minutes left use the nominal clock, never below MIN_MINUTES_LEFT.
BASE_GOALS_PER_90 = 1.4
RECENT_XG_W = 0.5
XG_WINDOW_S = 15 * 60.0
RED_CARD_OWN_FACTOR = 0.7
RED_CARD_OPPONENT_FACTOR = 1.2
MIN_MINUTES_LEFT = 1.0
MAX_GOALS = 10  # Poisson tail cut-off per team

# ---------- key moments ----------
# importance = max(win-probability swing, BASE_IMPORTANCE[kind]); the swing is half the
# summed absolute change in home, draw, and away probabilities.
BASE_IMPORTANCE: dict[MomentKind, float] = {
    "goal": 0.15,
    "big_chance": 0.08,
    "save": 0.08,
    "card": 0.04,
    "momentum_swing": 0.06,
    "pressure_spell": 0.05,
    "milestone": 0.03,
}
BIG_CHANCE_XG = 0.3  # an unsaved, unscored shot at or above this xG is a big chance
BIG_SAVE_XG = 0.15  # a save from a shot at or above this xG is a key moment
MOMENTUM_SWING = 60.0  # |momentum| at or above this puts a team on top; a change of team is a swing
MOMENTUM_MIN_ACTIONS = 12  # final-third actions needed in the window before momentum counts
PRESSURE_SPELL_COUNT = 8  # pressures by one team within PRESSURE_SPELL_WINDOW_S
PRESSURE_SPELL_WINDOW_S = 3 * 60.0

# ---------- milestones ----------
PASS_MILESTONE = 80  # a player's 80th pass
DISTANCE_MILESTONE_KM = 11.0
TOP_SPEED_TAG_KMH = 33.0  # the first time a player reaches this speed
CLEAN_SHEET_MINUTE = 80  # a team that has not conceded by this nominal minute
TEAM_SHOTS_MILESTONE = 10

# ---------- overlay cues ----------
CUE_TIMING: dict[CueTemplate, tuple[float, int]] = {  # template: (duration_s, priority)
    "key_moment": (8.0, 90),
    "recap_card": (20.0, 80),
    "stat_compare": (15.0, 70),
    "momentum_bar": (8.0, 50),
    "player_tag": (6.0, 40),
    "shot_speed": (5.0, 30),
    "pass_quality": (5.0, 20),
}
STAT_COMPARE_FIELDS = (  # team stats on half-time and full-time comparison cards
    "goals",
    "possession",
    "shots",
    "shots_on_target",
    "xg",
    "passes",
    "pass_accuracy",
    "field_tilt",
)
PASS_QUALITY_CUE_MIN = 70.0  # difficulty of a completed pass that earns a cue
PASS_QUALITY_CUE_GAP_S = 120.0  # at most one pass-quality cue per this much played time
RECAP_TOP_MOMENTS = 3  # moments named on a recap card
