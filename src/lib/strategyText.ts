import type { Strategy, Condition, Rule } from '@shared/strategy'
import type { ActionSpec } from '@shared/sim/simulation'

function describeCondition(c: Condition): string {
  const { metric, op, value } = c
  if (metric === 'round') {
    if (op === 'lt')  return `in the first ${value} rounds`
    if (op === 'lte') return `in the first ${value + 1} rounds`
    if (op === 'gt')  return `after round ${value}`
    return `from round ${value} onward`
  }
  if (metric === 'enemyDistance') {
    if (op === 'lt' || op === 'lte') return `when the enemy is within ${value} cells`
    return `when the enemy is far away (>${value} cells)`
  }
  if (metric === 'cellRatio') {
    const pct = Math.round(value * 100)
    if (op === 'lt')  return `when I'm losing (under ${pct}% of cells)`
    if (op === 'lte') return `when I'm at or below ${pct}% of cells`
    if (op === 'gt')  return `when I'm winning (over ${pct}% of cells)`
    return `when I control at least ${pct}% of cells`
  }
  if (metric === 'myCells') {
    if (op === 'lt' || op === 'lte') return `when I have fewer than ${value} cells`
    return `when I have more than ${value} cells`
  }
  if (metric === 'nutrientDensity') {
    const pct = Math.round(value * 100)
    if (op === 'lt' || op === 'lte') return `when nutrients are scarce (under ${pct}%)`
    return `when nutrients are plentiful (over ${pct}%)`
  }
  return `${metric} ${op} ${value}`
}

const ACTION_VERB: Record<string, string> = {
  GROW:  'spread my cells',
  HUNT:  'chase and capture enemies',
  ARMOR: 'shield my cells',
  PULSE: 'blast with a shockwave',
}

const ZONE_PHRASE: Record<string, string> = {
  NORTH: 'in the north',
  SOUTH: 'in the south',
  EAST:  'in the east',
  WEST:  'in the west',
  ALL:   '',
}

const INTENSITY_PHRASE: Record<string, string> = {
  CAUTIOUS:   'cautiously',
  NORMAL:     '',
  AGGRESSIVE: 'aggressively',
}

export function describeSpec(spec: ActionSpec): string {
  const verb      = ACTION_VERB[spec.action] ?? spec.action.toLowerCase()
  const zone      = ZONE_PHRASE[spec.zone] ?? ''
  const intensity = INTENSITY_PHRASE[spec.intensity] ?? ''
  return [verb, intensity, zone].filter(Boolean).join(' ')
}

function describeRule(rule: Rule): string {
  const conds = rule.when.map(describeCondition)
  const cond  = conds.length === 0 ? 'always' : conds.join(', and ')
  return `When ${cond}, ${describeSpec(rule.do)}.`
}

function describeFallback(spec: ActionSpec): string {
  return `Otherwise, ${describeSpec(spec)}.`
}

export function describeStrategy(strategy: Strategy): string[] {
  return [
    ...strategy.rules.map(describeRule),
    describeFallback(strategy.fallback),
  ]
}
