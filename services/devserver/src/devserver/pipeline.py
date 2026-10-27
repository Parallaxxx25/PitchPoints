"""One match's engines: simulator messages in, live messages out. Pure; no I/O."""

from contracts import (
    LiveMessage,
    MatchEvent,
    MatchMetadata,
    MatchState,
    MatchStatus,
    PositionFrame,
    Speed,
)
from insights import InsightsEngine
from scoring import ScoringEngine

STATS_INTERVAL_S = 10.0
"""Stats and tactical state go out at most this often (match seconds), and after every key event."""
KEY_EVENTS = frozenset({"goal", "own_goal", "card", "substitution", "period_end", "match_end"})


class Pipeline:
    """Runs the insights and scoring engines over a match's messages in order."""

    def __init__(self, metadata: MatchMetadata) -> None:
        self.metadata = metadata
        self.insights = InsightsEngine(metadata)
        self.scoring = ScoringEngine(metadata)
        self.last_event: MatchEvent | None = None
        self.finished = False
        self._score = {metadata.home.id: 0, metadata.away.id: 0}
        self._stats_at: tuple[int, float] | None = None  # (period, clock_s) of the last stats

    def handle(self, message: MatchEvent | PositionFrame) -> list[LiveMessage]:
        """The message itself plus everything the engines produce from it; nothing after full time."""
        if self.finished:
            return []
        if isinstance(message, PositionFrame):
            found = self.insights.apply_frame(message)
            return [message, *found.moments, *found.cues]
        e = self.last_event = message
        found = self.insights.apply(e)
        out: list[LiveMessage] = [e, *found.moments, *found.cues, *self.scoring.apply(e)]
        if e.score:
            self._score = dict(e.score)
        if e.type == "match_end":
            self.finished = True
            final = self.insights.finalize()
            out += [*final.moments, *final.cues, *self.scoring.finalize()]
        if self._stats_due(e):
            self._stats_at = (e.period, e.clock_s)
            out += self.current()
        return out

    def current(self) -> list[LiveMessage]:
        """Latest stats and tactical state; nothing before the first event."""
        if self.last_event is None:
            return []
        return [self.insights.stats(), self.insights.tactical_state()]

    def state(self, status: MatchStatus, speed: Speed, revision: int) -> MatchState:
        """Match state at the last event; a finished match is always `finished`."""
        e = self.last_event
        return MatchState(
            match_id=self.metadata.match_id,
            status="finished" if self.finished else status,
            speed=speed,
            revision=revision,
            period=e.period if e else 1,
            clock_s=e.clock_s if e else 0.0,
            minute=e.minute if e else 0,
            score_home=self._score[self.metadata.home.id],
            score_away=self._score[self.metadata.away.id],
            last_event_id=e.id if e else 0,
        )

    def _stats_due(self, e: MatchEvent) -> bool:
        if self._stats_at is None or e.type in KEY_EVENTS:
            return True
        period, clock = self._stats_at
        return e.period != period or e.clock_s - clock >= STATS_INTERVAL_S
