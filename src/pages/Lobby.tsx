import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { s } from '../lib/styles'
import Logo from '../components/Logo'

export default function Lobby() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)

  async function startGame() {
    setStarting(true)
    setError('')
    try {
      const res = await fetch('/api/games', { method: 'POST', credentials: 'include' })
      const data = await res.json() as { code?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to create game')
      const code = data.code!
      const botRes = await fetch(`/api/games/${code}/add-bot`, { method: 'POST', credentials: 'include' })
      if (!botRes.ok) {
        const d = await botRes.json() as { error?: string }
        throw new Error(d.error ?? 'Failed to start game')
      }
      navigate(`/game/${code}`)
    } catch (e) {
      setError((e as Error).message)
      setStarting(false)
    }
  }

  return (
    <div style={s.center}>
      <div style={s.card}>
        <h1 style={{ fontSize: 24, letterSpacing: 6, color: '#4a9eff', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo size={30} />PRIMORDIAL
        </h1>
        <p style={{ color: '#5a7a9a', fontSize: 12, marginBottom: 40 }}>
          Hello, {user?.displayName}
        </p>

        <button
          style={{ ...s.primaryButton, width: '100%' }}
          onClick={startGame}
          disabled={starting}
        >
          {starting ? 'Starting…' : 'Start Game (vs Computer)'}
        </button>

        {error && (
          <p style={{ color: '#ff6b6b', fontSize: 12, marginTop: 16 }}>{error}</p>
        )}

        <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid #1a2a3a' }}>
          <a href="/auth/logout" style={{ color: '#3a5a7a', fontSize: 11, textDecoration: 'none' }}>
            Sign out
          </a>
        </div>
      </div>
    </div>
  )
}
