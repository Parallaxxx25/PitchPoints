"""Contracts produced by the insights engine: stats, tactical state, key moments, overlay cues.

Every key moment and overlay cue names the events it came from, so any number
can be traced back and replayed on the pitch.
"""

from typing import Literal

from pydantic import Field

from contracts.match import Contract, Period

FactValue = str | int | float | bool
Facts = dict[str, FactValue]


class TeamStats(Contract):
    """One team's match totals. Shares (possession, pass accuracy, field tilt) are 0 to 1."""

    team_id: str
    goals: int
    possession: float
    passes: int
    pass_accuracy: float
    shots: int
    shots_on_target: int
    xg: float
    field_tilt: float
    pressures: int
    ppda: float | None  # opponent passes allowed per defensive action; null before any action
    corners: int
    fouls: int
    yellow_cards: int
    red_cards: int


class PlayerStats(Contract):
    """One player's match totals; distance and top speed come from position frames."""

    player_id: str
    team_id: str
    minutes: int
    passes: int
    pass_accuracy: float
    avg_pass_difficulty: float
    distance_km: float
    top_speed_kmh: float
    shots: int
    shots_on_target: int
    goals: int
    assists: int
    xg: float
    defensive_actions: int
    pressures: int


class StatSnapshot(Contract):
    """Match stats up to and including `last_event_id`; players who have not appeared are omitted."""

    match_id: str
    period: Period
    clock_s: float
    minute: int
    last_event_id: int
    home: TeamStats
    away: TeamStats
    players: list[PlayerStats]


class WinProbability(Contract):
    home: float
    draw: float
    away: float


class TeamPair(Contract):
    home: float
    away: float


class TacticalState(Contract):
    """Rolling-window tactical indices; windows and formulas live in `insights.constants`."""

    match_id: str
    period: Period
    clock_s: float
    minute: int
    last_event_id: int
    momentum: float  # -100 (away on top) to +100 (home on top)
    control_chaos_index: float  # -100 (chaos) to +100 (control)
    pressing_intensity: TeamPair  # pressures per opponent possession
    tempo: float  # passes per minute, both teams
    win_probability: WinProbability


MomentKind = Literal[
    "goal", "big_chance", "save", "card", "momentum_swing", "pressure_spell", "milestone"
]


class KeyMoment(Contract):
    """A moment worth explaining. `importance` (0 to 1) is the win-probability swing it caused,
    or the kind's base importance when that is larger. `facts` holds every number an agent
    may quote about it."""

    id: int
    match_id: str
    period: Period
    clock_s: float
    minute: int
    kind: MomentKind
    importance: float
    team_id: str
    player_ids: list[str]
    facts: Facts
    source_event_ids: list[int] = Field(min_length=1)


CueTemplate = Literal[
    "player_tag",
    "pass_quality",
    "shot_speed",
    "momentum_bar",
    "key_moment",
    "stat_compare",
    "recap_card",
]


class OverlayCue(Contract):
    """A timed broadcast graphic. Timing and `data` come from the insights engine; `text`
    (language code to text) is filled later by templates or fact-checked agents."""

    id: int
    match_id: str
    period: Period
    start_clock_s: float
    duration_s: float
    template: CueTemplate
    priority: int  # higher wins when cues overlap
    anchor_player_id: str | None = None
    data: Facts
    text: dict[str, str] = Field(default_factory=dict)
    source_moment_ids: list[int] = Field(default_factory=list)
    source_event_ids: list[int] = Field(min_length=1)
