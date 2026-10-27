# PitchPoints: build plan

> PitchPoints is an AI match insights engine on Azure that turns synthetic football events into real-time stats, explained key moments, live narratives, and automated recaps, rendered as timed broadcast overlays and personalised for every fan: from the data-hungry analyst to the casual viewer to the fantasy manager.

This plan is written to be executed with Claude Code, one phase per session. Each phase lists its goal, tasks, and acceptance criteria. Work through phases in order; do not start a phase until the previous phase's acceptance criteria pass.

Hackathon: Microsoft x Premier League "Inside the Game" developer hackathon, challenge **"The Synthetic Match Insights Engine for Premier League Studio"**. All data must be synthetic. Judging is 20% each: technological implementation, agentic design and innovation, real-world impact, user experience and presentation, category adherence.

---

## 1. Product summary

**Who it's for:**

- **Studio, broadcast, and streaming producers** who need timed, machine-readable insight cues to render as graphics on a live feed, plus automated recaps.
- **Fans in any market** who want the same match told their way: by depth (analyst or casual), by favourite club or player, by fantasy squad, and in their language.

**The challenge's five-stage pipeline, as PitchPoints implements it:**

| Stage | PitchPoints |
|---|---|
| (a) Ingest | Synthetic simulator streams events, position frames, and match metadata through the EventBus. |
| (b) Interpret | Deterministic insights engine: team and player stats, pass quality, ball and shot speed, distance and top speed, tactical indices, win probability, key moments, milestones. Deterministic fantasy scoring engine. |
| (c) Explain | Agents explain why a moment matters (control vs chaos, pressure shifts, rhythm, win-probability swing), citing the facts and source events behind every claim. |
| (d) Render | Live 2D pitch app, plus a timed overlay cue feed and a 16:9 overlay view that a graphics partner could render over a live match feed. |
| (e) Personalise | Viewing modes (Analyst, Casual, Fantasy, Player Focus, Club), favourite club and players, a focus metric, and language. |

**Fan app (one screen):**

- A live 2D pitch in the centre showing the ball, 22 players, and each event as it happens.
- A stats panel whose depth and content depend on the viewing mode.
- A narrative feed: live story lines and key moments, each with "why it matters".
- Tap any moment, stat, or fantasy ledger entry to replay its source events on the pitch.
- A companion that answers questions such as "why did the momentum swing after the red card?" or "why does my defender only have 1 point?".
- Half-time and full-time recaps in the viewer's mode and language.

**Broadcast output:**

- An overlay cue feed (live push and JSON export): player tags with speed and distance when thresholds are reached, pass quality, shot speed, momentum bar, key-moment lower thirds, stat comparisons, recap cards.
- An `/overlay` route: a 16:9 transparent page that renders the cue feed, standing in for the production graphics path.

**Key principle:** every number is calculated by deterministic, tested code. AI agents explain, narrate, personalise, and translate. They never compute or alter numbers, and a fact-checker verifies every number and name they output, in every language.

**Out of scope:** auto-eventing from video. The data is synthetic and there is no video feed. Position frames are the contract a vision model would emit, so a model could later replace the simulator's tracking output behind the same port. Documented as future work.

---

## 2. Architecture

```
Match simulator ──► Event stream ──► Insights + scoring engines ──► Store (stats, moments, ledger, cues)
 (Python)           (Event Hubs)      (Azure Functions)              (Cosmos DB)
                                                                         │
  Fan app + /overlay ◄── Live push ◄── Agent team ◄──────────────────────┘
  (Static Web Apps)      (SignalR)     (AI Foundry + Agent Framework)
        │                                   ▲
        └────────── fan questions ──────────┘
```

### Ports and adapters (important)

Everything runs **locally first** with in-process adapters, then swaps to Azure adapters through configuration. This keeps development fast and shows judges a clean, maintainable design.

| Port | Local adapter | Azure adapter |
|---|---|---|
| EventBus | in-memory asyncio queue | Azure Event Hubs |
| Store | in-memory / SQLite | Azure Cosmos DB (NoSQL) |
| LivePush | FastAPI WebSocket | Azure SignalR Service |
| LLM | Azure OpenAI via Foundry (or a stub for tests) | Azure AI Foundry |

Selected with an environment variable, for example `PITCHPOINTS_MODE=local|azure`.

### Tech stack

