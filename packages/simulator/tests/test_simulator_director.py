"""Director mode: every scripted moment happens, on time, to the scripted team and player."""

from pathlib import Path

import pytest

from contracts import MatchEvent
from simulator import DirectorScript, Moment, load_script, simulate

DEMO = Path(__file__).parents[1] / "director" / "demo.yaml"


def happened(e: MatchEvent, m: Moment, team_id: str) -> bool:
    on_time = e.period == (1 if m.minute <= 45 else 2) and m.minute <= e.minute <= m.minute + 3
    player_ok = m.shirt is None or e.player_id == f"{team_id}-{m.shirt}"
    if not (on_time and player_ok and e.team_id == team_id):
        return False
    match m.type:
        case "goal":
            return e.type == "goal"
        case "penalty":
            return e.type == "shot" and bool(e.penalty) and e.outcome == m.outcome
        case "yellow_card":
            return e.type == "card" and e.card in ("yellow", "second_yellow")
        case "red_card":
            return e.type == "card" and e.card == "red"


@pytest.mark.parametrize("seed", range(10))
def test_demo_script_moments_all_happen(seed: int) -> None:
    script = load_script(DEMO)
    match = simulate(seed, script, frames=False)
    team_ids = {"home": match.metadata.home.id, "away": match.metadata.away.id}
    for moment in script.moments:
        team_id = team_ids[moment.team]
        assert any(happened(e, moment, team_id) for e in match.events), moment


def test_script_cannot_send_off_a_goalkeeper() -> None:
    script = DirectorScript(moments=[Moment(minute=30, type="red_card", team="home", shirt=1)])
    with pytest.raises(ValueError, match="goalkeeper"):
        simulate(1, script, frames=False)
