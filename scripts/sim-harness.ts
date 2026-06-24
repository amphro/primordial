// Phase 0 validation gate: do different strategies produce measurably different outcomes?
// Does do-nothing reliably lose?
// Run with: npx tsx scripts/sim-harness.ts

import { initGrid, simulateTick, CELL } from '../worker/durable-objects/simulation.js'
import { DEFAULT_CONFIG } from '../worker/lib/config.js'
import type { GridState, ActionSpec } from '../worker/durable-objects/simulation.js'
import type { GameConfig } from '../worker/lib/config.js'

// ── Seeded PRNG (mulberry32 — safe arithmetic only, no transcendentals) ─────
function makeRng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Board metrics (Manhattan only — no transcendentals for cross-runtime safety) ─
interface Metrics {
  round: number
  myCells: number
  enemyCells: number
  cellRatio: number       // myCells / total, 0..1
  enemyDistance: number   // min Manhattan distance from any my-cell to any enemy-cell
  nutrientDensity: number // fraction of all nutrients accessible within radius 4 of my cells
}

function computeMetrics(state: GridState, player: 'blue' | 'red', round: number, config: GameConfig): Metrics {
  const { gridWidth: w, gridHeight: h } = config
  const me    = player === 'blue' ? CELL.BLUE : CELL.RED
  const enemy = player === 'blue' ? CELL.RED  : CELL.BLUE

  let myCells = 0, enemyCells = 0
  const myPos: [number, number][]    = []
  const enemyPos: [number, number][] = []

  for (let i = 0; i < state.grid.length; i++) {
    const v = state.grid[i]
    if (v === me)    { myCells++;    myPos.push([i % w, Math.floor(i / w)]) }
    if (v === enemy) { enemyCells++; enemyPos.push([i % w, Math.floor(i / w)]) }
  }

  // Sample at most 30 cells per side to keep the metric O(n) rather than O(n²)
  let enemyDistance = 9999
  const ms = myPos.slice(0, 30)
  const es = enemyPos.slice(0, 30)
  for (const [mx, my] of ms) {
    for (const [ex, ey] of es) {
      const d = Math.abs(mx - ex) + Math.abs(my - ey)
      if (d < enemyDistance) enemyDistance = d
    }
  }

  const total = myCells + enemyCells
  const cellRatio = total === 0 ? 0.5 : myCells / total

  const R = 4
  let nutrientNear = 0
  const seen = new Uint8Array(w * h)
  for (const [mx, my] of myPos) {
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > R) continue
        const nx = mx + dx, ny = my + dy
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
        const ni = ny * w + nx
        if (!seen[ni] && state.nutrients[ni] > 0) { nutrientNear++; seen[ni] = 1 }
      }
    }
  }
  let totalNutrients = 0
  for (let i = 0; i < state.nutrients.length; i++) if (state.nutrients[i] > 0) totalNutrients++
  const nutrientDensity = totalNutrients === 0 ? 0 : nutrientNear / totalNutrients

  return { round, myCells, enemyCells, cellRatio, enemyDistance, nutrientDensity }
}

// ── Minimal strategy types + evaluator ──────────────────────────────────────
type Metric = keyof Metrics
interface Condition { metric: Metric; op: 'lt' | 'lte' | 'gt' | 'gte'; value: number }
interface Rule { when: Condition[]; do: ActionSpec }
interface Strategy { rules: Rule[]; fallback: ActionSpec }

function eval1(c: Condition, m: Metrics): boolean {
  const v = m[c.metric]
  if (c.op === 'lt')  return v < c.value
  if (c.op === 'lte') return v <= c.value
  if (c.op === 'gt')  return v > c.value
  return v >= c.value
}

function evalStrategy(s: Strategy, m: Metrics): { spec: ActionSpec; trace: string } {
  for (let i = 0; i < s.rules.length; i++) {
    if (s.rules[i].when.every(c => eval1(c, m))) return { spec: s.rules[i].do, trace: `R${i+1}` }
  }
  return { spec: s.fallback, trace: 'fallback' }
}