- **Backend:** Python 3.12, managed with `uv`. Pydantic v2 for all data contracts. FastAPI for the local dev server. Azure Functions (Python v2 programming model) in the cloud.
- **Agents:** Microsoft Agent Framework (Python) on Azure AI Foundry models. Check the current official docs and package names before writing agent code, because the APIs are evolving.
- **Frontend:** React + TypeScript + Vite, Tailwind CSS, SVG for the pitch. Zustand (or React context) for state. UI strings localised. PWA manifest for install-to-home-screen.
- **Infra:** Bicep + Azure Developer CLI (`azd`). Managed identity wherever possible; secrets in Key Vault. Application Insights for logs, metrics, and agent traces.
- **Quality:** pytest, ruff, mypy (backend); vitest, oxlint, prettier (frontend); GitHub Actions CI.

### Repository layout

```
pitchpoints/
├── CLAUDE.md                  # conventions for Claude Code
├── PLAN.md                    # this file
├── README.md
├── Makefile                   # make install / make check
├── azure.yaml                 # azd config (Phase 6)
├── infra/                     # Bicep modules (Phase 6)
├── packages/
│   ├── contracts/             # Pydantic models + generated JSON Schema + TS types
│   ├── simulator/             # match simulator (starts from match_simulator.py)
│   ├── insights/              # deterministic stats, tactical indices, moments, overlay cues
│   ├── scoring/               # deterministic fantasy scoring engine
│   └── agents/                # agent definitions, tools, prompts, evals
├── services/
│   ├── devserver/             # FastAPI local runner (simulator → engines → WebSocket)
│   └── functions/             # Azure Functions app (Phase 6)
├── web/                       # React frontend (fan app + /overlay)
├── tests/                     # cross-package and golden-match tests
└── docs/                      # architecture diagram, demo script, decisions
```

---

## 3. Data contracts

Define these in `packages/contracts` and generate TypeScript types from the JSON Schema so frontend and backend never drift.

**MatchMetadata** (from the simulator, once per match): `match_id, competition, season, matchday, venue, city, kickoff_utc, weather, temperature_c, referee, attendance, home, away` where each team has `id, name, short_name, colours, formation, starters[], bench[]`. All fictional.

**MatchEvent** (from the simulator): `id, match_id, period, clock_s, minute, type, team_id, player_id, possession_id, x, y` plus type-specific fields (`end_x, end_y, outcome, recipient_id, opponent_id, cross, under_pressure, ball_speed_kmh, xg, shot_speed_kmh, penalty, assist_player_id, card, player_in_id, score`), null when unused. A validator enforces the fields each type requires. `opponent_id` is the other-team player involved (pressed, tackled, fouled, or the shooter for blocks and saves). Cards are `yellow`, `second_yellow`, or `red`. A penalty miss is a `shot` with `penalty` true and an outcome other than `goal`. Coordinates are on a 105 x 68 pitch from the acting team's perspective (attacking left to right), rounded to 1 decimal; the frontend flips them for display.

Event types: `match_start, kickoff, pass, carry, pressure, possession_change, shot, goal, own_goal, save, block, tackle, interception, clearance, ball_recovery, foul, card, penalty_won, corner, substitution, period_end, match_end`.

**PositionFrame** (from the simulator, every 2 s): `match_id, period, clock_s, ball_x, ball_y, players [{player_id, x, y, speed_kmh}]`. Coordinates are in the home team's perspective. Distance covered and top speed are derived from frames by the insights engine.

**SimulatorMessage**: `MatchMetadata | MatchEvent | PositionFrame`, tagged by `kind` (`metadata`, `event`, `positions`). The simulator emits metadata first, then events and frames in match-clock order. JSON Schema lives in `packages/contracts/pitchpoints.schema.json`; TypeScript types in `web/src/contracts.gen.ts` (both regenerated by `make contracts`, and `make check` fails if either is stale).

**StatSnapshot** (from the insights engine): team stats (possession, passes, pass accuracy, shots, shots on target, xG, field tilt, pressures, PPDA) and player stats (minutes, passes, pass accuracy, average pass difficulty, distance, top speed, shots, xG, defensive actions). Exact fields fixed in Phase 2.

**TacticalState** (from the insights engine, rolling windows): `momentum, control_chaos_index, pressing_intensity, tempo, win_probability {home, draw, away}`.

**KeyMoment** (from the insights engine): `id, match_id, clock_s, minute, kind, importance, team_id, player_ids[], facts {}, source_event_ids[]`. Kinds include goal, big chance, save, card, momentum swing, pressure spell, milestone.

