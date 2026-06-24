import type { RoundRecord } from '@shared/sim/runGame'

interface Props {
  current: RoundRecord | null
  previous: RoundRecord | null
  myColor: 'blue' | 'red' | null
}

function deltaColor(d: number): string {
  return d > 0 ? '#6af080' : '#f08060'
}

function deltaStr(d: number): string {
  return d > 0 ? `+${d}` : `${d}`
}

export default function StatusBar({ current, previous, myColor }: Props) {
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
          <span style={{ color: deltaColor(dBlue), fontSize: 10 }}> {deltaStr(dBlue)}</span>
        )}
        <span style={{ color: '#3a5a7a', fontSize: 10 }}> ({bluePct}%)</span>
      </span>

      <span style={{ color: '#2a3a4a' }}>│</span>

      <span style={{ color: '#c8a840', minWidth: 70 }}>
        <span style={{ fontSize: 10 }}>⬡ </span>
        {nuts}
        {dNuts !== null && dNuts !== 0 && (
          <span style={{ color: deltaColor(dNuts), fontSize: 10 }}> {deltaStr(dNuts)}</span>
        )}
        <span style={{ color: '#3a5a7a', fontSize: 10 }}> nuts</span>
      </span>

      <span style={{ color: '#2a3a4a' }}>│</span>

      <span style={{ color: myColor === 'red' ? '#ffaa88' : '#cc6844', minWidth: 90 }}>
        <span style={{ color: '#ff6b4a', fontWeight: myColor === 'red' ? 700 : 400 }}>▪ </span>
        {red}
        {dRed !== null && dRed !== 0 && (
          <span style={{ color: deltaColor(dRed), fontSize: 10 }}> {deltaStr(dRed)}</span>
        )}
        <span style={{ color: '#3a5a7a', fontSize: 10 }}> ({redPct}%)</span>
      </span>
    </div>
  )
}
