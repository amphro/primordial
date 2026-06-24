# Feature Roadmap

Living tracker for the game-depth initiative. Each phase ships as its own commit.

---

## Phase 0 — Round-robin matching + scaffolding ✅

- [x] Co-matching rules cycle by `round % matchCount` instead of first-match-wins
- [x] `SIM_VERSION` bumped to `'2'` (round-robin is a sim-contract change)
- [x] This file created as the living roadmap

**Design decision:** cycle position keyed to absolute round number (stateless). Stable
rule-sets cycle cleanly. Overlapping short+long rules may start mid-cycle — accepted.

---

## Phase 1 — Activate dormant actions + full counter-web

- [ ] **WALL**: spawn wall tiles around the front; decay already runs
- [ ] **SCATTER**: reproduce ignoring nutrients (`scatter.ignoreNutrients`)
- [ ] **FEAST**: apply nutrient/repro multipliers this tick
- [ ] **TOXIN**: new `toxin: Uint8Array` GridState layer; marks tiles, kills enemies entering, decays
  - Must thread through: `persistGridState`, constructor rehydration, `buildStateMsg`, WS type, renderer
- [ ] **Counter-web**: implement all 8 relations
  - PULSE>SCATTER, ARMOR>PULSE, HUNT>TOXIN, TOXIN>GROW, WALL>HUNT, SCATTER>WALL, FEAST>ARMOR, GROW>FEAST
  - Currently only ARMOR>PULSE and HUNT>ARMOR are implemented
- [ ] DSL: add TOXIN/SCATTER/WALL/FEAST to `VALID_ACTIONS`
- [ ] Strategist system prompt: document all 8 actions + counter-web so LLM can choose them
- [ ] Reconcile `armor.aggressiveReproPenalty` (config.ts) vs `reproSpeedPenaltyPct` (GAME-DESIGN.md)

**Special actions are free in this phase** — resource-gating comes in Phase 4.

---

## Phase 2 — Status / HUD bar

- [ ] Extend `RoundRecord` with per-side cell counts + nutrient counts
- [ ] New `src/components/StatusBar.tsx` above the canvas
  - Shows: total cells per side, nutrients (by type), Δ-since-last-round
  - Updates during the replay animation driven by `RoundRecord`

---

## Phase 3 — Board events (combo cadence, seed-deterministic)

- [ ] New `shared/sim/events.ts`: `generateEvents(seed, config)` using a separate RNG stream (`seed ^ constant`)
  - Event kinds: nutrient bloom (zone), drought, toxic fog (zone)
  - Schedule: 2–4 one-off events at seed-chosen rounds + one recurring pulse every N rounds
- [ ] Apply events deterministically in the `runGame.ts` tick loop at the scheduled round
- [ ] Expose event schedule in `buildStateMsg`
- [ ] Render read-only "This game's events" panel in the strategy phase

---

## Phase 4 — Nutrient types + resource economy

Bump `SIM_VERSION` → `'3'`.

- [ ] New `nutrientType: Uint8Array` GridState layer (0 = normal, 1+ = special); thread everywhere
  - Place special nutrients via a separate RNG stream (`seed ^ different constant`)
- [ ] Per-side resource pools: collected when a cell consumes a special nutrient
  - Surface in the HUD (Phase 2) and `RoundRecord`
- [ ] Gate TOXIN / WALL / FEAST behind spending the matching resource; fall through when unaffordable
- [ ] DSL: new `Metric`s for held resources (`resourceA`, etc.)
  - Update `VALID_METRICS`, `computeMetrics`, `parseCondition` clamps, strategist prompt

---

## Cross-cutting principles

**Separate RNG streams per subsystem** — board events and special-nutrient placement each
use `makeRng(seed ^ unique_constant)`, never the base tick RNG. This prevents new features
from reshuffling base-sim outcomes and lets tables be retuned independently.

**New GridState layers ripple past the sim** — every new `Uint8Array` must thread through
`persistGridState`, constructor rehydration, `buildStateMsg`, the WS message type, and the
client renderer. The sim file alone is not the full change surface.