**LedgerEntry** (from the scoring engine): `id, match_id, player_id, minute, delta, running_total, rule_id, reason, source_event_ids[], provisional (bool)`.

Example: `{delta: 3, rule_id: "assist", reason: "Assist for goal by #9", source_event_ids: [1181, 1182]}`.

**OverlayCue** (timed, machine-readable): `id, match_id, start_clock_s, duration_s, template, priority, anchor_player_id?, data {}, text {language: string}, source_moment_ids[]`. Templates: `player_tag, pass_quality, shot_speed, momentum_bar, key_moment, stat_compare, recap_card`. Timing and data come from the insights engine; narrative text comes from agents after fact-checking.

**ViewerProfile** (from the user): `id, display_name, mode (analyst|casual|fantasy|player_focus|club), language, favourite_club_id?, favourite_player_ids[], focus_metric?, fantasy_squad? {players[11], captain_id, vice_captain_id}`.

**Narrative** (from agents, after fact-checking): `id, match_id, clock_s, kind (live_line|moment_explainer|recap|answer|alert), language, mode, text, cited_moment_ids[], cited_ledger_ids[], cited_event_ids[]`.

**LiveMessage** (pushed to the browser): a tagged union of `event`, `positions`, `stats`, `tactical_state`, `moment`, `ledger_update`, `squad_total`, `overlay_cue`, `narrative`, `match_state`.

---

## 4. Insight metrics

All computed by `packages/insights`: pure Python, no I/O, no model calls. Thresholds and weights are named constants in one module, documented with the formula.

- **Possession:** share of in-play time per team, split at `possession_change` events.
- **Pass quality:** pass length (m), accuracy, and a 0 to 100 **pass difficulty rating** from length, `under_pressure`, progressive distance, destination zone (final third, box), and cross flag.
- **Speed:** ball speed per pass and shot speed per shot (km/h, from simulator fields); player distance covered and top speed (from position frames). Player tags fire when a threshold is crossed (for example top speed over 33 km/h, 10 km covered).
- **xG:** per shot and cumulative timeline.
- **Field tilt / momentum:** share of final-third actions in a rolling 5-minute window.
- **Pressing intensity:** pressures per opponent possession, plus PPDA.
- **Tempo:** passes per minute in a rolling window.
- **Control vs chaos index:** -100 (chaos: turnovers per minute, short possessions, fouls, transitions) to +100 (control: long possessions, high pass accuracy, few turnovers).
- **Win probability:** a simple Poisson model on score, minute, and recent xG rate. Key-moment importance is the absolute win-probability swing, which gives agents a concrete "why it matters" number.
- **Milestones:** first goal, brace and hat-trick, 50th pass, 10 km covered, top speed of the match, clean sheet still intact at 80', team's 10th shot, and similar.

---

## 5. Fantasy scoring rules

Put every value in `packages/scoring/rules.yaml`, never hard-coded, so it can be corrected quickly. **Verify every value against the official current-season Fantasy Premier League rules before the demo; the values below are a starting point.**

| Rule | GK | DEF | MID | FWD |
|---|---|---|---|---|
| Played 1 to 59 minutes | 1 | 1 | 1 | 1 |
| Played 60+ minutes | 2 | 2 | 2 | 2 |
| Goal scored | 10 | 6 | 5 | 4 |
| Assist | 3 | 3 | 3 | 3 |
| Clean sheet (60+ minutes) | 4 | 4 | 1 | 0 |
| Every 3 saves | 1 | – | – | – |
| Penalty save | 5 | – | – | – |
| Penalty miss | -2 | -2 | -2 | -2 |
| Every 2 goals conceded | -1 | -1 | – | – |
| Yellow card | -1 | -1 | -1 | -1 |
| Red card | -3 | -3 | -3 | -3 |
| Own goal | -2 | -2 | -2 | -2 |
| Defensive contributions (DEF: 10 tackles + interceptions + clearances + blocks) | – | 2 | – | – |
| Defensive contributions (MID/FWD: 12 of the above + ball recoveries) | – | – | 2 | 2 |
| Bonus (top 3 by bonus score) | 3 / 2 / 1 | | | |

Notes:

- Clean sheet and goals-conceded points are **provisional** during the match and become final at full time. The UI should show them in a different style.
- The real bonus points system is complex. Implement a **simplified, documented** bonus score (goals, assists, key defensive actions, saves, minus cards) and label it "PitchPoints bonus (simplified)". Show provisional bonus live.
- Captain points are doubled at the squad-total level, not in the player ledger.

