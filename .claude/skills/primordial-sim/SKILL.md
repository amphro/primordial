---
name: primordial-sim
description: Reference for PRIMORDIAL's cellular automaton simulation — action effects, counter chain, metric definitions, config defaults, and zone semantics. Load when working on strategy generation, balance, new mechanics, or the LLM system prompt.
---

# PRIMORDIAL Sim Reference

## Grid

- Default: 40×40. Blue spawns in leftmost ~25% columns, Red in rightmost ~25%.
- 6 starting cells per side. 120 nutrients total; 25 are tagged as "power nutrients."
- Cell values: 0=EMPTY, 1=BLUE, 2=RED, 3=WALL_BLUE, 4=WALL_RED
- Each cell also tracks: `starvation` counter, `armor` hits, `wallAge` ticks, `toxin` timer

## Every round (in order)

1. **ARMOR** applied (both sides simultaneously)
2. **TOXIN** marks tiles (both sides simultaneously)
3. **PULSE** fires (both sides simultaneously)
4. **GROW / HUNT / WALL / SCATTER / FEAST** applied (both sides simultaneously)
5. **Base sim** runs:
   - Nutrients recharge (depleted tiles tick down cooldown per `nutrientRegenByRound`)
   - Each cell checks for a nutrient within `nutrientScanRadius` (default 2 tiles, Chebyshev)
     - Nutrient found → starvation resets; cell is a reproduction candidate (spawns to random empty neighbor, costs 1 nutrient charge)
     - No nutrient → starvation++ → if starvation > `starvationGraceTicks` (default 2), cell dies
   - Toxin tiles kill enemies on contact (each tick, at `killChancePct`), then tick down and decay
   - Walls age; decay after `wallDecayTicks` (default 3)
   - Armor on all cells ticks down by 1
   - **Comeback:** if either side ≤ 25% of occupied cells, a nutrient burst of 15 spawns near their cells

## Actions

### GROW
- Each of your cells in zone with a nearby nutrient spawns `extraReproPerCell × effectMult` (default: 2 at NORMAL) additional children into random empty neighbors
- One nutrient charge consumed per activating cell (not per extra spawn)
- AGGRESSIVE: 30% friendly fire on the activating cell
- Countered by TOXIN (−50% reproduction). Counters FEAST.

### HUNT
- Each of your cells in zone scans for the nearest enemy within `scanRadiusTiles × effectMult` (default: 5 tiles at NORMAL)
- Steps one tile toward the nearest enemy
- Empty → move there (carrying starvation/armor)
- Enemy, no armor → capture (turn to your color)
- Enemy, armored → drain 1 armor (or bypass completely if countering ARMOR)
- Does NOT consume nutrients. Moving into nutrient-poor territory causes starvation.
- AGGRESSIVE: 30% friendly fire on the source cell after move
- Countered by WALL (−50% scan radius). Counters ARMOR. Counters TOXIN (−50% toxin kill chance on hunters).

