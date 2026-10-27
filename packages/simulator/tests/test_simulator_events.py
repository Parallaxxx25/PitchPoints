"""Every emitted message is valid, well-formed, and internally consistent."""

from collections import Counter
from itertools import pairwise

import pytest
from pydantic import TypeAdapter

from contracts import MatchEvent, SimulatorMessage
from simulator import SimulatedMatch, simulate

SEEDS = range(50)
COORDS = ("x", "y", "end_x", "end_y")


@pytest.fixture(scope="module")
def matches() -> list[SimulatedMatch]:
    return [simulate(seed, frames=False) for seed in SEEDS]


@pytest.fixture(scope="module")
def with_frames() -> list[SimulatedMatch]:
    return [simulate(seed) for seed in range(3)]


def test_every_message_round_trips_through_the_contract(with_frames: list[SimulatedMatch]) -> None:
    adapter = TypeAdapter[SimulatorMessage](SimulatorMessage)
    for match in with_frames:
        for msg in match.messages():
            assert adapter.validate_json(msg.model_dump_json()) == msg


def test_coordinates_have_one_decimal(matches: list[SimulatedMatch]) -> None:
    for match in matches:
        for e in match.events:
            for name in COORDS:
                v = getattr(e, name)
                assert v is None or round(v, 1) == v, (e.id, name, v)


def test_ids_are_sequential_and_clock_never_goes_back(matches: list[SimulatedMatch]) -> None:
    for match in matches:
        assert [e.id for e in match.events] == list(range(1, len(match.events) + 1))
        for prev, e in pairwise(match.events):
            assert (e.period, e.clock_s) >= (prev.period, prev.clock_s)


def test_new_event_types_occur(matches: list[SimulatedMatch]) -> None:
    events = [e for m in matches for e in m.events]
    types = Counter(e.type for e in events)
    for etype in ("pressure", "possession_change", "own_goal", "penalty_won"):
        assert types[etype] > 0, etype
    assert any(e.type == "shot" and e.penalty and e.outcome != "goal" for e in events)
    assert any(e.type == "card" and e.card == "second_yellow" for e in events)


def test_possession_changes_alternate_teams(matches: list[SimulatedMatch]) -> None:
    for match in matches:
        teams = [e.team_id for e in match.events if e.type == "possession_change"]
        assert all(a != b for a, b in pairwise(teams))


def test_pressured_passes_follow_a_pressure_on_the_passer(matches: list[SimulatedMatch]) -> None:
    for match in matches:
        by_id = {e.id: e for e in match.events}
        for e in match.events:
            if e.type == "pass" and e.under_pressure:
                before: MatchEvent = by_id[e.id - 1]
                assert before.type == "pressure" and before.opponent_id == e.player_id


def test_sent_off_players_take_no_further_part(matches: list[SimulatedMatch]) -> None:
    for match in matches:
        off: set[str] = set()
        for e in match.events:
            assert e.player_id not in off, e
            if e.type == "card" and e.card != "yellow" and e.player_id:
                off.add(e.player_id)


def test_frames_cover_the_match_every_two_seconds(with_frames: list[SimulatedMatch]) -> None:
    for match in with_frames:
        for prev, f in pairwise(match.frames):
            if f.period == prev.period:
                assert f.clock_s - prev.clock_s == pytest.approx(2.0, abs=0.11)
        assert all(18 <= len(f.players) <= 22 for f in match.frames)


def test_squads_have_unique_fictional_names(matches: list[SimulatedMatch]) -> None:
    for match in matches:
        sheets = (match.metadata.home, match.metadata.away)
        names = [p.name for s in sheets for p in (*s.starters, *s.bench)]
        assert len(names) == len(set(names)) == 32
        assert sheets[0].id != sheets[1].id
