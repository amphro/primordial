import { createContext, useContext, useEffect, useState, useCallback, ReactNode, createElement } from 'react'

interface User {
  userId: string
  email: string
  displayName: string
}

interface AuthContext {
  user: User | null
  loading: boolean
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthContext>({ user: null, loading: true, refresh: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/auth/me', { credentials: 'include' })
      const data = await res.json() as { user: User | null }
      setUser(data.user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return createElement(Ctx.Provider, { value: { user, loading, refresh } }, children)
}

export function useAuth() {
  return useContext(Ctx)
}
