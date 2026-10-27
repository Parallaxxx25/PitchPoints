"""Per-match averages over 300 seeds stay inside the agreed realism ranges."""

from simulator.validate import out_of_range, realism, report


def test_realism_over_300_seeds() -> None:
    averages = realism(300)
    assert not out_of_range(averages), report(averages, 300)
