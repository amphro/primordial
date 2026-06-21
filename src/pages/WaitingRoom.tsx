import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useGameSocket, GameMsg } from '../hooks/useGameSocket'
import { s } from '../lib/styles'

interface Player {
  userId: string
  displayName: string
  color: 'blue' | 'red'
}

export default function WaitingRoom() {
  const { code } = useParams<{ code: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [players, setPlayers] = useState<Player[]>([])
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const onMessage = useCallback((msg: GameMsg) => {
    if (msg.type === 'state' && 'players' in msg) {
      setPlayers(msg.players as Player[])
    }
    if (msg.type === 'game_started') {
      navigate(`/game/${code}`)
    }
  }, [code, navigate])

  const { connected } = useGameSocket(code, onMessage)

  // Also fetch game info on load
  useEffect(() => {
    if (!code) return
    fetch(`/api/games/${code}`, { credentials: 'include' })
      .then(r => r.json())
      .then((data: { players?: Array<{ id: string; display_name: string; color: string }> }) => {
        if (data.players) {
          setPlayers(data.players.map(p => ({
            userId: p.id,
            displayName: p.display_name,
            color: p.color as 'blue' | 'red',
          })))
        }
      })
      .catch(() => {})
  }, [code])

  const isHost = players[0]?.userId === user?.userId

  async function startGame() {
    setStarting(true)
    setError('')
    try {
      const res = await fetch(`/api/games/${code}/start`, { method: 'POST', credentials: 'include' })
      const data = await res.json() as { started?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to start')
      navigate(`/game/${code}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setStarting(false)
    }
  }

  const colorStyle = (color: 'blue' | 'red') =>
    color === 'blue' ? '#4a9eff' : '#ff6b4a'

  return (
    <div style={s.center}>
      <div style={s.card}>
        <p style={{ color: '#3a5a7a', fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>GAME CODE</p>
        <h1 style={{ fontSize: 36, letterSpacing: 10, color: '#4a9eff', marginBottom: 32 }}>{code}</h1>

        <p style={{ color: '#3a5a7a', fontSize: 11, marginBottom: 16 }}>
          {connected ? '● connected' : '○ connecting...'}
        </p>

        <div style={{ marginBottom: 32 }}>
          {players.map(p => (
            <div key={p.userId} style={{
              padding: '10px 16px',
              marginBottom: 8,
              border: `1px solid ${colorStyle(p.color)}40`,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorStyle(p.color), display: 'inline-block' }} />
              <span style={{ color: '#c0d8f0' }}>{p.displayName}</span>
              <span style={{ marginLeft: 'auto', color: colorStyle(p.color), fontSize: 11 }}>
                {p.color}
              </span>
            </div>
          ))}
          {players.length < 2 && (
            <div style={{ padding: '10px 16px', border: '1px dashed #1e3050', borderRadius: 4, color: '#3a5a7a', fontSize: 13 }}>
              Waiting for opponent...
            </div>
          )}
        </div>

        {isHost && (
          <button
            style={{ ...s.primaryButton, width: '100%', opacity: players.length < 2 ? 0.4 : 1 }}
            onClick={startGame}
            disabled={players.length < 2 || starting}
          >
            {starting ? 'Starting...' : 'Start Game'}
          </button>
        )}
        {!isHost && (
          <p style={{ color: '#3a5a7a', fontSize: 13 }}>Waiting for host to start...</p>
        )}

        {error && <p style={{ color: '#ff6b6b', fontSize: 12, marginTop: 16 }}>{error}</p>}
      </div>
    </div>
  )
}
