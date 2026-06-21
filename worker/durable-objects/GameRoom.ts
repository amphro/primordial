import { DurableObject } from 'cloudflare:workers'

interface Env {
  DB: D1Database
  KV: KVNamespace
  AI: Ai
  AE: AnalyticsEngineDataset
  SESSION_SECRET: string
}

interface ConnectedPlayer {
  ws: WebSocket
  userId: string
  displayName: string
  color: 'blue' | 'red'
}

// Phase 1 stub: handles WebSocket connections and a "finish game" broadcast.
// Game engine (tick loop, sim, AI classify) added in Phase 2.
export class GameRoom extends DurableObject<Env> {
  private players = new Map<string, ConnectedPlayer>()
  private gameCode = ''
  private phase: 'lobby' | 'active' | 'finished' = 'lobby'

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/init') return this.handleInit(request)
    if (url.pathname === '/prompt') return this.handlePrompt(request)
    if (url.pathname === '/finish') return this.handleFinish()

    // WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader?.toLowerCase() === 'websocket') return this.handleWebSocket(request)

    return new Response('Not found', { status: 404 })
  }

  private async handleInit(request: Request): Promise<Response> {
    const body = await request.json() as { code: string }
    this.gameCode = body.code
    this.phase = 'active'
    await this.ctx.storage.put('gameCode', this.gameCode)
    await this.ctx.storage.put('phase', this.phase)
    return new Response('ok')
  }

  private handleWebSocket(request: Request): Response {
    const userId = request.headers.get('X-User-Id') ?? ''
    const displayName = request.headers.get('X-Display-Name') ?? 'Player'

    if (!userId) return new Response('Unauthorized', { status: 401 })

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket]

    this.ctx.acceptWebSocket(server)

    // Determine color from existing players
    const existingColors = new Set([...this.players.values()].map(p => p.color))
    const color: 'blue' | 'red' = existingColors.has('blue') ? 'red' : 'blue'

    this.players.set(userId, { ws: server, userId, displayName, color })

    // Send current state immediately
    const state = this.buildStateMessage()
    server.send(JSON.stringify(state))

    // Notify others
    this.broadcast({ type: 'player_joined', displayName, color }, userId)

    server.addEventListener('message', (_event) => {
      // Client messages not needed in Phase 1 — prompts go via HTTP POST
    })

    server.addEventListener('close', () => {
      this.players.delete(userId)
      this.broadcast({ type: 'player_left', displayName, color })
    })

    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket })
  }

  private async handlePrompt(_request: Request): Promise<Response> {
    // Phase 2: classify prompt and queue for next tick
    // Phase 1 stub: just acknowledge
    return new Response(JSON.stringify({ queued: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  private async handleFinish(): Promise<Response> {
    this.phase = 'finished'
    await this.ctx.storage.put('phase', 'finished')

    // Broadcast game over to all players (stub — no real winner yet)
    this.broadcast({
      type: 'game_over',
      winner: null,
      message: 'Game ended by player',
    })

    return new Response('ok')
  }

  private broadcast(message: unknown, excludeUserId?: string): void {
    const data = JSON.stringify(message)
    for (const [userId, player] of this.players) {
      if (userId !== excludeUserId) {
        try { player.ws.send(data) } catch { /* client disconnected */ }
      }
    }
  }

  private buildStateMessage() {
    return {
      type: 'state',
      phase: this.phase,
      players: [...this.players.values()].map(p => ({
        userId: p.userId,
        displayName: p.displayName,
        color: p.color,
      })),
    }
  }
}
