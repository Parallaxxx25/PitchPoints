"""The same seed and director script always produce identical output."""

from pathlib import Path

from simulator import DirectorScript, load_script, simulate

DEMO = Path(__file__).parents[1] / "director" / "demo.yaml"


def lines(seed: int, script: DirectorScript | None = None) -> list[str]:
    return [m.model_dump_json() for m in simulate(seed, script).messages()]


def test_same_seed_is_identical() -> None:
    assert lines(7) == lines(7)


def test_same_seed_and_script_is_identical() -> None:
    script = load_script(DEMO)
    assert lines(7, script) == lines(7, script)


def test_different_seeds_differ() -> None:
    assert lines(7) != lines(8)
