"""Insights engine: one test per stat, tactical index, key moment kind, milestone, and cue template."""

from typing import Any

import pytest

from contracts import KeyMoment, Period, PlayerPosition, PositionFrame
from contracts.testing import MatchBuilder
from insights import Insights, InsightsEngine
from insights import constants as c
from insights.metrics import pass_difficulty


def play(b: MatchBuilder) -> tuple[InsightsEngine, Insights]:
    engine, out = InsightsEngine(b.metadata), Insights()
    for e in b.events:
        out += engine.apply(e)
    return engine, out


def frame(clock_s: float, speeds: dict[str, float], period: Period = 1) -> PositionFrame:
    players = [PlayerPosition(player_id=p, x=50.0, y=30.0, speed_kmh=s) for p, s in speeds.items()]
    return PositionFrame(
        match_id="test-match",
        period=period,
        clock_s=clock_s,
        ball_x=52.5,
        ball_y=34.0,
        players=players,
    )


def milestones(out: Insights, name: str) -> list[KeyMoment]:
    return [m for m in out.moments if m.kind == "milestone" and m.facts["milestone"] == name]


def player(engine: InsightsEngine, player_id: str) -> dict[str, object]:
    stats = engine.stats().players
    return next(p for p in stats if p.player_id == player_id).model_dump()


# ---------- stats ----------
def test_possession_is_the_share_of_in_play_time() -> None:
    b = MatchBuilder().start()  # the home team has the ball from 0:00
    b.at(0.1).add("pass", "HOM-6")
    b.at(0.2).add("pass", "HOM-7")
    b.at(0.3).add("possession_change", "AWY-6")  # home: 18 s
    b.at(0.4).add("pass", "AWY-6")
    b.at(2.4).add("pass", "AWY-7")  # a 120 s gap is a stoppage: only 7 s count, so away: 13 s
    stats = play(b)[0].stats()
    assert stats.home.possession == round(18 / 31, 3)
    assert stats.away.possession == round(13 / 31, 3)


def test_pass_accuracy_and_average_difficulty() -> None:
    b = MatchBuilder().start()
    easy = b.at(1).add("pass", "HOM-6", x=30.0, y=34.0, end_x=40.0, end_y=34.0)
    hard = b.at(2).add("pass", "HOM-6", outcome="incomplete", end_x=95.0, under_pressure=True)
    engine = play(b)[0]
    assert (engine.stats().home.passes, engine.stats().home.pass_accuracy) == (2, 0.5)
    expected = round((pass_difficulty(easy) + pass_difficulty(hard)) / 2, 1)
    assert player(engine, "HOM-6")["avg_pass_difficulty"] == expected


def test_shots_on_target_and_xg() -> None:
    b = MatchBuilder().start()
    b.at(10).add("shot", "HOM-9", xg=0.1, outcome="off_target")
    b.at(11).add("shot", "HOM-9", xg=0.25, outcome="saved")
    engine = play(b)[0]
    home = engine.stats().home
    assert (home.shots, home.shots_on_target, home.xg) == (2, 1, 0.35)
    assert player(engine, "HOM-9")["xg"] == 0.35


def test_distance_and_top_speed_come_from_frames() -> None:
    engine = play(MatchBuilder().start())[0]
    for i in range(100):  # 36 km/h is 20 m per 2 s frame; the first frame has no interval
        engine.apply_frame(frame(i * 2.0, {"HOM-6": 36.0 if i != 50 else 31.0}))
    engine.apply_frame(frame(2700.0, {"HOM-6": 36.0}, period=2))  # a new half adds no distance
    stats = player(engine, "HOM-6")
    assert stats["distance_km"] == round((98 * 20 + 31 / 3.6 * 2) / 1000, 2)
    assert stats["top_speed_kmh"] == 36.0


def test_minutes_exclude_stoppage_time() -> None:
    b = MatchBuilder().start()
    b.at(48, period=1).add("period_end")
    b.at(45).add("kickoff", "AWY-10")
    b.at(70).add("substitution", "HOM-9", player_in_id="HOM-15")
    engine = play(b.full_time())[0]
    assert (player(engine, "HOM-9")["minutes"], player(engine, "HOM-15")["minutes"]) == (70, 20)


def test_field_tilt_counts_final_third_actions() -> None:
    b = MatchBuilder().start()
    for i in range(3):
        b.at(1 + i).add("pass", "HOM-9", x=80.0)
    b.at(5).add("carry", "AWY-9", x=75.0)
    b.at(6).add("pass", "AWY-9", x=50.0)  # outside the final third
    engine = play(b)[0]
    assert engine.stats().home.field_tilt == 0.75
    assert engine.tactical_state().momentum == 50.0


