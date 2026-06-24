> **Historical snapshot.** This is the original implementation plan. The current architecture may differ.

# Implementation Plan: PRIMORDIAL

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React + Vite | Lightweight, deploys to CF Pages cleanly |
| Game render | HTML Canvas | 40×40 grid with per-tick animation needs canvas, not DOM |
| Hosting | Cloudflare Pages | Static + Workers Functions, no separate server |
| API + routing | Cloudflare Workers | Handles auth, REST endpoints, WebSocket upgrade |
| Game state | Cloudflare Durable Objects | One DO per room: WebSocket hub, tick loop, SQLite state |
| AI classification | Cloudflare Workers AI | `@cf/meta/llama-3.1-8b-instruct`, native binding, no external API |
| User DB | Cloudflare D1 | Users, games, round history |
| Balance config | Cloudflare KV | Active `GameConfig` JSON — updatable without deploy |
| Sessions | Cloudflare KV | JWT session tokens |
| Analytics | Cloudflare Analytics Engine | Per-tick, per-action streaming events; SQL queryable |
| Auth | Google OAuth 2.0 | Handled by a Worker, no third-party service needed |

## Architecture

```
Browser (React + Canvas)
    │
    ├── HTTP (auth, create/join game, submit prompt)
    ├── WebSocket (live game state)
    │
    ▼
Cloudflare Workers (API layer + static serve)
    │
    ├── /auth/*          → Google OAuth flow → session in KV
    ├── /api/games       → create/join → D1
    ├── /api/games/:code → WebSocket upgrade → Durable Object (cookie validated in Worker before upgrade)
    └── /api/games/:code/prompt → validate session → DO.submitPrompt() → AI classify → store result
    │
    ├── Durable Object: GameRoom (one per active game)
    │     ├── WebSocket connections (hibernation API)
    │     ├── SQLite: game metadata, stored classifications, settings
    │     ├── Binary blobs: grid state (2× Uint8Array, 1600 bytes each)
    │     ├── Alarm: fires each tick, runs simulation only (reads stored classifications)
    │     └── Broadcasts: full authoritative state after each tick via native binary WS frames
    │
    ├── Workers AI: classify prompts at SUBMIT time (not tick time)
    │     └── Called in submitPrompt() RPC — result stored in DO before ack sent to client
    │
    ├── Analytics Engine: streaming game events from DO
    │     └── Written after each tick: tick_resolved, counter_triggered, action_applied, etc.
    │
    └── D1: users, games index, post-game round history
        KV:  session tokens + active GameConfig (key: config:balance)
```

## Database Schemas

### D1

```sql
-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,          -- Google sub
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL
);

-- Games (index only — live state lives in DO)
CREATE TABLE games (
  code TEXT PRIMARY KEY,        -- 6-char room code, e.g. TEAL42
  host_id TEXT NOT NULL,
  status TEXT NOT NULL,         -- 'lobby' | 'active' | 'finished'
  winner_id TEXT,
  settings TEXT NOT NULL,       -- JSON blob
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);

-- Players per game
CREATE TABLE game_players (
  game_code TEXT NOT NULL,
  user_id TEXT NOT NULL,
  color TEXT NOT NULL,          -- 'blue' | 'red'
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (game_code, user_id)
);

-- Round history (written after game ends)
CREATE TABLE rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_code TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  blue_prompt TEXT,
  blue_action TEXT,
  blue_zone TEXT,
  blue_intensity TEXT,
  red_prompt TEXT,
  red_action TEXT,
  red_zone TEXT,
  red_intensity TEXT,
  blue_pct REAL,
  red_pct REAL
);
```

### Durable Object SQLite (in-DO, per game)

```sql
CREATE TABLE game_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL           -- JSON
);
-- Keys: 'meta', 'settings', 'prompt_blue', 'prompt_red'

-- grid and nutrients stored as binary blobs (not SQL rows)
-- grid: Uint8Array(1600) — each byte: 0=empty,1=blue,2=red,3=wall_blue,4=wall_red
-- nutrients: Uint8Array(1600) — each byte: 0=empty, 1-255=nutrient level
```

