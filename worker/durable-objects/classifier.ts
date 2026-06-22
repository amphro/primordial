import type { Action, Zone, Intensity } from './simulation'

export interface Classification {
  action: Action
  zone: Zone
  intensity: Intensity
}

const DEFAULT: Classification = { action: 'GROW', zone: 'ALL', intensity: 'CAUTIOUS' }

// Only advertise the 4 actions that are actually implemented in the simulation.
// Re-add TOXIN/SCATTER/WALL/FEAST here when their simulation branches ship.
const VALID_ACTIONS = new Set(['GROW', 'ARMOR', 'HUNT', 'PULSE'])
const VALID_ZONES   = new Set(['NORTH', 'SOUTH', 'EAST', 'WEST', 'ALL'])
const VALID_INTENS  = new Set(['CAUTIOUS', 'NORMAL', 'AGGRESSIVE'])

const SYSTEM_PROMPT = `You classify a player's natural language prompt into three game dimensions.

ACTION (pick exactly one):
- GROW: spawn more cells, spread, expand, multiply, colonize, reproduce, bloom, feast, nourish
- ARMOR: defend, protect, shield, fortify, harden, hold the line, turtle, resist, reinforce
- HUNT: attack, chase, kill, rush, assault, invade, pursue, destroy, eliminate, overrun
- PULSE: burst, explode, nuke, detonate, shockwave, blast, wipe out, annihilate, obliterate

ZONE (pick exactly one): NORTH (top half), SOUTH (bottom half), EAST (right half), WEST (left half), ALL (everywhere)

INTENSITY (pick exactly one): CAUTIOUS (reduced effect, safe), NORMAL (standard), AGGRESSIVE (boosted effect, risk friendly fire)

Respond with ONLY valid JSON, nothing else: {"action":"GROW","zone":"ALL","intensity":"NORMAL"}
If unclear, default: action=GROW, zone=ALL, intensity=CAUTIOUS`

export async function classifyPrompt(
  prompt: string,
  ai: Ai,
): Promise<{ classification: Classification; latencyMs: number }> {
  const t0 = Date.now()
  try {
    const result = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: prompt.slice(0, 500) },
      ],
      max_tokens: 60,
    }) as { response?: string }

    const latencyMs = Date.now() - t0
    const text = result.response ?? ''
    const jsonMatch = text.match(/\{[^}]+\}/)
    if (!jsonMatch) return { classification: DEFAULT, latencyMs }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>
    const action = (parsed.action ?? '').toUpperCase()
    const zone   = (parsed.zone   ?? '').toUpperCase()
    const intensity = (parsed.intensity ?? '').toUpperCase()

    const classification: Classification = {
      action:    VALID_ACTIONS.has(action)   ? action as Action   : DEFAULT.action,
      zone:      VALID_ZONES.has(zone)       ? zone as Zone       : DEFAULT.zone,
      intensity: VALID_INTENS.has(intensity) ? intensity as Intensity : DEFAULT.intensity,
    }
    return { classification, latencyMs }
  } catch {
    return { classification: DEFAULT, latencyMs: Date.now() - t0 }
  }
}
