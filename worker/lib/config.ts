export type { IntensityConfig, GameConfig } from '../../shared/config'
export { DEFAULT_CONFIG } from '../../shared/config'

import type { GameConfig } from '../../shared/config'
import { DEFAULT_CONFIG } from '../../shared/config'

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
