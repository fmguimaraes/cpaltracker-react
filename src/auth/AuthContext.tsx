import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { apiClient, ApiError } from '../api/client'

/**
 * Account shape as returned by GET /api/v1/account.php (api/openapi.yaml).
 * Scaffolded here (KAN-60 FR4); the full login/logout UI is Auth & Session's
 * job (KAN-136). Backed by a REST/cookie session, not Supabase — see
 * react-frontend-stack-decision.md §3.
 */
export interface Account {
  id: string
  email: string
  mustChangePassword: boolean
}

interface AuthState {
  account: Account | null
  status: 'loading' | 'authenticated' | 'anonymous'
  error: string | null
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [status, setStatus] = useState<AuthState['status']>('loading')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const { account } = await apiClient.get<{ account: Account }>(
        '/account.php',
      )
      setAccount(account)
      setStatus('authenticated')
      setError(null)
    } catch (err) {
      setAccount(null)
      if (err instanceof ApiError && err.status === 401) {
        setStatus('anonymous')
        setError(null)
      } else {
        setStatus('anonymous')
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    }
  }, [])

  const logout = useCallback(async () => {
    await apiClient.post('/auth/logout.php')
    setAccount(null)
    setStatus('anonymous')
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(
    () => ({ account, status, error, refresh, logout }),
    [account, status, error, refresh, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
