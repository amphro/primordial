import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useGameSocket, GameMsg } from '../hooks/useGameSocket'
import { s } from '../lib/styles'

function useInviteLink(code: string | undefined) {
  const [copied, setCopied] = useState(false)
  function copy() {
    if (!code) return
    const url = `${window.location.origin}/?join=${code}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }
  return { copied, copy }
}

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
  const [hostId, setHostId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const { copied: inviteCopied, copy: copyInvite } = useInviteLink(code)

  // Single fetch fn shared by initial load and player_joined/player_left events.
  // Always use D1 as the source of truth for the lobby player list so we don't
  // depend on WebSocket connection order for host detection.
  const refetchGame = useCallback(() => {
    if (!code) return
    fetch(`/api/games/${code}`, { credentials: 'include' })
      .then(r => r.json())
      .then((data: { game?: { host_id: string }; players?: Array<{ id: string; display_name: string; color: string }> }) => {
        if (data.game?.host_id) setHostId(data.game.host_id)
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

  useEffect(() => {
    refetchGame()
  }, [refetchGame])

  const onMessage = useCallback((msg: GameMsg) => {
    // Navigate when the game goes active (host started, or add-bot auto-started).
    // The DO broadcasts a state msg with phase='active'; there is no 'game_started' type.
    if (msg.type === 'state') {
      const s = msg as { type: 'state'; phase: string }
      if (s.phase === 'active') navigate(`/game/${code}`)
    }
    // Refresh D1 player list when someone joins or leaves
    if (msg.type === 'player_joined' || msg.type === 'player_left') {
      refetchGame()
    }
  }, [code, navigate, refetchGame])

  const { connected } = useGameSocket(code, onMessage)

  // isHost derived from D1 host_id, not WS connection order
  const isHost = hostId !== null && hostId === user?.userId

  async function addBot() {
    setError('')
    try {
      const res = await fetch(`/api/games/${code}/add-bot`, { method: 'POST', credentials: 'include' })
      const data = await res.json() as { started?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      navigate(`/game/${code}`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <p style={{ color: '#3a5a7a', fontSize: 11, margin: 0 }}>
            {connected ? '● connected' : '○ connecting...'}
          </p>
          <button
            style={{ ...s.ghostButton, fontSize: 11, padding: '4px 12px' }}
            onClick={copyInvite}
          >
            {inviteCopied ? '✓ Link copied' : 'Copy invite link'}
          </button>
        </div>

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {players.length < 2 && (
              <button style={{ ...s.primaryButton, width: '100%' }} onClick={addBot}>
                Play vs Computer
              </button>
            )}
            <button
              style={{ ...s.ghostButton, width: '100%', opacity: players.length < 2 ? 0.4 : 1 }}
              onClick={startGame}
              disabled={players.length < 2 || starting}
            >
              {starting ? 'Starting...' : 'Start with Friend'}
            </button>
          </div>
        )}
        {!isHost && (
          <p style={{ color: '#3a5a7a', fontSize: 13 }}>Waiting for host to start...</p>
        )}

        {error && <p style={{ color: '#ff6b6b', fontSize: 12, marginTop: 16 }}>{error}</p>}
      </div>
    </div>
  )
}
