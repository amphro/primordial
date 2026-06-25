import type { GameConfig } from '../config'
import type { Strategy, Metrics } from '../strategy'
import { makeRng } from '../rng'
import { evaluateStrategy, computeMetrics } from '../strategy'
import { initGrid, simulateTick } from './simulation'
import type { ActionSpec, CounterEvent } from './simulation'
import { generateEvents, applyBoardEvent } from './events'
import type { BoardEvent } from './events'
export type { BoardEvent }

export const SIM_VERSION = '3'

export interface RoundRecord {
  round: number
  blueSpec: ActionSpec
  redSpec: ActionSpec
  blueTrace: string
  redTrace: string
  blueCells: number
  redCells: number
  totalNutrients: number
  counters: CounterEvent[]
  blueResources: number
  redResources: number
}

export interface GameResolution {
  simVersion: string
  seed: number
  config: GameConfig
  blueStrategy: Strategy
  redStrategy: Strategy
  winner: 'blue' | 'red' | 'tie'
  finalScores: { blue: number; red: number }
  rounds: RoundRecord[]
  events: BoardEvent[]
}

function pickAffordableSpec(
  strategy: Strategy,
  metrics: Metrics,
  resources: number,
  config: GameConfig,
): ReturnType<typeof evaluateStrategy> {
  const first = evaluateStrategy(strategy, metrics)
  const cost = config.powerNutrients.gatedActionCosts[first.spec.action] ?? 0
  if (!cost || resources >= cost) return first
  return evaluateStrategy(strategy, metrics, new Set([first.spec.action]))
}

export function runGame(
  seed: number,
  config: GameConfig,
  blueStrategy: Strategy,
  redStrategy: Strategy,
): GameResolution {
  const rng = makeRng(seed)
  const powerRng = makeRng(seed ^ 0x4E07)
  let state = initGrid(config, rng, powerRng)
  const rounds: RoundRecord[] = []
  const events = generateEvents(seed, config)

  for (let round = 0; round < config.totalRounds; round++) {
    const bm = computeMetrics(state, 'blue', round, config)
    const rm = computeMetrics(state, 'red',  round, config)
    const { spec: blueSpec, trace: blueTrace } = pickAffordableSpec(blueStrategy, bm, state.blueResources, config)
    const { spec: redSpec,  trace: redTrace  } = pickAffordableSpec(redStrategy,  rm, state.redResources,  config)

    const result = simulateTick(state, round, config, blueSpec, redSpec, rng)
    state = result.state

    // Apply board events for this round (uses tick RNG for placement randomness)
    for (const ev of events) {
      if (ev.round === round) applyBoardEvent(state, ev, config, rng)
    }

    let totalNutrients = 0
    for (let i = 0; i < state.nutrients.length; i++) if (state.nutrients[i] > 0) totalNutrients++

    rounds.push({ round, blueSpec, redSpec, blueTrace, redTrace, blueCells: result.blueCells, redCells: result.redCells, totalNutrients, counters: result.counters, blueResources: state.blueResources, redResources: state.redResources })

    if (result.winner) {
      const t = result.blueCells + result.redCells
      return {
        simVersion: SIM_VERSION,
        seed,
        config,
        blueStrategy,
        redStrategy,
        winner: result.winner,
        finalScores: {
          blue: t === 0 ? 50 : Math.round(result.blueCells / t * 100),
          red:  t === 0 ? 50 : Math.round(result.redCells  / t * 100),
        },
        rounds,
        events,
      }
    }
  }

  const last = rounds[rounds.length - 1]
  const t = last.blueCells + last.redCells
  const bluePct = t === 0 ? 50 : Math.round(last.blueCells / t * 100)
  return {
    simVersion: SIM_VERSION,
    seed,
    config,
    blueStrategy,
    redStrategy,
    winner: last.blueCells > last.redCells ? 'blue' : last.redCells > last.blueCells ? 'red' : 'tie',
    finalScores: { blue: bluePct, red: 100 - bluePct },
    rounds,
    events,
  }
}
