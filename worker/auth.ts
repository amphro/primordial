import { createSession, sessionCookie, clearSessionCookie, getSessionToken, verifySession } from './lib/session'

interface Env {
  DB: D1Database
  KV: KVNamespace
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  SESSION_SECRET: string
  ORIGIN: string
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

  const sessionToken = await createSession(
    { userId: profile.sub, email: profile.email, displayName: profile.name },
    env.SESSION_SECRET,
  )

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': [
        sessionCookie(sessionToken),
        // Clear the oauth state cookie
        'oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/',
      ].join(', '),
    },
  })
}

function handleLogout(): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: '/', 'Set-Cookie': clearSessionCookie() },
  })
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  const token = getSessionToken(request)
  if (!token) return new Response(JSON.stringify({ user: null }), { headers: jsonHeaders() })
  const session = await verifySession(token, env.SESSION_SECRET)
  if (!session) return new Response(JSON.stringify({ user: null }), { headers: jsonHeaders() })
  return new Response(JSON.stringify({ user: session }), { headers: jsonHeaders() })
}

function jsonHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json' }
}
