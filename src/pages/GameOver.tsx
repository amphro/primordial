import { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { s } from '../lib/styles'
import ThemeToggle from '../components/ThemeToggle'

async function startNewGame(navigate: ReturnType<typeof useNavigate>, setLoading: (b: boolean) => void) {
  setLoading(true)
  try {
    const res = await fetch('/api/games', { method: 'POST', credentials: 'include' })
    const data = await res.json() as { code: string }
    await fetch(`/api/games/${data.code}/add-bot`, { method: 'POST', credentials: 'include' })
    navigate(`/game/${data.code}`)
  } catch {
    setLoading(false)
  }
}

interface RoundEntry {
  round: number
  myAction: string; myZone: string; myDelta: number
  oppAction: string; oppZone: string; oppDelta: number
}

interface LocationState {
  gameCode?: string
  winner?: 'blue' | 'red' | null
  winReason?: string
  scores?: { blue: number; red: number }
  rounds?: RoundEntry[]
  isOwnGame?: boolean
}

export default function GameOver() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as LocationState) ?? {}
  const isGuest = user?.userId?.startsWith('test_')
  const [copied, setCopied] = useState(false)
  const [newGameLoading, setNewGameLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [hasAnalyzed, setHasAnalyzed] = useState(false)

  const color = state.winner === 'blue' ? 'var(--clr-blue)' : state.winner === 'red' ? 'var(--clr-red)' : 'var(--clr-text-muted)'
  const label = state.winner === 'tie' ? 'TIE' : state.winner ? `${state.winner.toUpperCase()} WINS` : 'GAME OVER'

  const rounds = state.rounds ?? []

  // Top 3 most dramatic rounds by absolute cell swing
  const topRounds = [...rounds]
    .sort((a, b) => Math.abs(b.myDelta) - Math.abs(a.myDelta))
    .slice(0, 3)

  function buildShareText(): string {
    const winner = state.winner ? state.winner.toUpperCase() : '?'
    const lines = [`PRIMORDIAL — ${winner} WINS`]
    if (state.scores) lines.push(`Blue ${state.scores.blue}% · Red ${state.scores.red}%`)
    if (rounds.length > 0) {
      lines.push('')
      lines.push('Top moments:')
      topRounds.forEach(r => {
        const sign = r.myDelta >= 0 ? '+' : ''
        lines.push(`  R${r.round} ${r.myAction} → ${sign}${r.myDelta} cells`)
      })
    }
    lines.push('')
    lines.push(window.location.origin)
    return lines.join('\n')
  }

  async function analyze() {
    if (!state.gameCode || analyzing || hasAnalyzed) return
    setAnalyzing(true)
    setHasAnalyzed(true)
    setAnalysis(null)
    try {
      const res = await fetch(`/api/games/${state.gameCode}/analyze`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: '' }),
      })
      const data = await res.json() as { analysis?: string; error?: string }
      setAnalysis(data.analysis ?? data.error ?? 'No analysis returned.')
    } catch {
      setAnalysis('Failed to reach the server.')
    } finally {
      setAnalyzing(false)
    }
  }

  async function share() {
    const text = buildShareText()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  function fmtDelta(d: number): string {
    return d > 0 ? `+${d}` : `${d}`
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--clr-bg)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', padding: '24px 0 80px' }}>
      <div style={{ ...s.card, maxWidth: 480, padding: 0, textAlign: 'left' }}>

        {/* Sticky nav header */}
        <div style={{ position: 'sticky', top: 0, background: 'var(--clr-card)', zIndex: 1, padding: '12px 20px', borderBottom: '1px solid var(--clr-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', color: 'var(--clr-blue)', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            ← Home
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link to="/history" style={{ color: 'var(--clr-text-muted)', fontSize: 12, textDecoration: 'none' }}>Past games</Link>
            <ThemeToggle />
          </div>
        </div>

        {/* Card content */}
        <div style={{ padding: '24px 20px 32px' }}>
          <div style={{ marginBottom: 12 }}>
            <h1 style={{ fontSize: 28, letterSpacing: 6, color, margin: 0 }}>{label}</h1>
            {state.scores && (
              <p style={{ color: 'var(--clr-text-dim)', fontSize: 13, marginTop: 6, marginBottom: 0 }}>
                Blue {state.scores.blue}% · Red {state.scores.red}%
              </p>
            )}
          </div>

          {/* Round recap */}
          {topRounds.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <p style={{ color: 'var(--clr-text-muted)', fontSize: 10, letterSpacing: 2, marginBottom: 12 }}>KEY ROUNDS</p>
              {topRounds.map(r => (
                <div key={r.round} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 10px',
                  marginBottom: 6,
                  background: 'var(--clr-surface-raised)',
                  border: '1px solid var(--clr-border-hi)',
                  borderRadius: 4,
                  fontSize: 12,
                  gap: 6,
                }}>
                  <span style={{ color: 'var(--clr-text-dim)', minWidth: 28, flexShrink: 0 }}>R{r.round}</span>
                  <span style={{ color: 'var(--clr-text-muted)', flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.myAction}
                  </span>
                  <span style={{
                    color: r.myDelta >= 0 ? 'var(--clr-green)' : 'var(--clr-red)',
                    fontWeight: 'bold',
                    minWidth: 48,
                    textAlign: 'right',
                    flexShrink: 0,
                  }}>
                    {fmtDelta(r.myDelta)} cells
                  </span>
                  <span style={{ color: 'var(--clr-text-faint)', margin: '0 4px', flexShrink: 0 }}>vs</span>
                  <span style={{ color: 'var(--clr-text-dim)', flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    opp {r.oppAction}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
            <button
              style={{ ...s.primaryButton, opacity: newGameLoading ? 0.6 : 1 }}
              onClick={() => void startNewGame(navigate, setNewGameLoading)}
              disabled={newGameLoading}
            >
              {newGameLoading ? 'Starting…' : 'New Game'}
            </button>
            <button
              style={{ ...s.ghostButton, fontSize: 12 }}
              onClick={() => void share()}
            >
              {copied ? '✓ Copied' : 'Share'}
            </button>
          </div>

          {/* Coach me */}
          {state.gameCode && (
            <div style={{ borderTop: '1px solid var(--clr-border)', paddingTop: 16 }}>
              <p style={{ color: 'var(--clr-text-muted)', fontSize: 10, letterSpacing: 2, margin: '0 0 12px' }}>COACH ME</p>
              {!hasAnalyzed ? (
                <button
                  onClick={() => void analyze()}
                  style={{ ...s.ghostButton, fontSize: 13, width: '100%' }}
                >
                  Coach me
                </button>
              ) : analyzing ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
                  <div className="spinner" />
                </div>
              ) : analysis ? (
                <div style={{
                  background: 'var(--clr-surface)', border: '1px solid var(--clr-border-hi)', borderRadius: 4,
                  padding: '12px 14px', color: 'var(--clr-text-secondary)', fontSize: 13, lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                }}>
                  {analysis}
                </div>
              ) : null}
            </div>
          )}

          {/* Guest nudge — only for players in their own game, not replay viewers */}
          {isGuest && state.isOwnGame && (
            <div style={{ marginTop: 28, textAlign: 'center' }}>
              <div style={{ color: 'var(--clr-text-muted)', fontSize: 12, marginBottom: 4 }}>
                This battle will vanish if you clear this browser.
              </div>
              <a href="/auth/google" style={{ color: 'var(--clr-blue)', textDecoration: 'none', fontSize: 12 }}>
                Sign in with Google to keep your war log →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
