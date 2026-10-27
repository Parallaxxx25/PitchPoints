"""JSON Schema for every contract; the TypeScript types in `web/` are generated from it.

Regenerate with `make contracts` (runs `python -m contracts.schema`).
"""

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, TypeAdapter
from pydantic.json_schema import GenerateJsonSchema, models_json_schema

from contracts.fantasy import FantasySquad, LedgerEntry
from contracts.insights import KeyMoment, OverlayCue, StatSnapshot, TacticalState
from contracts.match import SimulatorMessage

SCHEMA_PATH = Path(__file__).parents[2] / "pitchpoints.schema.json"
ENGINE_OUTPUTS: tuple[type[BaseModel], ...] = (
    StatSnapshot,
    TacticalState,
    KeyMoment,
    OverlayCue,
    LedgerEntry,
    FantasySquad,
)


class _NoFieldTitles(GenerateJsonSchema):
    """Keep titles on models only, so generated TypeScript has no per-field aliases."""

    def field_title_should_be_set(self, schema: Any) -> bool:
        return False


def json_schema() -> dict[str, Any]:
    """Serialization-mode JSON Schema; the root is a union of every top-level contract, each named in `$defs`."""
    _, schema = models_json_schema(
        [(m, "serialization") for m in ENGINE_OUTPUTS], schema_generator=_NoFieldTitles
    )
    union = TypeAdapter(SimulatorMessage).json_schema(
        mode="serialization", schema_generator=_NoFieldTitles
    )
    defs = {**schema["$defs"], **union.pop("$defs"), "SimulatorMessage": union}
    names = ["SimulatorMessage", *(m.__name__ for m in ENGINE_OUTPUTS)]
    return {
        "anyOf": [{"$ref": f"#/$defs/{n}"} for n in names],
        "$defs": dict(sorted(defs.items())),
    }


def main() -> None:
    """Write the schema to `packages/contracts/pitchpoints.schema.json`."""
    SCHEMA_PATH.write_text(json.dumps(json_schema(), indent=2) + "\n", newline="\n")


if __name__ == "__main__":
    main()
