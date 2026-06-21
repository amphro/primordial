import { useEffect, useRef, useState, useCallback } from 'react'

export interface GameStateMsg {
  type: 'state'
  phase: 'lobby' | 'active' | 'finished'
  players: Array<{ userId: string; displayName: string; color: 'blue' | 'red' }>
}

export interface GameOverMsg {
  type: 'game_over'
  winner: 'blue' | 'red' | null
  message?: string
}

export type GameMsg = GameStateMsg | GameOverMsg | { type: string; [key: string]: unknown }

interface UseGameSocketResult {
  connected: boolean
  lastMessage: GameMsg | null
}

export function useGameSocket(code: string | undefined, onMessage: (msg: GameMsg) => void): UseGameSocketResult {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    if (!code) return
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/api/games/${code}/ws`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
      // Reconnect after 2s if not intentionally closed
      setTimeout(connect, 2000)
    }
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as GameMsg
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

  const [lastMessage, setLastMessage] = useState<GameMsg | null>(null)
  useEffect(() => {
    const original = onMessageRef.current
    onMessageRef.current = (msg) => {
      setLastMessage(msg)
      original(msg)
    }
  }, [])

  return { connected, lastMessage }
}
