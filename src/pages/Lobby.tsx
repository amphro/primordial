import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { s } from '../lib/styles'
import Logo from '../components/Logo'
import ThemeToggle from '../components/ThemeToggle'
import { DOCS_URL, HOW_TO_PLAY_URL } from '../lib/links'

const linkStyle: React.CSSProperties = { color: 'var(--clr-text-dim)', fontSize: 11, textDecoration: 'none' }
const faintLinkStyle: React.CSSProperties = { color: 'var(--clr-text-faint)', fontSize: 10, textDecoration: 'none' }

export default function Lobby() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isGuest = user?.userId?.startsWith('test_')
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
        <p style={{ color: 'var(--clr-text-muted)', fontSize: 12, marginBottom: 32 }}>
          Two colonies. One battle. Your only weapon is plain English.
        </p>

        {/* Start button or spinner while creating the game */}
        {starting ? (
          <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : (
          <button
            style={{ ...s.primaryButton, width: '100%' }}
            onClick={startGame}
          >
            Start Game (vs Computer)
          </button>
        )}

        {error && (
          <p style={{ color: 'var(--clr-error)', fontSize: 12, marginTop: 12 }}>{error}</p>
        )}

        {/* Guest nudge — below the CTA so it doesn't compete */}
        {isGuest && !starting && (
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <div style={{ color: 'var(--clr-text-muted)', fontSize: 12, marginBottom: 4 }}>
              Guest mode — your battles live in this browser.
            </div>
            <a href="/auth/google" style={{ color: 'var(--clr-blue)', textDecoration: 'none', fontSize: 12 }}>
              Sign in with Google to keep them anywhere →
            </a>
          </div>
        )}

        {/* Footer nav */}
        <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--clr-border)', textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginBottom: 10 }}>
            <Link to="/history" style={linkStyle}>Past games</Link>
            <a href={HOW_TO_PLAY_URL} target="_blank" rel="noopener noreferrer" style={linkStyle}>How to play</a>
            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" style={linkStyle}>How it works</a>
          </div>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', alignItems: 'center' }}>
            <span style={{ color: 'var(--clr-text-faint)', fontSize: 10 }}>Experimental hobby project</span>
            <span style={{ color: 'var(--clr-text-faint)', fontSize: 10 }}>·</span>
            <a href="https://amphro.com/terms/" target="_blank" rel="noopener noreferrer" style={faintLinkStyle}>Terms</a>
            <a href="https://amphro.com/privacy/" target="_blank" rel="noopener noreferrer" style={faintLinkStyle}>Privacy</a>
          </div>
        </div>
      </div>
    </div>
  )
}
