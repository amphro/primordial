import { useState, useEffect, useRef } from 'react'
import { s } from '../lib/styles'

interface Props {
  gameCode: string
  myColor: 'blue' | 'red'
  submitted: boolean
  myReadback: string | null
  opponentLocked: boolean
}

export default function StrategyInput({ gameCode, myColor, submitted, myReadback, opponentLocked }: Props) {
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

  if (submitted) {
    return (
      <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
          <span style={{ color: accentColor, fontSize: 13, letterSpacing: 1 }}>Strategy locked</span>
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
          placeholder="Describe your strategy — when to grow, hunt, armor, or pulse…"
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
      <div style={{ color: 'var(--clr-text-dim)', fontSize: 11, lineHeight: 1.6 }}>
        ARMOR counters PULSE &nbsp;·&nbsp; HUNT bypasses ARMOR &nbsp;·&nbsp; GROW eats nutrients to multiply.
        You don't know what your opponent will do — set your rules, then start the battle.
      </div>
      {error && <p style={{ color: 'var(--clr-error)', fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  )
}
