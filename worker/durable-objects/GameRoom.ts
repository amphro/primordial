import { DurableObject } from 'cloudflare:workers'
import { DEFAULT_CONFIG, loadConfig, type GameConfig } from '../lib/config'
import { initGrid } from '../../shared/sim/simulation'
import type { GridState } from '../../shared/sim/simulation'
import { runGame } from '../../shared/sim/runGame'
import type { GameResolution } from '../../shared/sim/runGame'
import { generateStrategy } from './strategist'
import type { Strategy } from '../../shared/strategy'
import { makeRng } from '../../shared/rng'
import { writeGameOver, writeTickResolved, writeCounterTriggered } from './analytics'

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

// Hardcoded bot strategy — no AI needed, deterministic for balance testing
const BOT_STRATEGY: Strategy = {
  rules: [
    { when: [{ metric: 'round', op: 'lt', value: 3 }], do: { action: 'PULSE', zone: 'ALL', intensity: 'AGGRESSIVE' } },
    { when: [{ metric: 'enemyDistance', op: 'lte', value: 6 }], do: { action: 'HUNT', zone: 'ALL', intensity: 'AGGRESSIVE' } },
    { when: [{ metric: 'cellRatio', op: 'lt', value: 0.4 }], do: { action: 'GROW', zone: 'ALL', intensity: 'AGGRESSIVE' } },
  ],
  fallback: { action: 'GROW', zone: 'ALL', intensity: 'NORMAL' },
}
const BOT_READBACK = 'Shockwave early, chase enemies when close, grow aggressively when behind.'

export class GameRoom extends DurableObject<Env> {
  private players = new Map<string, ConnectedPlayer>()
  // Ephemeral pending locks — prevent double-submit across concurrent requests during await
  private strategyBluePending = false
  private strategyRedPending  = false

  // Persisted state
  private gameCode = ''
  private phase: 'lobby' | 'waiting' | 'resolved' | 'finished' = 'lobby'
  private config: GameConfig = DEFAULT_CONFIG
  private seed = 0
  private gridState: GridState | null = null
  private blueStrategy: Strategy | null = null
  private redStrategy:  Strategy | null = null
  private blueReadback: string | null = null
  private redReadback:  string | null = null
  private blueConfirmed = false
  private redConfirmed  = false
  private resolution: GameResolution | null = null
  private botColor: 'blue' | 'red' | null = null
  private deadlineAt = 0

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      this.gameCode     = (await ctx.storage.get<string>('gameCode'))    ?? ''
      this.phase        = (await ctx.storage.get<'lobby' | 'waiting' | 'resolved' | 'finished'>('phase')) ?? 'lobby'
      this.seed         = (await ctx.storage.get<number>('seed'))        ?? 0
      this.deadlineAt   = (await ctx.storage.get<number>('deadlineAt'))  ?? 0
      this.botColor     = (await ctx.storage.get<'blue' | 'red'>('botColor')) ?? null
      const storedCfg   = await ctx.storage.get<GameConfig>('config')
      if (storedCfg) this.config = storedCfg

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

