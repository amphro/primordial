import { useEffect, useRef, useState, useCallback } from 'react'

export interface StateMsg {
  type: 'state'
  phase: 'lobby' | 'active' | 'finished'
  round: number
  totalRounds: number
  promptTimerMs: number
  scores: { blue: number; red: number }
  cells: { blue: number; red: number }
  promptStatus: { blue: 'locked' | 'waiting'; red: 'locked' | 'waiting' }
  players: Array<{ userId: string; displayName: string; color: 'blue' | 'red' }>
  grid: number[]
  nutrients: number[]
  armor: number[]
  starvation: number[]
  gridW: number
  gridH: number
  alarmFiresAt: number
}

export interface PlayerResolve {
  prompt: string
  action: string
  zone: string
  intensity: string
  delta: number
}

export interface ResolveMsg {
  type: 'resolve'
  round: number
  blue: PlayerResolve | null
  red:  PlayerResolve | null
}

export interface GameOverMsg {
  type: 'game_over'
  winner: 'blue' | 'red'
  winReason: 'threshold' | 'rounds'
  scores: { blue: number; red: number }
}

export type GameMsg =
  | StateMsg
  | ResolveMsg
  | GameOverMsg
  | { type: string; [key: string]: unknown }

interface UseGameSocketResult {
  connected: boolean
  lastMessage: GameMsg | null
  goneError: boolean  // true when server returned 410 (game finished)
}

export function useGameSocket(code: string | undefined, onMessage: (msg: GameMsg) => void): UseGameSocketResult {
  const [connected, setConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<GameMsg | null>(null)
  const [goneError, setGoneError] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  const closingRef = useRef(false)  // true when we're intentionally closing (unmount/navigate)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    if (!code) return
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/api/games/${code}/ws`)
    wsRef.current = ws

    ws.onopen  = () => {
      setConnected(true)
      closingRef.current = false
    }
    ws.onerror = (e) => console.error('[ws] error', e)
    ws.onclose = (e) => {
      setConnected(false)
      console.warn('[ws] closed code=%d reason=%s', e.code, e.reason || '(none)')

      // Don't reconnect on intentional close (component unmounting/navigating away)
      if (closingRef.current) return

      // Explicit server game-over close
      if (e.code === 4010 || e.code === 4410) {
        setGoneError(true)
        return
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
    connect()
    return () => {
      closingRef.current = true
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  return { connected, lastMessage, goneError }
}