## API Endpoints

```
POST /auth/google          → initiate Google OAuth
GET  /auth/google/callback → exchange code, create session, set cookie
POST /auth/logout          → clear session
GET  /auth/me              → return current user

POST /api/games            → create game, return { code }
GET  /api/games/:code      → get game info + players
POST /api/games/:code/join → join game as second player
POST /api/games/:code/start → host starts game (moves to 'active')

GET  /api/games/:code/ws   → WebSocket upgrade (game events)
POST /api/games/:code/prompt → submit a prompt for current round
```

## WebSocket Messages

**Server → Client** (sent as native binary WebSocket frames — no base64, no JSON wrapper for state):
```typescript
// Full state broadcast (after each tick) — binary frame layout:
// [0]: message type (0x01 = state)
// [1-1600]: cell ownership grid (Uint8Array)
// [1601-3200]: nutrient grid (Uint8Array)
// [3201-3210]: metadata (round, totalRounds, blueScore, redScore, phase, timerMs as little-endian uint16s)
// For non-state messages (resolve, game_over): use JSON text frame

// Resolve message (text/JSON, sent after each tick):
{ type: 'state', payload: {
    grid: Uint8Array,      // raw binary
    nutrients: Uint8Array, // raw binary
    round: number,
    totalRounds: number,
    phase: 'waiting' | 'resolving' | 'finished',
    scores: { blue: number, red: number },  // percentage 0-100
    promptStatus: { blue: 'waiting' | 'locked', red: 'waiting' | 'locked' },
    timerMs: number,
    winner?: 'blue' | 'red'
}}

// Tick resolve: reveals what both prompts did (after resolution)
{ type: 'resolve', payload: {
    blue: { prompt: string, action: string, zone: string, intensity: string },
    red: { prompt: string, action: string, zone: string, intensity: string }
}}

// Game over
{ type: 'game_over', payload: { winner: 'blue' | 'red', finalScores: {...} }}
```

**Client → Server:**
```typescript
// Via HTTP POST, not WebSocket (easier auth validation)
POST /api/games/:code/prompt  { prompt: string }
```

---

## Phases

### Phase 1: Infrastructure Skeleton
*Goal: Two players can create, join, and "finish" a game. No game logic yet.*

**Deliverables:**
- [ ] Google OAuth flow (Worker: `/auth/google`, `/auth/google/callback`, `/auth/me`)
- [ ] Session management (KV-backed signed JWT cookie)
- [ ] D1 schema + migrations (users, games, game_players)
- [ ] `POST /api/games` — create game, persist to D1, return 6-char code
- [ ] `POST /api/games/:code/join` — join game, validate 2-player max
- [ ] `POST /api/games/:code/start` — host moves game to 'active'
- [ ] React app shell: Login page, Lobby (create/join), Waiting room
- [ ] WebSocket connection established from client after join
- [ ] Stub "Finish Game" button visible to both players once connected — clicking it ends the game (broadcasts `game_over`)
- [ ] Win/loss screen

**Can parallelize:**
- Frontend shell (login → lobby → waiting room) runs parallel to backend auth + D1 setup
- Frontend can use mock WebSocket/API while backend is wiring up

**Done when:** Two people on different machines can log in, share a code, join the same room, see each other connected, click the stub button, and see a win screen.

---

### Phase 2: Game Engine (Durable Object)
*Goal: The cellular automaton runs. Ticks fire. Prompts queue and classify. No rendering yet — use debug JSON output.*

