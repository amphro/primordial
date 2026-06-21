import { useRef, useEffect } from 'react'

const CELL_COLOR = ['#0a1020', '#4a9eff', '#ff6b4a', '#1a4488', '#882010'] as const
// 0=empty, 1=blue, 2=red, 3=wall_blue, 4=wall_red

interface Props {
  grid: number[]
  nutrients: number[]
  gridW?: number
  gridH?: number
  size?: number
}

export default function GameCanvas({ grid, nutrients, gridW = 40, gridH = 40, size = 480 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || grid.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cw = size / gridW
    const ch = size / gridH

    ctx.fillStyle = '#080e1a'
    ctx.fillRect(0, 0, size, size)

    // Draw cells
    for (let i = 0; i < grid.length; i++) {
      const v = grid[i]
      if (v === 0) continue
      const x = (i % gridW) * cw
      const y = Math.floor(i / gridW) * ch
      ctx.fillStyle = CELL_COLOR[v] ?? '#0a1020'
      ctx.fillRect(x + 0.5, y + 0.5, cw - 1, ch - 1)
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
  }, [grid, nutrients, gridW, gridH, size])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ display: 'block', border: '1px solid #1e3050', borderRadius: 4 }}
    />
  )
}
