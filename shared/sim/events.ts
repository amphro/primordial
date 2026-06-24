import { makeRng } from '../rng'
import type { GameConfig } from '../config'
import { CELL } from './simulation'
import type { GridState, Zone } from './simulation'

export type EventKind = 'nutrient_bloom' | 'drought'

export interface BoardEvent {
  kind: EventKind
  round: number
  zone: Zone
  period?: number  // set if recurring; fires at round, round+period, round+2*period, ...
}

const ZONES: Zone[] = ['NORTH', 'SOUTH', 'EAST', 'WEST', 'ALL']

// Separate RNG stream — never draws from the base tick RNG so adding/tuning events
// does not reshuffle base-sim outcomes.
const EVENTS_RNG_SALT = 0xB0A2D

export function generateEvents(seed: number, config: GameConfig): BoardEvent[] {
  const rng = makeRng(seed ^ EVENTS_RNG_SALT)
  const { totalRounds } = config
  const events: BoardEvent[] = []

  // 2 one-off events at deterministic rounds spread across the mid-game
  const usedRounds = new Set<number>()
  const oneOffCount = 2
  const oneOffKinds: EventKind[] = ['nutrient_bloom', 'drought']

  for (let i = 0; i < oneOffCount; i++) {
    let round = 0
    let tries = 0
    do {
      round = 3 + Math.floor(rng() * (totalRounds - 6))
      tries++
    } while (usedRounds.has(round) && tries < 30)
    usedRounds.add(round)
    events.push({
      kind: oneOffKinds[i % oneOffKinds.length],
      round,
      zone: ZONES[Math.floor(rng() * ZONES.length)],
    })
  }

  // 1 recurring nutrient-bloom — fires every `period` rounds starting from `period`
  const period = 4 + Math.floor(rng() * 3)  // 4, 5, or 6
  const recurZone = ZONES[Math.floor(rng() * ZONES.length)]
  let firstRecurring = true
  for (let r = period; r < totalRounds - 1; r += period) {
    const event: BoardEvent = { kind: 'nutrient_bloom', round: r, zone: recurZone }
    if (firstRecurring) { event.period = period; firstRecurring = false }
    events.push(event)
  }

  return events.sort((a, b) => a.round - b.round)
}

// Apply a board event to the live grid state in-place.
// Called from runGame.ts — uses the TICK rng (separate from events rng) for placement randomness.
export function applyBoardEvent(
  state: GridState,
  event: BoardEvent,
  config: GameConfig,
  rng: () => number,
): void {
  const { gridWidth: w, gridHeight: h } = config

  function inZone(x: number, y: number, zone: Zone): boolean {
    switch (zone) {
      case 'NORTH': return y < Math.floor(h / 2)
      case 'SOUTH': return y >= Math.floor(h / 2)
      case 'EAST':  return x >= Math.floor(w / 2)
      case 'WEST':  return x < Math.floor(w / 2)
      case 'ALL':   return true
    }
  }

  if (event.kind === 'nutrient_bloom') {
    const target = Math.floor(config.startingNutrients * 0.12)  // ~12% of starting supply
    let added = 0
    let attempts = 0
    while (added < target && attempts < target * 30) {
      attempts++
      const x = Math.floor(rng() * w)
      const y = Math.floor(rng() * h)
      if (!inZone(x, y, event.zone)) continue
      const i = y * w + x
      if (state.nutrients[i] === 0 && state.grid[i] === CELL.EMPTY) {
        state.nutrients[i] = config.nutrientCapacity
        added++
      }
    }
  } else if (event.kind === 'drought') {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!inZone(x, y, event.zone)) continue
        const i = y * w + x
        if (state.nutrients[i] > 0 && rng() < 0.5) {
          state.nutrients[i] = 0
          state.nutrientCooldown[i] = config.nutrientDepletionTtl
        }
      }
    }
  }
}
