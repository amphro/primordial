import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { s } from '../lib/styles'

interface LocationState {
  winner?: 'blue' | 'red' | null
  message?: string
}

export default function GameOver() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as LocationState) ?? {}

  const color = state.winner === 'blue' ? '#4a9eff' : state.winner === 'red' ? '#ff6b4a' : '#8a9aaa'
  const label = state.winner ? `${state.winner.toUpperCase()} WINS` : 'GAME OVER'

  return (
    <div style={s.center}>
      <div style={s.card}>
        <h1 style={{ fontSize: 28, letterSpacing: 6, color, marginBottom: 12 }}>{label}</h1>
        {state.message && (
          <p style={{ color: '#5a7a9a', fontSize: 13, marginBottom: 32 }}>{state.message}</p>
        )}
        <p style={{ color: '#3a5a7a', fontSize: 12, marginBottom: 32 }}>
          Game {code}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button style={s.primaryButton} onClick={() => navigate('/')}>New Game</button>
          <button style={s.ghostButton} onClick={() => navigate(`/game/${code}/wait`)}>Rematch</button>
        </div>
      </div>
    </div>
  )
}
