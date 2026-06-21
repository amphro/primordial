// Pure cellular automaton functions — no DO, no I/O, fully unit-testable.
import type { GameConfig } from '../lib/config'

export const CELL = { EMPTY: 0, BLUE: 1, RED: 2, WALL_BLUE: 3, WALL_RED: 4 } as const
export type CellValue = 0 | 1 | 2 | 3 | 4

export type Action = 'GROW' | 'ARMOR' | 'TOXIN' | 'HUNT' | 'SCATTER' | 'PULSE' | 'WALL' | 'FEAST'
export type Zone = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'ALL'
export type Intensity = 'CAUTIOUS' | 'NORMAL' | 'AGGRESSIVE'

export interface ActionSpec {
  action: Action
  zone: Zone
  intensity: Intensity
}

export interface GridState {
  grid: Uint8Array             // cell ownership (CELL_* values)
  nutrients: Uint8Array        // 0=not a nutrient, 1-4=charges remaining
  nutrientCooldown: Uint8Array // ticks until depleted nutrient recharges
  starvation: Uint8Array       // ticks this cell has lacked a nutrient
  armor: Uint8Array            // extra hits before dying (0=none)
  wallAge: Uint8Array          // ticks this wall has existed (0=not a wall)
}

export interface CounterEvent {
  winner: Action
  loser: Action
  zone: Zone
  reduction: number
}

export interface TickResult {
  state: GridState
  counters: CounterEvent[]
  bluePct: number
  redPct: number
  blueCells: number
  redCells: number
  winner: 'blue' | 'red' | null
}

// ── helpers ──────────────────────────────────────────────────────────────────

function idx(x: number, y: number, w: number): number {
  return y * w + x
}

function inZone(x: number, y: number, zone: Zone, w: number, h: number): boolean {
  switch (zone) {
    case 'NORTH': return y < Math.floor(h / 2)
    case 'SOUTH': return y >= Math.floor(h / 2)
    case 'EAST':  return x >= Math.floor(w / 2)
    case 'WEST':  return x < Math.floor(w / 2)
    case 'ALL':   return true
  }
}

function zoneCentroid(zone: Zone, w: number, h: number): [number, number] {
  switch (zone) {
    case 'NORTH': return [Math.floor(w / 2), Math.floor(h / 4)]
    case 'SOUTH': return [Math.floor(w / 2), Math.floor(3 * h / 4)]
    case 'EAST':  return [Math.floor(3 * w / 4), Math.floor(h / 2)]
    case 'WEST':  return [Math.floor(w / 4), Math.floor(h / 2)]
    case 'ALL':   return [Math.floor(w / 2), Math.floor(h / 2)]
  }
}

function neighbors4(x: number, y: number, w: number, h: number): [number, number][] {
  const result: [number, number][] = []
  if (x > 0)     result.push([x - 1, y])
  if (x < w - 1) result.push([x + 1, y])
  if (y > 0)     result.push([x, y - 1])
  if (y < h - 1) result.push([x, y + 1])
  return result
}

function cellsInRadius(cx: number, cy: number, r: number, w: number, h: number): [number, number][] {
  const result: [number, number][] = []
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        const nx = cx + dx, ny = cy + dy
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) result.push([nx, ny])
      }
    }
  }
  return result
}

function findNutrientNearby(x: number, y: number, nutrients: Uint8Array, radius: number, w: number, h: number): number | null {
  for (const [nx, ny] of cellsInRadius(x, y, radius, w, h)) {
    const i = idx(nx, ny, w)
    if (nutrients[i] > 0) return i
  }
  return null
}

function findNearestEnemy(
  x: number, y: number,
  grid: Uint8Array,
  enemyColor: CellValue,
  radius: number,
  w: number, h: number,
): [number, number] | null {
  let best: [number, number] | null = null
  let bestDist = Infinity
  for (const [nx, ny] of cellsInRadius(x, y, radius, w, h)) {
    if (grid[idx(nx, ny, w)] === enemyColor) {
      const d = Math.abs(nx - x) + Math.abs(ny - y)
      if (d < bestDist) { bestDist = d; best = [nx, ny] }
    }
  }
  return best
}

