export interface SessionPayload {
  userId: string
  email: string
  displayName: string
}

const COOKIE_NAME = 'session'
const TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const raw = enc.encode(secret)
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function createSession(payload: SessionPayload, secret: string): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS
  const body = btoa(JSON.stringify({ ...payload, exp }))
  const key = await getKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
  return `${header}.${body}.${sigB64}`
}

export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
  try {
    const [header, body, sig] = token.split('.')
    if (!header || !body || !sig) return null
    const key = await getKey(secret)
    const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0))
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(`${header}.${body}`))
    if (!valid) return null
    const payload = JSON.parse(atob(body)) as SessionPayload & { exp: number }
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return { userId: payload.userId, email: payload.email, displayName: payload.displayName }
  } catch {
    return null
  }
}

export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_SECONDS}; Path=/`
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/`
}

export function getSessionToken(request: Request): string | null {
  const cookie = request.headers.get('Cookie') ?? ''
  const match = cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`))
  return match ? match[1] : null
}
