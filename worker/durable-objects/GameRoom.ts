import { DurableObject } from 'cloudflare:workers'
import { DEFAULT_CONFIG, loadConfig, type GameConfig } from '../lib/config'
import { initGrid, simulateTick, type GridState, type Action, type Zone, type Intensity } from './simulation'
import { classifyPrompt } from './classifier'
import { writeTickResolved, writePromptClassified, writeCounterTriggered, writeGameOver } from './analytics'

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

interface StoredPrompt {
  text: string
  action: Action
  zone: Zone
  intensity: Intensity
  lockedAt: number
}

export class GameRoom extends DurableObject<Env> {
  // Ephemeral (reset on eviction — recovered via storage on next request)
  private players = new Map<string, ConnectedPlayer>()

  // Persisted in DO storage (rehydrated in constructor)
  private gameCode = ''
  private phase: 'lobby' | 'active' | 'finished' = 'lobby'
  private config: GameConfig = DEFAULT_CONFIG
  private round = 0
  private alarmFiresAt = 0
  private gridState: GridState | null = null
  private promptBlue: StoredPrompt | null = null
  private promptRed: StoredPrompt | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Rehydrate from storage so DO recovers correctly after eviction
    ctx.blockConcurrencyWhile(async () => {
      this.gameCode     = (await ctx.storage.get<string>('gameCode')) ?? ''
      this.phase        = (await ctx.storage.get<'lobby' | 'active' | 'finished'>('phase')) ?? 'lobby'
      this.round        = (await ctx.storage.get<number>('round')) ?? 0
      this.alarmFiresAt = (await ctx.storage.get<number>('alarmFiresAt')) ?? 0
      const storedConfig = await ctx.storage.get<GameConfig>('config')
      if (storedConfig) this.config = storedConfig

      const grid             = await ctx.storage.get<Uint8Array>('grid')
      const nutrients        = await ctx.storage.get<Uint8Array>('nutrients')
      const nutrientCooldown = await ctx.storage.get<Uint8Array>('nutrientCooldown')
      const starvation       = await ctx.storage.get<Uint8Array>('starvation')
      const armor            = await ctx.storage.get<Uint8Array>('armor')
      const wallAge          = await ctx.storage.get<Uint8Array>('wallAge')

      if (grid && nutrients) {
        const size = this.config.gridWidth * this.config.gridHeight
        this.gridState = {
          grid,
          nutrients,
          nutrientCooldown: nutrientCooldown ?? new Uint8Array(size),
          starvation:       starvation       ?? new Uint8Array(size),
          armor:            armor            ?? new Uint8Array(size),
          wallAge:          wallAge          ?? new Uint8Array(size),
        }
      }

      this.promptBlue = (await ctx.storage.get<StoredPrompt>('promptBlue')) ?? null
      this.promptRed  = (await ctx.storage.get<StoredPrompt>('promptRed'))  ?? null
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/init')   return this.handleInit(request)
    if (url.pathname === '/prompt') return this.handlePrompt(request)
    if (url.pathname === '/finish') return this.handleFinish()

    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader?.toLowerCase() === 'websocket') return this.handleWebSocket(request)

    return new Response('Not found', { status: 404 })
  }

  // ── alarm (tick loop) ─────────────────────────────────────────────────────

