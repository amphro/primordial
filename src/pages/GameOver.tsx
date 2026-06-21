import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { s } from '../lib/styles'

interface LocationState {
  winner?: 'blue' | 'red' | null
  winReason?: string
  scores?: { blue: number; red: number }
}

export default function GameOver() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as LocationState) ?? {}
  const [loading, setLoading] = useState(false)

  const color = state.winner === 'blue' ? '#4a9eff' : state.winner === 'red' ? '#ff6b4a' : '#8a9aaa'
  const label = state.winner ? `${state.winner.toUpperCase()} WINS` : 'GAME OVER'

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

  return (
    <div style={s.center}>
      <div style={s.card}>
        <h1 style={{ fontSize: 28, letterSpacing: 6, color, marginBottom: 12 }}>{label}</h1>
        {state.scores && (
          <p style={{ color: '#5a7a9a', fontSize: 13, marginBottom: 8 }}>
            Blue {state.scores.blue}% · Red {state.scores.red}%
          </p>
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 32 }}>
          <button style={s.primaryButton} onClick={() => navigate('/')}>New Game</button>
          <button style={{ ...s.ghostButton, opacity: loading ? 0.5 : 1 }} onClick={rematch} disabled={loading}>
            {loading ? 'Creating...' : 'Rematch'}
          </button>
        </div>
      </div>
    </div>
  )
}