      this.blueStrategy  = (await ctx.storage.get<Strategy>('blueStrategy'))      ?? null
      this.redStrategy   = (await ctx.storage.get<Strategy>('redStrategy'))       ?? null
      this.blueReadback  = (await ctx.storage.get<string>('blueReadback'))        ?? null
      this.redReadback   = (await ctx.storage.get<string>('redReadback'))         ?? null
      this.blueConfirmed = (await ctx.storage.get<boolean>('blueConfirmed'))      ?? false
      this.redConfirmed  = (await ctx.storage.get<boolean>('redConfirmed'))       ?? false
      this.resolution    = (await ctx.storage.get<GameResolution>('resolution'))  ?? null
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/init')     return this.handleInit(request)
    if (url.pathname === '/strategy') return this.handleStrategy(request)
    if (url.pathname === '/confirm')  return this.handleConfirm(request)
    if (url.pathname === '/analyze')  return this.handleAnalyze(request)
    if (url.pathname === '/finish')   return this.handleFinish()
    const upgrade = request.headers.get('Upgrade')
    if (upgrade?.toLowerCase() === 'websocket') return this.handleWebSocket(request)
    return new Response('Not found', { status: 404 })
  }

  // ── alarm: deadline — assign default strategies to anyone who hasn't submitted, then auto-confirm ──

  async alarm(): Promise<void> {
    if (this.phase !== 'waiting') return
    const defaultStrat: Strategy = { rules: [], fallback: { action: 'GROW', zone: 'ALL', intensity: 'NORMAL' } }

    if (!this.blueStrategy) {
      this.blueStrategy = defaultStrat
      this.blueReadback = 'Grow steadily (timed out).'
      await this.ctx.storage.put('blueStrategy', defaultStrat)
      await this.ctx.storage.put('blueReadback', this.blueReadback)
      this.broadcast({ type: 'strategy_locked', color: 'blue', readback: this.blueReadback, strategy: defaultStrat })
    }
    if (!this.redStrategy) {
      this.redStrategy = defaultStrat
      this.redReadback = 'Grow steadily (timed out).'
      await this.ctx.storage.put('redStrategy', defaultStrat)
      await this.ctx.storage.put('redReadback', this.redReadback)
      this.broadcast({ type: 'strategy_locked', color: 'red', readback: this.redReadback, strategy: defaultStrat })
    }

    // Deadline = auto-confirm both sides and run the battle
    if (!this.blueConfirmed) {
      this.blueConfirmed = true
      await this.ctx.storage.put('blueConfirmed', true)
    }
    if (!this.redConfirmed) {
      this.redConfirmed = true
      await this.ctx.storage.put('redConfirmed', true)
    }

    await this.tryResolve()
  }

  // ── routes ────────────────────────────────────────────────────────────────

  private async handleInit(request: Request): Promise<Response> {
    const body = await request.json() as { code: string; botColor?: 'blue' | 'red'; gameSettings?: Partial<GameConfig> }
    this.gameCode = body.code
    this.phase    = 'waiting'
    this.botColor = body.botColor ?? null

    const baseConfig = await loadConfig(this.env.KV)
    this.config = body.gameSettings ? { ...baseConfig, ...body.gameSettings } : baseConfig

    // Cryptographically seeded, but stored for deterministic replay
    const seedBytes = crypto.getRandomValues(new Uint8Array(4))
    this.seed = ((seedBytes[0] << 24) | (seedBytes[1] << 16) | (seedBytes[2] << 8) | seedBytes[3]) >>> 0

    const rng = makeRng(this.seed)
    this.gridState = initGrid(this.config, rng)

    await this.ctx.storage.put('gameCode', this.gameCode)
    await this.ctx.storage.put('phase',    this.phase)
    await this.ctx.storage.put('config',   this.config)
    await this.ctx.storage.put('seed',     this.seed)
    await this.ctx.storage.put('botColor', this.botColor ?? '')
    await this.persistGridState()

    // Bot: set strategy + confirm immediately; no deadline alarm needed vs CPU
    if (this.botColor) {
      if (this.botColor === 'blue') {
        this.blueStrategy  = BOT_STRATEGY
        this.blueReadback  = BOT_READBACK
        this.blueConfirmed = true
        await this.ctx.storage.put('blueStrategy',  BOT_STRATEGY)
        await this.ctx.storage.put('blueReadback',  BOT_READBACK)
        await this.ctx.storage.put('blueConfirmed', true)
      } else {
        this.redStrategy  = BOT_STRATEGY
        this.redReadback  = BOT_READBACK
        this.redConfirmed = true
        await this.ctx.storage.put('redStrategy',  BOT_STRATEGY)
        await this.ctx.storage.put('redReadback',  BOT_READBACK)
        await this.ctx.storage.put('redConfirmed', true)
      }
    } else {
      // Deadline only matters in 2-human games — stalling protection
      this.deadlineAt = Date.now() + this.config.promptTimerMs * 3
      await this.ctx.storage.put('deadlineAt', this.deadlineAt)
      await this.ctx.storage.setAlarm(this.deadlineAt)
    }

    return new Response('ok')
  }

  private async handleStrategy(request: Request): Promise<Response> {
    if (this.phase !== 'waiting') {
      return new Response(JSON.stringify({ error: 'Not waiting for strategies' }), { status: 409 })
    }

    const body = await request.json() as { color: 'blue' | 'red'; prompt: string }
    const { color, prompt } = body

    // Reject if confirmed (locked in) or if a classification is in-flight for this side
    if (color === 'blue' && (this.blueConfirmed || this.strategyBluePending)) {
      return new Response(JSON.stringify({ error: 'Already confirmed' }), { status: 409 })
    }
    if (color === 'red' && (this.redConfirmed || this.strategyRedPending)) {
      return new Response(JSON.stringify({ error: 'Already confirmed' }), { status: 409 })
    }

    if (color === 'blue') this.strategyBluePending = true
    else                  this.strategyRedPending  = true

    const { strategy, readback, latencyMs } = await generateStrategy(prompt, this.env.AI)

    if (color === 'blue') this.strategyBluePending = false
    else                  this.strategyRedPending  = false

    if (this.phase !== 'waiting') {
      return new Response(JSON.stringify({ error: 'Game no longer waiting' }), { status: 409 })
    }

    if (color === 'blue') {
      this.blueStrategy = strategy
      this.blueReadback = readback
      await this.ctx.storage.put('blueStrategy', strategy)
      await this.ctx.storage.put('blueReadback', readback)
    } else {
      this.redStrategy = strategy
      this.redReadback = readback
      await this.ctx.storage.put('redStrategy', strategy)
      await this.ctx.storage.put('redReadback', readback)
    }

    // Broadcast the parsed strategy so the client can show the review gate
    this.broadcast({ type: 'strategy_locked', color, readback, strategy, latencyMs })
    // Note: tryResolve is NOT called here — player must click "Start Battle" to confirm

    return new Response(JSON.stringify({ queued: true, readback }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  private async handleConfirm(request: Request): Promise<Response> {
    if (this.phase !== 'waiting') {
      return new Response(JSON.stringify({ error: 'Not waiting for strategies' }), { status: 409 })
    }
    const body = await request.json() as { color: 'blue' | 'red' }
    const { color } = body

    if (color === 'blue' && !this.blueStrategy) {
      return new Response(JSON.stringify({ error: 'No strategy submitted yet' }), { status: 409 })
    }
    if (color === 'red' && !this.redStrategy) {
      return new Response(JSON.stringify({ error: 'No strategy submitted yet' }), { status: 409 })
    }

    if (color === 'blue') {
      this.blueConfirmed = true
      await this.ctx.storage.put('blueConfirmed', true)
    } else {
      this.redConfirmed = true
      await this.ctx.storage.put('redConfirmed', true)
    }

    await this.tryResolve()

    return new Response(JSON.stringify({ confirmed: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  private async tryResolve(): Promise<void> {
    if (this.phase !== 'waiting' || !this.blueStrategy || !this.redStrategy) return
    if (!this.blueConfirmed || !this.redConfirmed) return

    // Synchronously mark as resolving — prevents double-run across concurrent strategy submissions
    this.phase = 'resolved'
    await this.ctx.storage.put('phase', 'resolved')

    const resolution = runGame(this.seed, this.config, this.blueStrategy, this.redStrategy)
    this.resolution = resolution
    await this.ctx.storage.put('resolution', resolution)

    await this.ctx.storage.deleteAlarm()

    // Write analytics for each round
    for (const r of resolution.rounds) {
      const t = r.blueCells + r.redCells
      const bluePct = t === 0 ? 50 : (r.blueCells / t) * 100
      const redPct  = 100 - bluePct
      writeTickResolved(this.env.AE, {
        gameCode: this.gameCode, round: r.round,
        blueAction: r.blueSpec.action, blueZone: r.blueSpec.zone, blueIntensity: r.blueSpec.intensity,
        redAction:  r.redSpec.action,  redZone:  r.redSpec.zone,  redIntensity:  r.redSpec.intensity,
        bluePct, redPct, blueCells: r.blueCells, redCells: r.redCells,
      })
      for (const counter of r.counters) {
        writeCounterTriggered(this.env.AE, {
          gameCode: this.gameCode, round: r.round,
          winnerAction: counter.winner, loserAction: counter.loser,
          zone: counter.zone, reduction: counter.reduction,
        })
      }
    }

    this.broadcast({ type: 'resolution', ...resolution })
    await this.endGame(resolution.winner, resolution.finalScores)
  }

  private handleFinish(): Response {
    void this.endGame('blue', { blue: 50, red: 50 })
    return new Response('ok')
  }

  private async handleAnalyze(request: Request): Promise<Response> {
    if (!this.resolution || !this.blueStrategy || !this.redStrategy) {
      return new Response(JSON.stringify({ error: 'No resolution for this game' }), { status: 409 })
    }
    const body = await request.json() as { question?: string }
    const question = body.question?.slice(0, 300).trim() ?? ''

    const last = this.resolution.rounds[this.resolution.rounds.length - 1]
    const total = last.blueCells + last.redCells
    const bluePct = total ? Math.round(last.blueCells / total * 100) : 50

    const roundTable = this.resolution.rounds
      .map(r => `R${r.round + 1}: Blue ${r.blueSpec.action}(${r.blueSpec.zone}) Red ${r.redSpec.action}(${r.redSpec.zone}) | ${r.blueCells} vs ${r.redCells}`)
      .join('\n')

    const systemPrompt = `You analyze completed games of PRIMORDIAL, a 40×40 cellular automaton strategy game.
Mechanics: GROW spreads cells via nutrients. HUNT captures nearby enemy cells (doesn't use nutrients). ARMOR shields cells and counters PULSE. PULSE is a shockwave attack; HUNT bypasses ARMOR. Zones (ALL/NORTH/SOUTH/EAST/WEST) filter which of YOUR cells activate. Comeback mechanic: if under 15% of occupied cells, nutrient burst appears near you. Win condition: 80% of occupied cells, or most cells after 20 rounds. Rules are first-match priority; empty when:[] always fires and blocks all later rules and the fallback. Be concise and cite specific round numbers.`

    const userContent = `Blue strategy: ${JSON.stringify(this.blueStrategy)}
Blue AI readback: "${this.blueReadback}"

Red strategy: ${JSON.stringify(this.redStrategy)}
Red AI readback: "${this.redReadback}"

Round-by-round:
${roundTable}

Result: ${this.resolution.winner} wins — Blue ${bluePct}%, Red ${100 - bluePct}%

${question ? `Question: ${question}` : 'In under 200 words: why did the winner win, what was the key turning point, and were there any strategy bugs (e.g. empty-condition rule blocking all later rules)?'}`

    const aiResult = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userContent },
      ],
      max_tokens: 400,
    }) as unknown

    let analysis = ''
    if (typeof aiResult === 'string') {
      analysis = aiResult
    } else if (aiResult && typeof aiResult === 'object') {
      const obj = aiResult as Record<string, unknown>
      const resp = obj.response
      if (typeof resp === 'string') analysis = resp
      else if (resp && typeof resp === 'object') analysis = JSON.stringify(resp)
    }

    return new Response(JSON.stringify({ analysis }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  private handleWebSocket(request: Request): Response {
    const userId      = request.headers.get('X-User-Id') ?? ''
    const displayName = request.headers.get('X-Display-Name') ?? 'Player'
    const headerColor = request.headers.get('X-Player-Color') as 'blue' | 'red' | null

    if (!userId) return new Response('Unauthorized', { status: 401 })

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket]
    server.accept()

    let color: 'blue' | 'red'
    if (headerColor === 'blue' || headerColor === 'red') {
      color = headerColor
    } else {
      const existingColors = new Set([...this.players.values()].map(p => p.color))
      color = existingColors.has('blue') ? 'red' : 'blue'
    }
    this.players.set(userId, { ws: server, userId, displayName, color })

    server.send(JSON.stringify(this.buildStateMsg()))

    // Reconnecting clients need the resolution to resume animation
    if (this.resolution) {
      server.send(JSON.stringify({ type: 'resolution', ...this.resolution }))
    }
    if (this.phase === 'finished' && this.resolution) {
      server.send(JSON.stringify({
        type: 'game_over',
        winner: this.resolution.winner,
        winReason: 'rounds',
        scores: this.resolution.finalScores,
      }))
    }

    this.broadcast({ type: 'player_joined', displayName, color }, userId)

    server.addEventListener('close', () => {
      if (this.players.get(userId)?.ws !== server) return
      this.players.delete(userId)
      this.broadcast({ type: 'player_left', displayName, color })
    })

    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket })
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private buildStateMsg(): object {
    return {
      type: 'state',
      phase: this.phase,
      seed: this.seed,
      totalRounds: this.config.totalRounds,
      gridW: this.config.gridWidth,
      gridH: this.config.gridHeight,
      strategyStatus: {
        blue: this.blueStrategy ? 'locked' : 'waiting',
        red:  this.redStrategy  ? 'locked' : 'waiting',
      },
      strategyReadback: {
        blue: this.blueReadback,
        red:  this.redReadback,
      },
      blueStrategy:  this.blueStrategy,
      redStrategy:   this.redStrategy,
      blueConfirmed: this.blueConfirmed,
      redConfirmed:  this.redConfirmed,
      players: [...this.players.values()].map(p => ({
        userId: p.userId,
        displayName: p.displayName,
        color: p.color,
      })),
      deadlineAt: this.deadlineAt,
      grid:       this.gridState ? Array.from(this.gridState.grid)       : [],
      nutrients:  this.gridState ? Array.from(this.gridState.nutrients)  : [],
      armor:      this.gridState ? Array.from(this.gridState.armor)      : [],
      starvation: this.gridState ? Array.from(this.gridState.starvation) : [],
    }
  }

  private async endGame(winner: 'blue' | 'red', scores: { blue: number; red: number }): Promise<void> {
    if (this.phase === 'finished') return
    this.phase = 'finished'
    await this.ctx.storage.put('phase', 'finished')

    writeGameOver(this.env.AE, {
      gameCode: this.gameCode,
      winnerColor: winner,
      winReason: 'rounds',
      finalBluePct: scores.blue,
      finalRedPct:  scores.red,
      totalRounds: this.config.totalRounds,
    })

    try {
      const winnerRow = await this.env.DB.prepare(
        'SELECT user_id FROM game_players WHERE game_code = ? AND color = ?',
      ).bind(this.gameCode, winner).first<{ user_id: string }>()
      const winnerId = winnerRow?.user_id ?? winner
      await this.env.DB.prepare(
        "UPDATE games SET status = 'finished', winner_id = ?, finished_at = ? WHERE code = ?",
      ).bind(winnerId, Date.now(), this.gameCode).run()
    } catch { /* non-fatal */ }

    this.broadcast({ type: 'game_over', winner, winReason: 'rounds', scores })
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

  private broadcast(message: unknown, excludeUserId?: string): void {
    const data = JSON.stringify(message)
    for (const [userId, player] of this.players) {
      if (userId !== excludeUserId) {
        try { player.ws.send(data) } catch { /* disconnected */ }
      }
    }
  }
}
