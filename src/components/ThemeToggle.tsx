import { useState } from 'react'

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'dark')

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    setTheme(next)
    try { localStorage.setItem('theme', next) } catch { /* private mode or quota */ }
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        background: 'none',
        border: '1px solid var(--clr-border)',
        color: 'var(--clr-text-muted)',
        fontFamily: 'monospace',
        fontSize: 13,
        padding: '2px 7px',
        borderRadius: 3,
        cursor: 'pointer',
        lineHeight: 1,
      }}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  )
}
