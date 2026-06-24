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
  toxin?: number[]
  anim?: AnimEvent | null
  gridW?: number
  gridH?: number
  size?: number
}

// Returns [x, y, width, height] of the zone in canvas coordinates
function zoneBounds(zone: string, size: number): [number, number, number, number] {
  const h = size / 2
  switch (zone) {
    case 'NORTH': return [0, 0, size, h]
    case 'SOUTH': return [0, h, size, h]
    case 'EAST':  return [h, 0, h, size]
    case 'WEST':  return [0, 0, h, size]
    default:      return [0, 0, size, size]
  }
}

function drawEffect(ctx: CanvasRenderingContext2D, effect: AnimEffect, t: number, size: number): void {
  const rgb = effect.color === 'blue' ? '74, 158, 255' : '255, 107, 74'
  const [bx, by, bw, bh] = zoneBounds(effect.zone, size)
  const cx = bx + bw / 2
  const cy = by + bh / 2
  const pulse = Math.sin(t * Math.PI) // 0 → peak → 0

  switch (effect.action) {
    case 'GROW': {
      // Zone-wide radial bloom — cells lighting up across the zone, not particles from center
      const maxR = Math.sqrt(bw * bw + bh * bh) * 0.65
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR)
      grad.addColorStop(0,   `rgba(${rgb}, ${pulse * 0.55})`)
      grad.addColorStop(0.6, `rgba(${rgb}, ${pulse * 0.22})`)
      grad.addColorStop(1,   `rgba(${rgb}, 0)`)
      ctx.fillStyle = grad
      ctx.fillRect(bx, by, bw, bh)
      break
    }
    case 'PULSE': {
      // Three concentric shockwave rings from zone center
      for (let ring = 0; ring < 3; ring++) {
        const rt = Math.max(0, t - ring * 0.2)
        const r = rt * Math.max(bw, bh) * 0.7
        const a = Math.max(0, (1 - rt) * 0.85)
        ctx.strokeStyle = `rgba(${rgb}, ${a})`
        ctx.lineWidth = 4 - ring
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    }
    case 'HUNT': {
      // Targeting reticle — cells locking onto prey in the zone
      const r = Math.min(bw, bh) * (0.18 + 0.1 * t)
      const fade = Math.max(0, 1 - t)
      const scanAngle = t * Math.PI * 4  // two full sweeps
      ctx.strokeStyle = `rgba(${rgb}, ${fade * 0.75})`
      ctx.lineWidth = 1.5
      // Target ring
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
      // 4 crosshair ticks extending outward from ring
      const tick = r * 0.5
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
        ctx.beginPath()
        ctx.moveTo(cx + dx * r, cy + dy * r)
        ctx.lineTo(cx + dx * (r + tick), cy + dy * (r + tick))
        ctx.stroke()
      }
      // Scanning arc (bright, rotating sweep)
      ctx.strokeStyle = `rgba(${rgb}, ${Math.min(1, fade * 2)})`
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(cx, cy, r, scanAngle, scanAngle + Math.PI * 0.45)
      ctx.stroke()
      break
    }
    case 'ARMOR': {
      // Pulsing shield border + inner radial glow
      ctx.strokeStyle = `rgba(${rgb}, ${pulse * 0.9})`
      ctx.lineWidth = pulse * 6
      ctx.strokeRect(bx + 3, by + 3, bw - 6, bh - 6)
      const maxR2 = Math.max(bw, bh) * 0.55
      const grad2 = ctx.createRadialGradient(cx, cy, maxR2 * 0.25, cx, cy, maxR2)
      grad2.addColorStop(0, `rgba(${rgb}, 0)`)
      grad2.addColorStop(1, `rgba(${rgb}, ${pulse * 0.22})`)
      ctx.fillStyle = grad2
      ctx.fillRect(bx, by, bw, bh)
      break
    }
  }
}

const BIRTH_DURATION = 650  // ms for new-cell bloom

export default function GameCanvas({ grid, nutrients, armor, starvation, toxin, anim, gridW = 40, gridH = 40, size = 480 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<AnimEvent | null>(null)
  const frameRef = useRef<number>(0)
  const prevGridRef = useRef<number[]>([])
  const birthCellsRef = useRef<{ i: number; color: number; ts: number }[]>([])

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

    // Draw toxin overlay (green tint; brightness proportional to remaining ticks)
    if (toxin) {
      for (let i = 0; i < toxin.length; i++) {
        const tv = toxin[i]
        if (tv === 0) continue
        const ticks = tv & 0x7F
        const alpha = (ticks / 7) * 0.38
        const x = (i % gridW) * cw
        const y = Math.floor(i / gridW) * ch
        ctx.fillStyle = `rgba(60, 230, 80, ${alpha})`
        ctx.fillRect(x, y, cw, ch)
      }
    }
  }, [grid, nutrients, armor, starvation, toxin, gridW, gridH, size])

  // Animation overlay — zone effects + per-cell birth blooms
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')
    if (!ctx) return

    cancelAnimationFrame(frameRef.current)

    // Detect newly born cells by diffing previous grid (skip first render when prevGrid is empty)
    if (prevGridRef.current.length > 0 && prevGridRef.current.length === grid.length) {
      const ts = Date.now()
      const born: { i: number; color: number; ts: number }[] = []
      for (let i = 0; i < grid.length; i++) {
        if (prevGridRef.current[i] === 0 && grid[i] !== 0) born.push({ i, color: grid[i], ts })
      }
      if (born.length > 0) birthCellsRef.current = born
    }
    if (grid.length > 0) prevGridRef.current = [...grid]

    const nothingToAnimate = !anim && birthCellsRef.current.length === 0
    if (nothingToAnimate) {
      animRef.current = null
      ctx.clearRect(0, 0, size, size)
      return
    }

    animRef.current = anim ?? null

    const cw = size / gridW
    const ch = size / gridH

    const draw = () => {
      const ev = animRef.current
      const cells = birthCellsRef.current
      const now = Date.now()

      const animElapsed = ev ? now - ev.startedAt : Infinity
      const birthElapsed = cells.length > 0 ? now - cells[0].ts : Infinity
      const animDone  = animElapsed  > 1200
      const birthDone = birthElapsed > BIRTH_DURATION

      if (animDone && birthDone) {
        ctx.clearRect(0, 0, size, size)
        if (birthDone) birthCellsRef.current = []
        return
      }

      ctx.clearRect(0, 0, size, size)

      // Zone effects (GROW glow, PULSE rings, HUNT reticle, ARMOR shield)
      if (ev && !animDone) {
        const t = animElapsed / 1200
        for (const effect of ev.effects) drawEffect(ctx, effect, t, size)
      }

      // Per-cell birth blooms: cells pop in large and contract/fade to nothing
      if (cells.length > 0 && !birthDone) {
        const t = birthElapsed / BIRTH_DURATION
        const scale = 1.0 + (1 - t) * 0.7   // 1.7x → 1.0x
        const alpha = (1 - t) * 0.8
        ctx.globalAlpha = alpha
        for (const { i, color } of cells) {
          const rgb = color === 1 ? '74, 158, 255' : '255, 107, 74'
          const gx = i % gridW
          const gy = Math.floor(i / gridW)
          const x = (gx + 0.5) * cw
          const y = (gy + 0.5) * ch
          ctx.fillStyle = `rgba(${rgb}, 1)`
          ctx.beginPath()
          ctx.arc(x, y, cw * 0.5 * scale, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }

      frameRef.current = requestAnimationFrame(draw)
    }

    frameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameRef.current)
  }, [anim, grid, gridW, gridH, size])

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
