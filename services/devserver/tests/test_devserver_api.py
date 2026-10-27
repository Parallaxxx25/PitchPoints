"""HTTP and WebSocket API with a paused match, so nothing depends on wall-clock timing."""

from collections.abc import Iterator

import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient

from devserver.app import NOT_FOUND_CLOSE, create_app
from devserver.cli import main
from simulator import simulate

METADATA = simulate(7, frames=False).metadata
MATCH = "/matches/match-0007"


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as c:
        yield c


def start(client: TestClient) -> dict[str, object]:
    response = client.post("/matches", json={"seed": 7, "script": "demo", "paused": True})
    assert response.status_code == 201
    return dict(response.json())


def test_profiles_are_validated_and_given_an_id(client: TestClient) -> None:
    created = client.post("/profiles", json={"display_name": "Sam", "mode": "analyst"})
    assert created.status_code == 201 and created.json()["id"]
    assert client.post("/profiles", json={"display_name": ""}).status_code == 422
    squad = {"players": ["a"] * 3, "captain_id": "a", "vice_captain_id": "b"}
    bad = client.post("/profiles", json={"display_name": "Sam", "fantasy_squad": squad})
    assert bad.status_code == 422


def test_start_seek_and_read_the_match(client: TestClient) -> None:
    state = start(client)
    assert (state["status"], state["minute"]) == ("paused", 0)
    assert client.get(f"{MATCH}/stats").status_code == 404  # nothing before kickoff
    final = client.post(f"{MATCH}/control", json={"seek_minute": 120}).json()
    assert final["status"] == "finished" and final["revision"] == 1
    assert client.get(MATCH).json() == final
    stats = client.get(f"{MATCH}/stats").json()
    assert stats["home"]["goals"] == final["score_home"]
    goals = [m for m in client.get(f"{MATCH}/moments").json() if m["type"] == "goal"]
    assert len(goals) == final["score_home"] + final["score_away"]
    assert client.get(f"{MATCH}/overlay-cues").json()
    scorer = goals[0]["player_ids"][0]
    rules = {x["rule_id"] for x in client.get(f"{MATCH}/ledger/{scorer}").json()}
    assert {"appearance", "goal"} <= rules


def test_unknown_or_invalid_requests(client: TestClient) -> None:
    assert client.get("/matches/match-9999").status_code == 404
    assert client.post("/matches", json={"seed": 7, "script": "nope"}).status_code == 404
    assert client.post("/matches", json={"seed": 7, "script": "../demo"}).status_code == 422
    assert client.post("/matches", json={"seed": 7, "speed": 5}).status_code == 422
    start(client)
    assert client.get(f"{MATCH}/ledger/XXX-1").status_code == 404
    assert client.post(f"{MATCH}/control", json={"seek_minute": -1}).status_code == 422


def test_live_feed_sends_a_snapshot_then_updates(client: TestClient) -> None:
    home = [p.id for p in METADATA.home.starters]
    squad = {"players": home, "captain_id": home[9], "vice_captain_id": home[8]}
    profile = client.post("/profiles", json={"display_name": "Sam", "fantasy_squad": squad}).json()
    start(client)
    client.post(f"{MATCH}/control", json={"seek_minute": 30})
    with client.websocket_connect(f"/live/match-0007?profile={profile['id']}") as ws:
        kinds = [ws.receive_json()["kind"] for _ in range(5)]
        assert kinds == ["metadata", "match_state", "stats", "tactical_state", "squad_total"]
        client.post(f"{MATCH}/control", json={"speed": 6})
        update = ws.receive_json()
        assert (update["kind"], update["speed"]) == ("match_state", 6)


def test_live_feed_closes_for_an_unknown_match(client: TestClient) -> None:
    with (
        client.websocket_connect("/live/match-9999") as ws,
        pytest.raises(WebSocketDisconnect) as closed,
    ):
        ws.receive_json()
    assert closed.value.code == NOT_FOUND_CLOSE


def test_only_local_mode_runs(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PITCHPOINTS_MODE", "azure")
    with pytest.raises(SystemExit):
        main([])