  async alarm(): Promise<void> {
    if (this.phase !== 'active' || !this.gridState) return

    const blueSpec = this.promptBlue
      ? { action: this.promptBlue.action, zone: this.promptBlue.zone, intensity: this.promptBlue.intensity }
      : null
    const redSpec = this.promptRed
      ? { action: this.promptRed.action, zone: this.promptRed.zone, intensity: this.promptRed.intensity }
      : null

    const result = simulateTick(
      this.gridState,
      this.round,
      this.config,
      blueSpec,
      redSpec,
      Math.random,
    )

    this.gridState = result.state
    this.round++

    // Write analytics
    writeTickResolved(this.env.AE, {
      gameCode: this.gameCode,
      round: this.round,
      blueAction: blueSpec?.action ?? 'GROW', blueZone: blueSpec?.zone ?? 'ALL', blueIntensity: blueSpec?.intensity ?? 'CAUTIOUS',
      redAction:  redSpec?.action  ?? 'GROW', redZone:  redSpec?.zone  ?? 'ALL', redIntensity:  redSpec?.intensity  ?? 'CAUTIOUS',
      bluePct: result.bluePct, redPct: result.redPct,
      blueCells: result.blueCells, redCells: result.redCells,
    })

    for (const counter of result.counters) {
      writeCounterTriggered(this.env.AE, {
        gameCode: this.gameCode,
        round: this.round,
        winnerAction: counter.winner,
        loserAction: counter.loser,
        zone: counter.zone,
        reduction: counter.reduction,
      })
    }

    // Broadcast resolve (what both prompts were this tick) before clearing them
    this.broadcast({
      type: 'resolve',
      round: this.round,
      blue: this.promptBlue ? { prompt: this.promptBlue.text, action: this.promptBlue.action, zone: this.promptBlue.zone, intensity: this.promptBlue.intensity } : null,
      red:  this.promptRed  ? { prompt: this.promptRed.text,  action: this.promptRed.action,  zone: this.promptRed.zone,  intensity: this.promptRed.intensity  } : null,
    })

    // Persist updated state and clear prompts
    await this.persistGridState()
    await this.ctx.storage.put('round', this.round)
    await this.clearPrompts()

    if (result.winner) {
      await this.endGame(result.winner, result.winner !== null && (result.bluePct >= this.config.winThresholdPct || result.redPct >= this.config.winThresholdPct) ? 'threshold' : 'rounds', result.bluePct, result.redPct)
    } else {
      // Schedule next tick and update timer
      this.alarmFiresAt = Date.now() + this.config.promptTimerMs
      await this.ctx.storage.put('alarmFiresAt', this.alarmFiresAt)
      await this.ctx.storage.setAlarm(this.alarmFiresAt)
    }

    // Broadcast new state after resolve so clients update the board
    this.broadcastState(result.bluePct, result.redPct)
  }

  // ── routes ────────────────────────────────────────────────────────────────

  private async handleInit(request: Request): Promise<Response> {
    const body = await request.json() as { code: string; gameSettings?: Partial<GameConfig> }
    this.gameCode = body.code
    this.phase = 'active'
    this.round = 0

    // Load config: KV balance + per-game overrides
    const baseConfig = await loadConfig(this.env.KV)
    this.config = body.gameSettings
      ? { ...baseConfig, ...body.gameSettings }
      : baseConfig

    // Init grid
    this.gridState = initGrid(this.config, Math.random)

    // Persist everything
    await this.ctx.storage.put('gameCode', this.gameCode)
    await this.ctx.storage.put('phase', this.phase)
    await this.ctx.storage.put('round', this.round)
    await this.ctx.storage.put('config', this.config)
    await this.persistGridState()

    // Start tick loop
    this.alarmFiresAt = Date.now() + this.config.promptTimerMs
    await this.ctx.storage.put('alarmFiresAt', this.alarmFiresAt)
    await this.ctx.storage.setAlarm(this.alarmFiresAt)

    return new Response('ok')
  }