### ARMOR
- All your cells in zone gain armor hits: CAUTIOUS=1, NORMAL=`hitsToKill` (2), AGGRESSIVE=`hitsToKill+1` (3)
- Armor is a max (won't downgrade existing armor); ticks down by 1 each round
- FEAST counters ARMOR (−1 from hits granted)
- Counters PULSE (−50% kill%). Countered by HUNT (bypassed), FEAST (weakened).

### PULSE
- Finds centroid of **enemy** cells in the specified zone
- Fires shockwave from that centroid with radius `radiusTiles × effectMult` (default: 3 tiles at NORMAL)
- Each enemy cell in radius: if armored → drain 1 armor; else kill with probability `killPct × effectMult` (default: 35% at NORMAL)
- AGGRESSIVE: 30% friendly fire on YOUR cells inside the blast radius
- Zone controls which enemy cells contribute to the centroid target
- Countered by ARMOR (−50% kill%). Counters SCATTER.

### TOXIN
- Poisons tiles in radius around your cells in zone (`radiusTiles × effectMult`, default: 3 tiles at NORMAL)
- Poisoned tiles last `decayTicks` rounds (default: 3). Does not poison your own cells or walls.
- During base sim, enemies on poisoned tiles: kill chance `killChancePct` per tick (default: 100% — instant kill if on toxin tile)
- HUNT counters TOXIN (−50% kill chance on hunting cells)
- **Costs 3 power resources** (deducted from accumulated power nutrient count)
- Counters GROW.

### SCATTER
- Cells reproduce into random empty neighbors without requiring a nearby nutrient
- `effectMult × cell count` cells activate (default: 100% at NORMAL)
- AGGRESSIVE: 30% friendly fire on the source cell
- Countered by PULSE (−50% active cells). Counters WALL.

### WALL
- Spawns up to `cellCount × effectMult` (default: 20 at NORMAL) barrier cells between your cells and the enemy centroid
- Walls block movement (HUNT can't step through). Decay after 3 rounds.
- SCATTER counters WALL (−50% cells placed)
- **Costs 2 power resources**
- Counters HUNT (scan radius).

### FEAST
- Cells near nutrients reproduce `reproMultiplier × effectMult` times (default: 2× at NORMAL), consuming nutrients
- GROW counters FEAST (−50% reproduction)
- **Costs 2 power resources**
- Counters ARMOR.

---

## Counter chain

Counters fire only if zones overlap (both use ALL, or same half, or one uses ALL).  
All counters reduce the effect by `counterEffectReductionPct` (default: 50%).

| Defender plays | Attacker plays | Effect |
|---------------|---------------|--------|
| ARMOR | PULSE | PULSE kill% −50% |
| ARMOR | HUNT | HUNT bypasses armor (ignores it completely) |
| ARMOR | FEAST | ARMOR hits granted −1 |
| PULSE | SCATTER | SCATTER active cells −50% |
| TOXIN | GROW | GROW reproduction −50% |
| TOXIN | HUNT | HUNT: toxin kill chance −50% on hunters |
| WALL | HUNT | HUNT scan radius −50% |
| WALL | SCATTER | SCATTER: walls placed −50% |
| FEAST | GROW | FEAST reproduction −50% |

Code source: `shared/sim/simulation.ts` `checkCounters()` (~line 730).

---

## Zones

- ALL: entire board
- NORTH/SOUTH: top/bottom half (y < h/2 or y ≥ h/2)
- EAST/WEST: right/left half (x ≥ w/2 or x < w/2)
- For GROW/HUNT/ARMOR/SCATTER/FEAST/WALL: filters which of YOUR cells activate
- For PULSE/TOXIN: filters which ENEMY cells form the centroid target

## Intensity multipliers

| Intensity | effectMult | friendlyFirePct |
|-----------|-----------|----------------|
| CAUTIOUS  | 0.7       | 0%             |
| NORMAL    | 1.0       | 0%             |
| AGGRESSIVE| 1.5       | 30%            |

## Strategy evaluation (per round, per side)

```
computeMetrics(state, player, round, config) → Metrics
evaluateStrategy(strategy, metrics) → { spec, trace }
```

### Metrics

| Metric | Description | Range |
|--------|-------------|-------|
| `round` | Current round (0-indexed) | 0–19 |
| `myCells` | Count of my cells | 0–1600 |
| `enemyCells` | Count of enemy cells | 0–1600 |
| `cellRatio` | myCells / (myCells + enemyCells) | 0.0–1.0 (0.5 = even) |
| `enemyDistance` | Min Manhattan distance, my cells to enemy cells (sampled ≤30 each) | 1–78 |
| `nutrientDensity` | Fraction of all nutrients within radius 4 of my cells | 0.0–1.0 |

### Rules
- Max 6 rules, max 4 conditions per rule (all AND'd)
- First matching rule fires; else fallback
- **Priority ordering matters** — put highest-urgency rules first
- Common pitfall: LLM puts GROW first (always matches), so PULSE/HUNT rules never fire

## Win conditions

- First to own 100% of occupied cells (eliminate all enemies) → wins immediately
- After 20 rounds → whoever has more cells wins (ties go to blue)

## Key config defaults

```ts
gridWidth: 40, gridHeight: 40
totalRounds: 20
startingCells: 6           // per side
startingNutrients: 120
nutrientCapacity: 4        // charges per nutrient
nutrientScanRadius: 2
starvationGraceTicks: 2
nutrientDepletionTtl: 2
wallDecayTicks: 3
winThresholdPct: 100       // must eliminate all enemies for early win
comebackThresholdPct: 25
comebackNutrientBurst: 15
counterEffectReductionPct: 0.5
powerNutrients: { count: 25, gatedActionCosts: { TOXIN: 3, WALL: 2, FEAST: 2 } }
```

## LLM model

`@cf/meta/llama-3.3-70b-instruct-fp8-fast`

System prompt in `worker/durable-objects/strategist.ts`. When updating: remind the model to order rules by priority (most urgent condition first), and that GROW often matches too broadly.

## Files

- `shared/sim/simulation.ts` — grid init, all apply functions (GROW/HUNT/ARMOR/PULSE/TOXIN/SCATTER/WALL/FEAST), base sim, win check
- `shared/sim/runGame.ts` — `runGame()`, `GameResolution`, `RoundRecord`, `SIM_VERSION`
- `shared/strategy.ts` — `Strategy`, `Rule`, `Condition`, `Metrics`, `computeMetrics()`, `evaluateStrategy()`, `validateStrategy()`
- `shared/config.ts` — `GameConfig`, `DEFAULT_CONFIG`
- `shared/rng.ts` — `makeRng(seed)` mulberry32
- `worker/durable-objects/strategist.ts` — `generateStrategy()`, LLM call, `strategyReadback()`
- `worker/durable-objects/GameRoom.ts` — DO, one-shot resolution flow
- `src/pages/DevRun.tsx` — client-side lab, runs `runGame()` in browser, no server needed
