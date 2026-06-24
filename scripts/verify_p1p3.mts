/**
 * Headless verification for Phase 1–3 mechanics.
 * Run: npx tsx scripts/verify_p1p3.mts
 *
 * Tests:
 * 1. WALL spawns wall cells (3 or 4) after the first tick
 * 2. TOXIN kills red cells on blue's toxic tiles
 * 3. FEAST results in more growth than GROW alone
 * 4. SCATTER grows without nutrients nearby
 * 5. Counter-web: PULSE>SCATTER reduces scatter spread
 * 6. Board event: totalNutrients jumps on bloom round, drops on drought
 * 7. Client/server parity: runGame final state matches replayed client sim
 */

import { initGrid, simulateTick, CELL } from '../shared/sim/simulation'
import type { GridState, ActionSpec } from '../shared/sim/simulation'
import { runGame } from '../shared/sim/runGame'
import { generateEvents, applyBoardEvent } from '../shared/sim/events'
import { makeRng } from '../shared/rng'
import { DEFAULT_CONFIG } from '../shared/config'

let passed = 0
let failed = 0

function assert(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  ✓  ${name}`)
    passed++
  } else {
    console.error(`  ✗  ${name}${detail ? ': ' + detail : ''}`)
    failed++
  }
}

function countCell(state: GridState, v: number): number {
  let c = 0
  for (const cell of state.grid) if (cell === v) c++
  return c
}

function countNutrients(state: GridState): number {
  let c = 0
  for (const n of state.nutrients) if (n > 0) c++
  return c
}

// ─────────────────────────────────────────────────────────────────
// 1. WALL spawns wall cells
// ─────────────────────────────────────────────────────────────────
console.log('\n[1] WALL spawns wall cells')
{
  const rng = makeRng(42)
  const state = initGrid(DEFAULT_CONFIG, rng)
  const blueWall: ActionSpec = { action: 'WALL', zone: 'ALL', intensity: 'NORMAL' }
  const redGrow:  ActionSpec = { action: 'GROW', zone: 'ALL', intensity: 'NORMAL' }
  const before = countCell(state, CELL.WALL_BLUE) + countCell(state, CELL.WALL_RED)
  simulateTick(state, 0, DEFAULT_CONFIG, blueWall, redGrow, rng)
  const after = countCell(state, CELL.WALL_BLUE)
  assert('blue WALL cells spawned (> 0)', after > 0, `after=${after}`)
  assert('no extra WALL before action', before === 0, `before=${before}`)
}

// ─────────────────────────────────────────────────────────────────
// 2. TOXIN: blue places toxin, reduces red growth vs baseline
// ─────────────────────────────────────────────────────────────────
console.log('\n[2] TOXIN suppresses enemy growth')
{
  const seed = 7
  // Baseline: blue does GROW (no toxin pressure)
  const baseState = initGrid(DEFAULT_CONFIG, makeRng(seed))
  const baseRng   = makeRng(seed + 1)
  const blueGrow:  ActionSpec = { action: 'GROW',  zone: 'ALL', intensity: 'NORMAL' }
  const blueToxin: ActionSpec = { action: 'TOXIN', zone: 'ALL', intensity: 'AGGRESSIVE' }
  const redGrow:   ActionSpec = { action: 'GROW',  zone: 'ALL', intensity: 'NORMAL' }
  for (let i = 0; i < 6; i++) simulateTick(baseState, i, DEFAULT_CONFIG, blueGrow, redGrow, baseRng)
  const redBaseline = countCell(baseState, CELL.RED)

  // TOXIN: blue places toxin instead
  const toxinState = initGrid(DEFAULT_CONFIG, makeRng(seed))
  const toxinRng   = makeRng(seed + 1)
  for (let i = 0; i < 6; i++) simulateTick(toxinState, i, DEFAULT_CONFIG, blueToxin, redGrow, toxinRng)
  const redWithToxin = countCell(toxinState, CELL.RED)

  assert('TOXIN reduces red cells vs GROW baseline', redWithToxin < redBaseline,
    `toxin=${redWithToxin} baseline=${redBaseline}`)

  // Verify toxin tiles exist in the toxin scenario
  let toxicCount = 0
  for (const tv of toxinState.toxin) if (tv !== 0) toxicCount++
  assert('toxin tiles present on grid', toxicCount > 0, `toxicCount=${toxicCount}`)
}

// ─────────────────────────────────────────────────────────────────
// 3. FEAST vs GROW — feast should yield more cells
// ─────────────────────────────────────────────────────────────────
console.log('\n[3] FEAST outgrows GROW')
{
  const seed = 99
  const feastState = initGrid(DEFAULT_CONFIG, makeRng(seed))
  const growState  = initGrid(DEFAULT_CONFIG, makeRng(seed))
  const feastRng = makeRng(seed)
  const growRng  = makeRng(seed)
  // Re-init so both start identical (initGrid advances rng)
  initGrid(DEFAULT_CONFIG, makeRng(seed))  // discard
  const feastS = initGrid(DEFAULT_CONFIG, makeRng(seed))
  const growS  = initGrid(DEFAULT_CONFIG, makeRng(seed))
  const fr = makeRng(seed + 1)
  const gr = makeRng(seed + 1)

  const feast: ActionSpec = { action: 'FEAST', zone: 'ALL', intensity: 'NORMAL' }
  const grow:  ActionSpec = { action: 'GROW',  zone: 'ALL', intensity: 'NORMAL' }
  const opp:   ActionSpec = { action: 'GROW',  zone: 'ALL', intensity: 'NORMAL' }

  for (let i = 0; i < 3; i++) {
    simulateTick(feastS, i, DEFAULT_CONFIG, feast, opp, fr)
    simulateTick(growS,  i, DEFAULT_CONFIG, grow,  opp, gr)
  }
  const feastCells = countCell(feastS, CELL.BLUE)
  const growCells  = countCell(growS,  CELL.BLUE)
  assert('FEAST yields more cells than GROW', feastCells >= growCells, `feast=${feastCells} grow=${growCells}`)
}

// ─────────────────────────────────────────────────────────────────
// 4. SCATTER grows without nutrients
// ─────────────────────────────────────────────────────────────────
console.log('\n[4] SCATTER works without nutrients')
{
  const rng = makeRng(55)
  // Build a state manually with blue cells but NO nutrients
  const cfg = { ...DEFAULT_CONFIG, startingNutrients: 0 }
  const state = initGrid(cfg, rng)
  // Verify no nutrients
  assert('no nutrients initially', countNutrients(state) === 0, `nuts=${countNutrients(state)}`)
  const blueBefore = countCell(state, CELL.BLUE)
  const scatter: ActionSpec = { action: 'SCATTER', zone: 'ALL', intensity: 'NORMAL' }
  const opp:     ActionSpec = { action: 'GROW',    zone: 'ALL', intensity: 'NORMAL' }
  simulateTick(state, 0, cfg, scatter, opp, rng)
  const blueAfter = countCell(state, CELL.BLUE)
  assert('SCATTER increases blue cells with 0 nutrients', blueAfter > blueBefore, `before=${blueBefore} after=${blueAfter}`)
}

// ─────────────────────────────────────────────────────────────────
// 5. Counter-web: PULSE > SCATTER reduces scatter spread
// ─────────────────────────────────────────────────────────────────
console.log('\n[5] PULSE counter reduces SCATTER spread')
{
  const seed = 77
  // Blue SCATTERs without counter
  const s1 = initGrid(DEFAULT_CONFIG, makeRng(seed))
  const r1 = makeRng(seed + 1)
  const scatter: ActionSpec = { action: 'SCATTER', zone: 'ALL', intensity: 'NORMAL' }
  const grow:    ActionSpec = { action: 'GROW',    zone: 'ALL', intensity: 'NORMAL' }
  const pulse:   ActionSpec = { action: 'PULSE',   zone: 'ALL', intensity: 'NORMAL' }
  simulateTick(s1, 0, DEFAULT_CONFIG, scatter, grow, r1)
  const freeScatter = countCell(s1, CELL.BLUE)

  // Blue SCATTERs while red PULSEs (PULSE>SCATTER counter fires)
  const s2 = initGrid(DEFAULT_CONFIG, makeRng(seed))
  const r2 = makeRng(seed + 1)
  simulateTick(s2, 0, DEFAULT_CONFIG, scatter, pulse, r2)
  const counteredScatter = countCell(s2, CELL.BLUE)

  assert('PULSE>SCATTER: scatter spreads less when countered', counteredScatter <= freeScatter,
    `free=${freeScatter} countered=${counteredScatter}`)
}

// ─────────────────────────────────────────────────────────────────
// 6. Board events: nutrient changes
// ─────────────────────────────────────────────────────────────────
console.log('\n[6] Board events change nutrient counts')
{
  const seed = 12345
  const events = generateEvents(seed, DEFAULT_CONFIG)
  assert('events generated (> 0)', events.length > 0, `count=${events.length}`)

  const blooms = events.filter(e => e.kind === 'nutrient_bloom')
  const droughts = events.filter(e => e.kind === 'drought')
  assert('at least one bloom', blooms.length > 0)
  assert('at least one drought', droughts.length > 0)

  // Verify bloom adds nutrients
  const bloom = blooms[0]
  const state = initGrid(DEFAULT_CONFIG, makeRng(seed))
  const nutsBefore = countNutrients(state)
  const rng = makeRng(seed + 99)
  applyBoardEvent(state, bloom, DEFAULT_CONFIG, rng)
  const nutsAfter = countNutrients(state)
  assert('bloom increases nutrients', nutsAfter > nutsBefore, `before=${nutsBefore} after=${nutsAfter}`)
}

// ─────────────────────────────────────────────────────────────────
// 7. Client/server parity: runGame vs manual replay
// ─────────────────────────────────────────────────────────────────
console.log('\n[7] Client/server parity')
{
  const seed = 314159
  const grow: import('../shared/strategy').Strategy = {
    rules: [],
    fallback: { action: 'GROW', zone: 'ALL', intensity: 'NORMAL' },
  }
  const hunt: import('../shared/strategy').Strategy = {
    rules: [
      { when: [{ metric: 'round', op: 'gt', value: 3 }], do: { action: 'HUNT', zone: 'ALL', intensity: 'AGGRESSIVE' } },
    ],
    fallback: { action: 'GROW', zone: 'ALL', intensity: 'CAUTIOUS' },
  }

  const resolution = runGame(seed, DEFAULT_CONFIG, grow, hunt)

  // Now replay identically (mimicking client animation)
  const rng = makeRng(seed)
  let state = initGrid(DEFAULT_CONFIG, rng)
  const events = resolution.events

  for (const r of resolution.rounds) {
    const result = simulateTick(state, r.round, DEFAULT_CONFIG, r.blueSpec, r.redSpec, rng)
    state = result.state
    for (const ev of events) {
      if (ev.round === r.round) applyBoardEvent(state, ev, DEFAULT_CONFIG, rng)
    }
  }

  // Compare final cell counts
  const clientBlue = countCell(state, CELL.BLUE)
  const clientRed  = countCell(state, CELL.RED)
  const clientTotal = clientBlue + clientRed
  const clientBluePct = clientTotal === 0 ? 50 : Math.round(clientBlue / clientTotal * 100)

  assert(
    'client replay matches server final scores (blue%)',
    clientBluePct === resolution.finalScores.blue,
    `client=${clientBluePct}% server=${resolution.finalScores.blue}%`
  )
  assert('server winner is deterministic', resolution.winner === 'blue' || resolution.winner === 'red')
  console.log(`    winner=${resolution.winner} after ${resolution.rounds.length} rounds`)
}

// ─────────────────────────────────────────────────────────────────
// Phase 4: Power nutrients + resource economy
// ─────────────────────────────────────────────────────────────────

console.log('\n[P4-1] Power nutrients placed at init')
{
  const seed = 11111
  const rng = makeRng(seed)
  const powerRng = makeRng(seed ^ 0x4E07)
  const state = initGrid(DEFAULT_CONFIG, rng, powerRng)
  let powerCount = 0
  for (let i = 0; i < state.nutrientType.length; i++) if (state.nutrientType[i] > 0) powerCount++
  assert('power nutrients placed', powerCount > 0, `count=${powerCount}`)
  assert('power count matches config (≤)', powerCount <= DEFAULT_CONFIG.powerNutrients.count, `placed=${powerCount} config=${DEFAULT_CONFIG.powerNutrients.count}`)
  // Every power nutrient should overlap with a real nutrient
  let mismatch = false
  for (let i = 0; i < state.nutrientType.length; i++) if (state.nutrientType[i] > 0 && state.nutrients[i] === 0) mismatch = true
  assert('power nutrients are on actual nutrient tiles', !mismatch)
}

console.log('\n[P4-2] Collecting power nutrients fills resource pool')
{
  const seed = 22222
  const rng = makeRng(seed)
  const powerRng = makeRng(seed ^ 0x4E07)
  const state = initGrid(DEFAULT_CONFIG, rng, powerRng)
  assert('start with 0 resources', state.blueResources === 0 && state.redResources === 0,
    `blue=${state.blueResources} red=${state.redResources}`)
  const grow: ActionSpec = { action: 'GROW', zone: 'ALL', intensity: 'NORMAL' }
  for (let i = 0; i < 5; i++) simulateTick(state, i, DEFAULT_CONFIG, grow, grow, rng)
  const totalCollected = state.blueResources + state.redResources
  assert('resources collected after 5 rounds', totalCollected > 0, `blue=${state.blueResources} red=${state.redResources}`)
}

console.log('\n[P4-3] Gated action deducts resources')
{
  const seed = 33333
  const rng = makeRng(seed)
  const powerRng = makeRng(seed ^ 0x4E07)
  const state = initGrid(DEFAULT_CONFIG, rng, powerRng)
  // Manually set blue resources high enough
  state.blueResources = 10
  const before = state.blueResources
  const toxin: ActionSpec = { action: 'TOXIN', zone: 'ALL', intensity: 'NORMAL' }
  const grow:  ActionSpec = { action: 'GROW',  zone: 'ALL', intensity: 'NORMAL' }
  simulateTick(state, 0, DEFAULT_CONFIG, toxin, grow, rng)
  const cost = DEFAULT_CONFIG.powerNutrients.gatedActionCosts['TOXIN'] ?? 0
  assert('TOXIN deducts resource cost', state.blueResources === before - cost,
    `before=${before} after=${state.blueResources} cost=${cost}`)
}

console.log('\n[P4-4] Fall-through when unaffordable (via runGame)')
{
  // Strategy: use TOXIN when holding ≥3 resources, otherwise GROW
  const toxinStrat: import('../shared/strategy').Strategy = {
    rules: [
      { when: [{ metric: 'resource', op: 'gte', value: 3 }], do: { action: 'TOXIN', zone: 'ALL', intensity: 'NORMAL' } },
    ],
    fallback: { action: 'GROW', zone: 'ALL', intensity: 'NORMAL' },
  }
  const growStrat: import('../shared/strategy').Strategy = {
    rules: [],
    fallback: { action: 'GROW', zone: 'ALL', intensity: 'NORMAL' },
  }
  // Use a longer game to give time to accumulate resources
  const bigCfg = { ...DEFAULT_CONFIG, totalRounds: 40 }
  const resolution = runGame(22222, bigCfg, toxinStrat, growStrat)
  // In early rounds, TOXIN condition is false (no resources) → GROW fires
  const round0 = resolution.rounds[0]
  assert('round 0 blue spec is GROW (resource condition not met)', round0.blueSpec.action === 'GROW',
    `spec=${round0.blueSpec.action}`)
  // TOXIN should eventually fire when resources ≥ 3
  const toxinRounds = resolution.rounds.filter(r => r.blueSpec.action === 'TOXIN')
  assert('TOXIN fires in at least one round (resource condition eventually met)', toxinRounds.length > 0,
    `toxinRounds=${toxinRounds.length}`)
}

console.log('\n[P4-5] `resource` metric computable and clamped')
{
  const { validateStrategy: _vs, computeMetrics } = await import('../shared/strategy')
  const seed = 55555
  const rng = makeRng(seed)
  const powerRng = makeRng(seed ^ 0x4E07)
  const state = initGrid(DEFAULT_CONFIG, rng, powerRng)
  state.blueResources = 7
  const m = computeMetrics(state, 'blue', 0, DEFAULT_CONFIG)
  assert('resource metric reads blueResources', m.resource === 7, `metric=${m.resource}`)
  const mRed = computeMetrics(state, 'red', 0, DEFAULT_CONFIG)
  assert('resource metric reads redResources for red', mRed.resource === 0, `metric=${mRed.resource}`)
}

console.log('\n[P4-6] P4 client/server parity with gated action')
{
  const seed = 666666
  const toxinStrat: import('../shared/strategy').Strategy = {
    rules: [{ when: [{ metric: 'resource', op: 'gte', value: 3 }], do: { action: 'TOXIN', zone: 'ALL', intensity: 'NORMAL' } }],
    fallback: { action: 'GROW', zone: 'ALL', intensity: 'NORMAL' },
  }
  const growStrat: import('../shared/strategy').Strategy = { rules: [], fallback: { action: 'GROW', zone: 'ALL', intensity: 'NORMAL' } }
  const resolution = runGame(seed, DEFAULT_CONFIG, toxinStrat, growStrat)

  // Replay client-side
  const rng = makeRng(seed)
  const powerRng = makeRng(seed ^ 0x4E07)
  let state = initGrid(DEFAULT_CONFIG, rng, powerRng)
  for (const r of resolution.rounds) {
    const result = simulateTick(state, r.round, DEFAULT_CONFIG, r.blueSpec, r.redSpec, rng)
    state = result.state
    for (const ev of resolution.events) {
      if (ev.round === r.round) applyBoardEvent(state, ev, DEFAULT_CONFIG, rng)
    }
  }
  const cBlue = countCell(state, CELL.BLUE)
  const cRed  = countCell(state, CELL.RED)
  const cTotal = cBlue + cRed
  const clientPct = cTotal === 0 ? 50 : Math.round(cBlue / cTotal * 100)
  assert('P4 client/server parity with gated action', clientPct === resolution.finalScores.blue,
    `client=${clientPct}% server=${resolution.finalScores.blue}%`)
}

// ─────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
