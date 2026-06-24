export interface IntensityConfig {
  effectMult: number
  friendlyFirePct: number
}

export interface GameConfig {
  gridWidth: number
  gridHeight: number
  startingCells: number
  totalRounds: number
  promptTimerMs: number
  winThresholdPct: number
  startingNutrients: number
  nutrientClusterSize: number
  // Index = round number (0-based); last value repeats for remaining rounds
  nutrientRegenByRound: number[]
  nutrientDepletionTtl: number
  nutrientCapacity: number
  nutrientScanRadius: number
  starvationGraceTicks: number
  wallDecayTicks: number
  intensity: {
    cautious: IntensityConfig
    normal: IntensityConfig
    aggressive: IntensityConfig
  }
  actions: {
    grow: { extraReproPerCell: number }
    armor: { hitsToKill: number; reproSpeedPenaltyPct: number }
    toxin: { radiusTiles: number; killChancePct: number; decayTicks: number }
    hunt: { scanRadiusTiles: number }
    scatter: { ignoreNutrients: boolean }
    pulse: { radiusTiles: number; killPct: number }
    wall: { cellCount: number }
    feast: { nutrientMultiplier: number; reproMultiplier: number }
  }
  comebackThresholdPct: number
  comebackNutrientBurst: number
  counterEffectReductionPct: number
  powerNutrients: {
    count: number                   // how many normal nutrient tiles to tag as power-type
    gatedActionCosts: Record<string, number>  // action → resource cost (0 or absent = free)
  }
}

export const DEFAULT_CONFIG: GameConfig = {
  gridWidth: 40,
  gridHeight: 40,
  startingCells: 6,
  totalRounds: 20,
  promptTimerMs: 20_000,
  winThresholdPct: 100,
  startingNutrients: 120,
  nutrientClusterSize: 8,
  nutrientRegenByRound: [4, 4, 4, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  nutrientDepletionTtl: 2,
  nutrientCapacity: 4,
  nutrientScanRadius: 2,
  starvationGraceTicks: 2,
  wallDecayTicks: 3,
  intensity: {
    cautious:   { effectMult: 0.7,  friendlyFirePct: 0    },
    normal:     { effectMult: 1.0,  friendlyFirePct: 0    },
    aggressive: { effectMult: 1.5,  friendlyFirePct: 0.30 },
  },
  actions: {
    grow:    { extraReproPerCell: 2 },
    armor:   { hitsToKill: 2, reproSpeedPenaltyPct: 0.5 },
    toxin:   { radiusTiles: 3, killChancePct: 1.0, decayTicks: 3 },
    hunt:    { scanRadiusTiles: 5 },
    scatter: { ignoreNutrients: true },
    pulse:   { radiusTiles: 3, killPct: 0.35 },
    wall:    { cellCount: 20 },
    feast:   { nutrientMultiplier: 2, reproMultiplier: 2 },
  },
  comebackThresholdPct: 25,
  comebackNutrientBurst: 15,
  counterEffectReductionPct: 0.5,
  powerNutrients: {
    count: 25,
    gatedActionCosts: { TOXIN: 3, WALL: 2, FEAST: 2 },
  },
}