**Deliverables:**
- [ ] `workers/lib/config.ts` — `GameConfig` type + `DEFAULT_CONFIG` + `loadConfig(kv)` (reads `config:balance` key from KV, falls back to default). **This file ships first; nothing else is hardcoded.**
- [ ] Analytics Engine binding added to `wrangler.jsonc`; `workers/durable-objects/analytics.ts` with typed write helpers for each event type
- [ ] `GameRoom` Durable Object scaffolded (wrangler config, binding)
- [ ] WebSocket upgrade routing → DO
- [ ] DO: game state init (grid, nutrients, player positions) — all sizing from `GameConfig`
- [ ] DO: alarm-based tick loop (interval from `config.promptTimerMs`)
- [ ] DO: cellular automaton simulation (all radii, TTLs, rates read from `GameConfig`) — pure functions in `simulation.ts`, unit-testable without DO
- [ ] Workers AI classifier (standalone, testable in isolation) — prompt → `{action, zone, intensity}`, try/catch fallback to GROW·ALL·CAUTIOUS
- [ ] DO: `submitPrompt()` calls classifier, stores result + classification latency in SQLite, sends locked ack; writes `prompt_classified` Analytics Engine event
- [ ] DO: action effect application — all effect values read from `config.actions.*` and `config.intensity.*`. **Vertical slice first: 4 actions (GROW, ARMOR, HUNT, PULSE) × 5 zones (N/S/E/W/ALL) × 3 intensities.** Remaining 4 actions (TOXIN, SCATTER, WALL, FEAST) in Phase 4.
- [ ] DO: writes `tick_resolved`, `action_applied`, `counter_triggered` events to Analytics Engine after each tick
- [ ] DO: state broadcast after each tick (native binary WebSocket frame)
- [ ] DO: win condition check (`config.winThresholdPct`) after each tick
- [ ] DO: post-game round history write to D1; writes `game_over` Analytics Engine event

**Can parallelize:**
- AI prompt classifier built + tested in isolation (standalone Worker, just classifies and returns JSON)
- `simulation.ts` written and unit-tested in pure TypeScript before being integrated into the DO
- Analytics writer stubs can be wired up as no-ops first, filled in alongside tick logic

**Done when:** Two browser consoles receive ticking binary WebSocket state, submit prompts, see game state change, and Analytics Engine is receiving events (verifiable via `wrangler tail`).

---

### Phase 3: Game Client (Canvas Renderer)
*Goal: The game looks like the game. Players can actually play.*

**Deliverables:**
- [ ] Canvas renderer: grid cells (color per owner), nutrients (glowing dots), walls (opaque cells)
- [ ] Canvas renderer: smooth per-tick transition animation (cells fade in/out over ~500ms)
- [ ] Score bar (live percentage, updates with each tick)
- [ ] Prompt input box (placeholder: "Tell your cells what to do.") + submit button
- [ ] Opponent status indicator ("waiting..." vs "locked in ✓")
- [ ] Round counter + timer countdown
- [ ] Tick resolve animation: brief pause, then the `resolve` message shows what both prompts did
- [ ] Post-game reveal screen: round-by-round table showing prompts + resolved dimensions
- [ ] Lobby/waiting room upgrade: show game settings, player names

**Can parallelize:**
- Canvas renderer can be developed with mock state data
- Prompt UI can be wired up independently

**Done when:** A full game can be played visually end-to-end. Both players see the board, submit prompts, watch ticks resolve, and see a winner.

---

### Phase 4: Polish, Remaining Actions + Balancing Tools
*Goal: The game is finished and shippable.*

**Deliverables:**
- [ ] Remaining 4 actions implemented: TOXIN, SCATTER, WALL, FEAST (all values from `GameConfig`)
- [ ] Game settings UI (timer, rounds, grid size, nutrient density, AI opponent toggle) — maps to `GameConfig` overrides stored in D1
- [ ] AI opponent: strategy system (generates natural language prompts based on game state)
- [ ] Visual polish: pulse ripple effect, toxic tile glow, wall opacity
- [ ] Mobile layout (single-column, prompt input at bottom)
- [ ] Error handling: disconnection recovery (rejoin mid-game), prompt submission failures
- [ ] Basic analytics: game count, average duration (Analytics Engine or D1 aggregate)
- [ ] Landing page (what is this game, how to play — no keywords listed)

**Done when:** A stranger could land on the page, create or join a game, play solo vs AI, finish, and understand what happened in the post-game reveal.

---

## File Structure

