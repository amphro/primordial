import type { Strategy } from '../../shared/strategy'
import { validateStrategy } from '../../shared/strategy'
import { DEFAULT_CONFIG } from '../../shared/config'

const SYSTEM_PROMPT = `You are a strategy AI for a cellular automaton territory game.

Two sides (blue, red) compete on a grid. Each round you choose one action for all your cells.
You generate a Strategy: a list of conditional rules + a fallback action.

ACTIONS:
- GROW: extra reproduction near nutrients (strong early expansion)
- HUNT: cells chase and capture nearby enemies (offensive)
- ARMOR: cells gain shields that absorb hits (defensive; counters PULSE)
- PULSE: shockwave kills % of enemies in a radius (countered by ARMOR)
- TOXIN: marks tiles in a radius with poison; enemy cells on those tiles die each tick (3-tick duration)
- SCATTER: cells reproduce without needing nutrients (good for starved areas)
- WALL: spawn barrier tiles in front of your cells facing the enemy (3-tick duration)
- FEAST: cells near nutrients reproduce multiple times this tick (burst growth)

Counter web (winner > loser — winner's effectiveness is preserved; loser's is reduced):
ARMOR>PULSE, HUNT>ARMOR, PULSE>SCATTER, HUNT>TOXIN, TOXIN>GROW, WALL>HUNT, SCATTER>WALL, FEAST>ARMOR, GROW>FEAST

ZONES: ALL, NORTH, SOUTH, EAST, WEST (board halves)
INTENSITIES: CAUTIOUS (weaker, safe), NORMAL, AGGRESSIVE (stronger, 30% friendly fire)

METRICS you can check in conditions:
- round: current round 0–19
- myCells: how many cells I have
- cellRatio: my cells / total (0=losing, 1=dominating)
- enemyDistance: min Manhattan tiles to nearest enemy
- nutrientDensity: fraction of nutrients near my cells (0–1)

Operators: "lt" (<), "lte" (≤), "gt" (>), "gte" (≥)
Rules: max 6; all conditions in a rule are AND'd. When multiple rules match the same round, they cycle in order (round % matchCount), so all matching rules get turns.

Output ONLY valid JSON — no prose:
{
  "rules": [
    { "when": [{ "metric": "enemyDistance", "op": "lte", "value": 6 }], "do": { "action": "HUNT", "zone": "ALL", "intensity": "AGGRESSIVE" } }
  ],
  "fallback": { "action": "GROW", "zone": "ALL", "intensity": "NORMAL" }
}`

const DEFAULT_STRATEGY: Strategy = {
  rules: [],
  fallback: { action: 'GROW', zone: 'ALL', intensity: 'NORMAL' },
}

export async function generateStrategy(
  prompt: string,
  ai: Ai,
): Promise<{ strategy: Strategy; readback: string; latencyMs: number }> {
  const t0 = Date.now()
  let rawText = ''
  try {
    const aiResult = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: `Strategy intent: "${prompt.slice(0, 500)}"\n\nJSON only:` },
      ],
      max_tokens: 800,
    }) as unknown

    // Handle non-string responses: wrangler 4.x dev auto-parses JSON into an object;
    // production returns { response: string }
    if (typeof aiResult === 'string') {
      rawText = aiResult
    } else if (aiResult && typeof aiResult === 'object') {
      const obj = aiResult as Record<string, unknown>
      const rawResponse = obj.response
      const ctor = (rawResponse as { constructor?: { name?: string } })?.constructor?.name ?? 'null'
      console.log('[strategist] response type:', typeof rawResponse, ctor)

      if (typeof rawResponse === 'string') {
        rawText = rawResponse
      } else if (rawResponse instanceof ReadableStream) {
        console.log('[strategist] draining ReadableStream (wrangler dev streaming mode)')
        const reader = rawResponse.getReader()
        const dec = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          for (const line of dec.decode(value).split('\n')) {
            const d = line.replace(/^data:\s*/, '').trim()
            if (!d || d === '[DONE]') continue
            try {
              const p = JSON.parse(d) as { response?: string }
              if (p.response) rawText += p.response
            } catch { /* skip malformed SSE lines */ }
          }
        }
      } else if (rawResponse != null && Symbol.asyncIterator in Object(rawResponse)) {
        for await (const chunk of rawResponse as AsyncIterable<{ response?: string }>) {
          if (chunk.response) rawText += chunk.response
        }
      } else if (rawResponse && typeof rawResponse === 'object') {
        // wrangler 4.x dev auto-parses the LLM's JSON output into an object
        rawText = JSON.stringify(rawResponse)
      } else {
        console.warn('[strategist] unexpected response type:', typeof rawResponse, ctor)
      }
    }
    console.log('[strategist] raw LLM text length:', rawText.length, '| preview:', rawText.slice(0, 100))
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) as unknown : null
    if (!parsed) console.warn('[strategist] no JSON found in response')

    const strategy = parsed
      ? validateStrategy(parsed, DEFAULT_CONFIG.totalRounds)
      : DEFAULT_STRATEGY

    console.log('[strategist] rules:', strategy.rules.length, '| fallback:', strategy.fallback.action)
    const readback = strategyReadback(strategy)
    return { strategy, readback, latencyMs: Date.now() - t0 }
  } catch (err) {
    console.error('[strategist] failed — raw:', String(rawText).slice(0, 200), '| error:', err)
    return { strategy: DEFAULT_STRATEGY, readback: 'Grow steadily (default).', latencyMs: Date.now() - t0 }
  }
}

function strategyReadback(s: Strategy): string {
  if (s.rules.length === 0) {
    return `${actionDesc(s.fallback.action)} (${s.fallback.intensity.toLowerCase()}) always.`
  }
  const parts = s.rules.map(r => {
    const conds = r.when.map(c => condDesc(c.metric, c.op, c.value)).join(' and ')
    return `When ${conds}: ${actionDesc(r.do.action)} (${r.do.intensity.toLowerCase()})${r.do.zone !== 'ALL' ? ' in ' + r.do.zone.toLowerCase() : ''}`
  })
  parts.push(`Otherwise: ${actionDesc(s.fallback.action)} (${s.fallback.intensity.toLowerCase()})`)
  return parts.join('. ')
}

function actionDesc(a: string): string {
  switch (a) {
    case 'GROW':    return 'expand'
    case 'HUNT':    return 'attack enemies'
    case 'ARMOR':   return 'shield cells'
    case 'PULSE':   return 'shockwave'
    case 'TOXIN':   return 'poison tiles'
    case 'SCATTER': return 'scatter without nutrients'
    case 'WALL':    return 'build walls'
    case 'FEAST':   return 'feast on nutrients'
    default:        return a.toLowerCase()
  }
}

function condDesc(metric: string, op: string, value: number): string {
  const opStr = op === 'lt' ? '<' : op === 'lte' ? '≤' : op === 'gt' ? '>' : '≥'
  switch (metric) {
    case 'round':           return `round ${opStr} ${value}`
    case 'myCells':         return `my cells ${opStr} ${value}`
    case 'cellRatio':       return `I control ${opStr} ${Math.round(value * 100)}%`
    case 'enemyDistance':   return `enemy ${opStr} ${value} tiles away`
    case 'nutrientDensity': return `nutrients near me ${opStr} ${Math.round(value * 100)}%`
    default:                return `${metric}${opStr}${value}`
  }
}
