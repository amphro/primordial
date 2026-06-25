import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
}

export default function GameOver() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as LocationState) ?? {}
  const [copied, setCopied] = useState(false)
  const [newGameLoading, setNewGameLoading] = useState(false)
  const [analyzeOpen, setAnalyzeOpen] = useState(false)
  const [analyzeQuestion, setAnalyzeQuestion] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<string | null>(null)

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
    if (!state.gameCode || analyzing) return
    setAnalyzing(true)
    setAnalysis(null)
    try {
      const res = await fetch(`/api/games/${state.gameCode}/analyze`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: analyzeQuestion.trim() }),
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
    <div style={s.center}>
      <div style={{ ...s.card, maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <h1 style={{ fontSize: 28, letterSpacing: 6, color }}>{label}</h1>
          <ThemeToggle />
        </div>
        {state.scores && (
          <p style={{ color: 'var(--clr-text-dim)', fontSize: 13, marginBottom: 24 }}>
            Blue {state.scores.blue}% · Red {state.scores.red}%
          </p>
        )}

        {/* Round recap */}
        {topRounds.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <p style={{ color: 'var(--clr-text-muted)', fontSize: 10, letterSpacing: 2, marginBottom: 12 }}>KEY ROUNDS</p>
            {topRounds.map(r => (
              <div key={r.round} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                marginBottom: 6,
                background: 'var(--clr-surface-raised)',
                border: '1px solid var(--clr-border-hi)',
                borderRadius: 4,
                fontSize: 12,
              }}>
                <span style={{ color: 'var(--clr-text-dim)', minWidth: 28 }}>R{r.round}</span>
                <span style={{ color: 'var(--clr-text-muted)', flex: 1, textAlign: 'left' }}>
                  {r.myAction} {r.myZone}
                </span>
                <span style={{
                  color: r.myDelta >= 0 ? 'var(--clr-green)' : 'var(--clr-red)',
                  fontWeight: 'bold',
                  minWidth: 52,
                  textAlign: 'right',
                }}>
                  {fmtDelta(r.myDelta)} cells
                </span>
                <span style={{ color: 'var(--clr-text-faint)', margin: '0 8px' }}>vs</span>
                <span style={{ color: 'var(--clr-text-dim)', flex: 1, textAlign: 'right' }}>
                  opp {r.oppAction}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
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
          {state.gameCode && (
            <button
              style={{ ...s.ghostButton, fontSize: 12 }}
              onClick={() => { setAnalyzeOpen(o => !o); setAnalysis(null) }}
            >
              Analyze
            </button>
          )}
        </div>

        {analyzeOpen && (
          <div style={{ marginTop: 20, borderTop: '1px solid var(--clr-border-hi)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ color: 'var(--clr-text-dim)', fontSize: 11, letterSpacing: 1, margin: 0 }}>ASK THE AI</p>
            <textarea
              value={analyzeQuestion}
              onChange={e => setAnalyzeQuestion(e.target.value)}
              placeholder="Why did I lose? Was my strategy correct? (leave blank for auto-analysis)"
              rows={2}
              style={{
                background: 'var(--clr-surface-raised)', border: '1px solid var(--clr-border-hi)', borderRadius: 4,
                color: 'var(--clr-text)', fontSize: 13, padding: '8px 10px', resize: 'none',
                fontFamily: 'inherit', lineHeight: 1.5,
              }}
            />
            <button
              onClick={() => void analyze()}
              disabled={analyzing}
              style={{ ...s.ghostButton, fontSize: 12, opacity: analyzing ? 0.6 : 1 }}
            >
              {analyzing ? 'Analyzing…' : 'Analyze this game'}
            </button>
            {analysis && (
              <div style={{
                background: 'var(--clr-surface)', border: '1px solid var(--clr-border-hi)', borderRadius: 4,
                padding: '12px 14px', color: 'var(--clr-text-secondary)', fontSize: 13, lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
              }}>
                {analysis}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
