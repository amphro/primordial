import { handleAuth } from './auth'
import { handleGames } from './games'

export { GameRoom } from './durable-objects/GameRoom'

interface Env {
  DB: D1Database
  KV: KVNamespace
  AI: Ai
  AE: AnalyticsEngineDataset
  GAME_ROOM: DurableObjectNamespace
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  SESSION_SECRET: string
  ORIGIN: string
  ASSETS: Fetcher
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env.ORIGIN) })
    }

    // Origin check for state-mutating requests
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
      const origin = request.headers.get('Origin')
      if (origin && origin !== env.ORIGIN) {
        return new Response('Forbidden', { status: 403 })
      }
    }

    if (url.pathname.startsWith('/auth/')) {
      const res = await handleAuth(request, env)
      return withCors(res, env.ORIGIN)
    }

    if (url.pathname.startsWith('/api/')) {
      const res = await handleGames(request, env)
      // WebSocket upgrade responses have the socket handle attached to the Response
      // object itself — rewrapping with new Response() drops it. Pass through as-is.
      if (res.status === 101) return res
      return withCors(res, env.ORIGIN)
    }

    // Serve frontend static assets
    return env.ASSETS.fetch(request)
  },
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  }
}

function withCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
  return new Response(response.body, { status: response.status, headers })
}
