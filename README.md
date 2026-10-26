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
