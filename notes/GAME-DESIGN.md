> **Historical snapshot.** This document describes an earlier design (per-round prompt submission, a different action set). The current game uses one-shot resolution and 8 actions. See `docs/how-to-play.md` and `.claude/skills/primordial-sim` for current mechanics.

# PRIMORDIAL — Game Design Document

## Concept

Two colonies of microscopic organisms compete for dominance on a shared petri dish. The simulation runs itself — cells spread, eat, and die every tick without any input. Players' only control is a single natural language prompt per round, submitted blind before each tick resolves.

**The prompt UI says one thing:** `"Tell your cells what to do."`

No action list. No keywords. No directions to memorize. Just a text box.

---

## Core Loop

```
[Tick N resolving visually]
        ↓
Both players see current board state
        ↓
Both type a prompt → lock in (blind/simultaneous)
        ↓
Timeout fires if one or both haven't submitted (configurable)
        ↓
AI classifies both prompts into 3 dimensions each
        ↓
Game engine applies effects deterministically
        ↓
New board state broadcasts to all clients
        ↓
[Tick N+1 resolving visually]
```

Prompts are locked the moment you hit submit. You cannot change it. Neither player sees the other's prompt until the tick resolves. The reveal is part of the experience.

---

## The Prompt Dimension System

Every prompt resolves into exactly **3 dimensions**. These are hidden from players entirely.

### Dimension 1: ACTION
What kind of thing your cells do.

| Action | What it does |
|--------|-------------|
| GROW | Boost reproduction rate — more cells born this tick |
| ARMOR | Cells resist death — each takes two hits before dying |
| TOXIN | Your cells poison adjacent enemy cells on contact |
| HUNT | Your cells actively pursue nearest enemy cells |
| SCATTER | Cells spread outward aggressively, ignoring density |
| PULSE | Emit a burst that destroys nearby enemy cells |
| WALL | Spawn non-reproducing barrier cells that block movement |
| FEAST | Cells consume nutrients 2× faster, reproducing faster but risking starvation |

### Dimension 2: ZONE
Where on the board the effect applies. Relative to the player's current position.

`NORTH · SOUTH · EAST · WEST · NORTHEAST · NORTHWEST · SOUTHEAST · SOUTHWEST · CENTER · ALL`

If no direction is implied, the AI defaults to `ALL`.

### Dimension 3: INTENSITY
How forcefully the action is applied.

| Intensity | Effect multiplier | Trade-off |
|-----------|------------------|-----------|
| CAUTIOUS | 70% of normal effect | No side effects |
| NORMAL | 100% effect | Standard rules |
| AGGRESSIVE | 150% effect | 30% of your own cells in the affected zone take damage too |

AGGRESSIVE is a real gamble — the expected value is roughly equal to NORMAL, not better. Use it when you can afford losses.

**Examples of how prompts resolve:**

| Player types | AI resolves |
|---|---|
| `"protect my left side"` | ARMOR · WEST · NORMAL |
| `"go go go, attack everything!"` | HUNT · ALL · AGGRESSIVE |
| `"slowly build a wall across the top"` | WALL · NORTH · CAUTIOUS |
| `"spread out and grab nutrients"` | SCATTER · ALL · NORMAL |
| `"blast them with a toxic pulse from the center"` | PULSE · CENTER · AGGRESSIVE |
| `"make my cells eat faster"` | FEAST · ALL · NORMAL |
| `"quietly fortify the northeast"` | ARMOR · NORTHEAST · CAUTIOUS |

If the AI can't determine a dimension, it defaults: ACTION=GROW, ZONE=ALL, INTENSITY=**CAUTIOUS**. A bad or missing prompt gets a weak default — not submitting is a real disadvantage.

---

## The Counter-Web (hidden from players)

Actions have soft counter-relationships. Players discover these through play, not documentation.

**Numeric definition:** When a counter relationship triggers in the same or overlapping zone, the countered action's effect is reduced by 50%.

```
PULSE beats SCATTER (thin spread = vulnerable to wipe)
ARMOR beats PULSE (armored cells shrug off bursts)
HUNT beats TOXIN (hunters move through poison faster than it kills them)
TOXIN beats GROW (dense new cells walk into poison and die)
WALL beats HUNT (hunters slam into barrier, slowing advance)
SCATTER beats WALL (going around is faster than through)
FEAST beats ARMOR (armor is wasted if they starve you out)
GROW beats FEAST (more total cells = survive boom/bust better)
```

