"""Engine output contracts reject untraceable or inconsistent data."""

from typing import Any

import pytest
from pydantic import BaseModel, ValidationError

from contracts import FantasySquad, KeyMoment, LedgerEntry, OverlayCue, nominal_seconds

PLAYERS = [f"HOM-{n}" for n in range(1, 12)]
MOMENT = {
    "id": 1,
    "match_id": "m",
    "period": 1,
    "clock_s": 60.0,
    "minute": 1,
    "kind": "goal",
    "importance": 0.2,
    "team_id": "HOM",
    "player_ids": [],
    "facts": {},
}
CUE = {
    "id": 1,
    "match_id": "m",
    "period": 1,
    "start_clock_s": 60.0,
    "duration_s": 8.0,
    "template": "key_moment",
    "priority": 90,
    "data": {},
}
ENTRY = {
    "id": "HOM-9:goal:3",
    "match_id": "m",
    "player_id": "HOM-9",
    "minute": 1,
    "delta": 4,
    "running_total": 5,
    "rule_id": "goal",
    "reason": "Goal",
    "provisional": False,
}


def test_squad_needs_eleven_unique_players_with_captains_inside() -> None:
    FantasySquad(players=PLAYERS, captain_id="HOM-9", vice_captain_id="HOM-10")
    bad: list[dict[str, Any]] = [
        {"players": PLAYERS[:10], "captain_id": "HOM-9", "vice_captain_id": "HOM-10"},
        {"players": [*PLAYERS[:10], "HOM-1"], "captain_id": "HOM-9", "vice_captain_id": "HOM-10"},
        {"players": PLAYERS, "captain_id": "HOM-9", "vice_captain_id": "HOM-9"},
        {"players": PLAYERS, "captain_id": "AWY-9", "vice_captain_id": "HOM-10"},
    ]
    for fields in bad:
        with pytest.raises(ValidationError):
            FantasySquad.model_validate(fields)


@pytest.mark.parametrize(
    ("model", "fields"), [(KeyMoment, MOMENT), (OverlayCue, CUE), (LedgerEntry, ENTRY)]
)
def test_engine_outputs_need_source_events(model: type[BaseModel], fields: dict[str, Any]) -> None:
    model.model_validate({**fields, "source_event_ids": [3]})
    with pytest.raises(ValidationError):
        model.model_validate({**fields, "source_event_ids": []})


@pytest.mark.parametrize(
    ("period", "clock_s", "expected"),
    [(1, 600.0, 600.0), (1, 2880.0, 2700.0), (2, 3000.0, 3000.0), (2, 5640.0, 5400.0)],
)
def test_nominal_clock_drops_stoppage_time(period: int, clock_s: float, expected: float) -> None:
    assert nominal_seconds(period, clock_s) == expected
