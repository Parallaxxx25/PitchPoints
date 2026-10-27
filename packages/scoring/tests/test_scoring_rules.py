"""One test per fantasy rule in rules.yaml, plus provisional entries, bonus, and squad totals."""

import pytest
import yaml

from contracts import EventType, FantasySquad, LedgerEntry
from contracts.testing import MatchBuilder
from scoring import RULES_PATH, Rules, ScoringEngine, bonus_points, load_rules


def play(b: MatchBuilder, rules: Rules | None = None) -> ScoringEngine:
    engine = ScoringEngine(b.metadata, rules)
    for e in b.events:
        engine.apply(e)
    return engine


def points(engine: ScoringEngine, player_id: str, rule_id: str) -> int:
    return sum(x.delta for x in engine.ledger(player_id) if x.rule_id == rule_id)


def entries(engine: ScoringEngine, player_id: str, rule_id: str) -> list[LedgerEntry]:
    return [x for x in engine.ledger(player_id) if x.rule_id == rule_id]


def test_rules_file_holds_the_plan_starting_values() -> None:
    rules = load_rules()
    assert rules.points.goal == {"GK": 10, "DEF": 6, "MID": 5, "FWD": 4}
    assert rules.points.clean_sheet == {"GK": 4, "DEF": 4, "MID": 1, "FWD": 0}
    assert (rules.saves_per_point, rules.goals_conceded_per_point) == (3, 2)
    assert rules.bonus.points == [3, 2, 1]


def test_point_values_come_from_the_rules_file() -> None:
    data = yaml.safe_load(RULES_PATH.read_text(encoding="utf-8"))
    data["points"]["goal"]["FWD"] = 7
    b = MatchBuilder().start()
    b.at(10).goal("HOM-9")
    assert points(play(b, Rules.model_validate(data)), "HOM-9", "goal") == 7


def test_appearance_for_starters_and_substitutes_only() -> None:
    b = MatchBuilder().start()
    sub = b.at(70).add("substitution", "HOM-11", player_in_id="HOM-16")
    engine = play(b)
    assert points(engine, "HOM-1", "appearance") == 1
    assert entries(engine, "HOM-16", "appearance")[0].source_event_ids == [sub.id]
    assert "HOM-15" not in engine.totals()


def test_sixty_minutes_point_cites_the_first_event_after_the_hour() -> None:
    b = MatchBuilder().start()
    b.at(59.5).add("pass", "HOM-6")
    marker = b.at(61).add("pass", "AWY-6")
    [entry] = entries(play(b), "HOM-2", "sixty_minutes")
    assert (entry.delta, entry.source_event_ids, entry.minute) == (1, [marker.id], 61)


def test_substituted_before_sixty_minutes_gets_one_point() -> None:
    b = MatchBuilder().start()
    b.at(58).add("substitution", "HOM-9", player_in_id="HOM-15")
    b.full_time()
    engine = play(b)
    assert engine.totals()["HOM-9"] == 1
    assert points(engine, "HOM-15", "sixty_minutes") == 0


def test_stoppage_time_does_not_count_towards_minutes() -> None:
    b = MatchBuilder().start()
    b.at(49, period=1).add("period_end")  # four minutes of first-half stoppage time
    b.at(45).add("kickoff", "AWY-10")
    b.at(59.5).add("substitution", "HOM-9", player_in_id="HOM-15")
    assert points(play(b), "HOM-9", "sixty_minutes") == 0


@pytest.mark.parametrize(
    ("scorer", "expected"), [("HOM-1", 10), ("HOM-2", 6), ("HOM-6", 5), ("HOM-9", 4)]
)
def test_goal_points_depend_on_position(scorer: str, expected: int) -> None:
    b = MatchBuilder().start()
    goal = b.at(10).goal(scorer)
    [entry] = entries(play(b), scorer, "goal")
    assert (entry.delta, entry.source_event_ids) == (expected, [goal.id - 1, goal.id])


def test_assist_cites_the_pass_and_the_goal() -> None:
    b = MatchBuilder().start()
    passed = b.at(10).add("pass", "HOM-6", recipient_id="HOM-9")
    goal = b.goal("HOM-9", assist="HOM-6")
    [entry] = entries(play(b), "HOM-6", "assist")
    assert (entry.delta, entry.source_event_ids) == (3, [passed.id, goal.id])
    assert entry.reason == "Assist for Home 9's goal"


def test_clean_sheet_is_provisional_until_full_time() -> None:
    b = MatchBuilder().start().full_time()
    engine = play(b)
    live = {pid: points(engine, pid, "clean_sheet") for pid in ("HOM-1", "HOM-2", "HOM-6", "HOM-9")}
    assert live == {"HOM-1": 4, "HOM-2": 4, "HOM-6": 1, "HOM-9": 0}
    assert all(x.provisional for x in engine.ledger() if x.rule_id == "clean_sheet")
    final = engine.finalize()
    assert {x.rule_id for x in final} == {"clean_sheet"}
    assert final[0].source_event_ids[-1] == b.events[-1].id  # cites match_end
    assert not any(x.provisional for x in engine.ledger())


