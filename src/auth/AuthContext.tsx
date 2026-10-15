import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { apiClient, ApiError, setAuthToken } from '../api/client'

/**
 * Account shape as returned by GET /api/v1/account.php (api/openapi.yaml
 * `Account` schema). Scaffolded here (KAN-60 FR4); the full login/logout UI
 * is Auth & Session's job (KAN-136). The API is bearer-token authenticated,
 * not cookie/session-based — see react-frontend-stack-decision.md §3.
 */
export interface Account {
  userId: number
  clientId: number | null
  mail: string
  nom: string
  prenom: string
  role: 'admin' | 'client'
  telephone: string | null
  lastLoginAt: string | null
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
  const requestId = useRef(0)

  const refresh = useCallback(async () => {
    const id = ++requestId.current
    try {
      const { account } = await apiClient.get<{ account: Account }>(
        '/account.php',
      )
      if (id !== requestId.current) return
      setAccount(account)
      setStatus('authenticated')
      setError(null)
    } catch (err) {
      if (id !== requestId.current) return
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
    const id = ++requestId.current
    try {
      await apiClient.post('/auth/logout.php')
    } finally {
      setAuthToken(null)
      if (id === requestId.current) {
        setAccount(null)
        setStatus('anonymous')
      }
    }
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
