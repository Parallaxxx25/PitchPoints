"""Replay data: windows around source events, no future events, and the HTTP endpoints."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from contracts import MatchEvent, MatchMetadata, PositionFrame
from devserver.app import create_app
from devserver.replay import MAX_SOURCE_EVENTS, REPLAY_LEAD_S, REPLAY_TAIL_S, build_replay
from simulator import simulate

MATCH = simulate(7)
FEED = [m for m in MATCH.messages() if not isinstance(m, MatchMetadata)]
GOAL = next(m for m in FEED if isinstance(m, MatchEvent) and m.type == "goal")
URL = "/matches/match-0007"


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as c:
        yield c


def test_replay_covers_the_window_around_the_source_events() -> None:
    replay = build_replay("m", FEED, [GOAL.id], last_event_id=GOAL.id + 100)
    assert replay.source_event_ids == [GOAL.id]
    assert GOAL.id in {e.id for e in replay.events}
    assert replay.frames
    lo, hi = GOAL.clock_s - REPLAY_LEAD_S, GOAL.clock_s + REPLAY_TAIL_S
    timed: list[MatchEvent | PositionFrame] = [*replay.events, *replay.frames]
    assert all(lo <= x.clock_s <= hi for x in timed)
    assert {x.period for x in timed} == {GOAL.period}


def test_replay_never_shows_events_that_have_not_happened() -> None:
    replay = build_replay("m", FEED, [GOAL.id], last_event_id=GOAL.id - 1)
    assert replay.source_event_ids == [] and replay.events == [] and replay.frames == []
    partial = build_replay("m", FEED, [GOAL.id - 1], last_event_id=GOAL.id - 1)
    assert max(e.id for e in partial.events) == GOAL.id - 1


def test_replay_of_far_apart_events_has_one_window_each() -> None:
    goals = [m.id for m in FEED if isinstance(m, MatchEvent) and m.type == "goal"]
    replay = build_replay("m", FEED, goals, last_event_id=10_000)
    assert replay.source_event_ids == goals
    first, last = replay.frames[0], replay.frames[-1]
    assert (first.period, first.clock_s) < (last.period, last.clock_s)
    window_s = REPLAY_LEAD_S + REPLAY_TAIL_S
    assert len(replay.frames) <= len(goals) * (window_s / 2 + 1)


def test_replay_and_ledger_endpoints(client: TestClient) -> None:
    client.post("/matches", json={"seed": 7, "script": "demo", "paused": True})
    client.post(f"{URL}/control", json={"seek_minute": 120})
    moment = next(m for m in client.get(f"{URL}/moments").json() if m["type"] == "goal")
    ids = moment["source_event_ids"]
    got = client.get(f"{URL}/replay", params={"event_ids": ids}).json()
    assert got["source_event_ids"] == ids and got["frames"]
    assert {e["id"] for e in got["events"]} >= set(ids)
    assert client.get(f"{URL}/replay").status_code == 422
    too_many = {"event_ids": list(range(1, MAX_SOURCE_EVENTS + 2))}
    assert client.get(f"{URL}/replay", params=too_many).status_code == 422
    assert client.get("/matches/match-9999/replay", params={"event_ids": [1]}).status_code == 404
    everyone = client.get(f"{URL}/ledger").json()
    scorer = moment["player_ids"][0]
    assert [x for x in everyone if x["player_id"] == scorer] == client.get(
        f"{URL}/ledger/{scorer}"
    ).json()
    assert len({x["player_id"] for x in everyone}) > 11
