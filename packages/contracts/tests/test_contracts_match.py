"""MatchEvent validation and the committed JSON Schema."""

import json
from typing import Any

import pytest
from pydantic import ValidationError

from contracts import MatchEvent
from contracts.schema import SCHEMA_PATH, json_schema

PASS: dict[str, Any] = {
    "id": 1, "match_id": "m", "period": 1, "clock_s": 1.0, "minute": 0, "type": "pass",
    "team_id": "A", "player_id": "A-6", "possession_id": 1, "x": 10.0, "y": 20.0,
    "end_x": 25.0, "end_y": 30.0, "outcome": "complete", "recipient_id": "A-7",
    "cross": False, "under_pressure": False, "ball_speed_kmh": 45.0,
}  # fmt: skip


def test_valid_pass_event() -> None:
    assert MatchEvent.model_validate(PASS).recipient_id == "A-7"


@pytest.mark.parametrize(
    "change",
    [
        {"end_x": None},  # pass without its required fields
        {"x": 105.5},  # off the pitch
        {"y": -1.0},
        {"period": 3},
        {"type": "header"},  # unknown event type
        {"unknown_field": 1},
    ],
)
def test_invalid_event_rejected(change: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        MatchEvent.model_validate({**PASS, **change})


def test_committed_schema_is_current() -> None:
    committed = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    assert committed == json_schema(), "contracts changed: run `make contracts`"
