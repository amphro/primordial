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
  // Synchronous pending locks set before async AI classification to prevent
  // double-submits or prompt leaks across round boundaries
  private promptBluePending = false
  private promptRedPending  = false

  // Persisted in DO storage (rehydrated in constructor)
  private gameCode = ''
  private phase: 'lobby' | 'active' | 'finished' = 'lobby'
  private config: GameConfig = DEFAULT_CONFIG
  private round = 0
  private alarmFiresAt = 0
  private gridState: GridState | null = null
  private promptBlue: StoredPrompt | null = null
  private promptRed: StoredPrompt | null = null
  private lastWinner: 'blue' | 'red' | null = null
  private lastWinReason: 'threshold' | 'rounds' | null = null
  private botColor: 'blue' | 'red' | null = null
  private botSubmitAt = 0  // ms timestamp; 0 = not scheduled

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

      this.promptBlue    = (await ctx.storage.get<StoredPrompt>('promptBlue')) ?? null
      this.promptRed     = (await ctx.storage.get<StoredPrompt>('promptRed'))  ?? null
      this.lastWinner    = (await ctx.storage.get<'blue' | 'red'>('lastWinner')) ?? null
      this.lastWinReason = (await ctx.storage.get<'threshold' | 'rounds'>('lastWinReason')) ?? null
      this.botColor      = (await ctx.storage.get<'blue' | 'red'>('botColor')) ?? null
      this.botSubmitAt   = (await ctx.storage.get<number>('botSubmitAt')) ?? 0
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
    const now = Date.now()

    // Bot submit fires before the next tick
    if (this.botSubmitAt > 0 && now >= this.botSubmitAt - 200) {
      this.botSubmitAt = 0
      await this.ctx.storage.put('botSubmitAt', 0)
      await this.handleBotSubmit()
      // Re-arm for the main tick (unless it was already overridden to fire immediately)
      if (this.phase === 'active' && this.alarmFiresAt > now) {
        await this.ctx.storage.setAlarm(this.alarmFiresAt).catch(() => {})
      }
      return
    }

    if (this.phase !== 'active' || !this.gridState) return

    try {
      const prevCells = this.currentScores()

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
        blue: this.promptBlue ? {
          prompt: this.promptBlue.text,
          action: this.promptBlue.action,
          zone: this.promptBlue.zone,
          intensity: this.promptBlue.intensity,
          delta: result.blueCells - prevCells.blueCells,
        } : null,
        red: this.promptRed ? {
          prompt: this.promptRed.text,
          action: this.promptRed.action,
          zone: this.promptRed.zone,
          intensity: this.promptRed.intensity,
          delta: result.redCells - prevCells.redCells,
        } : null,
      })

      // Persist updated state and clear prompts
      await this.persistGridState()
      await this.ctx.storage.put('round', this.round)
      await this.clearPrompts()

      if (result.winner) {
        await this.endGame(result.winner, result.winner !== null && (result.bluePct >= this.config.winThresholdPct || result.redPct >= this.config.winThresholdPct) ? 'threshold' : 'rounds', result.bluePct, result.redPct)
        // Don't broadcast state after game_over — it would race the game_over message
        // and could bounce the client off the GameOver screen.
        return
      }

      // Schedule next tick
      this.alarmFiresAt = Date.now() + this.config.promptTimerMs
      await this.ctx.storage.put('alarmFiresAt', this.alarmFiresAt)

      if (this.botColor) {
        // Bot submits 1–3 s into the new round, before the tick fires
        this.botSubmitAt = Date.now() + 1000 + Math.random() * 2000
        await this.ctx.storage.put('botSubmitAt', this.botSubmitAt)
        await this.ctx.storage.setAlarm(this.botSubmitAt)
      } else {
        await this.ctx.storage.setAlarm(this.alarmFiresAt)
      }

      // Broadcast new state after resolve so clients update the board
      this.broadcastState(result.bluePct, result.redPct)
    } catch (err) {
      console.error('[GameRoom] alarm error — rescheduling tick:', err)
      // Don't let a transient error kill the DO. Reschedule and keep going.
      if (this.phase === 'active') {
        this.alarmFiresAt = Date.now() + this.config.promptTimerMs
        await this.ctx.storage.put('alarmFiresAt', this.alarmFiresAt).catch(() => {})
        await this.ctx.storage.setAlarm(this.alarmFiresAt).catch(() => {})
      }
    }
  }

  // ── routes ────────────────────────────────────────────────────────────────

  private async handleInit(request: Request): Promise<Response> {
    const body = await request.json() as { code: string; botColor?: 'blue' | 'red'; gameSettings?: Partial<GameConfig> }
    this.gameCode = body.code
    this.phase = 'active'
    this.round = 0
    this.botColor = body.botColor ?? null

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
    await this.ctx.storage.put('botColor', this.botColor ?? '')
    await this.persistGridState()

    // Start tick loop
    this.alarmFiresAt = Date.now() + this.config.promptTimerMs
    await this.ctx.storage.put('alarmFiresAt', this.alarmFiresAt)

    if (this.botColor) {
      // Bot submits 1–3 s after round starts
      this.botSubmitAt = Date.now() + 1000 + Math.random() * 2000
      await this.ctx.storage.put('botSubmitAt', this.botSubmitAt)
      await this.ctx.storage.setAlarm(this.botSubmitAt)
    } else {
      await this.ctx.storage.setAlarm(this.alarmFiresAt)
    }

    return new Response('ok')
  }

  private async handlePrompt(request: Request): Promise<Response> {
    if (this.phase !== 'active') return new Response(JSON.stringify({ error: 'Game not active' }), { status: 409 })

    const body = await request.json() as { color: 'blue' | 'red'; prompt: string }
    const { color, prompt } = body

    // Check if already locked — include the pending flag to block double-submits
    // that sneak past before the async AI call returns.
    if (color === 'blue' && (this.promptBlue || this.promptBluePending)) return new Response(JSON.stringify({ error: 'Already locked' }), { status: 409 })
    if (color === 'red'  && (this.promptRed  || this.promptRedPending))  return new Response(JSON.stringify({ error: 'Already locked' }), { status: 409 })

    // Synchronously mark as pending so no concurrent request for the same color
    // can slip past while we await the AI classification.
    const roundAtSubmit = this.round
    if (color === 'blue') this.promptBluePending = true
    else                  this.promptRedPending  = true

    // Classify the prompt (at submit-time, never in alarm)
    const { classification, latencyMs } = await classifyPrompt(prompt, this.env.AI)

    // Clear pending flag regardless of outcome
    if (color === 'blue') this.promptBluePending = false
    else                  this.promptRedPending  = false

    // If the round advanced or the game ended during classification, discard the prompt
    if (this.phase !== 'active' || this.round !== roundAtSubmit) {
      return new Response(JSON.stringify({ error: 'Round expired' }), { status: 409 })
    }

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
    const userId      = request.headers.get('X-User-Id') ?? ''
    const displayName = request.headers.get('X-Display-Name') ?? 'Player'
    const headerColor = request.headers.get('X-Player-Color') as 'blue' | 'red' | null

    if (!userId) return new Response('Unauthorized', { status: 401 })

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket]
    server.accept()

    // Use the color assigned in D1 (passed by the Worker) so it never flips on reconnect.
    // Fall back to connection-order assignment only if no color header is present.
    let color: 'blue' | 'red'
    if (headerColor === 'blue' || headerColor === 'red') {
      color = headerColor
    } else {
      const existingColors = new Set([...this.players.values()].map(p => p.color))
      color = existingColors.has('blue') ? 'red' : 'blue'
    }
    this.players.set(userId, { ws: server, userId, displayName, color })

    // Send full current state to the newly connected player
    server.send(JSON.stringify(this.buildFullStateMsg()))

    // If game already finished, immediately send game_over so the client navigates properly
    if (this.phase === 'finished' && this.lastWinner) {
      const { bluePct, redPct } = this.currentScores()
      server.send(JSON.stringify({
        type: 'game_over',
        winner: this.lastWinner,
        winReason: this.lastWinReason ?? 'rounds',
        scores: { blue: Math.round(bluePct), red: Math.round(redPct) },
      }))
    }

    this.broadcast({ type: 'player_joined', displayName, color }, userId)

    server.addEventListener('close', () => {
      // Guard: if a newer socket already replaced this one in the map, don't evict it.
      // This happens when React StrictMode double-mounts or the client reconnects before
      // the old close event fires — without this guard the live socket gets deleted from
      // the broadcast map and the client never receives state updates again.
      if (this.players.get(userId)?.ws !== server) return
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
      promptTimerMs: this.config.promptTimerMs,
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
      gridW: this.config.gridWidth,
      gridH: this.config.gridHeight,
      grid: this.gridState ? Array.from(this.gridState.grid) : [],
      nutrients: this.gridState ? Array.from(this.gridState.nutrients) : [],
      armor: this.gridState ? Array.from(this.gridState.armor) : [],
      starvation: this.gridState ? Array.from(this.gridState.starvation) : [],
    }
  }

  private broadcastState(_bluePct: number, _redPct: number): void {
    this.broadcast(this.buildFullStateMsg())
  }

  private async handleBotSubmit(): Promise<void> {
    if (!this.botColor || this.phase !== 'active') return
    const color = this.botColor

    // Don't double-submit
    if (color === 'blue' && this.promptBlue) return
    if (color === 'red'  && this.promptRed)  return

    const actions:     Action[]    = ['GROW', 'HUNT', 'PULSE', 'ARMOR']
    const zones:       Zone[]      = ['ALL', 'NORTH', 'SOUTH', 'EAST', 'WEST']
    const intensities: Intensity[] = ['CAUTIOUS', 'NORMAL', 'AGGRESSIVE']

    const action    = actions[Math.floor(Math.random() * actions.length)]
    const zone      = zones[Math.floor(Math.random() * zones.length)]
    const intensity = intensities[Math.floor(Math.random() * intensities.length)]

    const stored: StoredPrompt = {
      text: `[CPU] ${action} ${zone}`,
      action,
      zone,
      intensity,
      lockedAt: Date.now(),
    }

    if (color === 'blue') {
      this.promptBlue = stored
      await this.ctx.storage.put('promptBlue', stored)
    } else {
      this.promptRed = stored
      await this.ctx.storage.put('promptRed', stored)
    }

    this.broadcast({ type: 'prompt_locked', color })

    // If both players are now locked, fire the tick immediately
    if (this.promptBlue && this.promptRed) {
      this.alarmFiresAt = Date.now()
      await this.ctx.storage.put('alarmFiresAt', this.alarmFiresAt)
      await this.ctx.storage.setAlarm(this.alarmFiresAt)
    }
  }

  private async endGame(
    winner: 'blue' | 'red',
    winReason: 'threshold' | 'rounds',
    bluePct: number,
    redPct: number,
  ): Promise<void> {
    if (this.phase === 'finished') return
    this.phase = 'finished'
    this.lastWinner = winner
    this.lastWinReason = winReason
    await this.ctx.storage.put('phase', 'finished')
    await this.ctx.storage.put('lastWinner', winner)
    await this.ctx.storage.put('lastWinReason', winReason)
    await this.ctx.storage.deleteAlarm()

    writeGameOver(this.env.AE, {
      gameCode: this.gameCode,
      winnerColor: winner,
      winReason,
      finalBluePct: bluePct,
      finalRedPct: redPct,
      totalRounds: this.round,
    })

    // Update D1 — resolve color → user_id so winner_id is a real FK reference
    try {
      const winnerRow = await this.env.DB.prepare(
        'SELECT user_id FROM game_players WHERE game_code = ? AND color = ?',
      ).bind(this.gameCode, winner).first<{ user_id: string }>()
      const winnerId = winnerRow?.user_id ?? winner
      await this.env.DB.prepare(
        "UPDATE games SET status = 'finished', winner_id = ?, finished_at = ? WHERE code = ?",
      ).bind(winnerId, Date.now(), this.gameCode).run()
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
