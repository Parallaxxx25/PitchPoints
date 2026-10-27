"""The pure pipeline: engine output, stats throttling, and full time."""

from contracts import KeyMoment, LedgerEntry, LiveMessage, MatchEvent, StatSnapshot
from devserver.pipeline import KEY_EVENTS, STATS_INTERVAL_S, Pipeline
from insights import InsightsEngine
from scoring import ScoringEngine
from simulator import simulate

MATCH = simulate(5, frames=False)


def run() -> tuple[Pipeline, list[list[LiveMessage]]]:
    pipeline = Pipeline(MATCH.metadata)
    return pipeline, [pipeline.handle(e) for e in MATCH.events]


def test_output_matches_the_engines_run_directly() -> None:
    _, batches = run()
    out = [x for batch in batches for x in batch]
    insights, scoring = InsightsEngine(MATCH.metadata), ScoringEngine(MATCH.metadata)
    for e in MATCH.events:
        insights.apply(e)
        scoring.apply(e)
    insights.finalize()
    scoring.finalize()
    assert [x for x in out if isinstance(x, KeyMoment)] == insights.moments()
    latest = {x.id: x for x in out if isinstance(x, LedgerEntry)}
    assert list(latest.values()) == scoring.ledger()
    assert [x for x in out if isinstance(x, MatchEvent)] == MATCH.events


def test_stats_are_throttled_but_follow_every_key_event() -> None:
    _, batches = run()
    stats = [x for batch in batches for x in batch if isinstance(x, StatSnapshot)]
    assert 90 * 60 / STATS_INTERVAL_S / 2 < len(stats) < len(MATCH.events) / 2
    for e, batch in zip(MATCH.events, batches, strict=True):
        if e.type in KEY_EVENTS:
            assert any(isinstance(x, StatSnapshot) for x in batch), e.type


def test_nothing_after_full_time() -> None:
    pipeline, _ = run()
    assert pipeline.finished
    assert pipeline.handle(MATCH.events[-1]) == []
    state = pipeline.state("running", 18, revision=0)
    assert state.status == "finished"
    final = MATCH.events[-1].score or {}
    home, away = MATCH.metadata.home.id, MATCH.metadata.away.id
    assert (state.score_home, state.score_away) == (final[home], final[away])


def test_state_before_kickoff() -> None:
    state = Pipeline(MATCH.metadata).state("paused", 6, revision=0)
    assert (state.status, state.minute, state.last_event_id, state.score_home) == (
        "paused",
        0,
        0,
        0,
    )
