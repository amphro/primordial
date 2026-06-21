import { useState, useEffect, useRef } from 'react'
import { s } from '../lib/styles'

interface Props {
  gameCode: string
  myColor: 'blue' | 'red'
  myLocked: boolean
  opponentLocked: boolean
  disabled?: boolean
  onLocked: () => void
}

export default function PromptInput({ gameCode, myColor, myLocked, opponentLocked, disabled, onLocked }: Props) {
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!myLocked) {
      setPrompt('')
      setError('')
      // Focus prompt input at start of each round
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [myLocked])

  async function submit() {
    if (!prompt.trim() || submitting || myLocked) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/games/${gameCode}/prompt`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Failed')
      }
      onLocked()
    } catch (e) {
      setError((e as Error).message)
      setSubmitting(false)
    }
  }

  const accentColor = myColor === 'blue' ? '#4a9eff' : '#ff6b4a'

  if (disabled) {
    return <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2a3a4a', fontSize: 12 }}>Game over</div>
  }

  if (myLocked) {
    return (
      <div style={{ padding: '16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
        <span style={{ color: accentColor, fontSize: 13, letterSpacing: 1 }}>Locked in</span>
        <span style={{ color: '#2a3a4a', fontSize: 12, marginLeft: 'auto' }}>
          {opponentLocked ? '· opponent locked too' : '· waiting for opponent'}
        </span>
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
          placeholder="Tell your cells what to do."
          maxLength={500}
          rows={2}
          style={{
            ...s.input,
            resize: 'none',
            fontSize: 14,
            lineHeight: 1.5,
            flex: 1,
          }}
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
            opacity: (!prompt.trim() || submitting) ? 0.4 : 1,
            height: 52,
          }}
        >
          {submitting ? '...' : 'Lock In'}
        </button>
      </div>
      {error && <p style={{ color: '#ff6b6b', fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  )
}
