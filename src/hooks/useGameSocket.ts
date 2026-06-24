import { useEffect, useRef, useState, useCallback } from 'react'
import type { GameResolution } from '@shared/sim/runGame'
import type { Strategy } from '@shared/strategy'

export interface StateMsg {
  type: 'state'
  phase: 'lobby' | 'waiting' | 'resolved' | 'finished'
  seed: number
  totalRounds: number
  gridW: number
  gridH: number
  strategyStatus: { blue: 'waiting' | 'locked'; red: 'waiting' | 'locked' }
  strategyReadback: { blue: string | null; red: string | null }
  players: Array<{ userId: string; displayName: string; color: 'blue' | 'red' }>
  deadlineAt: number
  grid: number[]
  nutrients: number[]
  armor: number[]
  starvation: number[]
  toxin?: number[]
  blueStrategy?: Strategy | null
  redStrategy?: Strategy | null
}

export interface StrategyLockedMsg {
  type: 'strategy_locked'
  color: 'blue' | 'red'
  readback: string
  strategy?: Strategy
  latencyMs: number
}

export interface ResolutionMsg extends GameResolution {
  type: 'resolution'
}

export interface GameOverMsg {
  type: 'game_over'
  winner: 'blue' | 'red'
  winReason: 'threshold' | 'rounds'
  scores: { blue: number; red: number }
}

export type GameMsg =
  | StateMsg
  | StrategyLockedMsg
  | ResolutionMsg
  | GameOverMsg
  | { type: string; [key: string]: unknown }

interface UseGameSocketResult {
  connected: boolean
  lastMessage: GameMsg | null
  goneError: boolean
}

export function useGameSocket(code: string | undefined, onMessage: (msg: GameMsg) => void): UseGameSocketResult {
  const [connected, setConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<GameMsg | null>(null)
  const [goneError, setGoneError] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  const closingRef = useRef(false)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    if (!code) return
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/api/games/${code}/ws`)
    wsRef.current = ws

    ws.onopen  = () => { setConnected(true); closingRef.current = false }
    ws.onerror = (e) => console.error('[ws] error', e)
    ws.onclose = (e) => {
      setConnected(false)
      console.warn('[ws] closed code=%d reason=%s', e.code, e.reason || '(none)')
      if (closingRef.current) return
      if (e.code === 4010 || e.code === 4410) { setGoneError(true); return }
      setTimeout(connect, 2000)
    }
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as GameMsg
        setLastMessage(msg)
        onMessageRef.current(msg)
      } catch { /* ignore malformed */ }
    }
  }, [code])

  useEffect(() => {
    closingRef.current = false
    connect()
    return () => {
      closingRef.current = true
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  return { connected, lastMessage, goneError }
}