function stepToward(x: number, y: number, tx: number, ty: number): [number, number] {
  const dx = tx - x, dy = ty - y
  if (Math.abs(dx) >= Math.abs(dy)) return [x + Math.sign(dx), y]
  return [x, y + Math.sign(dy)]
}

// ── grid initialization ───────────────────────────────────────────────────────

export function initGrid(config: GameConfig, rng: () => number): GridState {
  const { gridWidth: w, gridHeight: h, startingCells, startingNutrients, nutrientClusterSize, nutrientCapacity } = config
  const size = w * h
  const grid = new Uint8Array(size)
  const nutrients = new Uint8Array(size)
  const nutrientCooldown = new Uint8Array(size)
  const starvation = new Uint8Array(size)
  const armor = new Uint8Array(size)
  const wallAge = new Uint8Array(size)

  // Place starting cells: blue on left third, red on right third
  const blueMaxX = Math.floor(w / 4)
  const redMinX  = w - Math.floor(w / 4) - 1

  let placed = 0
  while (placed < startingCells) {
    const x = Math.floor(rng() * (blueMaxX + 1))
    const y = Math.floor(rng() * h)
    const i = idx(x, y, w)
    if (grid[i] === CELL.EMPTY) { grid[i] = CELL.BLUE; placed++ }
  }
  placed = 0
  while (placed < startingCells) {
    const x = redMinX + Math.floor(rng() * (w - redMinX))
    const y = Math.floor(rng() * h)
    const i = idx(x, y, w)
    if (grid[i] === CELL.EMPTY) { grid[i] = CELL.RED; placed++ }
  }

  // Place nutrients in clusters
  const numClusters = Math.ceil(startingNutrients / nutrientClusterSize)
  let totalPlaced = 0
  for (let c = 0; c < numClusters && totalPlaced < startingNutrients; c++) {
    const cx = Math.floor(rng() * w)
    const cy = Math.floor(rng() * h)
    for (let j = 0; j < nutrientClusterSize && totalPlaced < startingNutrients; j++) {
      const nx = Math.max(0, Math.min(w - 1, cx + Math.floor((rng() - 0.5) * 6)))
      const ny = Math.max(0, Math.min(h - 1, cy + Math.floor((rng() - 0.5) * 6)))
      const i = idx(nx, ny, w)
      if (nutrients[i] === 0 && grid[i] === CELL.EMPTY) {
        nutrients[i] = nutrientCapacity
        totalPlaced++
      }
    }
  }

  return { grid, nutrients, nutrientCooldown, starvation, armor, wallAge }
}

// ── action effects ────────────────────────────────────────────────────────────

function myColor(player: 'blue' | 'red'): CellValue {
  return player === 'blue' ? CELL.BLUE : CELL.RED
}
function enemyColor(player: 'blue' | 'red'): CellValue {
  return player === 'blue' ? CELL.RED : CELL.BLUE
}

function intensityRadius(base: number, intensity: Intensity, effectMult: number): number {
  // Pulse/toxin radius scales with effectMult. Simple linear, floored.
  if (intensity === 'CAUTIOUS') return Math.max(1, base - 1)
  if (intensity === 'AGGRESSIVE') return Math.ceil(base * effectMult)
  return base
}

function killPctForPulse(intensity: Intensity, killPct: number, effectMult: number, cautiousMult: number): number {
  if (intensity === 'CAUTIOUS')   return killPct * cautiousMult
  if (intensity === 'AGGRESSIVE') return Math.min(1, killPct * effectMult)
  return killPct
}

function applyArmor(state: GridState, player: 'blue' | 'red', zone: Zone, intensity: Intensity, config: GameConfig): void {
  const { gridWidth: w, gridHeight: h, actions: { armor: ac } } = config
  const color = myColor(player)
  const hitsToGrant = intensity === 'CAUTIOUS' ? 1 : intensity === 'NORMAL' ? ac.hitsToKill : ac.hitsToKill + 1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inZone(x, y, zone, w, h)) continue
      const i = idx(x, y, w)
      if (state.grid[i] === color) {
        state.armor[i] = Math.max(state.armor[i], hitsToGrant)
      }
    }
  }
}

