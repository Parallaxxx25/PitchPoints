"""Builds small, valid matches for engine tests. Teams and players are fictional.

Players are `HOM-1`..`HOM-16` and `AWY-1`..`AWY-16`: shirt 1 is the goalkeeper,
2 to 5 defenders, 6 to 8 midfielders, 9 to 11 forwards; 12 to 16 are the bench
(DEF, MID, MID, FWD, FWD).
"""

from datetime import UTC, datetime
from typing import Any

from contracts.match import (
    REQUIRED_FIELDS,
    EventType,
    MatchEvent,
    MatchMetadata,
    Period,
    PlayerInfo,
    Position,
    TeamSheet,
)

HOME, AWAY = "HOM", "AWY"
_LINEUP: tuple[Position, ...] = ("GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "FWD")  # fmt: skip
_BENCH: tuple[Position, ...] = ("DEF", "MID", "MID", "FWD", "FWD")
_DEFAULTS: dict[str, dict[str, Any]] = {
    "pass": {"end_x": 60.0, "end_y": 34.0, "outcome": "complete", "cross": False, "under_pressure": False, "ball_speed_kmh": 40.0},
    "carry": {"end_x": 56.0, "end_y": 34.0},
    "shot": {"outcome": "off_target", "xg": 0.1, "penalty": False, "shot_speed_kmh": 80.0},
    "save": {"penalty": False},
    "tackle": {"outcome": "won"},
    "card": {"card": "yellow"},
}  # fmt: skip


def other(team_id: str) -> str:
    return AWAY if team_id == HOME else HOME


def _sheet(team_id: str, name: str) -> TeamSheet:
    def info(shirt: int, pos: Position) -> PlayerInfo:
        return PlayerInfo(
            id=f"{team_id}-{shirt}", name=f"{name} {shirt}", shirt=shirt, position=pos
        )

    return TeamSheet(
        id=team_id,
        name=f"{name} Town",
        short_name=name,
        primary_colour="#1d4ed8",
        secondary_colour="#ffffff",
        formation="4-3-3",
        starters=[info(i + 1, p) for i, p in enumerate(_LINEUP)],
        bench=[info(12 + i, p) for i, p in enumerate(_BENCH)],
    )


class MatchBuilder:
    """Appends valid events in order; `at()` moves the clock, `add()` fills required fields."""

    def __init__(self) -> None:
        self.metadata = MatchMetadata(
            match_id="test-match",
            competition="Test League",
            season="2026/27",
            matchday=1,
            venue="Test Ground",
            city="Testville",
            kickoff_utc=datetime(2026, 8, 15, 15, tzinfo=UTC),
            weather="clear",
            temperature_c=15,
            referee="Test Referee",
            attendance=1000,
            home=_sheet(HOME, "Home"),
            away=_sheet(AWAY, "Away"),
        )
        self.events: list[MatchEvent] = []
        self.period: Period = 1
        self.clock = 0.0
        self.score = {HOME: 0, AWAY: 0}

    def at(self, minute: float, period: Period | None = None) -> "MatchBuilder":
        """Move the clock to `minute`; minute 45 and later is the second half unless `period` is given."""
        self.period = period or (1 if minute < 45 else 2)
        self.clock = minute * 60
        return self

    def add(
        self,
        etype: EventType,
        player_id: str | None = None,
        team_id: str | None = None,
        **fields: Any,
    ) -> MatchEvent:
        """Append an event; the team defaults to the player's, coordinates to the centre spot."""
        team = team_id or (player_id.split("-")[0] if player_id else HOME)
        values = {**_DEFAULTS.get(etype, {}), **fields}
        required = REQUIRED_FIELDS.get(etype, ())
        if player_id:
            values.setdefault("x", 52.5)
            values.setdefault("y", 34.0)
        if "opponent_id" in required:
            values.setdefault("opponent_id", f"{other(team)}-9")
        if "recipient_id" in required:
            values.setdefault("recipient_id", f"{team}-10")
        if "score" in required:
            values.setdefault("score", dict(self.score))
        event = MatchEvent(
            id=len(self.events) + 1,
            match_id=self.metadata.match_id,
            period=self.period,
            clock_s=self.clock,
            minute=int(self.clock // 60),
            type=etype,
            team_id=team,
            player_id=player_id,
            possession_id=0,
            **values,
        )
        self.events.append(event)
        return event

    def start(self) -> "MatchBuilder":
        """Match start, then the home team kicks off."""
        self.at(0).add("match_start")
        self.add("possession_change", "HOM-10")
        self.add("kickoff", "HOM-10")
        return self

    def goal(
        self, scorer: str, assist: str | None = None, xg: float = 0.3, penalty: bool = False
    ) -> MatchEvent:
        """A scoring shot followed by its `goal` event; returns the goal."""
        team = scorer.split("-")[0]
        self.add("shot", scorer, outcome="goal", xg=xg, penalty=penalty, assist_player_id=assist)
        self.score[team] += 1
        return self.add("goal", scorer, assist_player_id=assist)

    def own_goal(self, player_id: str) -> MatchEvent:
        """`player_id` puts the ball into their own net."""
        self.score[other(player_id.split("-")[0])] += 1
        return self.add("own_goal", player_id)

    def half_time(self) -> "MatchBuilder":
        """End the first half (at 45:00 unless the clock is later), then the away team kicks off."""
        self.at(max(self.clock / 60, 45), period=1).add("period_end")
        self.at(45).add("kickoff", "AWY-10")
        return self

    def full_time(self) -> "MatchBuilder":
        """End the match at 90:00 (or later), playing half-time first if still in the first half."""
        if self.period == 1:
            self.half_time()
        self.at(max(self.clock / 60, 90)).add("period_end")
        self.add("match_end", score=dict(self.score))
        return self
