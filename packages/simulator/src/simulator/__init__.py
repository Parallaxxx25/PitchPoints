"""Deterministic synthetic football match simulator.

`simulate(seed)` returns fictional match metadata, every event, and position
frames. The same seed and director script always produce identical output.
"""

import random
from collections.abc import Iterator
from dataclasses import dataclass

from contracts import MatchEvent, MatchMetadata, PositionFrame
from simulator.director import DirectorScript, Moment, load_script
from simulator.engine import MatchEngine
from simulator.positions import position_frames
from simulator.teams import CLUBS, fixture, make_metadata

__all__ = ["CLUBS", "DirectorScript", "Moment", "SimulatedMatch", "load_script", "simulate"]


@dataclass(frozen=True)
class SimulatedMatch:
    metadata: MatchMetadata
    events: list[MatchEvent]
    frames: list[PositionFrame]

    def messages(self) -> Iterator[MatchMetadata | MatchEvent | PositionFrame]:
        """Metadata first, then events and frames in match-clock order."""
        yield self.metadata
        stream: list[MatchEvent | PositionFrame] = [*self.events, *self.frames]
        yield from sorted(stream, key=lambda m: (m.period, m.clock_s))


def simulate(
    seed: int, script: DirectorScript | None = None, frames: bool = True
) -> SimulatedMatch:
    """Simulate one match; `frames=False` skips the position frames."""
    home, away = fixture(seed)
    match_id = f"match-{seed:04d}"
    metadata = make_metadata(seed, match_id, home, away)
    events = MatchEngine(home, away, seed, match_id, script).run()
    rng = random.Random(f"positions:{seed}")
    return SimulatedMatch(
        metadata, events, position_frames(events, home, away, rng) if frames else []
    )