---

## 6. Phases

Estimated total: about 5 weeks part-time for one person. Times are rough.

### Phase 0: repository foundation (0.5 day)

Goal: a clean monorepo that builds, lints, and tests from day one.

Tasks:
- Create the layout above. `uv` workspace for Python packages (`contracts`, `simulator`, `insights`, `scoring`, `agents`, `devserver`) and `pnpm` for `web/`. Directories for later phases (`infra/`, `services/functions/`, `docs/`) are created by those phases.
- Add ruff, mypy, pytest, oxlint, prettier, vitest configs. Vite + React + TypeScript + Tailwind skeleton in `web/`.
- `Makefile` with `install` and `check`.
- GitHub Actions workflow running `make install check`.
- README skeleton with the one-line definition and a "run locally" section.

Acceptance: `make check` runs all linters, type checks, and tests and passes on the empty project; CI is green.

### Phase 1: contracts and simulator (2 days)

Goal: a deterministic, football-realistic simulator emitting validated events, position frames, and metadata.

Tasks:
- Define the contracts in section 3 that the simulator emits (`MatchMetadata`, `MatchEvent`, `PositionFrame`) and generate JSON Schema and TypeScript types.
- Move `match_simulator.py` into `packages/simulator`, split into modules (teams, engine, xg, positions, cli).
- Emit events as Pydantic `MatchEvent` models; validate every event in tests. Round all coordinates to 1 decimal.
- Add missing events: `pressure` (the existing internal pressure roll becomes an emitted event with `target_id`), `possession_change`, `own_goal`, `penalty_won`, penalty miss flag.
- Add `under_pressure` and `ball_speed_kmh` to passes, `shot_speed_kmh` to shots.
- Emit fictional `MatchMetadata`.
- Emit `PositionFrame`s about every 2 seconds (formation home position + team block shift toward the ball + pressing for the nearest defender), with per-player speed. Keep it simple and plausible.
- Add **director mode**: a YAML script that forces moments at given minutes (for example a red card at 70', a late winner at 88') so the demo always has drama.
- Extend the realism report (`--validate N`) and a test asserting per-match averages stay inside agreed ranges (goals 2.3 to 3.5, shots 20 to 32, pass accuracy 78% to 90%, yellows 2.5 to 5, pressures 120 to 220, player distance 9 to 12.5 km for full-match outfield players, top speeds 28 to 36 km/h).

Acceptance: same seed produces identical output; realism test passes over 300 seeds; a scripted director-mode match contains every scripted moment.

### Phase 2: deterministic engines (3 days)

Goal: pure, fully tested engines that turn events and frames into stats, tactical state, key moments, overlay cue data, and fantasy ledger entries.