Zone targeting matters: a PULSE at CENTER has no counter-effect against SCATTER NORTH — zones don't overlap.

**Discoverability:** When a counter triggers, a brief spark visual fires in the affected zone — no label, no text, just a flash. Players sense that something countered something without being told what. The full cause-and-effect is only revealed post-game.

---

## Simulation Rules

### The Grid
- 40×40 tiles
- Each tile: empty, blue cell, red cell, blue wall, red wall, or nutrient

### Cell Behavior (per tick, before action effects)
1. A cell **reproduces** into one adjacent empty tile if a nutrient tile is within 2 tiles. Each nutrient supports up to 4 reproductions per tick before depleting.
2. A cell **dies** if it has no nutrient source within 2 tiles for 2 consecutive ticks (starvation lag — gives a brief grace period)
3. Wall cells never reproduce and never die from starvation; they decay after 3 ticks unless re-applied
4. Cells entering an enemy-toxin-marked tile die immediately

### Cell Movement (HUNT and SCATTER)
Cells don't normally move — they only reproduce into adjacent tiles. HUNT and SCATTER override this:
- **HUNT:** Each affected cell moves 1 tile toward the nearest enemy cell this tick (instead of reproducing). Movement uses Manhattan distance. If no enemy is within 5 tiles, the cell reproduces normally.
- **SCATTER:** Each affected cell reproduces into the adjacent tile furthest from the colony center (outward spread), ignoring normal nutrient requirements for that one reproduction.
- **PULSE:** No cell movement. A radial burst is applied from the centroid of the ZONE area — all unarmored enemy cells within a 4-tile radius take damage.

### Numeric Effect Values
| Action | CAUTIOUS | NORMAL | AGGRESSIVE |
|--------|---------|--------|-----------|
| GROW | +1 extra reproduction per cell | +2 per cell | +3 per cell, 30% own-cell damage |
| ARMOR | Cells survive 1 starvation tick | Cells take 2 hits | Cells take 3 hits, -50% repro speed |
| TOXIN | 3-tile radius, 50% kill chance | 3-tile radius, 100% kill | 5-tile radius, 100% kill, 30% own-cell damage |
| HUNT | Move toward enemies if within 3 tiles | Move if within 5 tiles | Move if within 8 tiles, 30% own-cell damage |
| SCATTER | Outward repro, 50% nutrient req | Outward repro, no nutrient req | 2× outward repro, 30% own-cell damage |
| PULSE | 3-tile radius, kills 30% of enemies | 4-tile radius, kills 60% | 5-tile radius, kills 90%, 30% own-cell damage |
| WALL | 10 wall cells spawned | 20 wall cells | 30 wall cells, decay in 2 ticks |
| FEAST | 1.5× nutrient consumption/repro | 2× | 3×, cells die if nutrients run out |

### Nutrients
- ~200 nutrient tiles at game start, slightly clustered (not fully random)
- **Regen decays over rounds:** Rounds 1-7: +3 nutrients/tick. Rounds 8-11: +2. Rounds 12+: +1. This forces scarcity in late game, preventing stalemates near 50/50.
- Each nutrient tile supports up to 4 reproductions before depleting for 2 ticks, then recharges

### Action Resolution Order (per tick)
1. Apply WALL effects (barriers appear before movement)
2. Apply ARMOR effects (mark cells as protected)
3. Apply TOXIN effects (mark tiles as toxic)
4. Apply PULSE effects (kill unarmored enemy cells in radius)
5. Apply HUNT / SCATTER / GROW / FEAST effects (movement and reproduction)
6. Apply base simulation rules (starvation, reproduction)
7. Clear expired effects

---

## Win Condition

**First player to control 60% of all living cells wins.**

If no one reaches 60% by round 15 (the final tick), **the player with the higher cell count wins.**

A "cell count" score (e.g., "Blue: 48% · Red: 31%") is always visible. Players always know roughly where they stand.

---

## Game Structure

### Session
- **~15 rounds** at configurable tick intervals
- Default: **20-second prompt window**, then tick resolves
- Total game time: ~5 minutes at default settings