def test_clean_sheet_is_lost_when_the_team_concedes() -> None:
    b = MatchBuilder().start()
    b.at(65).add("pass", "HOM-6")
    goal = b.at(70).goal("AWY-9")
    [entry] = entries(play(b), "HOM-1", "clean_sheet")
    assert (entry.delta, entry.reason, entry.source_event_ids) == (0, "Clean sheet lost", [goal.id])
    assert entry.running_total == 2  # appearance + 60 minutes; the 4 is gone


def test_clean_sheet_is_kept_by_a_player_substituted_before_the_goal() -> None:
    b = MatchBuilder().start()
    b.at(66).add("substitution", "HOM-2", player_in_id="HOM-12")
    b.at(70).goal("AWY-9")
    engine = play(b)
    assert points(engine, "HOM-2", "clean_sheet") == 4
    assert entries(engine, "HOM-12", "clean_sheet") == []


def test_one_point_every_three_saves() -> None:
    b = MatchBuilder().start()
    saves = [b.at(10 + i).add("save", "AWY-1") for i in range(7)]
    found = entries(play(b), "AWY-1", "saves")
    assert [x.delta for x in found] == [1, 1]
    assert found[0].source_event_ids == [s.id for s in saves[:3]]


def test_penalty_save() -> None:
    b = MatchBuilder().start()
    save = b.at(10).add("save", "AWY-1", penalty=True)
    [entry] = entries(play(b), "AWY-1", "penalty_save")
    assert (entry.delta, entry.source_event_ids) == (5, [save.id])


def test_penalty_miss_but_not_an_open_play_miss() -> None:
    b = MatchBuilder().start()
    b.at(10).add("shot", "HOM-9", outcome="off_target")
    b.at(20).add("shot", "HOM-9", penalty=True, outcome="saved", xg=0.76)
    assert [x.delta for x in entries(play(b), "HOM-9", "penalty_miss")] == [-2]


def test_goals_conceded_cost_a_point_per_two_for_goalkeepers_and_defenders() -> None:
    b = MatchBuilder().start()
    for minute in (10, 20, 30, 40):
        b.at(minute).goal("AWY-9")
    engine = play(b)
    assert points(engine, "HOM-1", "goals_conceded") == -2
    assert points(engine, "HOM-2", "goals_conceded") == -2
    assert points(engine, "HOM-6", "goals_conceded") == 0
    [entry] = entries(engine, "HOM-1", "goals_conceded")
    assert entry.provisional and len(entry.source_event_ids) == 4


def test_sent_off_players_keep_conceding_but_substituted_players_do_not() -> None:
    b = MatchBuilder().start()
    b.at(10).add("card", "HOM-3", card="red")
    b.at(20).add("substitution", "HOM-2", player_in_id="HOM-12")
    b.at(30).goal("AWY-9")
    b.at(31).goal("AWY-9")
    engine = play(b)
    assert points(engine, "HOM-3", "goals_conceded") == -1
    assert points(engine, "HOM-2", "goals_conceded") == 0
    assert points(engine, "HOM-12", "goals_conceded") == -1


def test_yellow_card() -> None:
    b = MatchBuilder().start()
    card = b.at(10).add("card", "HOM-6")
    [entry] = entries(play(b), "HOM-6", "yellow_card")
    assert (entry.delta, entry.source_event_ids) == (-1, [card.id])


def test_red_card_stops_the_minutes() -> None:
    b = MatchBuilder().start()
    b.at(30).add("card", "HOM-3", card="red")
    b.full_time()
    engine = play(b)
    assert points(engine, "HOM-3", "red_card") == -3
    assert points(engine, "HOM-3", "sixty_minutes") == 0
    assert points(engine, "HOM-3", "clean_sheet") == 0


def test_second_yellow_totals_the_red_card_deduction() -> None:
    b = MatchBuilder().start()
    b.at(10).add("card", "HOM-6")
    b.at(50).add("card", "HOM-6", card="second_yellow")
    engine = play(b)
    assert points(engine, "HOM-6", "yellow_card") + points(engine, "HOM-6", "red_card") == -3


def test_own_goal_counts_against_the_player_and_their_team() -> None:
    b = MatchBuilder().start()
    own = b.at(10).own_goal("HOM-2")
    b.at(20).own_goal("HOM-3")
    engine = play(b)
    assert entries(engine, "HOM-2", "own_goal")[0].source_event_ids == [own.id]
    assert points(engine, "HOM-2", "own_goal") == -2
    assert points(engine, "HOM-1", "goals_conceded") == -1


