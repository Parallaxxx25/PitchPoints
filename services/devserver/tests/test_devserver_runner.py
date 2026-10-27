"""The match runner over the in-memory adapters: playback, pause, seek, and squad totals."""

import asyncio
from collections.abc import Awaitable, Callable

from contracts import (
    FantasySquad,
    KeyMoment,
    LedgerEntry,
    LiveMessage,
    MatchControl,
    MatchEvent,
    OverlayCue,
    PositionFrame,
    SquadTotal,
    StatSnapshot,
    ViewerProfile,
)
from devserver.adapters.memory import MemoryEventBus, MemoryStore
from devserver.pipeline import Pipeline
from devserver.runner import MatchRunner
from simulator import simulate

MATCH = simulate(5)


class RecordingPush:
    """LivePush that remembers what it sent."""

    def __init__(self) -> None:
        self.sent: list[tuple[LiveMessage, str | None]] = []

    async def send(
        self, match_id: str, message: LiveMessage, profile_id: str | None = None
    ) -> None:
        self.sent.append((message, profile_id))

    def of[T](self, kind: type[T]) -> list[T]:
        return [m for m, _ in self.sent if isinstance(m, kind)]


Scenario = Callable[[MatchRunner, MemoryStore, RecordingPush], Awaitable[None]]


def play(scenario: Scenario, paused: bool = True) -> tuple[MatchRunner, RecordingPush]:
    store, push = MemoryStore(), RecordingPush()
    runner = MatchRunner(MATCH, MemoryEventBus(), store, push, speed=60, paused=paused)

    async def main() -> None:
        await runner.start()
        try:
            await scenario(runner, store, push)
        finally:
            await runner.stop()

    asyncio.run(main())
    return runner, push


def stats_at(minute: int) -> StatSnapshot:
    """Stats from the pipeline run straight through to `minute`."""
    pipeline = Pipeline(MATCH.metadata)
    target = (1 if minute < 45 else 2, minute * 60.0)
    for m in MATCH.messages():
        if isinstance(m, MatchEvent | PositionFrame):
            if (m.period, m.clock_s) >= target:
                break
            pipeline.handle(m)
    return pipeline.insights.stats()


def test_seek_rebuilds_exactly_the_state_of_playing_straight_through() -> None:
    found: list[StatSnapshot] = []

    async def scenario(runner: MatchRunner, store: MemoryStore, push: RecordingPush) -> None:
        for minute in (30, 80, 30):
            await runner.control(MatchControl(seek_minute=minute))
            found.extend(await store.get(runner.match_id, StatSnapshot))

    runner, _ = play(scenario)
    assert found[0] == found[2] == stats_at(30)
    assert found[1] == stats_at(80)
    assert runner.revision == 3


def test_seeking_past_full_time_finishes_the_match() -> None:
    starters = MATCH.metadata.home.starters
    squad = FantasySquad(
        players=[p.id for p in starters],
        captain_id=starters[9].id,
        vice_captain_id=starters[8].id,
    )
    viewer = ViewerProfile(id="v1", display_name="Viewer", fantasy_squad=squad)

    async def scenario(runner: MatchRunner, store: MemoryStore, push: RecordingPush) -> None:
        await store.put_profile(viewer)
        state = await runner.control(MatchControl(seek_minute=120))
        assert state.status == "finished"
        assert await store.get(runner.match_id, KeyMoment)
        assert await store.get(runner.match_id, OverlayCue)
        ledger = await store.get(runner.match_id, LedgerEntry)
        assert ledger and not any(x.provisional for x in ledger)

    runner, push = play(scenario)
    [total] = push.of(SquadTotal)
    assert total.total == runner.pipeline.scoring.squad_total(squad)
    assert [p for m, p in push.sent if isinstance(m, SquadTotal)] == ["v1"]


def test_playing_pushes_events_in_order() -> None:
    async def scenario(runner: MatchRunner, store: MemoryStore, push: RecordingPush) -> None:
        await asyncio.sleep(0.5)  # about 30 match seconds at 60x

    runner, push = play(scenario, paused=False)
    events = push.of(MatchEvent)
    assert events and [e.id for e in events] == list(range(1, len(events) + 1))
    assert push.of(StatSnapshot)
    assert runner.state().last_event_id == events[-1].id
    assert events[-1].clock_s < 120


def test_pause_holds_the_feed_until_resumed() -> None:
    async def scenario(runner: MatchRunner, store: MemoryStore, push: RecordingPush) -> None:
        await asyncio.sleep(0.2)
        assert push.of(MatchEvent) == []
        state = await runner.control(MatchControl(paused=False, speed=60))
        assert state.status == "running"
        await asyncio.sleep(0.3)
        assert push.of(MatchEvent)
        assert (await runner.control(MatchControl(paused=True))).status == "paused"

    play(scenario)
