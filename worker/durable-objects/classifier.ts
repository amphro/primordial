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

// Keyword-based intensity override — deterministic, takes precedence over the LLM's field.
// The 8B model defaults to CAUTIOUS almost always; keywords are more reliable.
function intensityFromKeywords(prompt: string): Intensity | null {
  const p = prompt.toLowerCase()
  if (/\b(rapidly|fast|faster|aggressive|rush|all[- ]?out|hard|max|blitz|overwhelm|surge|push|fully|completely|as fast|sprint)\b/.test(p)) return 'AGGRESSIVE'
  if (/\b(slowly|slow|gently|gentle|steady|careful|cautious|safe|conserve|a bit|slightly|carefully)\b/.test(p)) return 'CAUTIOUS'
  return null
}

const SYSTEM_PROMPT = `You classify a player's natural language prompt into three game dimensions.

ACTION (pick exactly one):
- GROW: spawn more cells, spread, expand, multiply, colonize, reproduce, bloom, feast, nourish
- ARMOR: defend, protect, shield, fortify, harden, hold the line, turtle, resist, reinforce
- HUNT: attack, chase, kill, rush, assault, invade, pursue, destroy, eliminate, overrun
- PULSE: burst, explode, nuke, detonate, shockwave, blast, wipe out, annihilate, obliterate

ZONE (pick exactly one): NORTH (top half), SOUTH (bottom half), EAST (right half), WEST (left half), ALL (everywhere)

INTENSITY (pick exactly one):
- CAUTIOUS: slow, gentle, careful, safe, conserve, a bit, slightly
- NORMAL: standard pace, no modifiers
- AGGRESSIVE: fast, rapidly, rush, max, blitz, all-out, overwhelm, hard

Examples:
- "grow rapidly" → {"action":"GROW","zone":"ALL","intensity":"AGGRESSIVE"}
- "defend the south carefully" → {"action":"ARMOR","zone":"SOUTH","intensity":"CAUTIOUS"}
- "attack from the east" → {"action":"HUNT","zone":"EAST","intensity":"NORMAL"}
- "nuke them" → {"action":"PULSE","zone":"ALL","intensity":"AGGRESSIVE"}

Respond with ONLY valid JSON, nothing else: {"action":"GROW","zone":"ALL","intensity":"NORMAL"}
If unclear: action=GROW, zone=ALL, intensity=NORMAL`

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

    // Try each {...} match so stray braces before the real JSON don't abort the parse
    let parsed: Record<string, string> | null = null
    for (const m of text.matchAll(/\{[^}]+\}/g)) {
      try { parsed = JSON.parse(m[0]) as Record<string, string>; break } catch { /* try next */ }
    }
    if (!parsed) return { classification: DEFAULT, latencyMs }

    const action = (parsed.action ?? '').toUpperCase()
    const zone   = (parsed.zone   ?? '').toUpperCase()

    // Keyword extraction overrides the LLM's intensity field — the 8B model defaults
    // to CAUTIOUS regardless of prompt urgency, so we can't trust its intensity output.
    const intensity: Intensity = intensityFromKeywords(prompt) ?? 'NORMAL'

    const classification: Classification = {
      action: VALID_ACTIONS.has(action) ? action as Action : DEFAULT.action,
      zone:   VALID_ZONES.has(zone)     ? zone as Zone     : DEFAULT.zone,
      intensity,
    }
    return { classification, latencyMs }
  } catch {
    return { classification: DEFAULT, latencyMs: Date.now() - t0 }
  }
}
