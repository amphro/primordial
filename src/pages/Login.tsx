import { s } from '../lib/styles'

export default function Login() {
  return (
    <div style={s.center}>
      <div style={s.card}>
        <h1 style={{ fontSize: 32, letterSpacing: 8, color: '#4a9eff', marginBottom: 8 }}>PRIMORDIAL</h1>
        <p style={{ color: '#5a7a9a', marginBottom: 40, fontSize: 13 }}>
          A cellular battle of wills.
        </p>
        <a href="/auth/google" style={s.primaryButton}>
          Sign in with Google
        </a>
      </div>
    </div>
  )
}
