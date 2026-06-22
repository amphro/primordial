export interface IntensityConfig {
  effectMult: number
  friendlyFirePct: number
}

export interface GameConfig {
  // Grid
  gridWidth: number
  gridHeight: number
  startingCells: number

  // Session
  totalRounds: number
  promptTimerMs: number
  winThresholdPct: number

  // Nutrients
  startingNutrients: number
  nutrientClusterSize: number
  // Index = round number (0-based); last value repeats for remaining rounds
  nutrientRegenByRound: number[]
  nutrientDepletionTtl: number
  nutrientCapacity: number

  // Cell behavior
  nutrientScanRadius: number
  starvationGraceTicks: number
  wallDecayTicks: number

  // Intensity
  intensity: {
    cautious: IntensityConfig
    normal: IntensityConfig
    aggressive: IntensityConfig
  }

  // Per-action values (at NORMAL intensity)
  actions: {
    grow: { extraReproPerCell: number }
    armor: { hitsToKill: number; aggressiveReproPenalty: number }
    toxin: { radiusTiles: number; killChancePct: number }
    hunt: { scanRadiusTiles: number }
    scatter: { ignoreNutrients: boolean }
    pulse: { radiusTiles: number; killPct: number }
    wall: { cellCount: number }
    feast: { nutrientMultiplier: number; reproMultiplier: number }
  }

  // Comeback mechanic
  comebackThresholdPct: number
  comebackNutrientBurst: number

  // Counter-web
  counterEffectReductionPct: number
}

export const DEFAULT_CONFIG: GameConfig = {
  gridWidth: 40,
  gridHeight: 40,
  startingCells: 6,           // small start — rounds 1-3 are pure growth

  totalRounds: 20,
  promptTimerMs: 20_000,
  winThresholdPct: 100,       // instant win only by full elimination; normally decided by round 20

  startingNutrients: 120,
  nutrientClusterSize: 8,
  // Higher early (fuel the growth phase), lower late (scarcity drives conflict)
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
    armor:   { hitsToKill: 2, aggressiveReproPenalty: 0.5 },
    toxin:   { radiusTiles: 3, killChancePct: 1.0 },
    hunt:    { scanRadiusTiles: 5 },
    scatter: { ignoreNutrients: true },
    pulse:   { radiusTiles: 4, killPct: 0.6 },
    wall:    { cellCount: 20 },
    feast:   { nutrientMultiplier: 2, reproMultiplier: 2 },
  },

  comebackThresholdPct: 25,
  comebackNutrientBurst: 15,

  counterEffectReductionPct: 0.5,
}

export async function loadConfig(kv: KVNamespace): Promise<GameConfig> {
  try {
    const override = await kv.get('config:balance', 'json') as Partial<GameConfig> | null
    if (!override) return DEFAULT_CONFIG
    return deepMerge(
      DEFAULT_CONFIG as unknown as Record<string, unknown>,
      override as unknown as Record<string, unknown>,
    ) as unknown as GameConfig
  } catch {
    return DEFAULT_CONFIG
  }
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base }
  for (const key of Object.keys(override)) {
    const bv = base[key]
    const ov = override[key]
    if (ov !== null && typeof ov === 'object' && !Array.isArray(ov) && typeof bv === 'object' && bv !== null) {
      result[key] = deepMerge(bv as Record<string, unknown>, ov as Record<string, unknown>)
    } else {
      result[key] = ov
    }
  }
  return result
}
