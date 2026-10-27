"""JSON Schema for every contract; the TypeScript types in `web/` are generated from it.

Regenerate with `make contracts` (runs `python -m contracts.schema`).
"""

import json
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter
from pydantic.json_schema import GenerateJsonSchema

from contracts.match import SimulatorMessage

SCHEMA_PATH = Path(__file__).parents[2] / "pitchpoints.schema.json"


class _NoFieldTitles(GenerateJsonSchema):
    """Keep titles on models only, so generated TypeScript has no per-field aliases."""

    def field_title_should_be_set(self, schema: Any) -> bool:
        return False


def json_schema() -> dict[str, Any]:
    """Return the serialization-mode JSON Schema of every simulator message."""
    return TypeAdapter(SimulatorMessage).json_schema(
        mode="serialization", schema_generator=_NoFieldTitles
    )


def main() -> None:
    """Write the schema to `packages/contracts/pitchpoints.schema.json`."""
    SCHEMA_PATH.write_text(json.dumps(json_schema(), indent=2) + "\n", newline="\n")


if __name__ == "__main__":
    main()
