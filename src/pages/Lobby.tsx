import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { s } from '../lib/styles'

export default function Lobby() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [joinCode, setJoinCode] = useState(() => searchParams.get('join') ?? '')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)

  async function createGame() {
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/games', { method: 'POST', credentials: 'include' })
      const data = await res.json() as { code?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to create game')
      navigate(`/game/${data.code}/wait`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  async function joinGame() {
    const code = joinCode.toUpperCase().trim()
    if (code.length !== 6) { setError('Enter a 6-character code'); return }
    setJoining(true)
    setError('')
    try {
      const res = await fetch(`/api/games/${code}/join`, { method: 'POST', credentials: 'include' })
      const data = await res.json() as { code?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      navigate(`/game/${code}/wait`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setJoining(false)
    }
  }

  return (
    <div style={s.center}>
      <div style={s.card}>
        <h1 style={{ fontSize: 24, letterSpacing: 6, color: '#4a9eff', marginBottom: 4 }}>PRIMORDIAL</h1>
        <p style={{ color: '#3a5a7a', fontSize: 12, marginBottom: 40 }}>
          Hello, {user?.displayName}
        </p>

        <div style={{ marginBottom: 32 }}>
          <button
            style={{ ...s.primaryButton, width: '100%' }}
            onClick={createGame}
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Create Game'}
          </button>
        </div>

        <div style={{ color: '#2a3a4a', fontSize: 11, letterSpacing: 2, marginBottom: 16 }}>— OR —</div>

        <div style={{ marginBottom: 12 }}>
          <label style={s.label}>Game Code</label>
          <input
            style={{ ...s.input, textTransform: 'uppercase', letterSpacing: 4, textAlign: 'center' }}
            placeholder="TEAL42"
            maxLength={6}
            value={joinCode}
            onChange={e => setJoinCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && joinGame()}
          />
        </div>

        <button
          style={{ ...s.ghostButton, width: '100%' }}
          onClick={joinGame}
          disabled={joining}
        >
          {joining ? 'Joining...' : 'Join Game'}
        </button>

        {error && (
          <p style={{ color: '#ff6b6b', fontSize: 12, marginTop: 16 }}>{error}</p>
        )}

        <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid #1a2a3a' }}>
          <a href="/auth/logout" style={{ color: '#2a4a6a', fontSize: 11, textDecoration: 'none' }}>
            Sign out
          </a>
        </div>
      </div>
    </div>
  )
}
