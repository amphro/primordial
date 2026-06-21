import { useEffect, useRef, useState, useCallback } from 'react'

export interface StateMsg {
  type: 'state'
  phase: 'lobby' | 'active' | 'finished'
  round: number
  totalRounds: number
  scores: { blue: number; red: number }
  cells: { blue: number; red: number }
  promptStatus: { blue: 'locked' | 'waiting'; red: 'locked' | 'waiting' }
  players: Array<{ userId: string; displayName: string; color: 'blue' | 'red' }>
  grid: number[]
  nutrients: number[]
  alarmFiresAt: number
}

export interface ResolveMsg {
  type: 'resolve'
  round: number
  blue: { prompt: string; action: string; zone: string; intensity: string } | null
  red:  { prompt: string; action: string; zone: string; intensity: string } | null
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
}

export function useGameSocket(code: string | undefined, onMessage: (msg: GameMsg) => void): UseGameSocketResult {
  const [connected, setConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<GameMsg | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    if (!code) return
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/api/games/${code}/ws`)
    wsRef.current = ws

    ws.onopen  = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
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
    connect()
    return () => {
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  return { connected, lastMessage }
}