def test_ppda_counts_opponent_passes_per_high_defensive_action() -> None:
    b = MatchBuilder().start()
    for i in range(6):
        b.at(1 + i).add("pass", "AWY-4", x=30.0)  # in their own 60%
    b.at(8).add("pass", "AWY-6", x=70.0)  # not counted
    b.at(9).add("tackle", "HOM-9", x=50.0)
    b.at(10).add("interception", "HOM-10", x=60.0)
    b.at(11).add("tackle", "HOM-2", x=20.0)  # too deep to count
    stats = play(b)[0].stats()
    assert (stats.home.ppda, stats.away.ppda) == (3.0, None)


def test_cards_fouls_and_corners() -> None:
    b = MatchBuilder().start()
    b.at(5).add("foul", "HOM-4")
    b.at(5).add("card", "HOM-4")
    b.at(9).add("corner", "AWY-7")
    b.at(20).add("card", "HOM-4", card="second_yellow")
    stats = play(b)[0].stats()
    assert (stats.home.fouls, stats.home.yellow_cards, stats.home.red_cards) == (1, 2, 1)
    assert stats.away.corners == 1


# ---------- tactical state ----------
def test_pressing_intensity_and_tempo() -> None:
    b = MatchBuilder().start()
    b.at(1).add("possession_change", "AWY-6")
    for i in range(4):
        b.at(1.1 + i / 10).add("pressure", "HOM-9")
    b.at(2).add("possession_change", "HOM-6")
    for i in range(6):
        b.at(2.1 + i / 10).add("pass", "HOM-6")
    b.at(3).add("possession_change", "AWY-6")
    state = play(b)[0].tactical_state()
    assert (state.pressing_intensity.home, state.pressing_intensity.away) == (2.0, 0.0)
    assert state.tempo == 2.0  # 6 passes in 3 minutes


def test_control_chaos_index_tells_control_from_chaos() -> None:
    calm = MatchBuilder().start()
    for i in range(30):
        calm.at(i / 10).add("pass", "HOM-6")
    chaos = MatchBuilder().start()
    for i in range(30):
        side = "HOM" if i % 2 else "AWY"
        chaos.at(i / 10).add("possession_change", f"{side}-6")
        chaos.add("pass", f"{side}-6", outcome="incomplete")
        if i % 5 == 0:
            chaos.add("foul", f"{side}-4")
    assert play(calm)[0].tactical_state().control_chaos_index > 50
    assert play(chaos)[0].tactical_state().control_chaos_index == -100.0


def test_win_probability_follows_the_score() -> None:
    b = MatchBuilder().start()
    level = play(b)[0].tactical_state().win_probability
    assert level.home == level.away
    b.at(80).goal("HOM-9")
    ahead = play(b)[0].tactical_state().win_probability
    assert ahead.home > 0.8 > ahead.away


# ---------- key moments ----------
def test_goal_moment_importance_is_the_win_probability_swing() -> None:
    b = MatchBuilder().start()
    b.at(10).add("pass", "HOM-6")
    goal = b.at(88).goal("HOM-9", assist="HOM-6", xg=0.4)
    out = play(b)[1]
    [m] = [x for x in out.moments if x.kind == "goal"]
    assert m.importance == m.facts["win_prob_swing"] and m.importance > 0.3
    assert m.facts["score_home"] == 1 and m.facts["first_goal"] is True and m.facts["xg"] == 0.4
    assert (m.player_ids, m.source_event_ids) == (["HOM-9", "HOM-6"], [goal.id - 1, goal.id])
    assert any(x.template == "key_moment" and x.source_moment_ids == [m.id] for x in out.cues)


def test_a_late_goal_matters_more_than_an_early_one() -> None:
    def importance(minute: float) -> float:
        b = MatchBuilder().start()
        b.at(minute).goal("HOM-9")
        return next(m.importance for m in play(b)[1].moments if m.kind == "goal")

    assert importance(85) > importance(5)


def test_own_goal_is_a_goal_moment_for_the_other_team() -> None:
    b = MatchBuilder().start()
    b.at(30).own_goal("AWY-2")
    [m] = [x for x in play(b)[1].moments if x.kind == "goal"]
    assert (m.team_id, m.facts["own_goal"], m.facts["score_home"]) == ("HOM", True, 1)


def test_big_chance_is_a_missed_high_xg_shot() -> None:
    b = MatchBuilder().start()
    b.at(10).add("shot", "HOM-9", xg=0.05, outcome="off_target")
    miss = b.at(11).add("shot", "HOM-9", xg=0.45, outcome="off_target")
    [m] = [x for x in play(b)[1].moments if x.kind == "big_chance"]
    assert (m.source_event_ids, m.facts["xg"]) == ([miss.id], 0.45)


