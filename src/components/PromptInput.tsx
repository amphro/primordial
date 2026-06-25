import { useState, useEffect, useRef } from 'react'
import { s } from '../lib/styles'

interface Props {
  gameCode: string
  myColor: 'blue' | 'red'
  submitted: boolean
  myReadback: string | null
  opponentLocked: boolean
  tokenUsage?: { promptTokens: number; completionTokens: number } | null
}

const ACTION_HINTS = [
  { action: 'GROW',    desc: 'extra reproduction near nutrients' },
  { action: 'HUNT',    desc: 'cells chase and capture enemies' },
  { action: 'ARMOR',   desc: 'shields that absorb hits; counters PULSE' },
  { action: 'PULSE',   desc: 'shockwave kills % of nearby enemies' },
  { action: 'TOXIN',   desc: 'poison tiles for 3 rounds (costs 3 power)' },
  { action: 'SCATTER', desc: 'reproduce without needing nutrients' },
  { action: 'WALL',    desc: 'barriers facing the enemy (costs 2 power)' },
  { action: 'FEAST',   desc: 'burst growth near nutrients (costs 2 power)' },
]

export default function StrategyInput({ gameCode, myColor, submitted, myReadback, opponentLocked, tokenUsage }: Props) {
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!submitted) setTimeout(() => inputRef.current?.focus(), 100)
  }, [submitted])

  async function submit() {
    if (!prompt.trim() || submitting || submitted) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/games/${gameCode}/strategy`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      })
      if (!res.ok) {
        let msg = `Server error (${res.status})`
        try { const d = await res.json() as { error?: string }; msg = d.error ?? msg } catch { /* non-JSON body */ }
        throw new Error(msg)
      }
    } catch (e) {
      setError((e as Error).message)
      setSubmitting(false)
    }
    // Don't set submitting=false on success — the strategy_locked WS message will update state
  }

  const accentColor = myColor === 'blue' ? 'var(--clr-blue)' : 'var(--clr-red)'
  const totalTokens = tokenUsage ? tokenUsage.promptTokens + tokenUsage.completionTokens : null

  if (submitted) {
    return (
      <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
          <span style={{ color: accentColor, fontSize: 13, letterSpacing: 1 }}>Strategy locked</span>
          {totalTokens !== null && (
            <span style={{ color: 'var(--clr-text-faint)', fontSize: 11, marginLeft: 4 }}>{totalTokens} tok</span>
          )}
          <span style={{ color: 'var(--clr-text-faint)', fontSize: 11, marginLeft: 'auto' }}>
            {opponentLocked ? '· opponent ready' : '· waiting for opponent'}
          </span>
        </div>
        {myReadback && (
          <div style={{ paddingLeft: 18, color: 'var(--clr-text-dim)', fontSize: 12, fontStyle: 'italic' }}>
            "{myReadback}"
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={inputRef}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() } }}
          placeholder="Describe your strategy in plain English…"
          maxLength={500}
          rows={5}
          disabled={submitting}
          style={{ ...s.input, resize: 'none', fontSize: 14, lineHeight: 1.5, flex: 1, opacity: submitting ? 0.5 : 1 }}
        />
        <button
          onClick={() => void submit()}
          disabled={submitting || !prompt.trim()}
          style={{
            ...s.primaryButton,
            background: accentColor,
            padding: '10px 20px',
            fontSize: 13,
            flexShrink: 0,
            opacity: submitting ? 0.7 : (!prompt.trim() ? 0.4 : 1),
            height: 108,
          }}
        >
          {submitting ? 'Thinking…' : 'Set Strategy'}
        </button>
      </div>

      {/* Action reference */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px' }}>
        {ACTION_HINTS.map(({ action, desc }) => (
          <div key={action} style={{ display: 'flex', gap: 6, fontSize: 11, lineHeight: 1.5 }}>
            <span style={{ color: accentColor, fontWeight: 700, minWidth: 52, flexShrink: 0 }}>{action}</span>
            <span style={{ color: 'var(--clr-text-dim)' }}>{desc}</span>
          </div>
        ))}
      </div>
      <div style={{ color: 'var(--clr-text-faint)', fontSize: 11 }}>
        tip: try <em style={{ color: 'var(--clr-text-dim)' }}>"create a random strategy"</em> if you aren't sure where to begin
      </div>

      {error && <p style={{ color: 'var(--clr-error)', fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  )
}
