import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { s } from '../lib/styles'
import Logo from '../components/Logo'
import ThemeToggle from '../components/ThemeToggle'

interface GameEntry {
  code: string
  winner_id: string | null
  finished_at: number
  my_color: 'blue' | 'red'
  opponent_name: string | null
}

function result(entry: GameEntry, userId: string): { label: string; color: string } {
  if (entry.winner_id === null) return { label: 'Tie', color: 'var(--clr-text-muted)' }
  if (entry.winner_id === userId) return { label: 'Won', color: 'var(--clr-blue)' }
  return { label: 'Lost', color: 'var(--clr-red)' }
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function History() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [games, setGames] = useState<GameEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/games', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { games?: GameEntry[] }) => setGames(d.games ?? []))
      .catch(() => {/* stay empty */})
      .finally(() => setLoading(false))
  }, [])

  const isGuest = user?.userId?.startsWith('test_')

  return (
    <div style={s.center}>
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <button
            onClick={() => navigate('/')}
            style={{ ...s.ghostButton, padding: '4px 10px', fontSize: 12 }}
          >
            ← Back
          </button>
          <ThemeToggle />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <Logo size={22} />
          <h1 style={{ fontSize: 18, letterSpacing: 4, color: 'var(--clr-blue)', margin: 0 }}>PAST GAMES</h1>
        </div>

        {isGuest && (
          <div style={{
            background: 'var(--clr-surface)',
            border: '1px solid var(--clr-border)',
            borderRadius: 6,
            padding: '12px 16px',
            marginBottom: 20,
            fontSize: 13,
            color: 'var(--clr-text-dim)',
          }}>
            Playing as a guest — history is tied to this browser.{' '}
            <a href="/auth/google" style={{ color: 'var(--clr-blue)', textDecoration: 'none' }}>
              Log in with Google
            </a>{' '}
            to keep it across devices.
          </div>
        )}

        {loading && (
          <p style={{ color: 'var(--clr-text-faint)', fontSize: 13 }}>Loading…</p>
        )}

        {!loading && games.length === 0 && (
          <p style={{ color: 'var(--clr-text-faint)', fontSize: 13 }}>No finished games yet.</p>
        )}

        {!loading && games.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {games.map(g => {
              const r = result(g, user?.userId ?? '')
              const colorLabel = g.my_color === 'blue' ? 'Blue' : 'Red'
              const colorHex = g.my_color === 'blue' ? 'var(--clr-blue)' : 'var(--clr-red)'
              return (
                <div
                  key={g.code}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    background: 'var(--clr-surface)',
                    border: '1px solid var(--clr-border)',
                    borderRadius: 6,
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 13, color: r.color, minWidth: 36 }}>{r.label}</span>
                  <span style={{ fontSize: 12, color: colorHex, minWidth: 28 }}>{colorLabel}</span>
                  <span style={{ fontSize: 12, color: 'var(--clr-text-dim)', flex: 1 }}>
                    vs {g.opponent_name ?? 'Unknown'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--clr-text-faint)', marginRight: 8 }}>{fmt(g.finished_at)}</span>
                  <button
                    onClick={() => navigate(`/game/${g.code}`)}
                    style={{ ...s.ghostButton, padding: '3px 10px', fontSize: 11 }}
                  >
                    Replay
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
