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

## Phase 1 — Activate dormant actions + full counter-web ✅

- [x] **WALL**: spawn wall tiles around the front; decay already runs
- [x] **SCATTER**: reproduce ignoring nutrients
- [x] **FEAST**: apply `reproMultiplier` extra spawns per nutrient this tick
- [x] **TOXIN**: new `toxin: Uint8Array` GridState layer; marks tiles, kills enemies entering, decays
  - Threaded through: `persistGridState`, constructor rehydration, `buildStateMsg`, WS type, renderer
- [x] **Counter-web**: all 9 relations implemented (ARMOR>PULSE, HUNT>ARMOR, PULSE>SCATTER, HUNT>TOXIN, TOXIN>GROW, WALL>HUNT, SCATTER>WALL, FEAST>ARMOR, GROW>FEAST)
- [x] DSL: added TOXIN/SCATTER/WALL/FEAST to `VALID_ACTIONS`
- [x] Strategist system prompt: documents all 8 actions + counter-web
- [x] Renamed `armor.aggressiveReproPenalty` → `armor.reproSpeedPenaltyPct` (matches GAME-DESIGN.md)

**Special actions are free in this phase** — resource-gating comes in Phase 4.

---

## Phase 2 — Status / HUD bar ✅

- [x] Extend `RoundRecord` with `totalNutrients` count
- [x] New `src/components/StatusBar.tsx` above the canvas
  - Shows: blue cells (%), nutrients, red cells (%) with green/red deltas
  - Updates during replay animation driven by `roundHistory`

---

## Phase 3 — Board events (combo cadence, seed-deterministic) ✅

- [x] New `shared/sim/events.ts`: `generateEvents(seed, config)` using separate RNG stream (`seed ^ 0xB0A2D`)
  - Event kinds: nutrient_bloom, drought
  - Schedule: 2 one-off events (bloom+drought) at seed-chosen rounds + recurring nutrient bloom every 4–6 rounds
- [x] Applied deterministically in `runGame.ts` tick loop AND client animation loop (same RNG order = identical results)
- [x] Events included in `GameResolution` and exposed via `buildStateMsg`
- [x] "BOARD EVENTS" panel rendered in strategy phase UI (R{n}: Kind / zone / recurring indicator)

---

## Phase 4 — Nutrient types + resource economy ✅

Bumped `SIM_VERSION` → `'3'`.

- [x] New `nutrientType: Uint8Array` GridState layer (0 = normal, 1 = power); thread everywhere
  - Special nutrients placed via separate RNG stream (`seed ^ 0x4E07`)
  - Rendered as purple diamonds on the canvas
- [x] Per-side resource pools (`blueResources`, `redResources` on GridState): collected when a cell consumes a power nutrient; shown in HUD (◆ pwr) and `RoundRecord`
- [x] Gate TOXIN (cost 3), WALL (cost 2), FEAST (cost 2) behind spending resources; fall through to next matching rule (or fallback) when unaffordable
- [x] DSL: new `resource` Metric for held power resources
  - Updated `VALID_METRICS`, `computeMetrics`, `parseCondition`, evaluateStrategy `excludeActions` param, strategist system prompt

---

## Day mode (light theme)

- [ ] Define `[data-theme="light"]` block in `src/index.css` with light equivalents for all `--clr-*` vars
- [ ] Toggle button in header + `localStorage` persistence
- [ ] Sweep remaining hardcoded bg colors in `Game.tsx` to CSS vars (`#080c14`, `#0a1420`, etc.)
- [ ] Decide on `GameCanvas.tsx` cell colors — currently hardcoded constants; either tokenize or keep canvas dark regardless of theme

**Note:** CSS custom property foundation is already in place (`src/index.css`). Estimated ~2–3h once a light palette is chosen.

---

## Mobile layout

Viewport meta is correct. ScoreBar is already responsive. Everything else needs work:

- [ ] `Game.tsx`: stack canvas above rounds sidebar at ≤600px (`flex-direction: column`); all 5 `maxWidth: 660` containers need responsive fallback
- [ ] `GameCanvas.tsx`: canvas prop `size={480}` — canvas element already has `width: 100%` so it scales, but the parent layout needs fixing first
- [ ] `StatusBar.tsx`: four `minWidth` sections sum to ~330px; reflow into two rows or a scrollable strip on mobile
- [ ] `PromptInput.tsx`: textarea + submit button are side-by-side with `height: 108` on the button; need to stack vertically
- [ ] Speed control buttons row: 4 buttons + skip, unconstrained — needs `flex-wrap` or collapsing
- [ ] Bump minimum tap-target font sizes to 12px app-wide (several 11px labels throughout)
- [ ] Add `@media` rules in `src/index.css` (foundation is there, zero queries exist today)

**Note:** Real layout rewrite — desktop-first throughout. Estimated ~6–8h. Treat as its own session.

---

## Cross-cutting principles

**Separate RNG streams per subsystem** — board events and special-nutrient placement each
use `makeRng(seed ^ unique_constant)`, never the base tick RNG. This prevents new features
from reshuffling base-sim outcomes and lets tables be retuned independently.

**New GridState layers ripple past the sim** — every new `Uint8Array` must thread through
`persistGridState`, constructor rehydration, `buildStateMsg`, the WS message type, and the
client renderer. The sim file alone is not the full change surface.
