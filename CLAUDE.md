# CLAUDE.md: PitchPoints

PitchPoints is an AI match insights engine on Azure. It turns synthetic football events into real-time stats, explained key moments, live narratives, and automated recaps, rendered as timed broadcast overlays and personalised per fan (mode, favourite club or player, fantasy squad, language). The full build plan is in `PLAN.md`; read it at the start of every session and follow the current phase.

## Non-negotiable rules

1. **Every number is deterministic code, never an LLM.** `packages/insights` (stats, tactical indices, win probability, key moments, overlay cue data) and `packages/scoring` (fantasy points) are pure Python with no I/O and no model calls. Agents may read engine output to explain, narrate, personalise, and translate; they must never calculate, estimate, or modify numbers.
2. **Synthetic, fictional data only.** No real Premier League match data, club names, or player names anywhere in the repo, fixtures, prompts, or screenshots.
3. **Every number is traceable.** Every `LedgerEntry`, `KeyMoment`, and `OverlayCue` references the `source_event_ids` (or source moments) that caused it. Keep this true when changing the engines.
4. **Every number and name shown by an agent is verified** against engine output by the fact-checker before reaching the UI or the overlay feed, in every supported language.
5. **Determinism.** The simulator must produce identical output for the same seed and director script. Never use the global `random` module; pass a seeded `random.Random`.
6. **Ports and adapters.** Business logic depends on the ports (EventBus, Store, LivePush, LLM), never on Azure SDKs directly. Azure SDK imports live only in `*/adapters/azure_*.py`.
7. **No magic numbers.** Fantasy point values live in `packages/scoring/rules.yaml`. Insight thresholds and weights are named, documented constants in one module of `packages/insights`.

## Conventions

- Python 3.12, `uv` workspace (members under `packages/` and `services/`), Pydantic v2 for all contracts, type hints everywhere (mypy strict).
- Contracts are defined once in `packages/contracts`; TypeScript types are generated from them. Do not hand-write duplicate types in `web/`.
- Frontend: React + TypeScript + Vite + Tailwind, pnpm. Pitch is SVG in a 105 x 68 coordinate system. Events arrive in the acting team's perspective; flip in one helper (`toScreenCoords`), nowhere else.
- Personalisation and language are parameters: prompts take the output language and viewer mode as inputs; UI strings are localised, never hard-coded in components.
- Overlay cues are timed (`start_clock_s`, `duration_s`) and validate against the `OverlayCue` contract; stat cues use templated text, narrative cues use fact-checked agent text.
- Small, focused modules. Docstrings on public functions. No commented-out code.
- Tests accompany every feature. Bug fixes start with a failing test. Test file names are unique across the repo (pytest and mypy use flat module names).
- Prompts live in versioned files under `packages/agents/prompts/`, not inline strings.
- Secrets come from environment variables locally and Key Vault / managed identity on Azure. Never commit keys or `.env` files.
- For Microsoft Agent Framework, Azure Functions bindings, and Azure SDK APIs, check the current official documentation before writing code; these APIs change frequently.

## Commands

Update this section as the project takes shape.

```bash
make install        # uv sync + pnpm install
make check          # lint + type-check + all tests (backend and frontend)
uv run pytest       # backend tests
cd web && pnpm dev  # frontend dev server
```

Planned (not yet implemented):

```bash
uv run python -m simulator --validate 300   # realism report (Phase 1)
uv run devserver    # local live pipeline, PITCHPOINTS_MODE=local (Phase 3)
azd up              # deploy to Azure (Phase 6)
```

## Definition of done for any task

- Acceptance criteria for the current phase in `PLAN.md` are met.
- `make check` passes.
- README or docs updated if behaviour or commands changed.
- Progress log in `PLAN.md` updated with date, phase, status, and short notes.