```
/
├── src/                        # React frontend (Vite)
│   ├── pages/
│   │   ├── Landing.tsx
│   │   ├── Login.tsx
│   │   ├── Lobby.tsx           # create / join
│   │   ├── WaitingRoom.tsx
│   │   ├── Game.tsx
│   │   └── GameOver.tsx
│   ├── components/
│   │   ├── GameCanvas.tsx      # canvas renderer
│   │   ├── PromptInput.tsx
│   │   ├── ScoreBar.tsx
│   │   ├── RoundTimer.tsx
│   │   └── ResolveReveal.tsx
│   ├── hooks/
│   │   ├── useGameSocket.ts    # WebSocket connection + state
│   │   └── useAuth.ts
│   └── lib/
│       └── canvasRenderer.ts   # pure canvas drawing functions
│
├── workers/
│   ├── api/
│   │   ├── index.ts            # main Worker (routing)
│   │   ├── auth.ts             # Google OAuth handlers
│   │   ├── games.ts            # create/join/start endpoints
│   │   └── prompt.ts           # prompt submission endpoint
│   ├── durable-objects/
│   │   ├── GameRoom.ts         # DO class (tick loop, WebSocket, game state)
│   │   ├── simulation.ts       # cellular automaton logic (pure functions, takes GameConfig)
│   │   ├── actions.ts          # action effect application (reads all values from GameConfig)
│   │   ├── classifier.ts       # Workers AI prompt → {action, zone, intensity}
│   │   └── analytics.ts        # Analytics Engine event writers
│   └── lib/
│       ├── config.ts           # DEFAULT_CONFIG: GameConfig baseline, config loader (KV → default)
│       └── session.ts          # JWT sign/verify helpers
│
├── migrations/                 # D1 SQL migrations
│   └── 001_initial.sql
│
└── wrangler.jsonc
```

## Key Technical Decisions

**Why Canvas over DOM for the grid:** 1600 cells updating each tick via React re-renders = jank. Canvas with `requestAnimationFrame` interpolation is smooth and budget-friendly.

**Why classify at submit-time, not tick-time:** DO alarm auto-retries on uncaught throws — awaiting a Workers AI call (500ms-2s) inside the alarm creates a retry-storm risk if the AI call fails. By classifying when the player submits their prompt, the tick just reads stored `{action,zone,intensity}` from SQLite — O(1600 cells), fast, no external calls. AI latency is absorbed during the prompt window, invisible to players. Wrap the AI call in try/catch in `submitPrompt()` and fallback to GROW·ALL·CAUTIOUS on error.

**Why native binary WebSocket frames:** Send `Uint8Array` directly — browsers and Cloudflare Workers both support binary frames natively. Skips the 33% base64 inflation and encode/decode overhead. Low-frequency control messages (resolve reveal, game_over) can remain JSON text frames.

**Why HTTP POST for prompt submission (not WebSocket message):** Auth validation is cleaner over HTTP (cookie/header). The cookie is validated in the Worker *before* the WebSocket upgrade to the DO — the DO itself doesn't need to handle auth. Never use a token in the WS query string (leaks into logs).

**Why 6-char room codes:** Human-shareable (`TEAL42` easy to say aloud). Generated with `crypto.getRandomValues`, not `Math.random()` (predictable RNG). DO ID derived via `idFromName(code)` — O(1) lookup, no DB query on WebSocket upgrade.

**OAuth sharp edge:** Store a random `state` param in KV before redirecting to Google; verify it on callback (prevents login CSRF). The `redirect_uri` must match exactly in Google Console and in code (trailing slash, `localhost` vs `127.0.0.1` in dev — the most common OAuth gotcha). `id_token` received from Google's token endpoint over TLS can be trusted directly without JWKS verification.

## Configuration System

All numeric game values live in `GameConfig` (`workers/lib/config.ts`). Zero magic numbers in simulation or action code.

**Config loading (priority order):**
1. Per-game override set by host at creation → stored in D1 `games.settings`
2. Active balance config → `config:balance` key in KV (JSON-encoded `Partial<GameConfig>`)
3. `DEFAULT_CONFIG` in `config.ts` — compile-time baseline

