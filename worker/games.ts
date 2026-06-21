import { getSessionToken, verifySession, SessionPayload } from './lib/session'

interface Env {
  DB: D1Database
  KV: KVNamespace
  GAME_ROOM: DurableObjectNamespace
  SESSION_SECRET: string
}

export async function handleGames(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const session = await requireSession(request, env)
  if (session instanceof Response) return session

  // POST /api/games — create
  if (request.method === 'POST' && url.pathname === '/api/games') {
    return createGame(request, env, session)
  }

  const codeMatch = url.pathname.match(/^\/api\/games\/([A-Z0-9]{6})(\/.*)?$/)
  if (!codeMatch) return new Response('Not found', { status: 404 })
  const code = codeMatch[1]
  const sub = codeMatch[2] ?? ''

  if (request.method === 'GET' && sub === '') return getGame(code, env)
  if (request.method === 'POST' && sub === '/join') return joinGame(code, env, session)
  if (request.method === 'POST' && sub === '/add-bot') return addBot(code, env, session)
  if (request.method === 'POST' && sub === '/start') return startGame(code, env, session)
  if (request.method === 'GET' && sub === '/ws') return upgradeWebSocket(code, request, env, session)
  if (request.method === 'POST' && sub === '/prompt') return submitPrompt(code, request, env, session)
  if (request.method === 'POST' && sub === '/finish') return finishGame(code, env, session)

  return new Response('Not found', { status: 404 })
}

async function createGame(request: Request, env: Env, session: SessionPayload): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { settings?: Record<string, unknown> }
  const code = await generateUniqueCode(env.DB)
  const settings = JSON.stringify(body.settings ?? {})
  const now = Date.now()

  await env.DB.prepare(`
    INSERT INTO games (code, host_id, status, settings, created_at)
    VALUES (?, ?, 'lobby', ?, ?)
  `).bind(code, session.userId, settings, now).run()

  await env.DB.prepare(`
    INSERT INTO game_players (game_code, user_id, color, joined_at)
    VALUES (?, ?, 'blue', ?)
  `).bind(code, session.userId, now).run()

  return json({ code })
}

async function getGame(code: string, env: Env): Promise<Response> {
  const game = await env.DB.prepare('SELECT * FROM games WHERE code = ?').bind(code).first()
  if (!game) return new Response('Not found', { status: 404 })
  const players = await env.DB.prepare(`
    SELECT u.id, u.display_name, gp.color FROM game_players gp
    JOIN users u ON u.id = gp.user_id
    WHERE gp.game_code = ?
    ORDER BY gp.joined_at ASC
  `).bind(code).all<{ id: string; display_name: string; color: string }>()
  return json({ game, players: players.results })
}

async function joinGame(code: string, env: Env, session: SessionPayload): Promise<Response> {
  const game = await env.DB.prepare('SELECT * FROM games WHERE code = ?').bind(code).first<{ status: string, host_id: string }>()
  if (!game) return error('Game not found', 404)
  if (game.status !== 'lobby') return error('Game already started', 409)

  const players = await env.DB.prepare('SELECT user_id FROM game_players WHERE game_code = ?').bind(code).all()
  if (players.results.length >= 2) return error('Game is full', 409)
  if (players.results.some(p => (p as { user_id: string }).user_id === session.userId)) {
    return error('Already in this game', 409)
  }

  await env.DB.prepare(`
    INSERT INTO game_players (game_code, user_id, color, joined_at)
    VALUES (?, ?, 'red', ?)
  `).bind(code, session.userId, Date.now()).run()

  return json({ code })
}

async function addBot(code: string, env: Env, session: SessionPayload): Promise<Response> {
  const game = await env.DB.prepare('SELECT * FROM games WHERE code = ?').bind(code).first<{ status: string; host_id: string }>()
  if (!game) return error('Game not found', 404)
  if (game.host_id !== session.userId) return error('Only the host can add a bot', 403)
  if (game.status !== 'lobby') return error('Game already started', 409)

  const players = await env.DB.prepare('SELECT user_id FROM game_players WHERE game_code = ?').bind(code).all()
  if (players.results.length >= 2) return error('Game is full', 409)

  // Ensure the bot user exists in the users table
  await env.DB.prepare(`
    INSERT INTO users (id, email, display_name, created_at)
    VALUES ('bot', 'bot@primordial', 'CPU', 0)
    ON CONFLICT(id) DO NOTHING
  `).run()

  await env.DB.prepare(`
    INSERT INTO game_players (game_code, user_id, color, joined_at)
    VALUES (?, 'bot', 'red', ?)
  `).bind(code, Date.now()).run()

  // Auto-start
  await env.DB.prepare("UPDATE games SET status = 'active' WHERE code = ?").bind(code).run()
  const id = env.GAME_ROOM.idFromName(code)
  const stub = env.GAME_ROOM.get(id)
  await stub.fetch(new Request('http://do/init', {
    method: 'POST',
    body: JSON.stringify({ code, settings: game }),
  }))

  return json({ started: true })
}

