import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { s } from '../lib/styles'

interface RoundEntry {
  round: number
  myAction: string; myZone: string; myDelta: number
  oppAction: string; oppZone: string; oppDelta: number
}

interface LocationState {
  winner?: 'blue' | 'red' | null
  winReason?: string
  scores?: { blue: number; red: number }
  rounds?: RoundEntry[]
}

export default function GameOver() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as LocationState) ?? {}
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const color = state.winner === 'blue' ? '#4a9eff' : state.winner === 'red' ? '#ff6b4a' : '#8a9aaa'
  const label = state.winner ? `${state.winner.toUpperCase()} WINS` : 'GAME OVER'

  const rounds = state.rounds ?? []

  // Top 3 most dramatic rounds by absolute cell swing
  const topRounds = [...rounds]
    .sort((a, b) => Math.abs(b.myDelta) - Math.abs(a.myDelta))
    .slice(0, 3)

  async function rematch() {
    setLoading(true)
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json() as { code: string }
      navigate(`/game/${data.code}/wait`)
    } catch {
      setLoading(false)
    }
  }

  function buildShareText(): string {
    const winner = state.winner ? state.winner.toUpperCase() : '?'
    const lines = [`PRIMORDIAL — ${winner} WINS`]
    if (state.scores) lines.push(`Blue ${state.scores.blue}% · Red ${state.scores.red}%`)
    if (rounds.length > 0) {
      lines.push('')
      lines.push('Top moments:')
      topRounds.forEach(r => {
        const sign = r.myDelta >= 0 ? '+' : ''
        lines.push(`  R${r.round} ${r.myAction} → ${sign}${r.myDelta} cells`)
      })
    }
    lines.push('')
    lines.push(window.location.origin)
    return lines.join('\n')
  }

  async function share() {
    const text = buildShareText()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  function fmtDelta(d: number): string {
    return d > 0 ? `+${d}` : `${d}`
  }

  return (
    <div style={s.center}>
      <div style={{ ...s.card, maxWidth: 480 }}>
        <h1 style={{ fontSize: 28, letterSpacing: 6, color, marginBottom: 12 }}>{label}</h1>
        {state.scores && (
          <p style={{ color: '#5a7a9a', fontSize: 13, marginBottom: 24 }}>
            Blue {state.scores.blue}% · Red {state.scores.red}%
          </p>
        )}

        {/* Round recap */}
        {topRounds.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <p style={{ color: '#2a4a6a', fontSize: 10, letterSpacing: 2, marginBottom: 12 }}>KEY ROUNDS</p>
            {topRounds.map(r => (
              <div key={r.round} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                marginBottom: 6,
                background: '#0d1a2a',
                border: '1px solid #1e3050',
                borderRadius: 4,
                fontSize: 12,
              }}>
                <span style={{ color: '#3a5a7a', minWidth: 28 }}>R{r.round}</span>
                <span style={{ color: '#8a9aaa', flex: 1, textAlign: 'left' }}>
                  {r.myAction} {r.myZone}
                </span>
                <span style={{
                  color: r.myDelta >= 0 ? '#00cc66' : '#ff6b4a',
                  fontWeight: 'bold',
                  minWidth: 52,
                  textAlign: 'right',
                }}>
                  {fmtDelta(r.myDelta)} cells
                </span>
                <span style={{ color: '#2a3a4a', margin: '0 8px' }}>vs</span>
                <span style={{ color: '#6a7a8a', flex: 1, textAlign: 'right' }}>
                  opp {r.oppAction}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button style={s.primaryButton} onClick={() => navigate('/')}>New Game</button>
          <button style={{ ...s.ghostButton, opacity: loading ? 0.5 : 1 }} onClick={rematch} disabled={loading}>
            {loading ? 'Creating...' : 'Play Again'}
          </button>
          <button
            style={{ ...s.ghostButton, fontSize: 12 }}
            onClick={() => void share()}
          >
            {copied ? '✓ Copied' : 'Share'}
          </button>
        </div>
      </div>
    </div>
  )
}