def test_defensive_contribution_for_defenders_at_ten_actions() -> None:
    b = MatchBuilder().start()
    actions: list[EventType] = ["tackle", "interception", "clearance", "block"] * 5
    counted = [b.at(1 + i).add(a, "HOM-2") for i, a in enumerate(actions[:9])]
    b.at(15).add("ball_recovery", "HOM-2")  # recoveries do not count for defenders
    assert points(play(b), "HOM-2", "defensive_contribution") == 0
    counted.append(b.at(16).add("tackle", "HOM-2"))
    for i, a in enumerate(actions[10:]):
        b.at(20 + i).add(a, "HOM-2")
    [entry] = entries(play(b), "HOM-2", "defensive_contribution")
    assert (entry.delta, entry.source_event_ids) == (2, [e.id for e in counted])


def test_defensive_contribution_for_midfielders_counts_recoveries() -> None:
    b = MatchBuilder().start()
    for i in range(11):
        b.at(1 + i).add("tackle", "HOM-6")
    assert points(play(b), "HOM-6", "defensive_contribution") == 0
    b.at(20).add("ball_recovery", "HOM-6")
    assert points(play(b), "HOM-6", "defensive_contribution") == 2


def test_goalkeepers_earn_no_defensive_contribution() -> None:
    b = MatchBuilder().start()
    for i in range(15):
        b.at(1 + i).add("clearance", "HOM-1")
    assert points(play(b), "HOM-1", "defensive_contribution") == 0


@pytest.mark.parametrize(
    ("scores", "expected"),
    [
        ({"a": 30, "b": 30, "c": 10, "d": 5}, {"a": 3, "b": 3, "c": 1}),
        ({"a": 30, "b": 20, "c": 20, "d": 10}, {"a": 3, "b": 2, "c": 2}),
        ({"a": 30, "b": 20, "c": 10, "d": 10}, {"a": 3, "b": 2, "c": 1, "d": 1}),
        ({"a": 5, "b": 0, "c": -3}, {"a": 3}),
    ],
)
def test_bonus_ranks_share_ties(scores: dict[str, int], expected: dict[str, int]) -> None:
    assert bonus_points(scores, [3, 2, 1]) == expected


def test_bonus_is_provisional_and_moves_when_a_player_is_overtaken() -> None:
    b = MatchBuilder().start()
    b.at(10).goal("HOM-9")
    assert points(play(b), "HOM-9", "bonus") == 3
    b.at(20).goal("AWY-9")
    b.at(30).goal("AWY-9")
    engine = play(b)
    assert (points(engine, "AWY-9", "bonus"), points(engine, "HOM-9", "bonus")) == (3, 2)
    assert all(x.provisional for x in engine.ledger() if x.rule_id == "bonus")
    b.full_time()
    engine = play(b)
    final = engine.finalize()
    assert {x.player_id for x in final if x.rule_id == "bonus"} == {"AWY-9", "HOM-9"}
    assert not any(x.provisional for x in engine.ledger())


def test_finalize_needs_match_end() -> None:
    with pytest.raises(RuntimeError):
        ScoringEngine(MatchBuilder().metadata).finalize()


def squad(captain: str, vice: str, extra: str = "HOM-11") -> FantasySquad:
    players = [f"HOM-{n}" for n in range(1, 11)] + [extra]
    return FantasySquad(players=players, captain_id=captain, vice_captain_id=vice)


def test_squad_total_doubles_the_captain() -> None:
    b = MatchBuilder().start()
    b.at(10).goal("HOM-9", assist="HOM-6")
    engine = play(b.full_time())
    totals = engine.totals()
    team = squad("HOM-9", "HOM-6")
    assert engine.squad_total(team) == sum(totals[p] for p in team.players) + totals["HOM-9"]


def test_vice_captain_is_doubled_while_the_captain_has_not_played() -> None:
    b = MatchBuilder().start()
    b.at(10).goal("HOM-9")
    engine = play(b)
    totals = engine.totals()
    team = squad("HOM-16", "HOM-9", extra="HOM-16")
    assert engine.squad_total(team) == sum(totals.get(p, 0) for p in team.players) + totals["HOM-9"]


def test_every_entry_cites_events_from_the_match() -> None:
    b = MatchBuilder().start()
    b.at(10).add("pass", "HOM-6", recipient_id="HOM-9")
    b.goal("HOM-9", assist="HOM-6")
    b.at(30).add("card", "AWY-4")
    b.at(55).add("substitution", "AWY-9", player_in_id="AWY-15")
    b.at(70).own_goal("AWY-2")
    b.full_time()
    engine = ScoringEngine(b.metadata)
    issued = [x for e in b.events for x in engine.apply(e)] + engine.finalize()
    ids = {e.id for e in b.events}
    assert issued and all(x.source_event_ids and set(x.source_event_ids) <= ids for x in issued)
