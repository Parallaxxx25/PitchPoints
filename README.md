# PitchPoints

AI match insights engine on Azure: turns synthetic football events into real-time stats, explained key moments, live narratives, and automated recaps, rendered as timed broadcast overlays and personalised for every fan, from the data-hungry analyst to the casual viewer.

Built for the Microsoft x Premier League "Inside the Game" hackathon. All clubs, players, and matches are synthetic and fictional.

> Work in progress. See [PLAN.md](PLAN.md) for the build plan and progress log.

## Run locally

Prerequisites: [uv](https://docs.astral.sh/uv/), Node.js 24, pnpm 10, and GNU make (on Windows: `winget install ezwinports.make`).

```bash
make install        # Python workspace + web dependencies
make check          # lint, type-check, and test everything
cd web && pnpm dev  # frontend dev server
```

Simulate a match (fictional clubs, deterministic per seed):

```bash
uv run python -m simulator --seed 7 --out match.jsonl       # metadata, events, position frames as JSONL
uv run python -m simulator --seed 7 --stream --speed 18     # replay live to stdout (90 minutes in ~5)
uv run python -m simulator --seed 7 --script packages/simulator/director/demo.yaml --out demo.jsonl
uv run python -m simulator --validate 300                   # realism report over 300 seeds
```

Director mode scripts force key moments (goals, penalties, cards) at given minutes so a demo always has drama; see `packages/simulator/director/demo.yaml`.

## Engines

Two deterministic engines turn the event stream into numbers; agents only ever explain them.

- `packages/insights`: `InsightsEngine` produces team and player stats, tactical state (momentum, control vs chaos, pressing, tempo, win probability), key moments, and timed overlay cues. Every threshold and weight is a documented constant in `insights/constants.py`.
- `packages/scoring`: `ScoringEngine` produces the fantasy points ledger from `packages/scoring/rules.yaml`. Clean sheets, goals conceded, and the simplified PitchPoints bonus are provisional until full time.

Every key moment, overlay cue, and ledger entry cites the events that caused it. Golden matches in `tests/golden/` pin the full output for three seeds; after an intended change, run `UPDATE_GOLDEN=1 uv run pytest tests/test_engine_pipeline.py` and review the diff.

## Repository layout

| Path | Contents |
|---|---|
| `packages/contracts` | Pydantic data contracts (source of the generated TypeScript types) |
| `packages/simulator` | Deterministic synthetic match simulator |
| `packages/insights` | Deterministic stats, tactical indices, key moments, overlay cue data |
| `packages/scoring` | Deterministic fantasy scoring engine |
| `packages/agents` | Agents that explain, narrate, personalise, and translate |
| `services/devserver` | Local FastAPI live pipeline |
| `web` | React fan app and broadcast overlay view |
| `tests` | Cross-package and golden-match tests |
