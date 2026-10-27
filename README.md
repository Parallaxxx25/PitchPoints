# PitchPoints

AI match insights engine on Azure: turns synthetic football events into real-time stats, explained key moments, live narratives, and automated recaps, rendered as timed broadcast overlays and personalised for every fan, from the data-hungry analyst to the casual viewer.

Built for the Microsoft x Premier League "Inside the Game" hackathon. All clubs, players, and matches are synthetic and fictional.

> Work in progress.

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

Play a match live through the whole pipeline (no Azure needed):

```bash
uv run devserver                                                    # http://127.0.0.1:8000, API docs at /docs
uv run python -m devserver.watch --seed 7 --script demo --speed 18  # in a second terminal: prints the match as it happens
```

| Endpoint | Purpose |
|---|---|
| `POST /matches` | Start a match: `{seed, script?, speed (1, 6, 18, 60), paused?}` |
| `GET /matches/{id}` | Playback status, clock, and score |
| `POST /matches/{id}/control` | Pause, resume, change speed, or seek: `{paused?, speed?, seek_minute?}` |
| `GET /matches/{id}/stats`, `/moments`, `/overlay-cues` | Latest stats, key moments, and the overlay cue export |
| `GET /matches/{id}/ledger`, `/ledger/{player_id}` | Every fantasy ledger entry, or one player's |
| `GET /matches/{id}/replay?event_ids=1&event_ids=2` | The events and position frames around those events (never later than the live match), for replaying them |
| `POST /profiles` | Create a viewer profile (mode, language, favourites, fantasy squad) |
| `WS /live/{id}?profile={profile_id}` | Live messages: a snapshot first, then every event, stat, moment, cue, and ledger update |

The devserver wires the pipeline through ports (`EventBus`, `Store`, `LivePush`) with in-memory adapters; Azure adapters replace them in Phase 6.

## Fan app and broadcast overlay

With the devserver running, start the web app and open http://localhost:5173:

```bash
cd web && pnpm dev   # proxies /matches, /profiles, and /live to the devserver on 127.0.0.1:8000
```

Two steps get you to the match: **set up** (your name, how you watch, your language, and the match's seed, director script, and speed), then **pick your squad** (11 players from both line-ups, filtered by position or club; tap a player on the formation pitch to make them captain or vice-captain). "Watch the match" skips the squad. The match address (`?match=...`) can be shared or reloaded to rejoin the same match.

- **Live screen:** a top bar with the score, clock, playback (pause, 1x to 60x, jump to a minute), mode, and language; team rails with every player's fantasy points or minutes; the pitch; and a live event stream that shows every key moment, only the big ones, or fantasy points as they are scored. Press a player to open their card: match points, key stats, tags, a heatmap, and their points ledger.
- **Five viewing modes** over the same match: Analyst (full team stats, tactical indices, and the xG, momentum, and win-probability timelines), Casual (the big moments in plain words and a few headline numbers), Fantasy (your squad strip and both teams' points), Player focus (one player's card always open), and Club (the match from your favourite club's side). Choices are kept in this browser.
- **Replay:** press any key moment, ledger entry, or underlined team stat (shots, corners, fouls, cards, pressures) to replay its source events on the pitch, then "Back to live". The live match keeps running behind the replay.
- **Languages:** English, Spanish, Portuguese, and Thai. Every number comes from the engines; the UI only formats and words it.
- **Narrow screens:** the pitch stacks above one panel at a time, chosen with pill tabs. Everything works from the keyboard, respects reduced motion, and never relies on colour alone (home players are circles, away players squares).
- **Heatmap:** drawn from the position frames received since you joined, so a reload starts it afresh.
- **Design:** the "Lobby Night Arcade" system (midnight surfaces, a volt-green accent, Plus Jakarta Sans for words and JetBrains Mono for numbers), with the fonts bundled rather than loaded from a CDN.

The broadcast overlay is a transparent 16:9 page that draws the match's overlay cues at their match-clock times, where a graphics system would draw them over a live feed: `http://localhost:5173/overlay?match=<id>`. Add `&lang=es` for another language and `&bg=dark` to preview on a backdrop. A cue stays up for at least four seconds of real time, so cues stay readable when the match is sped up; at 1x the match clock alone decides.

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