  private async handlePrompt(request: Request): Promise<Response> {
    if (this.phase !== 'active') return new Response(JSON.stringify({ error: 'Game not active' }), { status: 409 })

    const body = await request.json() as { color: 'blue' | 'red'; prompt: string }
    const { color, prompt } = body

    // Check if already locked
    if (color === 'blue' && this.promptBlue) return new Response(JSON.stringify({ error: 'Already locked' }), { status: 409 })
    if (color === 'red'  && this.promptRed)  return new Response(JSON.stringify({ error: 'Already locked' }), { status: 409 })

    // Classify the prompt (at submit-time, never in alarm)
    const { classification, latencyMs } = await classifyPrompt(prompt, this.env.AI)

    writePromptClassified(this.env.AE, {
      gameCode: this.gameCode,
      round: this.round,
      playerColor: color,
      action: classification.action,
      zone: classification.zone,
      intensity: classification.intensity,
      rawPrompt: prompt,
      latencyMs,
    })

    const stored: StoredPrompt = {
      text: prompt,
      action: classification.action,
      zone: classification.zone,
      intensity: classification.intensity,
      lockedAt: Date.now(),
    }

    if (color === 'blue') {
      this.promptBlue = stored
      await this.ctx.storage.put('promptBlue', stored)
    } else {
      this.promptRed = stored
      await this.ctx.storage.put('promptRed', stored)
    }

    // Notify all players that this color has locked in
    this.broadcast({ type: 'prompt_locked', color })

    // If both players have submitted, fire the tick immediately
    if (this.promptBlue && this.promptRed) {
      this.alarmFiresAt = Date.now()
      await this.ctx.storage.put('alarmFiresAt', this.alarmFiresAt)
      await this.ctx.storage.setAlarm(this.alarmFiresAt)
    }

    return new Response(JSON.stringify({
      queued: true,
      classification: { action: classification.action, zone: classification.zone, intensity: classification.intensity },
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  private async handleFinish(): Promise<Response> {
    const { bluePct, redPct } = this.currentScores()
    await this.endGame(bluePct >= redPct ? 'blue' : 'red', 'threshold', bluePct, redPct)
    return new Response('ok')
  }

  private handleWebSocket(request: Request): Response {
    const userId     = request.headers.get('X-User-Id') ?? ''
    const displayName = request.headers.get('X-Display-Name') ?? 'Player'

    if (!userId) return new Response('Unauthorized', { status: 401 })

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket]
    server.accept()

    const existingColors = new Set([...this.players.values()].map(p => p.color))
    const color: 'blue' | 'red' = existingColors.has('blue') ? 'red' : 'blue'
    this.players.set(userId, { ws: server, userId, displayName, color })

    // Send full current state to the newly connected player
    server.send(JSON.stringify(this.buildFullStateMsg()))

    this.broadcast({ type: 'player_joined', displayName, color }, userId)

    server.addEventListener('close', () => {
      this.players.delete(userId)
      this.broadcast({ type: 'player_left', displayName, color })
    })

    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket })
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private currentScores(): { bluePct: number; redPct: number; blueCells: number; redCells: number } {
    if (!this.gridState) return { bluePct: 50, redPct: 50, blueCells: 0, redCells: 0 }
    let blue = 0, red = 0
    for (const cell of this.gridState.grid) {
      if (cell === 1) blue++
      else if (cell === 2) red++
    }
    const total = blue + red
    return {
      bluePct:   total === 0 ? 50 : (blue / total) * 100,
      redPct:    total === 0 ? 50 : (red  / total) * 100,
      blueCells: blue,
      redCells:  red,
    }
  }

  private buildFullStateMsg(): object {
    const { bluePct, redPct, blueCells, redCells } = this.currentScores()
    return {
      type: 'state',
      phase: this.phase,
      round: this.round,
      totalRounds: this.config.totalRounds,
      scores: { blue: Math.round(bluePct), red: Math.round(redPct) },
      cells:  { blue: blueCells, red: redCells },
      promptStatus: {
        blue: this.promptBlue ? 'locked' : 'waiting',
        red:  this.promptRed  ? 'locked' : 'waiting',
      },
      players: [...this.players.values()].map(p => ({
        userId: p.userId,
        displayName: p.displayName,
        color: p.color,
      })),
      alarmFiresAt: this.alarmFiresAt,
      grid: this.gridState ? Array.from(this.gridState.grid) : [],
      nutrients: this.gridState ? Array.from(this.gridState.nutrients) : [],
    }
  }

  private broadcastState(_bluePct: number, _redPct: number): void {
    this.broadcast(this.buildFullStateMsg())
  }

  private async endGame(
    winner: 'blue' | 'red',
    winReason: 'threshold' | 'rounds',
    bluePct: number,
    redPct: number,
  ): Promise<void> {
    if (this.phase === 'finished') return
    this.phase = 'finished'
    await this.ctx.storage.put('phase', 'finished')
    await this.ctx.storage.deleteAlarm()

    writeGameOver(this.env.AE, {
      gameCode: this.gameCode,
      winnerColor: winner,
      winReason,
      finalBluePct: bluePct,
      finalRedPct: redPct,
      totalRounds: this.round,
    })

    // Update D1
    try {
      await this.env.DB.prepare(
        "UPDATE games SET status = 'finished', winner_id = ?, finished_at = ? WHERE code = ?",
      ).bind(winner, Date.now(), this.gameCode).run()
    } catch { /* non-fatal */ }

    this.broadcast({ type: 'game_over', winner, winReason, scores: { blue: Math.round(bluePct), red: Math.round(redPct) } })
  }

  private async persistGridState(): Promise<void> {
    if (!this.gridState) return
    await this.ctx.storage.put('grid',             this.gridState.grid)
    await this.ctx.storage.put('nutrients',         this.gridState.nutrients)
    await this.ctx.storage.put('nutrientCooldown',  this.gridState.nutrientCooldown)
    await this.ctx.storage.put('starvation',        this.gridState.starvation)
    await this.ctx.storage.put('armor',             this.gridState.armor)
    await this.ctx.storage.put('wallAge',           this.gridState.wallAge)
  }

  private async clearPrompts(): Promise<void> {
    this.promptBlue = null
    this.promptRed  = null
    await this.ctx.storage.delete('promptBlue')
    await this.ctx.storage.delete('promptRed')
  }

  private broadcast(message: unknown, excludeUserId?: string): void {
    const data = JSON.stringify(message)
    for (const [userId, player] of this.players) {
      if (userId !== excludeUserId) {
        try { player.ws.send(data) } catch { /* client disconnected */ }
      }
    }
  }
}
