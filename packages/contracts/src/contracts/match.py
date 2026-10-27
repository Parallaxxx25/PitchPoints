"""Contracts emitted by the match simulator: metadata, events, and position frames.

Coordinates are metres on a 105 x 68 pitch. Events use the acting team's
perspective (attacking left to right); position frames use the home team's.
"""

from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

PITCH_LENGTH = 105.0
PITCH_WIDTH = 68.0

Position = Literal["GK", "DEF", "MID", "FWD"]
Period = Literal[1, 2]
EventType = Literal[
    "match_start",
    "kickoff",
    "pass",
    "carry",
    "pressure",
    "possession_change",
    "shot",
    "goal",
    "own_goal",
    "save",
    "block",
    "tackle",
    "interception",
    "clearance",
    "ball_recovery",
    "foul",
    "card",
    "penalty_won",
    "corner",
    "substitution",
    "period_end",
    "match_end",
]
Outcome = Literal["complete", "incomplete", "goal", "saved", "blocked", "off_target", "won"]
Card = Literal["yellow", "second_yellow", "red"]
Weather = Literal["clear", "cloudy", "rain", "wind", "cold"]

X = Annotated[float, Field(ge=0, le=PITCH_LENGTH)]
Y = Annotated[float, Field(ge=0, le=PITCH_WIDTH)]


class Contract(BaseModel):
    """Base for every contract: immutable, no unknown fields, all fields present in JSON."""

    model_config = ConfigDict(
        frozen=True, extra="forbid", json_schema_serialization_defaults_required=True
    )


class PlayerInfo(Contract):
    id: str
    name: str
    shirt: int
    position: Position


class TeamSheet(Contract):
    id: str
    name: str
    short_name: str
    primary_colour: str
    secondary_colour: str
    formation: str
    starters: list[PlayerInfo]
    bench: list[PlayerInfo]


class MatchMetadata(Contract):
    """Fixture details, sent once before the first event. All names are fictional."""

    kind: Literal["metadata"] = "metadata"
    match_id: str
    competition: str
    season: str
    matchday: int
    venue: str
    city: str
    kickoff_utc: datetime
    weather: Weather
    temperature_c: int
    referee: str
    attendance: int
    home: TeamSheet
    away: TeamSheet


_ACTOR = ("player_id", "x", "y")
REQUIRED_FIELDS: dict[EventType, tuple[str, ...]] = {
    "kickoff": _ACTOR,
    "pass": (
        *_ACTOR,
        "end_x",
        "end_y",
        "outcome",
        "recipient_id",
        "cross",
        "under_pressure",
        "ball_speed_kmh",
    ),
    "carry": (*_ACTOR, "end_x", "end_y"),
    "pressure": (*_ACTOR, "opponent_id"),
    "possession_change": _ACTOR,
    "shot": (*_ACTOR, "outcome", "xg", "penalty", "shot_speed_kmh"),
    "goal": (*_ACTOR, "score"),
    "own_goal": (*_ACTOR, "score"),
    "save": (*_ACTOR, "opponent_id", "penalty"),
    "block": (*_ACTOR, "opponent_id"),
    "tackle": (*_ACTOR, "opponent_id", "outcome"),
    "interception": _ACTOR,
    "clearance": _ACTOR,
    "ball_recovery": _ACTOR,
    "foul": (*_ACTOR, "opponent_id"),
    "card": (*_ACTOR, "card"),
    "penalty_won": _ACTOR,
    "corner": _ACTOR,
    "substitution": ("player_id", "player_in_id"),
    "match_end": ("score",),
}
"""Fields each event type must set; every other optional field may be null."""


class MatchEvent(Contract):
    """One match event. Type-specific fields are null unless the type uses them.

    `opponent_id` is the other-team player involved: the player pressed, tackled,
    or fouled, or the shooter for `block` and `save`. `possession_change` is
    emitted just before the event that wins the ball. A penalty miss is a `shot`
    with `penalty` true and an outcome other than `goal`.
    """

    kind: Literal["event"] = "event"
    id: int
    match_id: str
    period: Period
    clock_s: float
    minute: int
    type: EventType
    team_id: str
    player_id: str | None = None
    possession_id: int
    x: X | None = None
    y: Y | None = None
    end_x: X | None = None
    end_y: Y | None = None
    outcome: Outcome | None = None
    recipient_id: str | None = None
    opponent_id: str | None = None
    cross: bool | None = None
    under_pressure: bool | None = None
    ball_speed_kmh: float | None = None
    xg: float | None = None
    shot_speed_kmh: float | None = None
    penalty: bool | None = None
    assist_player_id: str | None = None
    card: Card | None = None
    player_in_id: str | None = None
    score: dict[str, int] | None = None

    @model_validator(mode="after")
    def _type_fields_present(self) -> Self:
        missing = [f for f in REQUIRED_FIELDS.get(self.type, ()) if getattr(self, f) is None]
        if missing:
            raise ValueError(f"{self.type} event is missing {', '.join(missing)}")
        return self


class PlayerPosition(Contract):
    player_id: str
    x: X
    y: Y
    speed_kmh: float


class PositionFrame(Contract):
    """Approximate positions of the ball and every on-pitch player, about every 2 seconds."""

    kind: Literal["positions"] = "positions"
    match_id: str
    period: Period
    clock_s: float
    ball_x: X
    ball_y: Y
    players: list[PlayerPosition]


SimulatorMessage = Annotated[
    MatchMetadata | MatchEvent | PositionFrame, Field(discriminator="kind")
]
"""Anything the simulator emits, tagged by `kind`."""