function applyPulse(
  state: GridState,
  player: 'blue' | 'red',
  zone: Zone,
  intensity: Intensity,
  config: GameConfig,
  armorCountered: boolean,
  rng: () => number,
): void {
  const { gridWidth: w, gridHeight: h, intensity: intCfg, actions: { pulse } } = config
  const im = intCfg[intensity.toLowerCase() as 'cautious' | 'normal' | 'aggressive']
  const enemy = enemyColor(player)
  const me = myColor(player)

  const r = intensityRadius(pulse.radiusTiles, intensity, im.effectMult)
  const baseKill = killPctForPulse(intensity, pulse.killPct, im.effectMult, intCfg.cautious.effectMult)
  const effectiveKill = armorCountered ? baseKill * (1 - config.counterEffectReductionPct) : baseKill

  const [cx, cy] = zoneCentroid(zone, w, h)
  for (const [nx, ny] of cellsInRadius(cx, cy, r, w, h)) {
    const i = idx(nx, ny, w)
    if (state.grid[i] === enemy) {
      if (state.armor[i] > 0) {
        state.armor[i]--
      } else if (rng() < effectiveKill) {
        state.grid[i] = CELL.EMPTY
      }
    }
    // Friendly fire for AGGRESSIVE
    if (intensity === 'AGGRESSIVE' && state.grid[i] === me) {
      if (rng() < im.friendlyFirePct) state.grid[i] = CELL.EMPTY
    }
  }
}

function applyGrow(
  state: GridState,
  player: 'blue' | 'red',
  zone: Zone,
  intensity: Intensity,
  config: GameConfig,
  rng: () => number,
): void {
  const { gridWidth: w, gridHeight: h, intensity: intCfg, actions: { grow }, nutrientScanRadius } = config
  const im = intCfg[intensity.toLowerCase() as 'cautious' | 'normal' | 'aggressive']
  const me = myColor(player)

  const extraRepro = Math.round(grow.extraReproPerCell * im.effectMult)
  const cells: [number, number][] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (inZone(x, y, zone, w, h) && state.grid[idx(x, y, w)] === me) cells.push([x, y])
    }
  }

  for (const [x, y] of cells) {
    for (let r = 0; r < extraRepro; r++) {
      const ns = neighbors4(x, y, w, h).filter(([nx, ny]) => state.grid[idx(nx, ny, w)] === CELL.EMPTY)
      if (ns.length === 0) continue
      const nutrientIdx = findNutrientNearby(x, y, state.nutrients, nutrientScanRadius, w, h)
      if (nutrientIdx === null) continue
      const [nx, ny] = ns[Math.floor(rng() * ns.length)]
      state.grid[idx(nx, ny, w)] = me
      state.nutrients[nutrientIdx] = Math.max(0, state.nutrients[nutrientIdx] - 1)
      if (state.nutrients[nutrientIdx] === 0) state.nutrientCooldown[nutrientIdx] = config.nutrientDepletionTtl
    }

    if (intensity === 'AGGRESSIVE' && rng() < im.friendlyFirePct) {
      state.grid[idx(x, y, w)] = CELL.EMPTY
    }
  }
}

