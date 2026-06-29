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
    <>
      <span style={{ display: 'inline-block', minWidth: `${max}ch`, textAlign: 'right', color }}>{value}</span>
      <span style={{ display: 'inline-block', minWidth: '5ch', textAlign: 'right', fontSize: 11, visibility: (pos || neg) ? 'visible' : 'hidden', color: pos ? 'var(--clr-pos)' : 'var(--clr-neg)' }}>
        {delta !== null ? (delta > 0 ? `+${delta}` : `${delta}`) : '+0'}
      </span>
    </>
  )
}

export default function StatusBar({ current, previous, myColor, blueResources = 0, redResources = 0 }: Props) {
  if (!current) return null

  const { blueCells: blue, redCells: red, totalNutrients: nuts } = current
  const prevBlue = previous?.blueCells ?? null
  const prevRed  = previous?.redCells  ?? null
  const prevNuts = previous?.totalNutrients ?? null

  const total = blue + red
  const bluePct = total === 0 ? 50 : Math.round(blue / total * 100)
  const redPct  = 100 - bluePct

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '5px 10px',
      background: 'var(--clr-surface)',
      border: '1px solid var(--clr-border)',
      borderRadius: 4,
      marginBottom: 6,
      fontSize: 12,
      fontFamily: 'monospace',
      userSelect: 'none',
      whiteSpace: 'nowrap',
    }}>
      {/* Blue cells */}
      <span>
        <span style={{ color: 'var(--clr-blue)', fontWeight: myColor === 'blue' ? 700 : 400 }}>▪ </span>
        <Num value={blue} prev={prevBlue} color={myColor === 'blue' ? 'var(--clr-blue)' : 'var(--clr-blue-dim)'} />
        <span style={{ color: 'var(--clr-text-muted)', fontSize: 11 }}> (<span style={{ display: 'inline-block', minWidth: '3ch', textAlign: 'right' }}>{bluePct}</span>%)</span>
      </span>

      <span style={{ color: 'var(--clr-text-dim)' }}>│</span>

      {/* Nutrients */}
      <span>
        <span style={{ color: 'var(--clr-nutrient)', fontSize: 11 }}>⬡ </span>
        <Num value={nuts} prev={prevNuts} color='var(--clr-nutrient)' max={3} />
        <span style={{ color: 'var(--clr-text-muted)', fontSize: 11 }}> nut</span>
      </span>

      <span style={{ color: 'var(--clr-text-dim)' }}>│</span>

      {/* Power resources */}
      <span style={{ color: 'var(--clr-power)' }}>
        ◆ <span style={{ color: 'var(--clr-blue)', display: 'inline-block', minWidth: '2ch', textAlign: 'right' }}>{blueResources}</span>
        <span style={{ color: 'var(--clr-text-dim)', margin: '0 2px' }}>╱</span>
        <span style={{ color: 'var(--clr-red)', display: 'inline-block', minWidth: '2ch' }}>{redResources}</span>
        <span style={{ color: 'var(--clr-text-muted)', fontSize: 11 }}> pwr</span>
      </span>

      <span style={{ color: 'var(--clr-text-dim)' }}>│</span>

      {/* Red cells */}
      <span>
        <span style={{ color: 'var(--clr-red)', fontWeight: myColor === 'red' ? 700 : 400 }}>▪ </span>
        <Num value={red} prev={prevRed} color={myColor === 'red' ? 'var(--clr-red)' : 'var(--clr-red-dim)'} />
        <span style={{ color: 'var(--clr-text-muted)', fontSize: 11 }}> (<span style={{ display: 'inline-block', minWidth: '3ch', textAlign: 'right' }}>{redPct}</span>%)</span>
      </span>
    </div>
  )
}
