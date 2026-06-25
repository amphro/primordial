import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { s } from '../lib/styles'
import Logo from '../components/Logo'
import ThemeToggle from '../components/ThemeToggle'
import { HOW_TO_PLAY_URL } from '../lib/links'

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <h1 style={{ fontSize: 24, letterSpacing: 6, color: 'var(--clr-blue)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Logo size={30} />PRIMORDIAL
          </h1>
          <ThemeToggle />
        </div>
        <p style={{ color: 'var(--clr-text-muted)', fontSize: 12, marginBottom: 40 }}>
          A cellular battle of wills.
        </p>

        <button
          style={{ ...s.primaryButton, width: '100%' }}
          onClick={startGame}
          disabled={starting}
        >
          {starting ? 'Starting…' : 'Start Game (vs Computer)'}
        </button>

        {error && (
          <p style={{ color: 'var(--clr-error)', fontSize: 12, marginTop: 16 }}>{error}</p>
        )}

        <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--clr-border)', textAlign: 'center' }}>
          <p style={{ color: 'var(--clr-text-faint)', fontSize: 11, marginBottom: 8 }}>
            Experimental hobby project — use at your own risk.
          </p>
          <a href={HOW_TO_PLAY_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--clr-text-dim)', fontSize: 11, textDecoration: 'none' }}>
            How to play →
          </a>
        </div>
      </div>
    </div>
  )
}
