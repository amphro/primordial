import { useNavigate } from 'react-router-dom'
import { s } from '../lib/styles'
import Logo from '../components/Logo'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div style={s.center}>
      <div style={{ ...s.card, textAlign: 'center' }}>
        <Logo size={28} />
        <div style={{ fontSize: 48, fontWeight: 700, color: 'var(--clr-border-hi)', letterSpacing: 4, margin: '12px 0 4px' }}>
          404
        </div>
        <p style={{ color: 'var(--clr-text-dim)', fontSize: 13, marginBottom: 32 }}>
          That game doesn't exist or the link is wrong.
        </p>
        <button style={{ ...s.primaryButton, width: '100%' }} onClick={() => navigate('/')}>
          Play New Game
        </button>
      </div>
    </div>
  )
}