function applyHunt(
  state: GridState,
  player: 'blue' | 'red',
  zone: Zone,
  intensity: Intensity,
  config: GameConfig,
  rng: () => number,
): void {
  const { gridWidth: w, gridHeight: h, intensity: intCfg, actions: { hunt } } = config
  const im = intCfg[intensity.toLowerCase() as 'cautious' | 'normal' | 'aggressive']
  const me = myColor(player)
  const enemy = enemyColor(player)

  const r = Math.round(hunt.scanRadiusTiles * im.effectMult)
  const cells: [number, number][] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (inZone(x, y, zone, w, h) && state.grid[idx(x, y, w)] === me) cells.push([x, y])
    }
  }

  // Shuffle to avoid directional bias
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]]
  }

  for (const [x, y] of cells) {
    const target = findNearestEnemy(x, y, state.grid, enemy, r, w, h)
    if (!target) continue
    const [tx, ty] = stepToward(x, y, target[0], target[1])
    const destI = idx(tx, ty, w)
    const srcI = idx(x, y, w)
    if (state.grid[destI] === CELL.EMPTY) {
      state.grid[destI] = me
      state.grid[srcI] = CELL.EMPTY
      state.starvation[destI] = state.starvation[srcI]
      state.armor[destI] = state.armor[srcI]
      state.starvation[srcI] = 0
      state.armor[srcI] = 0
    } else if (state.grid[destI] === enemy && state.armor[destI] === 0) {
      state.grid[destI] = me
      state.grid[srcI] = CELL.EMPTY
      state.starvation[destI] = 0
      state.armor[destI] = 0
      state.starvation[srcI] = 0
      state.armor[srcI] = 0
    } else if (state.grid[destI] === enemy && state.armor[destI] > 0) {
      state.armor[destI]--
    }

    if (intensity === 'AGGRESSIVE' && rng() < im.friendlyFirePct) {
      state.grid[srcI] = CELL.EMPTY
    }
  }
}

// ── base simulation step ──────────────────────────────────────────────────────

function baseSimStep(state: GridState, config: GameConfig, round: number, rng: () => number): void {
  const { gridWidth: w, gridHeight: h, nutrientScanRadius, starvationGraceTicks, nutrientDepletionTtl, nutrientCapacity, nutrientRegenByRound } = config
  const { grid, nutrients, nutrientCooldown, starvation } = state

  // Nutrient regen: recharge depleted nutrient tiles this tick
  const regenRate = nutrientRegenByRound[Math.min(round, nutrientRegenByRound.length - 1)]
  let regen = regenRate
  for (let i = 0; i < w * h && regen > 0; i++) {
    if (nutrients[i] === 0 && nutrientCooldown[i] > 0) {
      nutrientCooldown[i]--
      if (nutrientCooldown[i] === 0) {
        nutrients[i] = nutrientCapacity
        regen--
      }
    }
  }

  // Collect reproduction candidates (process in random order to avoid bias)
  type ReproCandidate = { x: number; y: number; color: CellValue; nutritionIdx: number }
  const candidates: ReproCandidate[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w)
      const cell = grid[i] as CellValue
      if (cell !== CELL.BLUE && cell !== CELL.RED) continue

      const nIdx = findNutrientNearby(x, y, nutrients, nutrientScanRadius, w, h)
      if (nIdx !== null) {
        starvation[i] = 0
        candidates.push({ x, y, color: cell, nutritionIdx: nIdx })
      } else {
        starvation[i]++
        if (starvation[i] > starvationGraceTicks) {
          grid[i] = CELL.EMPTY
          starvation[i] = 0
          state.armor[i] = 0
        }
      }
    }
  }

  // Shuffle candidates
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }

  // Attempt base reproduction (1 per candidate)
  for (const { x, y, color, nutritionIdx } of candidates) {
    if (nutrients[nutritionIdx] === 0) continue
    const ns = neighbors4(x, y, w, h).filter(([nx, ny]) => grid[idx(nx, ny, w)] === CELL.EMPTY)
    if (ns.length === 0) continue
    const [nx, ny] = ns[Math.floor(rng() * ns.length)]
    grid[idx(nx, ny, w)] = color
    nutrients[nutritionIdx] = Math.max(0, nutrients[nutritionIdx] - 1)
    if (nutrients[nutritionIdx] === 0) nutrientCooldown[nutritionIdx] = nutrientDepletionTtl
  }

  // Wall decay
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w)
      if (grid[i] === CELL.WALL_BLUE || grid[i] === CELL.WALL_RED) {
        state.wallAge[i]++
        if (state.wallAge[i] >= config.wallDecayTicks) {
          grid[i] = CELL.EMPTY
          state.wallAge[i] = 0
        }
      }
    }
  }
}