def test_save_from_a_good_chance_is_a_moment() -> None:
    b = MatchBuilder().start()
    b.at(10).add("shot", "HOM-9", xg=0.05, outcome="saved")
    b.add("save", "AWY-1", opponent_id="HOM-9")
    shot = b.at(20).add("shot", "HOM-9", xg=0.35, outcome="saved")
    save = b.add("save", "AWY-1", opponent_id="HOM-9")
    out = play(b)[1]
    [m] = [x for x in out.moments if x.kind == "save"]
    assert (m.player_ids, m.source_event_ids) == (["AWY-1", "HOM-9"], [shot.id, save.id])
    assert not any(x.kind == "big_chance" for x in out.moments)


def test_card_moment_cites_the_foul_and_a_red_matters_more() -> None:
    b = MatchBuilder().start()
    foul = b.at(20).add("foul", "HOM-4", opponent_id="AWY-9")
    card = b.add("card", "HOM-4")
    b.at(25).add("foul", "AWY-5")
    b.add("card", "AWY-5", card="red")
    yellow, red = [m for m in play(b)[1].moments if m.kind == "card"]
    assert (yellow.player_ids, yellow.source_event_ids) == (["HOM-4", "AWY-9"], [foul.id, card.id])
    assert red.importance > yellow.importance
    assert float(red.facts["win_prob_home"]) > float(yellow.facts["win_prob_home"])


def test_momentum_swing_when_a_team_takes_over() -> None:
    b = MatchBuilder().start()
    for i in range(c.MOMENTUM_MIN_ACTIONS + 5):
        b.at(1 + i / 10).add("pass", "HOM-9", x=80.0)
    out = play(b)[1]
    [m] = [x for x in out.moments if x.kind == "momentum_swing"]
    assert m.team_id == "HOM" and len(m.source_event_ids) == c.MOMENTUM_MIN_ACTIONS
    assert [x.template for x in out.cues if x.source_moment_ids == [m.id]] == ["momentum_bar"]
    for i in range(40):
        b.at(4 + i / 10).add("pass", "AWY-9", x=80.0)
    swings = [x for x in play(b)[1].moments if x.kind == "momentum_swing"]
    assert [x.team_id for x in swings] == ["HOM", "AWY"]


def test_pressure_spell_once_per_spell() -> None:
    b = MatchBuilder().start()
    spell = [b.at(1 + i / 10).add("pressure", "AWY-9") for i in range(c.PRESSURE_SPELL_COUNT + 2)]
    b.at(10).add("pressure", "AWY-9")  # the spell has ended
    for i in range(c.PRESSURE_SPELL_COUNT):
        b.at(10.1 + i / 10).add("pressure", "AWY-9")
    spells = [m for m in play(b)[1].moments if m.kind == "pressure_spell"]
    assert len(spells) == 2
    assert spells[0].source_event_ids == [e.id for e in spell[: c.PRESSURE_SPELL_COUNT]]


# ---------- milestones ----------
def test_brace_and_hat_trick_tags() -> None:
    b = MatchBuilder().start()
    goals = [b.at(minute).goal("HOM-9") for minute in (10, 20, 30)]
    out = play(b)[1]
    [brace], [hat_trick] = milestones(out, "brace"), milestones(out, "hat_trick")
    assert hat_trick.source_event_ids == [g.id for g in goals]
    assert brace.facts["goals"] == 2
    tags = [x for x in out.cues if x.template == "player_tag"]
    assert [x.anchor_player_id for x in tags] == ["HOM-9", "HOM-9"]


def test_pass_milestone() -> None:
    b = MatchBuilder().start()
    passes = [b.at(i / 10).add("pass", "HOM-6") for i in range(c.PASS_MILESTONE)]
    [m] = milestones(play(b)[1], "passes")
    assert m.source_event_ids == [passes[-1].id]


def test_distance_and_top_speed_tags_cite_the_latest_event() -> None:
    b = MatchBuilder().start()
    engine = play(b)[0]
    out = Insights()
    frames = int(c.DISTANCE_MILESTONE_KM * 1000 / 20) + 2  # 20 m per frame at 36 km/h
    for i in range(frames):
        out += engine.apply_frame(frame(i * 2.0, {"HOM-6": 36.0}))
    [speed], [distance] = milestones(out, "top_speed"), milestones(out, "distance")
    assert speed.facts["speed_kmh"] == 36.0 and distance.player_ids == ["HOM-6"]
    assert speed.source_event_ids == distance.source_event_ids == [b.events[-1].id]


