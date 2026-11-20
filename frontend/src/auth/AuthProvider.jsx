import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, getToken, setToken, setUnauthorizedHandler } from '@/api/client'

/**
 * @typedef {Object} AuthState
 * @property {import('@/api/shapes').User | null} user
 * @property {'loading' | 'signed-in' | 'signed-out'} status
 * @property {(email: string, password: string) => Promise<import('@/api/shapes').User>} signIn
 * @property {() => void} signOut
 */

const AuthContext = createContext(/** @type {AuthState | null} */ (null))

/**
 * Who is signed in (stage 6). On mount with a stored token it asks GET /auth/me and stays `loading` until the
 * backend answers; without a token, or when the token is rejected, it is `signed-out`. A 401 from any other
 * request (token expired) also switches to signed-out through the client's unauthorized handler.
 */
export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(() => (getToken() ? 'loading' : 'signed-out'))

  const signOut = useCallback(() => {
    setToken(null)
    queryClient.clear()
    setUser(null)
    setStatus('signed-out')
  }, [queryClient])

  // Token expired or rejected on any request: forget it and go to the login page. Cached data is cleared too so
  // the next user never sees the previous user's views.
  useEffect(() => {
    setUnauthorizedHandler(signOut)
    return () => setUnauthorizedHandler(null)
  }, [signOut])

  // Resume the stored session once on mount.
  useEffect(() => {
    if (!getToken()) return undefined
    let cancelled = false
    apiGet('/auth/me')
      .then((me) => {
        if (cancelled) return
        setUser(me)
        setStatus('signed-in')
      })
      .catch(() => {
        if (cancelled) return
        // A 401 has already cleared the token through the unauthorized handler; a network error keeps it so a
        // reload can retry, but the user still has to sign in to use the app now.
        setUser(null)
        setStatus('signed-out')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (email, password) => {
    const result = await apiPost('/auth/login', { email, password })
    setToken(result.access_token)
    setUser(result.user)
    setStatus('signed-in')
    return result.user
  }, [])

  const value = useMemo(() => ({ user, status, signIn, signOut }), [user, status, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Current auth state. Must be used inside <AuthProvider>. */
// The provider and its hook live together on purpose; a change here reloads the whole tree, which is fine.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