// ── counter-web (Phase 2: ARMOR beats PULSE) ──────────────────────────────────

function checkCounters(
  blue: ActionSpec | null,
  red: ActionSpec | null,
  config: GameConfig,
): CounterEvent[] {
  const counters: CounterEvent[] = []
  if (!blue || !red) return counters

  const zonesOverlap = blue.zone === red.zone || blue.zone === 'ALL' || red.zone === 'ALL'

  if (zonesOverlap) {
    // ARMOR beats PULSE
    if (blue.action === 'ARMOR' && red.action === 'PULSE') {
      counters.push({ winner: 'ARMOR', loser: 'PULSE', zone: red.zone, reduction: config.counterEffectReductionPct })
    }
    if (red.action === 'ARMOR' && blue.action === 'PULSE') {
      counters.push({ winner: 'ARMOR', loser: 'PULSE', zone: blue.zone, reduction: config.counterEffectReductionPct })
    }
    // TOXIN beats GROW (Phase 4 — stub for completeness)
    // PULSE beats SCATTER (Phase 4)
    // HUNT beats TOXIN (Phase 4)
  }

  return counters
}

// ── win condition ─────────────────────────────────────────────────────────────

function checkWin(grid: Uint8Array, config: GameConfig, round: number): {
  winner: 'blue' | 'red' | null
  bluePct: number
  redPct: number
  blueCells: number
  redCells: number
} {
  let blue = 0, red = 0
  for (const cell of grid) {
    if (cell === CELL.BLUE) blue++
    else if (cell === CELL.RED) red++
  }
  const total = blue + red
  const bluePct = total === 0 ? 0 : (blue / total) * 100
  const redPct  = total === 0 ? 0 : (red  / total) * 100
  let winner: 'blue' | 'red' | null = null
  if (bluePct >= config.winThresholdPct) winner = 'blue'
  else if (redPct >= config.winThresholdPct) winner = 'red'
  else if (round >= config.totalRounds) winner = blue >= red ? 'blue' : 'red'
  return { winner, bluePct, redPct, blueCells: blue, redCells: red }
}

// ── main tick ─────────────────────────────────────────────────────────────────

export function simulateTick(
  state: GridState,
  round: number,
  config: GameConfig,
  blueAction: ActionSpec | null,
  redAction: ActionSpec | null,
  rng: () => number,
): TickResult {
  const counters = checkCounters(blueAction, redAction, config)
  const pulseCounteredByArmor = (player: 'blue' | 'red') =>
    counters.some(c => c.loser === 'PULSE' &&
      ((player === 'red' && redAction?.action === 'PULSE') ||
       (player === 'blue' && blueAction?.action === 'PULSE')))

  // Resolution order per game design doc
  // 1. WALL — Phase 4
  // 2. ARMOR
  for (const [player, spec] of ([['blue', blueAction], ['red', redAction]] as const)) {
    if (spec?.action === 'ARMOR') applyArmor(state, player, spec.zone, spec.intensity, config)
  }
  // 3. TOXIN — Phase 4
  // 4. PULSE
  for (const [player, spec] of ([['blue', blueAction], ['red', redAction]] as const)) {
    if (spec?.action === 'PULSE') applyPulse(state, player, spec.zone, spec.intensity, config, pulseCounteredByArmor(player), rng)
  }
  // 5. HUNT / GROW / SCATTER / FEAST
  for (const [player, spec] of ([['blue', blueAction], ['red', redAction]] as const)) {
    if (!spec) continue
    if (spec.action === 'GROW')  applyGrow(state, player, spec.zone, spec.intensity, config, rng)
    if (spec.action === 'HUNT')  applyHunt(state, player, spec.zone, spec.intensity, config, rng)
  }
  // 6. Base sim
  baseSimStep(state, config, round, rng)
  // 7. Expire ARMOR (not persistent across ticks — re-applied each tick on submit)
  state.armor.fill(0)

  const { winner, bluePct, redPct, blueCells, redCells } = checkWin(state.grid, config, round)
  return { state, counters, bluePct, redPct, blueCells, redCells, winner }
}
