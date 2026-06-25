import { useState, useRef } from 'react'

interface Props {
  text: string
  children: React.ReactNode
  delay?: number
}

export default function Tooltip({ text, children, delay = 400 }: Props) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function show(e: React.MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: r.top - 8 })
    timerRef.current = setTimeout(() => setVisible(true), delay)
  }

  function hide() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }

  return (
    <span style={{ position: 'relative', display: 'inline-block' }} onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <div style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          transform: 'translate(-50%, -100%)',
          background: 'var(--clr-tooltip-bg)',
          border: '1px solid var(--clr-tooltip-border)',
          borderRadius: 4,
          padding: '5px 9px',
          fontSize: 11,
          color: 'var(--clr-tooltip-text)',
          whiteSpace: 'pre-line',
          maxWidth: 220,
          lineHeight: 1.5,
          zIndex: 9999,
          pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        }}>
          {text}
        </div>
      )}
    </span>
  )
}
