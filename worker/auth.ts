import { createSession, sessionCookie, clearSessionCookie, getSessionToken, verifySession } from './lib/session'

interface Env {
  DB: D1Database
  KV: KVNamespace
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  SESSION_SECRET: string
  ORIGIN: string
}

const ADJS  = ['amber','azure','bold','coral','cyan','dusk','ember','fern','gold','jade','neon','rose','rust','sage','teal','void','wild']
const NOUNS = ['bear','crane','crow','drake','falcon','fox','hawk','hare','lynx','moth','raven','shark','stag','swift','viper','wolf','wren']

function guestDisplayName(hex: string): string {
  const n1 = parseInt(hex.slice(0, 4), 16) % ADJS.length
  const n2 = parseInt(hex.slice(4, 8), 16) % NOUNS.length
  return `${ADJS[n1]}${NOUNS[n2]}`
}

export async function handleAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname === '/auth/google') return startOAuth(url, env)
  if (url.pathname === '/auth/google/callback') return handleCallback(url, request, env)
  if (url.pathname === '/auth/logout') return handleLogout()
  if (url.pathname === '/auth/me') return handleMe(request, env)

  return new Response('Not found', { status: 404 })
}

function startOAuth(_url: URL, env: Env): Response {
  const state = crypto.randomUUID()
  const redirectUri = `${env.ORIGIN}/auth/google/callback`
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  })
  // State goes in a short-lived cookie (10 min) for CSRF verification
  const stateCookie = `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      'Set-Cookie': stateCookie,
    },
  })
}

async function handleCallback(url: URL, request: Request, env: Env): Promise<Response> {
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  // Verify CSRF state
  const cookieHeader = request.headers.get('Cookie') ?? ''
  const stateMatch = cookieHeader.match(/(?:^|; )oauth_state=([^;]+)/)
  const storedState = stateMatch?.[1]
  if (!code || !state || state !== storedState) {
    return new Response('Invalid state', { status: 400 })
  }

  // Exchange code for tokens
  const redirectUri = `${env.ORIGIN}/auth/google/callback`
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) return new Response('Token exchange failed', { status: 500 })

  const tokens = await tokenRes.json() as { id_token: string }

  // Decode the id_token (trusted from Google's endpoint over TLS — no JWKS needed)
  const [, payloadB64] = tokens.id_token.split('.')
  const profile = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))) as {
    sub: string
    email: string
    name: string
  }

  // Upsert user in D1
  await env.DB.prepare(`
    INSERT INTO users (id, email, display_name, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name
  `).bind(profile.sub, profile.email, profile.name, Date.now()).run()

  // Merge guest data into Google account if a guest session is present
  const sessionMatch = cookieHeader.match(/(?:^|; )session=([^;]+)/)
  const existingToken = sessionMatch?.[1]
  if (existingToken) {
    try {
      const existing = await verifySession(existingToken, env.SESSION_SECRET)
      if (existing?.userId.startsWith('test_')) {
        const guestId = existing.userId
        const googleId = profile.sub
        await env.DB.batch([
          env.DB.prepare('UPDATE OR IGNORE game_players SET user_id = ? WHERE user_id = ?').bind(googleId, guestId),
          env.DB.prepare('UPDATE games SET host_id = ? WHERE host_id = ?').bind(googleId, guestId),
          env.DB.prepare('UPDATE games SET winner_id = ? WHERE winner_id = ?').bind(googleId, guestId),
        ])
      }
    } catch { /* non-fatal — login must succeed regardless */ }
  }

  const sessionToken = await createSession(
    { userId: profile.sub, email: profile.email, displayName: profile.name },
    env.SESSION_SECRET,
  )

  // Two separate Set-Cookie headers — joining them into one value breaks cookie parsing.
  const headers = new Headers({ Location: '/' })
  headers.append('Set-Cookie', sessionCookie(sessionToken))
  headers.append('Set-Cookie', 'oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/')
  return new Response(null, { status: 302, headers })
}

function handleLogout(): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: '/', 'Set-Cookie': clearSessionCookie() },
  })
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  const token = getSessionToken(request)
  if (token) {
    const session = await verifySession(token, env.SESSION_SECRET)
    if (session) return new Response(JSON.stringify({ user: session }), { headers: jsonHeaders() })
  }

  // No valid session — auto-create a guest account with a random, unguessable ID
  const hex = crypto.randomUUID().replace(/-/g, '')
  const userId = `test_${hex.slice(0, 16)}`
  const displayName = guestDisplayName(hex)

  await env.DB.prepare(`
    INSERT INTO users (id, email, display_name, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).bind(userId, `${userId}@guest`, displayName, Date.now()).run()

  const sessionToken = await createSession(
    { userId, email: `${userId}@guest`, displayName },
    env.SESSION_SECRET,
  )

  const user = { userId, email: `${userId}@guest`, displayName }
  const headers = new Headers(jsonHeaders())
  headers.set('Set-Cookie', sessionCookie(sessionToken))
  return new Response(JSON.stringify({ user }), { headers })
}

function jsonHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json' }
}