def test_clean_sheet_at_eighty_minutes() -> None:
    b = MatchBuilder().start()
    b.at(30).goal("HOM-9")
    marker = b.at(c.CLEAN_SHEET_MINUTE + 1).add("pass", "HOM-6")
    [m] = milestones(play(b)[1], "clean_sheet")
    assert (m.team_id, m.source_event_ids) == ("HOM", [marker.id])


def test_team_tenth_shot() -> None:
    b = MatchBuilder().start()
    shots = [b.at(1 + i).add("shot", "HOM-9") for i in range(c.TEAM_SHOTS_MILESTONE + 1)]
    [m] = milestones(play(b)[1], "team_shots")
    assert m.source_event_ids == [shots[c.TEAM_SHOTS_MILESTONE - 1].id]


def test_match_top_speed_at_full_time() -> None:
    b = MatchBuilder().start()
    engine = play(b)[0]
    engine.apply_frame(frame(2.0, {"HOM-6": 30.0, "AWY-7": 31.5}))
    with pytest.raises(RuntimeError):
        engine.finalize()
    for e in b.full_time().events[3:]:
        engine.apply(e)
    [m] = milestones(engine.finalize(), "match_top_speed")
    assert (m.player_ids, m.facts["speed_kmh"]) == (["AWY-7"], 31.5)
    assert m.source_event_ids == [b.events[-1].id]


# ---------- overlay cues ----------
def test_pass_quality_cue_for_a_hard_completed_pass_with_spacing() -> None:
    b = MatchBuilder().start()
    hard: dict[str, Any] = {
        "x": 50.0,
        "y": 5.0,
        "end_x": 95.0,
        "end_y": 34.0,
        "under_pressure": True,
    }
    b.at(1).add("pass", "HOM-6", outcome="incomplete", **hard)
    first = b.at(2).add("pass", "HOM-6", **hard)
    b.at(3).add("pass", "HOM-6", **hard)  # too soon after the last cue
    b.at(5).add("pass", "HOM-6", **hard)
    cues = [x for x in play(b)[1].cues if x.template == "pass_quality"]
    assert len(cues) == 2 and cues[0].source_event_ids == [first.id]
    assert float(cues[0].data["difficulty"]) >= c.PASS_QUALITY_CUE_MIN


def test_shot_speed_cue_only_for_shots_on_target() -> None:
    b = MatchBuilder().start()
    b.at(10).add("shot", "HOM-9", outcome="off_target")
    shot = b.at(11).add("shot", "HOM-9", outcome="saved", shot_speed_kmh=101.0)
    [cue] = [x for x in play(b)[1].cues if x.template == "shot_speed"]
    assert (cue.source_event_ids, cue.data["shot_speed_kmh"]) == ([shot.id], 101.0)


def test_half_time_and_full_time_cards() -> None:
    b = MatchBuilder().start()
    b.at(10).goal("HOM-9")
    b.half_time().at(70).goal("AWY-9")
    out = play(b.full_time())[1]
    compare = [x for x in out.cues if x.template == "stat_compare"]
    recaps = [x for x in out.cues if x.template == "recap_card"]
    assert [x.data["period"] for x in compare] == [1, 2] == [x.data["period"] for x in recaps]
    assert (compare[1].data["goals_home"], compare[1].data["goals_away"]) == (1, 1)
    goals = {m.id for m in out.moments if m.kind == "goal"}
    assert goals <= set(recaps[1].source_moment_ids)


def test_cue_timing_comes_from_the_constants() -> None:
    b = MatchBuilder().start()
    b.at(10).goal("HOM-9")
    for cue in play(b)[1].cues:
        assert (cue.duration_s, cue.priority) == c.CUE_TIMING[cue.template]


def test_every_moment_and_cue_cites_events_from_the_match() -> None:
    b = MatchBuilder().start()
    for i in range(20):
        b.at(1 + i / 4).add("pass", "HOM-9", x=85.0)
        b.add("pressure", "AWY-6")
    b.at(10).goal("HOM-9")
    b.at(20).add("foul", "AWY-4")
    b.add("card", "AWY-4", card="red")
    out = play(b.full_time())[1]
    events = {e.id for e in b.events}
    moments = {m.id for m in out.moments}
    assert out.moments and out.cues
    assert all(set(m.source_event_ids) <= events for m in out.moments)
    assert all(x.source_event_ids and set(x.source_event_ids) <= events for x in out.cues)
    assert all(set(x.source_moment_ids) <= moments for x in out.cues)
