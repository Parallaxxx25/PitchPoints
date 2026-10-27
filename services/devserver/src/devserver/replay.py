"""Replay data: the events and position frames around some source events."""

from collections.abc import Sequence

from contracts import MatchEvent, MatchMetadata, PositionFrame, Replay, SimulatorMessage

REPLAY_LEAD_S = 8.0
"""Match seconds shown before each source event, so the build-up is visible."""
REPLAY_TAIL_S = 3.0
"""Match seconds shown after each source event."""
MAX_SOURCE_EVENTS = 50


def build_replay(
    match_id: str, feed: Sequence[SimulatorMessage], event_ids: list[int], last_event_id: int
) -> Replay:
    """Everything within the lead and tail windows of the requested events that has already happened.

    Events after `last_event_id` are never returned, so a replay cannot show the future.
    """
    played = [m for m in feed if not isinstance(m, MatchMetadata)]
    sources = {i for i in event_ids if i <= last_event_id}
    wanted = [e for e in played if isinstance(e, MatchEvent) and e.id in sources]
    windows = [(e.period, e.clock_s - REPLAY_LEAD_S, e.clock_s + REPLAY_TAIL_S) for e in wanted]

    def inside(m: MatchEvent | PositionFrame) -> bool:
        return any(p == m.period and lo <= m.clock_s <= hi for p, lo, hi in windows)

    events = [
        e for e in played if isinstance(e, MatchEvent) and e.id <= last_event_id and inside(e)
    ]
    frames = [f for f in played if isinstance(f, PositionFrame) and inside(f)]
    return Replay(
        match_id=match_id,
        source_event_ids=sorted(e.id for e in wanted),
        events=events,
        frames=frames,
    )
