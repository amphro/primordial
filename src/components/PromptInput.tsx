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
  const [classification, setClassification] = useState<{ action: string; zone: string; intensity: string } | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!myLocked) {
      setPrompt('')
      setError('')
      setSubmitting(false)
      setClassification(null)
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
      const data = await res.json() as { queued: boolean; classification?: { action: string; zone: string; intensity: string } }
      if (data.classification) setClassification(data.classification)
      onLocked()
    } catch (e) {
      setError((e as Error).message)
      setSubmitting(false)
    }
  }

  const accentColor = myColor === 'blue' ? '#4a9eff' : '#ff6b4a'

  if (disabled) {
    return <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2a3a4a', fontSize: 12 }}>Waiting…</div>
  }

  if (myLocked) {
    return (
      <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
          <span style={{ color: accentColor, fontSize: 13, letterSpacing: 1 }}>Locked in</span>
          {classification && (
            <span style={{ color: '#8a9aaa', fontSize: 11, letterSpacing: 1 }}>
              → {classification.action} · {classification.zone} · {classification.intensity}
            </span>
          )}
          <span style={{ color: '#2a3a4a', fontSize: 12, marginLeft: 'auto' }}>
            {opponentLocked ? '· opponent locked too' : '· waiting for opponent'}
          </span>
        </div>
        {!classification && submitting && (
          <div style={{ color: '#3a5a7a', fontSize: 11, paddingLeft: 20 }}>classifying…</div>
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
          placeholder="Guide your cells — collect nutrients, attack, defend… but they have a mind of their own."
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
