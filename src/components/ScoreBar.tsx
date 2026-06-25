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
        <span style={{ color: 'var(--clr-blue)', fontWeight: 700 }}>BLUE {bluePct}%</span>
        <span style={{ color: 'var(--clr-text-muted)', fontSize: 11 }}>ROUND {round} / {totalRounds}</span>
        <span style={{ color: 'var(--clr-red)', fontWeight: 700 }}>RED {redPct}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--clr-surface-raised)', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${bluePct}%`, background: 'var(--clr-blue)', transition: 'width 0.4s ease' }} />
        <div style={{ flex: 1, background: 'var(--clr-border-hi)' }} />
        <div style={{ width: `${redPct}%`, background: 'var(--clr-red)', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}
