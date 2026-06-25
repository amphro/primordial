import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { s } from '../lib/styles'
import Logo from '../components/Logo'
import ThemeToggle from '../components/ThemeToggle'

export default function Login() {
  const { refresh } = useAuth()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function quickJoin() {
    if (!name.trim()) { setError('Enter a name'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/auth/test', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) throw new Error('Failed')
      await refresh()
    } catch {
      setError('Something went wrong')
    } finally {
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
          A cellular battle of wills.
        </p>

        {/* Quick join — always shown for now, remove once Google auth is configured */}
        <div style={{ marginBottom: 24 }}>
          <label style={s.label}>Your name</label>
          <input
            style={s.input}
            placeholder="Enter a name to play"
            value={name}
            maxLength={32}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && quickJoin()}
            autoFocus
          />
        </div>
        <button
          style={{ ...s.primaryButton, width: '100%', marginBottom: 32 }}
          onClick={quickJoin}
          disabled={loading}
        >
          {loading ? 'Joining...' : 'Play'}
        </button>

        {error && <p style={{ color: 'var(--clr-error)', fontSize: 12, marginBottom: 16 }}>{error}</p>}

        <div style={{ color: 'var(--clr-text-faint)', fontSize: 11, letterSpacing: 2, marginBottom: 20 }}>— OR —</div>

        <a href="/auth/google" style={{ ...s.ghostButton, width: '100%', display: 'block', textAlign: 'center' }}>
          Sign in with Google
        </a>
      </div>
    </div>
  )
}
