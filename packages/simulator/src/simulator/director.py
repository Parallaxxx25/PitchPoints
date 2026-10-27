"""Director mode: a YAML script that forces key moments at given minutes.

Example (see `packages/simulator/director/demo.yaml`):

    moments:
      - {minute: 12, type: goal, team: home, shirt: 10}
      - {minute: 58, type: penalty, team: away, outcome: saved}
      - {minute: 70, type: red_card, team: away}

Minutes 1-45 happen in the first half, 46-90 in the second. A scripted player
is protected from routine substitution; if they are no longer on the pitch, the
engine picks the most suitable active player instead.
"""

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field


class Moment(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    minute: int = Field(ge=1, le=90)
    type: Literal["goal", "penalty", "yellow_card", "red_card"]
    team: Literal["home", "away"]
    shirt: int | None = Field(default=None, ge=1, le=99)
    outcome: Literal["goal", "saved", "off_target"] = "goal"  # penalties only


class DirectorScript(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    moments: list[Moment]


def load_script(path: Path) -> DirectorScript:
    """Read and validate a director script."""
    return DirectorScript.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))