// ── Test strategies (3 clearly-contrasting approaches) ──────────────────────
const STRATEGIES: { name: string; s: Strategy }[] = [
  {
    name: 'Do-Nothing (auto-fallback)',
    s: { rules: [], fallback: { action: 'GROW', zone: 'ALL', intensity: 'CAUTIOUS' } },
  },
  {
    name: 'Grow-then-Hunt',
    s: {
      rules: [
        // Phase 1: grow aggressively while still far from enemy
        { when: [{ metric: 'enemyDistance', op: 'gt', value: 10 }], do: { action: 'GROW', zone: 'ALL', intensity: 'AGGRESSIVE' } },
        // Phase 2: when enemy is close, hunt them down
        { when: [{ metric: 'enemyDistance', op: 'lte', value: 6 }], do: { action: 'HUNT', zone: 'ALL', intensity: 'AGGRESSIVE' } },
        // Defensive fallback when outnumbered
        { when: [{ metric: 'cellRatio', op: 'lt', value: 0.35 }], do: { action: 'ARMOR', zone: 'ALL', intensity: 'NORMAL' } },
      ],
      fallback: { action: 'GROW', zone: 'ALL', intensity: 'NORMAL' },
    },
  },
  {
    name: 'Pulse Blitz (nuke early then grow)',
    s: {
      rules: [
        // Early rounds: PULSE the enemy while we have surprise
        { when: [{ metric: 'round', op: 'lt', value: 3 }], do: { action: 'PULSE', zone: 'ALL', intensity: 'AGGRESSIVE' } },
        // If we're winning big, lock in with armor
        { when: [{ metric: 'cellRatio', op: 'gt', value: 0.65 }], do: { action: 'ARMOR', zone: 'ALL', intensity: 'CAUTIOUS' } },
      ],
      fallback: { action: 'GROW', zone: 'ALL', intensity: 'NORMAL' },
    },
  },
  {
    name: 'Turtle (armor then grow)',
    s: {
      rules: [
        // Armor up when enemy is close
        { when: [{ metric: 'enemyDistance', op: 'lte', value: 5 }], do: { action: 'ARMOR', zone: 'ALL', intensity: 'AGGRESSIVE' } },
        // Hunt only when clearly winning
        { when: [{ metric: 'cellRatio', op: 'gt', value: 0.6 }], do: { action: 'HUNT', zone: 'ALL', intensity: 'CAUTIOUS' } },
      ],
      fallback: { action: 'GROW', zone: 'ALL', intensity: 'CAUTIOUS' },
    },
  },
]

// ── Run one game headless ─────────────────────────────────────────────────
function runOne(
  seed: number,
  blueS: Strategy,
  redS: Strategy,
  config: GameConfig,
): { winner: 'blue' | 'red'; rounds: number; blueCells: number; redCells: number } {
  const rng = makeRng(seed)
  let state = initGrid(config, rng)

  for (let round = 0; round < config.totalRounds; round++) {
    const bm = computeMetrics(state, 'blue', round, config)
    const rm = computeMetrics(state, 'red',  round, config)
    const bSpec = evalStrategy(blueS, bm).spec
    const rSpec = evalStrategy(redS,  rm).spec

    const res = simulateTick(state, round, config, bSpec, rSpec, rng)
    state = res.state

    if (res.winner) {
      return { winner: res.winner, rounds: round + 1, blueCells: res.blueCells, redCells: res.redCells }
    }
  }

  let blue = 0, red = 0
  for (const c of state.grid) { if (c === CELL.BLUE) blue++; else if (c === CELL.RED) red++ }
  return { winner: blue >= red ? 'blue' : 'red', rounds: config.totalRounds, blueCells: blue, redCells: red }
}

// ── Run matchups ─────────────────────────────────────────────────────────
const N = 100  // seeds per matchup
const cfg = DEFAULT_CONFIG

console.log(`\n=== PRIMORDIAL Phase 0 Gate — ${N} seeds per matchup ===\n`)

// 1. Each strategy vs Do-Nothing (most important: does do-nothing lose?)
const doNothing = STRATEGIES[0]
console.log('--- Each strategy as BLUE vs Do-Nothing as RED ---')
for (const { name, s } of STRATEGIES) {
  let wins = 0, totBlue = 0
  for (let i = 0; i < N; i++) {
    const r = runOne(i * 6271 + 1, s, doNothing.s, cfg)
    if (r.winner === 'blue') wins++
    totBlue += r.blueCells / (r.blueCells + r.redCells + 0.001)
  }
  const pct = (wins / N * 100).toFixed(0)
  const avg = (totBlue / N * 100).toFixed(1)
  console.log(`  [${name}] win rate ${pct.padStart(3)}%  avg coverage ${avg}%`)
}

// 2. Do-Nothing vs each strategy (mirror: does do-nothing lose as red?)
console.log('\n--- Do-Nothing as BLUE vs each strategy as RED ---')
for (const { name, s } of STRATEGIES) {
  let wins = 0
  for (let i = 0; i < N; i++) {
    const r = runOne(i * 6271 + 1, doNothing.s, s, cfg)
    if (r.winner === 'blue') wins++
  }
  const pct = (wins / N * 100).toFixed(0)
  console.log(`  Do-Nothing vs [${name}]: Do-Nothing win rate ${pct.padStart(3)}%`)
}

// 3. Head-to-head between active strategies
console.log('\n--- Active strategy head-to-heads ---')
const active = STRATEGIES.slice(1)
for (let i = 0; i < active.length; i++) {
  for (let j = i + 1; j < active.length; j++) {
    let bWins = 0
    for (let k = 0; k < N; k++) {
      const r = runOne(k * 6271 + 1, active[i].s, active[j].s, cfg)
      if (r.winner === 'blue') bWins++
    }
    const pct = (bWins / N * 100).toFixed(0)
    console.log(`  [${active[i].name}] vs [${active[j].name}]: ${pct}% / ${(100 - parseInt(pct))}%`)
  }
}

console.log('\n=== Gate criteria ===')
console.log('PASS if: "Do-Nothing" loses >65% to any active strategy AND active strategies differ by >20pp from each other')
console.log()
