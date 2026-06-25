import { useEffect, useRef, useState, useCallback } from 'react'
import type { GameResolution, BoardEvent } from '@shared/sim/runGame'
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
  nutrientType?: number[]
  blueResources?: number
  redResources?: number
  events?: BoardEvent[]
  blueStrategy?: Strategy | null
  redStrategy?: Strategy | null
}

export interface StrategyLockedMsg {
  type: 'strategy_locked'
  color: 'blue' | 'red'
  readback: string
  strategy?: Strategy
  latencyMs: number
  tokenUsage?: { promptTokens: number; completionTokens: number } | null
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
  const everConnectedRef = useRef(false)
  const failedAttemptsRef = useRef(0)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    if (!code) return
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/api/games/${code}/ws`)
    wsRef.current = ws

    ws.onopen  = () => {
      setConnected(true)
      closingRef.current = false
      everConnectedRef.current = true
      failedAttemptsRef.current = 0
    }
    ws.onerror = (e) => console.error('[ws] error', e)
    ws.onclose = (e) => {
      setConnected(false)
      console.warn('[ws] closed code=%d reason=%s', e.code, e.reason || '(none)')
      if (closingRef.current) return
      if (e.code === 4010 || e.code === 4410) { setGoneError(true); return }
      // Abnormal close before ever connecting — likely game not found (HTTP 404 on upgrade)
      if (e.code === 1006 && !everConnectedRef.current) {
        failedAttemptsRef.current += 1
        if (failedAttemptsRef.current >= 3) { setGoneError(true); return }
      }
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
    everConnectedRef.current = false
    failedAttemptsRef.current = 0
    connect()
    return () => {
      closingRef.current = true
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  return { connected, lastMessage, goneError }
}