async function startGame(code: string, env: Env, session: SessionPayload): Promise<Response> {
  const game = await env.DB.prepare('SELECT * FROM games WHERE code = ?').bind(code).first<{ status: string, host_id: string }>()
  if (!game) return error('Game not found', 404)
  if (game.host_id !== session.userId) return error('Only the host can start', 403)
  if (game.status !== 'lobby') return error('Game already started', 409)

  const players = await env.DB.prepare('SELECT * FROM game_players WHERE game_code = ?').bind(code).all()
  if (players.results.length < 2) return error('Need 2 players to start', 400)

  await env.DB.prepare("UPDATE games SET status = 'active' WHERE code = ?").bind(code).run()

  // Tell the DO to initialize the game
  const id = env.GAME_ROOM.idFromName(code)
  const stub = env.GAME_ROOM.get(id)
  await stub.fetch(new Request(`http://do/init`, {
    method: 'POST',
    body: JSON.stringify({ code, settings: game }),
  }))

  return json({ started: true })
}

async function upgradeWebSocket(code: string, request: Request, env: Env, session: SessionPayload): Promise<Response> {
  const game = await env.DB.prepare('SELECT status FROM games WHERE code = ?').bind(code).first<{ status: string }>()
  if (!game) return error('Game not found', 404)
  if (game.status === 'finished') return error('Game over', 410)

  const id = env.GAME_ROOM.idFromName(code)
  const stub = env.GAME_ROOM.get(id)

  // Forward with session info in header (internal only — set by Worker, not client)
  const doRequest = new Request(request.url, {
    headers: {
      ...Object.fromEntries(request.headers),
      'X-User-Id': session.userId,
      'X-Display-Name': session.displayName,
    },
    body: request.body,
  })
  return stub.fetch(doRequest)
}

async function submitPrompt(code: string, request: Request, env: Env, session: SessionPayload): Promise<Response> {
  const body = await request.json() as { prompt: string }
  if (!body.prompt || typeof body.prompt !== 'string') return error('prompt required', 400)
  const prompt = body.prompt.slice(0, 500).trim()
  if (!prompt) return error('prompt required', 400)

  // Verify player is in this game
  const player = await env.DB.prepare('SELECT color FROM game_players WHERE game_code = ? AND user_id = ?')
    .bind(code, session.userId).first<{ color: string }>()
  if (!player) return error('Not in this game', 403)

  const game = await env.DB.prepare('SELECT status FROM games WHERE code = ?').bind(code).first<{ status: string }>()
  if (!game || game.status !== 'active') return error('Game not active', 409)

  const id = env.GAME_ROOM.idFromName(code)
  const stub = env.GAME_ROOM.get(id)
  const res = await stub.fetch(new Request('http://do/prompt', {
    method: 'POST',
    body: JSON.stringify({ userId: session.userId, color: player.color, prompt }),
  }))
  return res
}

async function finishGame(code: string, env: Env, session: SessionPayload): Promise<Response> {
  const player = await env.DB.prepare('SELECT 1 FROM game_players WHERE game_code = ? AND user_id = ?')
    .bind(code, session.userId).first()
  if (!player) return error('Not in this game', 403)

  const id = env.GAME_ROOM.idFromName(code)
  const stub = env.GAME_ROOM.get(id)
  await stub.fetch(new Request('http://do/finish', { method: 'POST' }))
  return json({ finished: true })
}

// ---- helpers ----

async function generateUniqueCode(db: D1Database): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(6))
    const code = Array.from(bytes, b => chars[b % chars.length]).join('')
    const existing = await db.prepare('SELECT 1 FROM games WHERE code = ?').bind(code).first()
    if (!existing) return code
  }
  throw new Error('Could not generate unique code')
}

async function requireSession(request: Request, env: Env): Promise<SessionPayload | Response> {
  const token = getSessionToken(request)
  if (!token) return new Response('Unauthorized', { status: 401 })
  const session = await verifySession(token, env.SESSION_SECRET)
  if (!session) return new Response('Unauthorized', { status: 401 })
  return session
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function error(msg: string, status: number): Response {
  return json({ error: msg }, status)
}
