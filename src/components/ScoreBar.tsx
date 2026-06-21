interface Props {
  blue: number  // percentage 0-100
  red: number
  round: number
  totalRounds: number
}

export default function ScoreBar({ blue, red, round, totalRounds }: Props) {
  const bluePct = Math.round(blue)
  const redPct  = Math.round(red)

  return (
    <div style={{ width: '100%', userSelect: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12, letterSpacing: 1 }}>
        <span style={{ color: '#4a9eff', fontWeight: 700 }}>BLUE {bluePct}%</span>
        <span style={{ color: '#5a7a9a', fontSize: 11 }}>ROUND {round} / {totalRounds}</span>
        <span style={{ color: '#ff6b4a', fontWeight: 700 }}>RED {redPct}%</span>
      </div>
      <div style={{ height: 6, background: '#0d1a2a', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${bluePct}%`, background: '#4a9eff', transition: 'width 0.4s ease' }} />
        <div style={{ flex: 1, background: '#1e3050' }} />
        <div style={{ width: `${redPct}%`, background: '#ff6b4a', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}
