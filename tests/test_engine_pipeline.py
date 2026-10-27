"""Simulator into both engines: golden matches and the traceability acceptance criterion.

Golden output for fixed seeds is checked into tests/golden/. After an intended
change, regenerate with `UPDATE_GOLDEN=1 uv run pytest tests/test_engine_pipeline.py`
and review the diff.
"""

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest

from contracts import (
    KeyMoment,
    LedgerEntry,
    MatchEvent,
    OverlayCue,
    PositionFrame,
    StatSnapshot,
    TacticalState,
)
from insights import InsightsEngine
from scoring import ScoringEngine
from simulator import SimulatedMatch, load_script, simulate

GOLDEN = Path(__file__).parent / "golden"
DEMO = Path(__file__).parents[1] / "packages" / "simulator" / "director" / "demo.yaml"
CASES: dict[str, tuple[int, Path | None]] = {
    "seed-0007-demo": (7, DEMO),
    "seed-0001": (1, None),
    "seed-0002": (2, None),
}


@dataclass
class Run:
    match: SimulatedMatch
    stats: StatSnapshot
    tactical_state: TacticalState
    moments: list[KeyMoment]
    cues: list[OverlayCue]
    issued: list[LedgerEntry]  # every entry as issued, including later-replaced versions
    ledger: list[LedgerEntry]  # the current version of every entry
    points: dict[str, int]


def run(match: SimulatedMatch) -> Run:
    insights, scoring = InsightsEngine(match.metadata), ScoringEngine(match.metadata)
    cues: list[OverlayCue] = []
    issued: list[LedgerEntry] = []
    for msg in match.messages():
        if isinstance(msg, MatchEvent):
            cues += insights.apply(msg).cues
            issued += scoring.apply(msg)
        elif isinstance(msg, PositionFrame):
            cues += insights.apply_frame(msg).cues
    cues += insights.finalize().cues
    issued += scoring.finalize()
    return Run(
        match,
        insights.stats(),
        insights.tactical_state(),
        insights.moments(),
        cues,
        issued,
        scoring.ledger(),
        scoring.totals(),
    )


def golden(r: Run) -> dict[str, Any]:
    out = {
        "stats": r.stats.model_dump(mode="json"),
        "tactical_state": r.tactical_state.model_dump(mode="json"),
        "moments": [m.model_dump(mode="json") for m in r.moments],
        "cues": [c.model_dump(mode="json") for c in r.cues],
        "points": r.points,
        "ledger": [x.model_dump(mode="json") for x in r.ledger],
    }
    return dict(json.loads(json.dumps(out)))


@pytest.mark.parametrize("name", CASES)
def test_golden_match(name: str) -> None:
    seed, script = CASES[name]
    actual = golden(run(simulate(seed, load_script(script) if script else None)))
    path = GOLDEN / f"{name}.json"
    if os.environ.get("UPDATE_GOLDEN"):
        path.write_text(json.dumps(actual, indent=1) + "\n", encoding="utf-8", newline="\n")
    assert actual == json.loads(path.read_text(encoding="utf-8"))


@pytest.mark.parametrize("seed", range(20))
def test_every_output_traces_to_match_events(seed: int) -> None:
    r = run(simulate(seed, frames=seed < 3))
    events = {e.id: e for e in r.match.events}
    moments = {m.id for m in r.moments}
    traced: list[LedgerEntry | KeyMoment | OverlayCue] = [*r.issued, *r.moments, *r.cues]
    for item in traced:
        assert item.source_event_ids, item
        assert set(item.source_event_ids) <= events.keys(), item
    for cue in r.cues:
        assert set(cue.source_moment_ids) <= moments, cue
    for entry in r.issued:
        if entry.rule_id == "sixty_minutes":  # time-based points cite the minute-marker event
            [marker] = entry.source_event_ids
            assert events[marker].minute == entry.minute
    assert sum(r.points.values()) == sum(x.delta for x in r.ledger)