The DO reads config once at game start via `loadConfig(env.KV)`, merges with per-game overrides, and stores the resolved config in its own SQLite. No KV lookup during ticks.

**Updating balance without a deploy:**
```bash
# Push updated balance config to KV
echo '{"actions":{"grow":{"extraReproPerCell":3}}}' | \
  wrangler kv key put config:balance --binding=KV --stdin
# Takes effect on next game creation
```

**Scheduled auto-balancing (future — Cron Trigger):**
A daily Worker queries Analytics Engine for win rates per action, detects outliers (e.g., PULSE win rate > 70%), computes adjusted values, and writes updated `config:balance` to KV. No human required.

---

## Analytics + Data Capture

### Cloudflare Analytics Engine
Written directly from the DO via `env.AE.writeDataPoint()`. No external service, no extra cost beyond Workers Paid plan (included).

**Binding in `wrangler.jsonc`:**
```jsonc
"analytics_engine_datasets": [{ "binding": "AE", "dataset": "primordial_events" }]
```

**Events captured:**

| Event (index1) | Key dimensions (indexes) | Blobs | Doubles |
|---|---|---|---|
| `tick_resolved` | gameCode, round, action_blue, zone_blue, intensity_blue, action_red, zone_red, intensity_red | — | blue_pct, red_pct, blue_cells, red_cells |
| `counter_triggered` | gameCode, round, winner_action, loser_action, zone | — | effect_reduction_pct |
| `action_applied` | gameCode, round, player_color, action, zone, intensity | — | cells_gained, cells_lost, net_delta |
| `prompt_classified` | gameCode, round, player_color, action, zone, intensity | raw_prompt (blob1) | latency_ms |
| `game_over` | gameCode, winner_color, win_reason | — | final_blue_pct, final_red_pct, total_rounds |

### Sample Analysis Queries
```sql
-- Which action wins most rounds?
SELECT index4 as action, AVG(double1 - double2) as avg_score_delta
FROM primordial_events WHERE index1 = 'tick_resolved' AND index4 = index8
GROUP BY index4 ORDER BY avg_score_delta DESC;

-- AI classifier latency p95
SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY double1)
FROM primordial_events WHERE index1 = 'prompt_classified';

-- Counter trigger rate per pair
SELECT index4 as winner, index5 as loser, COUNT(*) as triggers
FROM primordial_events WHERE index1 = 'counter_triggered'
GROUP BY winner, loser ORDER BY triggers DESC;
```

Query via: `wrangler analytics-engine` CLI or the Cloudflare dashboard SQL tab.

### D1: Complete Game Record
The `rounds` table captures every prompt and classification per round. Written once at game end (bulk insert). Source for post-game reveal and per-game drill-down analysis.

---

## Risks + Mitigations

| Risk | Mitigation |
|------|-----------|
| AI call fails inside prompt submission | try/catch in `submitPrompt()` RPC; fallback to GROW·ALL·CAUTIOUS on any throw. Never let AI failure block the tick. |
| AI misclassifies a prompt | Post-game reveal shows what happened; cellular automaton self-heals in 1-2 ticks anyway |
| DO alarm retry storm | Tick alarm only runs deterministic simulation (no external calls). AI runs at submit-time. Alarm can't stall on an AI timeout. |
| Cellular automaton stalls at ~50/50 | Nutrient regen decay (rounds 8-11+) forces scarcity. Comeback mechanic: small nutrient burst near trailing player at <25% cells. |
| 240-combination action space scope creep | Phase 2 ships 4 actions × 5 zones × 3 intensities (60 combos). Remaining 4 actions in Phase 4. |
| Players disconnect mid-game | DO holds state; reconnecting WebSocket receives full current state immediately |
| Room code collision | D1 unique constraint on code; retry with new random code on conflict |
| Login CSRF in OAuth | `state` param generated with `crypto.getRandomValues`, stored in KV, verified on callback |
