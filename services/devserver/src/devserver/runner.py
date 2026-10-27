"""Match runner: replays a simulated match in accelerated real time through the ports.

A producer task publishes the recorded feed to the EventBus, paced by the match
clock and the current speed; a consumer task runs each message through the
engines, stores the output, and pushes it to viewers. Seeking rebuilds the
engines from the feed, so any minute can be replayed exactly.
"""

import asyncio
import logging
from bisect import bisect_left

from contracts import (
    HALF_S,
    LedgerEntry,
    LiveMessage,
    MatchControl,
    MatchEvent,
    MatchMetadata,
    MatchState,
    MatchStatus,
    PositionFrame,
    Speed,
    SquadTotal,
    ViewerProfile,
)
from devserver.pipeline import Pipeline
from devserver.ports import EventBus, LivePush, Store
from simulator import SimulatedMatch

log = logging.getLogger(__name__)
STATE_EVENTS = frozenset({"kickoff", "goal", "own_goal", "period_end", "match_end"})
"""Events after which the match state is pushed; it is stored after every event."""


class MatchRunner:
    """Plays one match: start, pause or resume, change speed, seek, stop."""

    def __init__(
        self,
        match: SimulatedMatch,
        bus: EventBus,
        store: Store,
        live: LivePush,
        speed: Speed = 18,
        paused: bool = False,
    ) -> None:
        self.match, self.match_id = match, match.metadata.match_id
        self.feed = [m for m in match.messages() if not isinstance(m, MatchMetadata)]
        self.bus, self.store, self.live = bus, store, live
        self.speed: Speed = speed
        self.pipeline = Pipeline(match.metadata)
        self.revision = 0  # bumped by every seek
        self._next = 0  # index of the next feed message to publish
        self._playing = asyncio.Event()
        self._changed = asyncio.Event()  # wakes the producer after a speed change or pause
        self._totals: dict[str, int] = {}  # last squad total sent per profile
        self._tasks: list[asyncio.Task[None]] = []
        if not paused:
            self._playing.set()

    @property
    def status(self) -> MatchStatus:
        return "running" if self._playing.is_set() else "paused"

    def state(self) -> MatchState:
        return self.pipeline.state(self.status, self.speed, self.revision)

    async def start(self) -> None:
        """Store the metadata and initial state, then start playing (unless paused)."""
        await self.store.clear(self.match_id)  # a restarted seed replaces the old match
        await self.store.put(self.match_id, self.match.metadata)
        await self.store.put(self.match_id, self.state())
        self._launch()

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks = []

    async def control(self, change: MatchControl) -> MatchState:
        """Apply a seek, then speed and pause changes; returns and pushes the new state."""
        if change.seek_minute is not None:
            await self.seek(change.seek_minute)
        if change.speed is not None:
            self.speed = change.speed
        if change.paused is not None:
            (self._playing.clear if change.paused else self._playing.set)()
        self._changed.set()
        state = self.state()
        await self.store.put(self.match_id, state)
        await self.live.send(self.match_id, state)
        return state

    async def seek(self, minute: int) -> None:
        """Rebuild everything from the feed up to `minute` (45 and later is the second half)."""
        await self.stop()
        self.revision += 1
        self.pipeline = Pipeline(self.match.metadata)
        self._totals = {}
        await self.store.clear(self.match_id)
        await self.store.put(self.match_id, self.match.metadata)
        target = (1 if minute * 60 < HALF_S else 2, minute * 60.0)
        self._next = bisect_left(self.feed, target, key=lambda m: (m.period, m.clock_s))
        for message in self.feed[: self._next]:
            await self._process(message, push=False)
        current = self.pipeline.current()
        for item in [self.state(), *current]:
            await self.store.put(self.match_id, item)
        for item in [*current, *await self._squad_totals(only_changed=False)]:
            await self.live.send(self.match_id, item, getattr(item, "profile_id", None))
        self._launch()

    async def snapshot(self, profile: ViewerProfile | None) -> list[LiveMessage]:
        """What a new viewer needs first: metadata, state, stats, and their squad total."""
        out: list[LiveMessage] = [self.match.metadata, self.state(), *self.pipeline.current()]
        if profile and profile.fantasy_squad:
            total = self.pipeline.scoring.squad_total(profile.fantasy_squad)
            out.append(SquadTotal(match_id=self.match_id, profile_id=profile.id, total=total))
        return out

    # ---------- tasks ----------
    def _launch(self) -> None:
        topic = f"{self.match_id}/{self.revision}"
        self._tasks = [
            asyncio.create_task(self._produce(topic)),
            asyncio.create_task(self._consume(topic)),
        ]

    async def _produce(self, topic: str) -> None:
        while self._next < len(self.feed):
            message = self.feed[self._next]
            if self._next:
                previous = self.feed[self._next - 1]
                if previous.period == message.period and message.clock_s > previous.clock_s:
                    await self._wait(message.clock_s - previous.clock_s)
            await self._playing.wait()
            await self.bus.publish(topic, message)
            self._next += 1

    async def _wait(self, match_seconds: float) -> None:
        # ponytail: a speed change or pause restarts the current gap; track elapsed time if gaps get long
        while True:
            self._changed.clear()
            try:
                await asyncio.wait_for(self._changed.wait(), match_seconds / self.speed)
            except TimeoutError:
                return

    async def _consume(self, topic: str) -> None:
        try:
            async for message in self.bus.subscribe(topic):
                if isinstance(message, MatchEvent | PositionFrame):
                    await self._process(message, push=True)
        except Exception:
            log.exception("live pipeline failed for %s", self.match_id)
            raise

    async def _process(self, message: MatchEvent | PositionFrame, push: bool) -> None:
        out = self.pipeline.handle(message)
        for item in out:
            if not isinstance(item, PositionFrame):
                await self.store.put(self.match_id, item)
        if isinstance(message, MatchEvent):
            await self.store.put(self.match_id, self.state())
            if message.type in STATE_EVENTS:
                out.append(self.state())
        if any(isinstance(item, LedgerEntry) for item in out):
            out += await self._squad_totals(only_changed=True)
        if push:
            for item in out:
                await self.live.send(self.match_id, item, getattr(item, "profile_id", None))

    async def _squad_totals(self, only_changed: bool) -> list[LiveMessage]:
        # ponytail: totals for every stored profile with a squad; track viewers per match if profiles grow
        out: list[LiveMessage] = []
        for profile in await self.store.profiles():
            if profile.fantasy_squad is None:
                continue
            total = self.pipeline.scoring.squad_total(profile.fantasy_squad)
            if not only_changed or self._totals.get(profile.id) != total:
                self._totals[profile.id] = total
                out.append(SquadTotal(match_id=self.match_id, profile_id=profile.id, total=total))
        return out
