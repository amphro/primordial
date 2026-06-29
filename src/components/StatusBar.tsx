import type { RoundRecord } from '@shared/sim/runGame'

interface Props {
  current: RoundRecord | null
  previous: RoundRecord | null
  myColor: 'blue' | 'red' | null
  blueResources?: number
  redResources?: number
}

function Num({ value, prev, color, max = 4 }: { value: number; prev: number | null; color: string; max?: number }) {
  const delta = prev !== null ? value - prev : null
  const pos = delta !== null && delta > 0
  const neg = delta !== null && delta < 0
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <span style={{ display: 'inline-block', minWidth: `${max}ch`, textAlign: 'right', color }}>{value}</span>
      <span style={{ display: 'inline-block', minWidth: '4ch', textAlign: 'right', fontSize: 11, visibility: (pos || neg) ? 'visible' : 'hidden', color: pos ? 'var(--clr-pos)' : 'var(--clr-neg)' }}>
        {delta !== null ? (delta > 0 ? `+${delta}` : `${delta}`) : '+0'}
      </span>
    </span>
  )
}

export default function StatusBar({ current, previous, myColor, blueResources = 0, redResources = 0 }: Props) {
  if (!current) return null

  const { blueCells: blue, redCells: red, totalNutrients: nuts } = current
  const prevBlue = previous?.blueCells ?? null
  const prevRed  = previous?.redCells  ?? null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '5px 8px',
      background: 'var(--clr-surface)',
      border: '1px solid var(--clr-border)',
      borderRadius: 4,
      marginBottom: 6,
      fontSize: 12,
      fontFamily: 'monospace',
      userSelect: 'none',
      overflowX: 'auto',
    }}>
      {/* Blue cells */}
      <span style={{ whiteSpace: 'nowrap' }}>
        <span style={{ color: 'var(--clr-blue)', fontWeight: myColor === 'blue' ? 700 : 400 }}>▪ </span>
        <Num value={blue} prev={prevBlue} color={myColor === 'blue' ? 'var(--clr-blue)' : 'var(--clr-blue-dim)'} />
      </span>

      <span style={{ color: 'var(--clr-text-dim)', flexShrink: 0 }}>│</span>

      {/* Nutrients — count only, no delta (changes less dramatically) */}
      <span style={{ whiteSpace: 'nowrap', color: 'var(--clr-nutrient)' }}>
        <span style={{ fontSize: 11 }}>⬡ </span>
        <span style={{ display: 'inline-block', minWidth: '3ch', textAlign: 'right' }}>{nuts}</span>
      </span>

      <span style={{ color: 'var(--clr-text-dim)', flexShrink: 0 }}>│</span>

      {/* Power — compact, no label */}
      <span style={{ whiteSpace: 'nowrap', color: 'var(--clr-power)' }}>
        ◆ <span style={{ color: 'var(--clr-blue)', display: 'inline-block', minWidth: '2ch', textAlign: 'right' }}>{blueResources}</span>
        <span style={{ color: 'var(--clr-text-dim)', margin: '0 1px' }}>╱</span>
        <span style={{ color: 'var(--clr-red)', display: 'inline-block', minWidth: '2ch' }}>{redResources}</span>
      </span>

      <span style={{ color: 'var(--clr-text-dim)', flexShrink: 0 }}>│</span>

      {/* Red cells */}
      <span style={{ whiteSpace: 'nowrap' }}>
        <span style={{ color: 'var(--clr-red)', fontWeight: myColor === 'red' ? 700 : 400 }}>▪ </span>
        <Num value={red} prev={prevRed} color={myColor === 'red' ? 'var(--clr-red)' : 'var(--clr-red-dim)'} />
      </span>
    </div>
  )
}
