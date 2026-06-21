import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useGameSocket, GameMsg } from '../hooks/useGameSocket'

// Phase 1 stub: shows connected players and a "Finish Game" button.
// Canvas renderer and actual game UI added in Phase 3.
export default function Game() {
  const { code } = useParams<{ code: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [players, setPlayers] = useState<Array<{ userId: string; displayName: string; color: 'blue' | 'red' }>>([])
  const [finishing, setFinishing] = useState(false)

  const onMessage = useCallback((msg: GameMsg) => {
    if (msg.type === 'state' && 'players' in msg) {
      setPlayers(msg.players as typeof players)
    }
    if (msg.type === 'game_over') {
      navigate(`/game/${code}/over`, {
        state: { winner: (msg as { winner: string | null }).winner, message: (msg as { message?: string }).message },
      })
    }
  }, [code, navigate])

  const { connected } = useGameSocket(code, onMessage)

  const myPlayer = players.find(p => p.userId === user?.userId)

  async function finishGame() {
    setFinishing(true)
    await fetch(`/api/games/${code}/finish`, { method: 'POST', credentials: 'include' })
    // Navigation handled by game_over WebSocket message
  }

  const color = (c: 'blue' | 'red') => c === 'blue' ? '#4a9eff' : '#ff6b4a'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <h2 style={{ color: '#4a9eff', letterSpacing: 6, fontSize: 20 }}>PRIMORDIAL</h2>
      <p style={{ color: '#3a5a7a', fontSize: 12 }}>Game {code} · {connected ? '● live' : '○ connecting'}</p>

      <div style={{ display: 'flex', gap: 16 }}>
        {players.map(p => (
          <div key={p.userId} style={{
            padding: '12px 20px',
            border: `1px solid ${color(p.color)}40`,
            borderRadius: 4,
            textAlign: 'center',
          }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: color(p.color), margin: '0 auto 8px' }} />
            <div style={{ color: '#c0d8f0', fontSize: 13 }}>{p.displayName}</div>
            <div style={{ color: color(p.color), fontSize: 11, marginTop: 4 }}>{p.color}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, padding: '32px 48px', border: '1px dashed #1e3050', borderRadius: 8, textAlign: 'center' }}>
        <p style={{ color: '#3a5a7a', fontSize: 13, marginBottom: 24 }}>
          [Game canvas goes here — Phase 3]
        </p>
        <p style={{ color: '#2a4a6a', fontSize: 12, marginBottom: 24 }}>
          You are playing as{' '}
          <span style={{ color: myPlayer ? color(myPlayer.color) : '#fff' }}>
            {myPlayer?.color ?? '...'}
          </span>
        </p>
        <button
          onClick={finishGame}
          disabled={finishing}
          style={{
            background: '#ff6b4a20',
            border: '1px solid #ff6b4a40',
            color: '#ff6b4a',
            fontFamily: 'inherit',
            fontSize: 13,
            letterSpacing: 1,
            padding: '10px 24px',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {finishing ? 'Finishing...' : 'Finish Game'}
        </button>
      </div>
    </div>
  )
}
