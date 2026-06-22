import { useRef, useEffect } from 'react'

const CELL_COLOR = ['#0a1020', '#4a9eff', '#ff6b4a', '#1a4488', '#882010'] as const

export interface AnimEffect {
  action: string
  zone: string
  color: 'blue' | 'red'
}

export interface AnimEvent {
  effects: AnimEffect[]
  startedAt: number
}

interface Props {
  grid: number[]
  nutrients: number[]
  armor?: number[]
  starvation?: number[]
  anim?: AnimEvent | null
  gridW?: number
  gridH?: number
  size?: number
}

function getZoneCx(zone: string, size: number): number {
  if (zone === 'WEST') return size * 0.25
  if (zone === 'EAST') return size * 0.75
  return size * 0.5
}

function getZoneCy(zone: string, size: number): number {
  if (zone === 'NORTH') return size * 0.25
  if (zone === 'SOUTH') return size * 0.75
  return size * 0.5
}

function drawEffect(ctx: CanvasRenderingContext2D, effect: AnimEffect, t: number, size: number): void {
  const cx = getZoneCx(effect.zone, size)
  const cy = getZoneCy(effect.zone, size)
  const alpha = 1 - t
  const rgb = effect.color === 'blue' ? '74, 158, 255' : '255, 107, 74'

  switch (effect.action) {
    case 'PULSE': {
      for (let ring = 0; ring < 3; ring++) {
        const rt = Math.max(0, t - ring * 0.18)
        const r = rt * size * 0.48
        const a = Math.max(0, (1 - rt) * 0.85)
        ctx.strokeStyle = `rgba(${rgb}, ${a})`
        ctx.lineWidth = 3 - ring * 0.8
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    }
    case 'GROW': {
      const numDots = 10
      for (let i = 0; i < numDots; i++) {
        const angle = (i / numDots) * Math.PI * 2
        const r = t * size * 0.38
        const x = cx + Math.cos(angle) * r
        const y = cy + Math.sin(angle) * r
        const a = Math.max(0, alpha * 0.9)
        ctx.fillStyle = `rgba(${rgb}, ${a})`
        ctx.beginPath()
        ctx.arc(x, y, Math.max(0.5, (1 - t) * 5), 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'HUNT': {
      const numArrows = 6
      for (let i = 0; i < numArrows; i++) {
        const angle = (i / numArrows) * Math.PI * 2
        const startR = size * 0.46
        const endR = size * 0.08
        const currentR = startR - t * (startR - endR)
        const x = cx + Math.cos(angle) * currentR
        const y = cy + Math.sin(angle) * currentR
        const a = Math.max(0, alpha * 0.85)
        const tailLen = 14 * Math.min(1, t * 3)
        ctx.strokeStyle = `rgba(${rgb}, ${a})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(
          x + Math.cos(angle + Math.PI) * tailLen,
          y + Math.sin(angle + Math.PI) * tailLen,
        )
        ctx.stroke()
      }
      break
    }
    case 'ARMOR': {
      const shieldT = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65
      const r = shieldT * size * 0.32
      const a = shieldT * 0.9
      ctx.strokeStyle = `rgba(${rgb}, ${a})`
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = `rgba(255, 255, 255, ${a * 0.4})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.65, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
  }
}

export default function GameCanvas({ grid, nutrients, armor, starvation, anim, gridW = 40, gridH = 40, size = 480 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<AnimEvent | null>(null)
  const frameRef = useRef<number>(0)

  // Main grid render
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || grid.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cw = size / gridW
    const ch = size / gridH

    ctx.fillStyle = '#080e1a'
    ctx.fillRect(0, 0, size, size)

    // Draw cells with starvation opacity
    for (let i = 0; i < grid.length; i++) {
      const v = grid[i]
      if (v === 0) continue
      const x = (i % gridW) * cw
      const y = Math.floor(i / gridW) * ch
      const starv = starvation?.[i] ?? 0
      ctx.globalAlpha = starv >= 2 ? 0.32 : starv === 1 ? 0.62 : 1
      ctx.fillStyle = CELL_COLOR[v] ?? '#0a1020'
      ctx.fillRect(x + 0.5, y + 0.5, cw - 1, ch - 1)
    }
    ctx.globalAlpha = 1

    // Draw armor rings on armored cells
    if (armor) {
      for (let i = 0; i < grid.length; i++) {
        if (!armor[i] || grid[i] === 0) continue
        const x = (i % gridW) * cw
        const y = Math.floor(i / gridW) * ch
        const bright = armor[i] >= 2 ? '#ffffff' : (grid[i] === 1 ? '#88ccff' : '#ffaa88')
        ctx.strokeStyle = bright
        ctx.globalAlpha = armor[i] >= 2 ? 0.9 : 0.6
        ctx.lineWidth = 1
        ctx.strokeRect(x + 1, y + 1, cw - 2, ch - 2)
      }
      ctx.globalAlpha = 1
    }

    // Draw nutrient dots on empty tiles
    ctx.fillStyle = 'rgba(255, 220, 80, 0.55)'
    for (let i = 0; i < nutrients.length; i++) {
      if (nutrients[i] === 0 || grid[i] !== 0) continue
      const x = (i % gridW) * cw + cw / 2
      const y = Math.floor(i / gridW) * ch + ch / 2
      ctx.beginPath()
      ctx.arc(x, y, Math.max(1, cw * 0.22), 0, Math.PI * 2)
      ctx.fill()
    }
  }, [grid, nutrients, armor, starvation, gridW, gridH, size])

  // Animation overlay
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')
    if (!ctx) return

    cancelAnimationFrame(frameRef.current)
    ctx.clearRect(0, 0, size, size)

    if (!anim) {
      animRef.current = null
      return
    }

    animRef.current = anim

    const draw = () => {
      const ev = animRef.current
      if (!ev) return
      const elapsed = Date.now() - ev.startedAt
      if (elapsed > 750) {
        ctx.clearRect(0, 0, size, size)
        return
      }
      ctx.clearRect(0, 0, size, size)
      const t = elapsed / 750
      for (const effect of ev.effects) {
        drawEffect(ctx, effect, t, size)
      }
      frameRef.current = requestAnimationFrame(draw)
    }

    frameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameRef.current)
  }, [anim, size])

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: size }}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: '1', border: '1px solid #1e3050', borderRadius: 4 }}
      />
      <canvas
        ref={overlayRef}
        width={size}
        height={size}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 4, pointerEvents: 'none' }}
      />
    </div>
  )
}
