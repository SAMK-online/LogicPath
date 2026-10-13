import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setCsrfToken, setUnauthorizedHandler } from '../services/api'
import type { User } from '../types/api'

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (b: { name: string; email: string; password: string; confirm_password: string }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const clear = useCallback(() => { setCsrfToken(null); setUser(null) }, [])

  useEffect(() => {
    setUnauthorizedHandler(clear) // an expired session anywhere sends the user to /login
    let cancelled = false
    api.me()
      .then((r) => { if (!cancelled) { setCsrfToken(r.csrf_token); setUser(r.user) } })
      .catch(() => { /* not logged in */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true; setUnauthorizedHandler(null) }
  }, [clear])

  const value = useMemo<AuthState>(() => ({
    user, loading,
    login: async (email, password) => { const r = await api.login({ email, password }); setCsrfToken(r.csrf_token); setUser(r.user) },
    register: async (b) => { const r = await api.register(b); setCsrfToken(r.csrf_token); setUser(r.user) },
    logout: async () => {
      try { await api.logout() } catch { /* session may already be gone; log out locally regardless */ }
      clear()
    },
  }), [user, loading, clear])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