### Prompt Timer
- Timer starts when the previous tick finishes rendering
- If both players submit early, tick resolves immediately (no wait)
- If one player hasn't submitted when the timer expires, their action defaults to GROW · ALL · CAUTIOUS — a weak default, not a free move
- Configurable: timer can be disabled entirely for async/long-form games (players set pace)

### Configurable Settings (set at game creation)
| Setting | Default | Options |
|---------|---------|---------|
| Prompt timer | 20s | 10s / 20s / 30s / 60s / off |
| Total rounds | 15 | 10 / 15 / 20 |
| Grid size | 40×40 | 30×30 / 40×40 / 50×50 |
| Nutrient density | Medium | Low / Medium / High |
| Starting cells | 30 | 20 / 30 / 50 |
| AI opponent | Off | Off / Easy / Hard |

### Multiplayer Modes
- **1v1 (human vs human):** Both players on separate machines, server-authoritative
- **1v1 (human vs AI):** AI opponent submits prompts via Workers AI using a strategy system
- Single player is the default — game creates with one slot, second slot is filled by AI

---

## Player Experience

### Joining a Game
1. Log in with Google
2. **Create** → get a 6-character room code (e.g., `TEAL42`) → share it
3. **Join** → enter code → land in lobby
4. Host clicks **Start** → game begins

No lounge, no matchmaking — just a code to share.

### During a Game
- The grid takes up most of the screen (canvas render)
- Both prompt boxes sit at the bottom — yours is editable, opponent's shows "locked" or "waiting"
- A countdown timer ticks down
- After tick: a brief visual "resolve" animation plays, then the prompt boxes clear for the next round
- Score shown as a live percentage bar at the top

### End of Game
- Win/loss screen with replay option
- Game summary: what actions each player used each round (revealed post-game only)
- **This is where the hidden system gets revealed** — players see for the first time exactly how their prompts were interpreted. This is intentionally a moment of delight ("oh THAT'S what it did!")

---

## Visual Direction

- Dark background (deep blue-black)
- Blue cells: bright cyan/blue
- Red cells: warm coral/red
- Nutrients: small glowing white/yellow dots
- Wall cells: slightly darker, more opaque version of player color
- Toxic tiles: subtle pulsing glow on affected tiles
- Cell death: brief flash/fade, not dramatic
- Pulse effect: radial ripple from center of effect zone
- No sprites, no art assets — pure canvas shapes

The game should be hypnotic to watch, like a lava lamp or aquarium, even if you're not playing.

---

## AI Opponent Strategy (for single player)
The AI opponent reads game state and submits a prompt that a smart player might plausibly type. It doesn't get special access to the dimension system — it generates a natural language prompt that then goes through the same AI classifier as human prompts.

Example AI-generated prompts based on game state:
- If losing (< 35% cells): "send everything to attack now, I need to take back ground"
- If ahead (> 55% cells): "stay back and protect what I have"
- If even: "grow fast in the center and spread out"
- If opponent last played SCATTER: "pulse the whole board, wipe them out"

Difficulty affects how well the AI reads the game state.

---

## Configuration System

Every numeric value in the game lives in a typed `GameConfig` object — no magic numbers anywhere in the engine. This enables:
- Balancing without code changes (edit config, redeploy or push to KV)
- Custom game modes (fast/slow, chaotic/tactical, nutrient-rich/scarce)
- Future automated balancing from analytics data

### Config Shape

