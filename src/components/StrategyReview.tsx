import type { Strategy } from '@shared/strategy'
import { describeStrategy } from '../lib/strategyText'
import { s } from '../lib/styles'

interface Props {
  strategy: Strategy
  readback: string | null
  myColor: 'blue' | 'red'
  onEdit: () => void
  onConfirm: () => void
  confirming: boolean
}

export default function StrategyReview({ strategy, readback, myColor, onEdit, onConfirm, confirming }: Props) {
  const accentColor = myColor === 'blue' ? 'var(--clr-blue)' : 'var(--clr-red)'
  const lines = describeStrategy(strategy)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {readback && (
        <div style={{ color: 'var(--clr-text-secondary)', fontSize: 13, fontStyle: 'italic', borderLeft: `2px solid ${accentColor}`, paddingLeft: 10, lineHeight: 1.5 }}>
          {readback}
        </div>
      )}

      <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 4, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ color: 'var(--clr-text-dim)', fontSize: 10, letterSpacing: 2, marginBottom: 4 }}>YOUR STRATEGY</div>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ color: accentColor, fontSize: 11, minWidth: 18, flexShrink: 0, marginTop: 2 }}>
              {i < lines.length - 1 ? `${i + 1}.` : '→'}
            </span>
            <span style={{ color: 'var(--clr-text)', fontSize: 13, lineHeight: 1.5 }}>{line}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onEdit}
          disabled={confirming}
          style={{ ...s.ghostButton, flex: 1, fontSize: 13, padding: '10px 16px' }}
        >
          Edit
        </button>
        <button
          onClick={onConfirm}
          disabled={confirming}
          style={{ ...s.primaryButton, flex: 2, background: accentColor, fontSize: 13, padding: '10px 20px', opacity: confirming ? 0.6 : 1 }}
        >
          {confirming ? 'Starting…' : 'Start Battle →'}
        </button>
      </div>
    </div>
  )
}
