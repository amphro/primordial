import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { s } from '../lib/styles'
import Logo from '../components/Logo'
import ThemeToggle from '../components/ThemeToggle'

const ADJS  = ['amber', 'azure', 'bold', 'coral', 'cyan', 'dusk', 'ember', 'fern', 'gold', 'jade', 'neon', 'rose', 'rust', 'sage', 'teal', 'void', 'wild']
const NOUNS = ['bear', 'crane', 'crow', 'drake', 'falcon', 'fox', 'hawk', 'hare', 'lynx', 'moth', 'raven', 'shark', 'stag', 'swift', 'viper', 'wolf', 'wren']

function guestName(): string {
  let id = ''
  try {
    id = localStorage.getItem('guestId') ?? ''
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('guestId', id) }
  } catch { id = crypto.randomUUID() }
  const hex = id.replace(/-/g, '')
  const n1 = parseInt(hex.slice(0, 4), 16) % ADJS.length
  const n2 = parseInt(hex.slice(4, 8), 16) % NOUNS.length
  return `${ADJS[n1]}${NOUNS[n2]}`
}

export default function Login() {
  const { refresh } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function play() {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/auth/test', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: guestName() }),
      })
      if (!res.ok) throw new Error('Server error')
      await refresh()
    } catch {
      setError('Could not connect — make sure the server is running.')
      setLoading(false)
    }
  }

  return (
    <div style={s.center}>
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <h1 style={{ fontSize: 32, letterSpacing: 8, color: 'var(--clr-blue)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Logo size={38} />PRIMORDIAL
          </h1>
          <ThemeToggle />
        </div>
        <p style={{ color: 'var(--clr-text-muted)', marginBottom: 40, fontSize: 13, letterSpacing: 1 }}>
          A cellular automaton where your only weapon is a plain-English strategy.
        </p>

        <button
          style={{ ...s.primaryButton, width: '100%', marginBottom: 16 }}
          onClick={play}
          disabled={loading}
        >
          {loading ? 'Joining…' : 'Play'}
        </button>

        {error && <p style={{ color: 'var(--clr-error)', fontSize: 12, marginBottom: 16 }}>{error}</p>}

        <a href="/auth/google" style={{ ...s.ghostButton, width: '100%', display: 'block', textAlign: 'center' }}>
          Sign in with Google
        </a>

        <p style={{ marginTop: 24, fontSize: 11, color: 'var(--clr-text-faint)', textAlign: 'center' }}>
          <a href="https://amphro.com/terms/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--clr-text-dim)', textDecoration: 'none' }}>Terms</a>
          {' · '}
          <a href="https://amphro.com/privacy/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--clr-text-dim)', textDecoration: 'none' }}>Privacy</a>
        </p>
      </div>
    </div>
  )
}