Tasks:
- `packages/insights`: an `InsightsEngine` with `apply(event)`, `apply_frame(frame)`, and `finalize()`, returning stat snapshots, tactical state, key moments, and overlay cues (timing and data; narrative text is filled later by agents). All metrics in section 4.
- `packages/scoring`: a `ScoringEngine` class with `apply(event) -> list[LedgerEntry]` and `finalize() -> list[LedgerEntry]`. Load rules from `rules.yaml`.
- Scoring tracks per-player state: minutes, saves count, defensive contribution count, goals conceded while on pitch, cards. Substitutions handled for minutes and clean sheets (a player subbed off before 60' gets no clean sheet).
- Provisional entries for clean sheet, goals conceded, and bonus, replaced at `match_end`. Squad totals apply captain doubling.
- Tests: one unit test per fantasy rule and per metric, plus 3 golden matches (fixed seeds) with expected final stats, moments, and points checked into `tests/golden/`.

Acceptance: 100% of rules and metrics covered by tests; golden tests pass; every ledger entry, key moment, and overlay cue traces back to at least one source event (time-based appearance points reference the minute marker event).

### Phase 3: local live pipeline (1.5 days)

Goal: run a full match live on a laptop with no Azure dependency.

Tasks:
- `services/devserver`: FastAPI app that starts a match (seed, speed, director script), runs simulator → engines through the in-memory EventBus, and pushes `LiveMessage`s over a WebSocket.
- Endpoints: `POST /matches` (start), `GET /matches/{id}` (state), `GET /matches/{id}/stats`, `GET /matches/{id}/moments`, `GET /matches/{id}/overlay-cues` (JSON export), `GET /matches/{id}/ledger/{player_id}`, `POST /profiles`, `WS /live/{match_id}?profile={id}`.
- Speed control (pause, 1x, 6x, 18x, 60x) and seek-to-minute using stored events.

Acceptance: `uv run devserver` + a simple WebSocket client shows events, stats, moments, cues, and ledger updates for a whole match at 18x speed.

### Phase 4: frontend (4.5 days)

Goal: the polished fan app and the broadcast overlay view.

Tasks:
- Layout: header (score, minute, speed controls, mode and language switchers), left team panel, centre pitch, right team panel, narrative feed and companion. Responsive: on mobile, stack pitch, then the mode's main panel, with the rest in tabs.
- Pitch component (SVG, 105 x 68 coordinates): ball interpolation between events with easing, player dots with shirt numbers, pass and shot lines, event icons, half-time direction flip.
- Mode views: Analyst (dense stats, tactical indices, xG and momentum timelines), Casual (few headline numbers, narrative first), Fantasy (squad points, ledger, captain total), Player Focus (one player's live card, heatmap, tags), Club (favourite club's view of the match).
- Replay: click any key moment, stat source, or ledger entry to replay its source events on the pitch (pause live, animate, then "back to live").
- Profile picker: mode, language, favourite club, favourite players, focus metric, optional fantasy squad and captain. Store locally.
- `/overlay` route: 16:9 transparent page rendering overlay cues by template, timed to the match clock.
- Localised UI strings for every supported language.
- Accessibility: keyboard navigation, colour not used as the only signal, reduced-motion support.
- PWA manifest and icons.

Acceptance: a full match plays smoothly at 18x; clicking any moment or ledger entry replays the right events; Analyst and Casual modes are clearly different experiences of the same match; `/overlay` renders every cue template; works at 375 px width and on desktop; Lighthouse accessibility score 90+.

### Phase 5: agent team (4.5 days)

Goal: grounded, personalised, multi-language narratives, explanations, and recaps.

Agents (each with a narrow role and explicit tools):

- **Orchestrator:** routes fan questions and live triggers to the right agent; merges responses.
- **Narrator:** turns high-importance key moments into live story lines and key-moment overlay text. Triggered by the insights engine (importance threshold, rate-limited), never by polling.
- **Explainer:** answers "why" questions about football (control vs chaos, pressure shifts, rhythm, win-probability swings) and fantasy points. Tools: `get_stats`, `get_tactical_state`, `get_moments`, `get_events(ids)`, `get_player_ledger`, `get_rules`. Must cite moment, ledger, or event ids so the UI can link them to replays.
- **Recap agent:** half-time and full-time recaps in three formats: 30-second studio script, short article, social post. Built from key moments and final stats.
- **Personaliser:** adapts any output to the viewer's mode, favourite club or players, focus metric, and language. Fantasy-mode alerts (captain events, bonus changes, clean sheet at risk) live here, behind a rule-based pre-filter.
- **Fact-checker:** validates every number and player name in an agent output against engine output before it is shown, in every language; on mismatch, regenerate once, then fall back to a templated sentence.

Languages: English, Spanish, Portuguese, and Thai.

Tasks:
- Implement tools as plain Python functions over the Store port.
- Prompts in versioned files under `packages/agents/prompts/`; output language is a parameter.
- An evaluation set of 40+ questions and moments with expected facts, across modes and languages; a script that scores groundedness and accuracy. Run it in CI with a stub model for structure and manually against the real model.
- Trace agent runs to Application Insights (or log locally in dev).

Acceptance: eval accuracy 90%+ on factual questions in every supported language; zero unverified numbers reach the UI or the overlay feed; live narrative and alerts never exceed a set rate (for example 1 per 2 match minutes per viewer); recaps generated within 10 seconds of half-time and full-time.

### Phase 6: Azure deployment (3 days)

Goal: the same app running on Azure with one command.

Tasks:
- Bicep modules: Event Hubs, Function App (Flex Consumption or Consumption), Cosmos DB (serverless), SignalR Service (serverless mode), Static Web Apps, AI Foundry project + model deployment, Key Vault, Application Insights, Container Apps job for the simulator.
- Azure adapters for EventBus, Store, LivePush; select with `PITCHPOINTS_MODE=azure`.
- Functions: Event Hubs trigger → engines → Cosmos DB + SignalR output binding; HTTP API mirroring the devserver endpoints.
- Managed identity between services; no keys in code.
- `azd up` deploys everything; `azd down` removes it. Document estimated hackathon costs and keep resources on serverless/consumption tiers.

Acceptance: a fresh `azd up` produces a working public URL; a match started from the UI plays end to end in the cloud, including `/overlay`; traces visible in Application Insights.

### Phase 7: polish, documentation, and demo (2 to 3 days)

Tasks:
- README: problem, solution, five-stage pipeline, architecture diagram, how to run locally and on Azure, data synthesis approach, metric definitions, scoring disclaimer, responsible AI notes (grounding, fact-checking, fictional data), future work (auto-eventing from video).
- `docs/decisions/`: short architecture decision records (deterministic numbers vs LLM, ports and adapters, simplified bonus, overlay cue contract).
- Demo script (3 minutes): problem (20s) → the same moment in Analyst vs Casual side by side (30s) → live match at speed with overlay cues and narrative (50s) → "why" question answered with clickable citations that replay on the pitch (30s) → language switch and full-time recap (20s) → architecture and agent design (20s) → impact and next steps (10s).
- Record with a director-mode match so key moments happen on cue.

Acceptance: a person who has never seen the project can run it locally from the README in under 10 minutes.

---

## 7. Cut list (if time runs short, drop in this order)

1. PWA install support.
2. Azure Event Hubs (simulator calls the Function over HTTP instead).
3. Fourth language (keep English plus two).
4. Club mode (keep Analyst, Casual, Fantasy, Player Focus).
5. Fantasy alerts (keep the fantasy ledger and explainer).
6. Player position animation (keep frames for distance and speed metrics; draw ball and events only).

Never cut: deterministic engines with tests, the moment/ledger-to-replay link, the explainer with citations, the fact-checker, the overlay cue feed, recaps, Analyst vs Casual modes, and at least two languages. Those are the project's core story.

## 8. Risks

- **Wrong numbers in AI output:** mitigated by the fact-checker (every language) and the citation requirement.
- **Scope:** larger than a single-feature app; mitigated by the cut list and by building the deterministic engines first so every later layer has real data.
- **Live latency and cost of narration:** narrator runs only on high-importance moments, rate-limited; stat overlays use templated text, not the model.
- **Boring random matches in the demo:** mitigated by director mode.
- **Rule accuracy:** all fantasy values in `rules.yaml`, verified against official rules before submission.
- **Azure setup time:** local mode first; deploy early in a thin "hello world" form (end of Phase 3) to catch problems.
- **Data rules:** fictional clubs and players only; no real match data anywhere in the repo.

## 9. How to use this plan with Claude Code

Start each session with a prompt like:

> Read CLAUDE.md and PLAN.md. We are on Phase N. Summarise the tasks and acceptance criteria, propose a short implementation plan, then implement it. Run the checks and tests before finishing, and update the progress log at the bottom of PLAN.md.

## 10. Progress log

| Date | Phase | Status | Notes |
|---|---|---|---|
| 2026-10-27 | – | done | Plan reframed from fantasy-points companion to match insights engine for the "Synthetic Match Insights Engine for Premier League Studio" challenge. Fantasy is now one viewing mode. |
| 2026-10-27 | 0 | done | uv workspace with 6 members and a workspace import smoke test; Vite 8 + React 19 + Tailwind 4 skeleton in `web/`; ruff, mypy strict, pytest, oxlint (Vite template default, replaces eslint), prettier, vitest; `Makefile`; GitHub Actions running `make install check`. `make check` passes locally from Git Bash and PowerShell; CI green on first push (public repo Parallaxxx25/PitchPoints). |
| 2026-10-27 | 1 | done | Contracts (`MatchMetadata`, `MatchEvent` with per-type required fields, `PositionFrame`, `SimulatorMessage`) with committed JSON Schema and generated TS types. Simulator split into `teams`, `xg`, `engine`, `positions`, `director`, `validate`, `cli`; 8 fictional clubs with seed-independent squads; new `pressure`, `possession_change`, `own_goal`, `penalty_won`, `second_yellow`, ball and shot speed; position frames every 2 s derived from events with their own seeded RNG; director mode (`packages/simulator/director/demo.yaml`). Tuned: in-box fouls give a penalty 12% of the time, xG coefficient 0.9, booked players foul-carded less. 300-seed report: goals 3.03, shots 25.4, pass accuracy 82.7%, yellows 3.37, pressures 173, distance 10.2 km, top speed 31.7 km/h, penalties 0.38, reds 0.17. Realism test runs in a process pool capped at 8 workers (more intermittently failed on Windows); `make check` takes about 70 s locally. `match_simulator.py` removed. |
