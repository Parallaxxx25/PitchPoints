"""Contracts for the live pipeline: viewer profiles, match control, and pushed messages."""

from typing import Annotated, Literal

from pydantic import Field

from contracts.fantasy import FantasySquad, LedgerEntry
from contracts.insights import KeyMoment, OverlayCue, StatSnapshot, TacticalState
from contracts.match import Contract, MatchEvent, MatchMetadata, Period, PositionFrame

ViewerMode = Literal["analyst", "casual", "fantasy", "player_focus", "club"]
Language = Literal["en", "es", "pt", "th"]
Speed = Literal[1, 6, 18, 60]
MatchStatus = Literal["running", "paused", "finished"]


class NewProfile(Contract):
    """What a viewer chooses; the server adds the id."""

    display_name: str = Field(min_length=1, max_length=40)
    mode: ViewerMode = "casual"
    language: Language = "en"
    favourite_club_id: str | None = None
    favourite_player_ids: list[str] = Field(default_factory=list)
    focus_metric: str | None = None
    fantasy_squad: FantasySquad | None = None


class ViewerProfile(NewProfile):
    id: str


class StartMatch(Contract):
    """Start a simulated match. `script` names a director script, such as `demo`."""

    seed: int = Field(ge=0)
    script: str | None = Field(default=None, pattern=r"^[a-z0-9_-]+$")
    speed: Speed = 18
    paused: bool = False


class MatchControl(Contract):
    """Change a running match; unset fields stay as they are. A seek is applied first."""

    seek_minute: int | None = Field(default=None, ge=0, le=120)
    paused: bool | None = None
    speed: Speed | None = None


class MatchState(Contract):
    """Where a live match is: playback status and speed, clock, and score."""

    kind: Literal["match_state"] = "match_state"
    match_id: str
    status: MatchStatus
    speed: Speed
    revision: int  # bumped by every seek: refetch moments, cues, and ledgers when it changes
    period: Period
    clock_s: float
    minute: int
    score_home: int
    score_away: int
    last_event_id: int  # 0 before the first event


class SquadTotal(Contract):
    """One viewer's fantasy squad points with the captain doubled; sent to that viewer only."""

    kind: Literal["squad_total"] = "squad_total"
    match_id: str
    profile_id: str
    total: int


LiveMessage = Annotated[
    MatchMetadata
    | MatchState
    | MatchEvent
    | PositionFrame
    | StatSnapshot
    | TacticalState
    | KeyMoment
    | LedgerEntry
    | OverlayCue
    | SquadTotal,
    Field(discriminator="kind"),
]
"""Anything pushed to the browser over the live connection, tagged by `kind`."""
