import type { RoundRecord } from '@shared/sim/runGame'

interface Props {
  current: RoundRecord | null
  previous: RoundRecord | null
  myColor: 'blue' | 'red' | null
  blueResources?: number
  redResources?: number
}

function deltaColor(d: number): string {
  return d > 0 ? 'var(--clr-pos)' : 'var(--clr-neg)'
}

function deltaStr(d: number): string {
  return d > 0 ? `+${d}` : `${d}`
}

export default function StatusBar({ current, previous, myColor, blueResources = 0, redResources = 0 }: Props) {
  if (!current) return null

  const { blueCells: blue, redCells: red, totalNutrients: nuts } = current
  const dBlue = previous !== null ? blue - previous.blueCells         : null
  const dRed  = previous !== null ? red  - previous.redCells          : null
  const dNuts = previous !== null ? nuts - previous.totalNutrients    : null

  const total = blue + red
  const bluePct = total === 0 ? 50 : Math.round(blue / total * 100)
  const redPct  = 100 - bluePct

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '5px 10px',
      background: '#0a1420',
      border: '1px solid #1a2a3a',
      borderRadius: 4,
      marginBottom: 6,
      fontSize: 12,
      fontFamily: 'monospace',
      userSelect: 'none',
    }}>
      <span style={{ color: myColor === 'blue' ? '#6ab8ff' : '#4a88cc', minWidth: 90 }}>
        <span style={{ color: '#4a9eff', fontWeight: myColor === 'blue' ? 700 : 400 }}>▪ </span>
        {blue}
        {dBlue !== null && dBlue !== 0 && (
          <span style={{ color: deltaColor(dBlue), fontSize: 11 }}> {deltaStr(dBlue)}</span>
        )}
        <span style={{ color: 'var(--clr-text-muted)', fontSize: 11 }}> ({bluePct}%)</span>
      </span>

      <span style={{ color: 'var(--clr-text-dim)' }}>│</span>

      <span style={{ color: 'var(--clr-nutrient)', minWidth: 70 }}>
        <span style={{ fontSize: 11 }}>⬡ </span>
        {nuts}
        {dNuts !== null && dNuts !== 0 && (
          <span style={{ color: deltaColor(dNuts), fontSize: 11 }}> {deltaStr(dNuts)}</span>
        )}
        <span style={{ color: 'var(--clr-text-muted)', fontSize: 11 }}> nuts</span>
      </span>

      <span style={{ color: 'var(--clr-text-dim)' }}>│</span>

      <span style={{ color: 'var(--clr-power)', minWidth: 80, fontSize: 12 }}>
        <span>◆ </span>
        <span style={{ color: '#4a9eff' }}>{blueResources}</span>
        <span style={{ color: 'var(--clr-text-dim)', margin: '0 3px' }}>╱</span>
        <span style={{ color: '#ff6b4a' }}>{redResources}</span>
        <span style={{ color: 'var(--clr-text-muted)', fontSize: 11 }}> pwr</span>
      </span>

      <span style={{ color: 'var(--clr-text-dim)' }}>│</span>

      <span style={{ color: myColor === 'red' ? '#ffaa88' : '#cc6844', minWidth: 90 }}>
        <span style={{ color: '#ff6b4a', fontWeight: myColor === 'red' ? 700 : 400 }}>▪ </span>
        {red}
        {dRed !== null && dRed !== 0 && (
          <span style={{ color: deltaColor(dRed), fontSize: 11 }}> {deltaStr(dRed)}</span>
        )}
        <span style={{ color: 'var(--clr-text-muted)', fontSize: 11 }}> ({redPct}%)</span>
      </span>
    </div>
  )
}