```typescript
interface GameConfig {
  // Grid
  gridWidth: number;          // default: 40
  gridHeight: number;         // default: 40
  startingCells: number;      // default: 30

  // Session
  totalRounds: number;        // default: 15
  promptTimerMs: number;      // default: 20000
  winThresholdPct: number;    // default: 60

  // Nutrients
  startingNutrients: number;  // default: 200
  nutrientClusterSize: number; // default: 8 (tiles per cluster)
  nutrientRegenByRound: number[]; // default: [3,3,3,3,3,3,3,2,2,2,1,1,1,1,1]
  nutrientDepletionTtl: number;   // default: 2 (ticks before recharge)
  nutrientCapacity: number;       // default: 4 (reproductions per nutrient per tick)

  // Cell behavior
  nutrientScanRadius: number;   // default: 2 (tiles a cell looks for nutrients)
  starvationGraceTicks: number; // default: 2 (ticks before a starving cell dies)
  wallDecayTicks: number;       // default: 3 (ticks before wall cells decay)

  // Intensity multipliers
  intensity: {
    cautious: { effectMult: number; friendlyFirePct: number };   // default: 0.7, 0
    normal:   { effectMult: number; friendlyFirePct: number };   // default: 1.0, 0
    aggressive: { effectMult: number; friendlyFirePct: number }; // default: 1.5, 0.30
  };

  // Per-action values (at NORMAL intensity; CAUTIOUS/AGGRESSIVE scale via multipliers)
  actions: {
    grow: {
      extraReproPerCell: number;  // default: 2
    };
    armor: {
      hitsToKill: number;         // default: 2
      reproSpeedPenaltyPct: number; // default: 0 (aggressive: 0.5)
    };
    toxin: {
      radiusTiles: number;        // default: 3
      killChancePct: number;      // default: 1.0
    };
    hunt: {
      scanRadiusTiles: number;    // default: 5
    };
    scatter: {
      ignoreNutrients: boolean;   // default: true
    };
    pulse: {
      radiusTiles: number;        // default: 4
      killPct: number;            // default: 0.6
    };
    wall: {
      cellCount: number;          // default: 20
    };
    feast: {
      nutrientMultiplier: number; // default: 2
      reproMultiplier: number;    // default: 2
    };
  };

  // Comeback mechanic
  comebackThresholdPct: number;   // default: 25 (trailing player % at which burst fires)
  comebackNutrientBurst: number;  // default: 15 (extra nutrients spawned near trailing player)

  // Counter-web
  counterEffectReductionPct: number; // default: 0.5 (countered action loses 50% effect)
}
```

### Config Sources (priority order)
1. **Per-game override** — host sets at game creation, stored in D1 `games.settings`
2. **Active balance config** — stored in KV as `config:balance`, updated without redeploy
3. **Default config** — hardcoded in `workers/lib/config.ts` as the compile-time baseline

The DO loads config once at game start and stores it in SQLite. The tick loop reads from DO storage — no KV lookup per tick.

---

## Data Capture + Analytics

Every game event is captured for analysis and eventual automated balancing. Two-tier storage:

### Tier 1: Cloudflare Analytics Engine (streaming, per-event)
Written from the DO after each tick. High-cardinality, queryable via SQL. Free on Workers Paid plan (100k datapoints/day; a 15-round 2-player game writes ~30 events).

**Events written:**

| Event | Dimensions | Blobs | Values |
|-------|-----------|-------|--------|
| `tick_resolved` | gameCode, round, action_blue, zone_blue, intensity_blue, action_red, zone_red, intensity_red | prompt_blue, prompt_red | blue_pct, red_pct, blue_cell_count, red_cell_count |
| `counter_triggered` | gameCode, round, winner_action, loser_action, zone | — | effect_reduction |
| `game_over` | gameCode, winner_color, win_reason (threshold/timeout) | — | final_blue_pct, final_red_pct, total_rounds |
| `prompt_classified` | gameCode, round, player_color, action, zone, intensity | raw_prompt | classification_latency_ms |
| `action_applied` | gameCode, round, action, zone, intensity, player_color | — | cells_gained, cells_lost, net_delta |

### Tier 2: D1 (complete game record, written at game end)
The `rounds` table already captures per-round prompt/classification/score data. This is the source for post-game reveal and long-form analysis.

### What This Enables

**Immediate (manual analysis):**
```sql
-- Which actions win the most rounds?
SELECT action_blue, AVG(blue_pct - red_pct) as avg_advantage
FROM ae_tick_resolved GROUP BY action_blue ORDER BY avg_advantage DESC;

-- Which counters trigger most often?
SELECT winner_action, loser_action, COUNT(*) as triggers
FROM ae_counter_triggered GROUP BY winner_action, loser_action;

-- AI classifier latency percentiles
SELECT intensity, PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY classification_latency_ms)
FROM ae_prompt_classified GROUP BY intensity;
```

**Future (automated balancing):**
A scheduled Worker (Cron Trigger, daily) queries Analytics Engine, detects outlier win rates per action, and writes an updated `config:balance` to KV. The next game creation picks it up. No deploy required.

---

## Post-Game Stats
Shown to players after each game:
- Round-by-round table: your prompt → resolved dimensions → opponent's prompt → resolved dimensions
- Cell count sparkline over time (both players)
- Win reason (60% threshold or round-limit majority)
- Game duration
- "Most used action" badge for each player
