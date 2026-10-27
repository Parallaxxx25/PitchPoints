"""Fantasy scoring rules, loaded and validated from `packages/scoring/rules.yaml`."""

from pathlib import Path
from typing import TypedDict

import yaml
from pydantic import BaseModel, ConfigDict

from contracts import EventType, Position

RULES_PATH = Path(__file__).parents[2] / "rules.yaml"


class PerPosition(TypedDict):
    GK: int
    DEF: int
    MID: int
    FWD: int


class _Strict(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Points(_Strict):
    appearance: PerPosition
    sixty_minutes: PerPosition
    goal: PerPosition
    assist: PerPosition
    clean_sheet: PerPosition
    saves: PerPosition
    penalty_save: PerPosition
    penalty_miss: PerPosition
    goals_conceded: PerPosition
    yellow_card: PerPosition
    red_card: PerPosition
    own_goal: PerPosition
    defensive_contribution: PerPosition


class DefensiveContribution(_Strict):
    threshold: PerPosition
    actions: dict[Position, list[EventType]]


class BonusScore(_Strict):
    goal: PerPosition
    assist: int
    save: int
    penalty_save: int
    defensive_action: int
    yellow_card: int
    red_card: int
    own_goal: int
    penalty_miss: int


class Bonus(_Strict):
    points: list[int]
    score: BonusScore


class Rules(_Strict):
    points: Points
    sixty_minutes: int
    clean_sheet_minutes: int
    saves_per_point: int
    goals_conceded_per_point: int
    defensive_contribution: DefensiveContribution
    bonus: Bonus


def load_rules(path: Path = RULES_PATH) -> Rules:
    """Read and validate a rules file."""
    return Rules.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))
