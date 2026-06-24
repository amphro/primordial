import type { GameConfig } from './config'
import { CELL } from './sim/simulation'
import type { GridState, ActionSpec } from './sim/simulation'

// ── Types ─────────────────────────────────────────────────────────────────────

export type Metric = 'round' | 'enemyDistance' | 'nutrientDensity' | 'cellRatio' | 'myCells' | 'resource'

export interface Condition {
  metric: Metric
  op: 'lt' | 'lte' | 'gt' | 'gte'
  value: number
}

export interface Rule {
  when: Condition[]  // all conditions AND'd together
  do: ActionSpec
}

export interface Strategy {
  rules: Rule[]      // all matching rules cycle by round (round % matchCount)
  fallback: ActionSpec
}

export interface Metrics {
  round: number
  myCells: number
  enemyCells: number
  cellRatio: number       // myCells / total, 0..1
  enemyDistance: number   // min Manhattan distance from any my-cell to any enemy-cell
  nutrientDensity: number // fraction of all nutrients accessible within radius 4 of my cells
  resource: number        // power resources held by this player going into this round
}

export interface EvalResult {
  spec: ActionSpec
  trace: string
}

// ── computeMetrics ────────────────────────────────────────────────────────────

export function computeMetrics(state: GridState, player: 'blue' | 'red', round: number, config: GameConfig): Metrics {
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

  // Sample ≤30 cells per side — O(n) instead of O(n²)
  let enemyDistance = 9999
  for (const [mx, my] of myPos.slice(0, 30)) {
    for (const [ex, ey] of enemyPos.slice(0, 30)) {
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

  const resource = player === 'blue' ? state.blueResources : state.redResources

  return { round, myCells, enemyCells, cellRatio, enemyDistance, nutrientDensity, resource }
}

// ── evaluateStrategy ──────────────────────────────────────────────────────────

function checkCondition(c: Condition, m: Metrics): boolean {
  const v = m[c.metric]
  switch (c.op) {
    case 'lt':  return v < c.value
    case 'lte': return v <= c.value
    case 'gt':  return v > c.value
    case 'gte': return v >= c.value
  }
}

export function evaluateStrategy(strategy: Strategy, metrics: Metrics, excludeActions?: Set<string>): EvalResult {
  // Collect all matching rules, then cycle by round so co-matching rules take turns
  const matching = strategy.rules
    .map((rule, i) => ({ rule, i }))
    .filter(({ rule }) =>
      rule.when.every(c => checkCondition(c, metrics)) &&
      (!excludeActions || !excludeActions.has(rule.do.action))
    )

  if (matching.length > 0) {
    const { rule, i } = matching[metrics.round % matching.length]
    const conds = rule.when.map(c => `${c.metric}${c.op}${c.value}`).join(' ')
    return {
      spec: rule.do,
      trace: `rule:${i + 1}[${metrics.round % matching.length + 1}/${matching.length}] ${conds} → ${rule.do.action}/${rule.do.zone}/${rule.do.intensity}`,
    }
  }

  const fallback = excludeActions?.has(strategy.fallback.action) ? DEFAULT_FALLBACK : strategy.fallback
  const { action, zone, intensity } = fallback
  const tag = fallback === DEFAULT_FALLBACK ? 'fallback[gated]' : 'fallback'
  return { spec: fallback, trace: `${tag} → ${action}/${zone}/${intensity}` }
}

// ── Validation (for LLM output) ───────────────────────────────────────────────

const VALID_ACTIONS     = new Set(['GROW', 'HUNT', 'ARMOR', 'PULSE', 'TOXIN', 'SCATTER', 'WALL', 'FEAST'])
const VALID_ZONES       = new Set(['NORTH', 'SOUTH', 'EAST', 'WEST', 'ALL'])
const VALID_INTENSITIES = new Set(['CAUTIOUS', 'NORMAL', 'AGGRESSIVE'])
const VALID_METRICS     = new Set<string>(['round', 'enemyDistance', 'nutrientDensity', 'cellRatio', 'myCells', 'resource'])
const VALID_OPS         = new Set<string>(['lt', 'lte', 'gt', 'gte'])
const MAX_RULES = 6
const MAX_CONDITIONS_PER_RULE = 4

export const DEFAULT_FALLBACK: ActionSpec = { action: 'GROW', zone: 'ALL', intensity: 'CAUTIOUS' }

export function validateStrategy(raw: unknown, totalRounds: number): Strategy {
  try {
    const r = raw as Record<string, unknown>
    const fallback = parseSpec(r.fallback) ?? DEFAULT_FALLBACK
    const rawRules = Array.isArray(r.rules) ? r.rules : []
    const rules: Rule[] = rawRules
      .slice(0, MAX_RULES)
      .map((rule: unknown) => parseRule(rule as Record<string, unknown>, totalRounds))
      .filter((rule): rule is Rule => rule !== null)
    return { rules, fallback }
  } catch {
    return { rules: [], fallback: DEFAULT_FALLBACK }
  }
}

function parseSpec(raw: unknown): ActionSpec | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const action    = String(s.action    ?? '').toUpperCase()
  const zone      = String(s.zone      ?? '').toUpperCase()
  const intensity = String(s.intensity ?? '').toUpperCase()
  if (!VALID_ACTIONS.has(action) || !VALID_ZONES.has(zone) || !VALID_INTENSITIES.has(intensity)) return null
  return { action, zone, intensity } as ActionSpec
}

function parseRule(raw: Record<string, unknown>, totalRounds: number): Rule | null {
  const spec = parseSpec(raw.do)
  if (!spec) return null
  const rawConds = Array.isArray(raw.when) ? raw.when : []
  const conditions: Condition[] = rawConds
    .slice(0, MAX_CONDITIONS_PER_RULE)
    .map((c: unknown) => parseCondition(c as Record<string, unknown>, totalRounds))
    .filter((c): c is Condition => c !== null)
  return { when: conditions, do: spec }
}

function parseCondition(raw: Record<string, unknown>, totalRounds: number): Condition | null {
  const metric = String(raw.metric ?? '')
  const op     = String(raw.op     ?? '')
  if (!VALID_METRICS.has(metric) || !VALID_OPS.has(op)) return null
  let value = Number(raw.value ?? 0)
  if (!isFinite(value)) return null
  // Clamp per-metric to prevent rules that silently never fire
  if (metric === 'round')            value = Math.max(0, Math.min(totalRounds, value))
  if (metric === 'nutrientDensity')  value = Math.max(0, Math.min(1, value))
  if (metric === 'cellRatio')        value = Math.max(0, Math.min(1, value))
  if (metric === 'myCells')          value = Math.max(0, value)
  if (metric === 'enemyDistance')    value = Math.max(0, value)
  if (metric === 'resource')         value = Math.max(0, value)
  return { metric: metric as Metric, op: op as 'lt' | 'lte' | 'gt' | 'gte', value }
}
