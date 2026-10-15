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

/**
 * The subset of Account returned alongside a freshly issued token by
 * POST /auth/login.php (api/openapi.yaml `AccountSummary` schema) — no
 * `telephone`/`lastLoginAt`. KAN-145 fills those two with `null` until a
 * later `refresh()` (GET /account.php) backfills the full record.
 */
type AccountSummary = Omit<Account, 'telephone' | 'lastLoginAt'>

interface LoginResponse {
  token: string
  expiresAt: string
  account: AccountSummary
}

interface AuthState {
  account: Account | null
  status: 'loading' | 'authenticated' | 'anonymous'
  error: string | null
  refresh: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
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

  /**
   * KAN-145 (FR4): submits credentials to POST /auth/login.php via the
   * bearer-token `apiClient` (never cookies — stack decision §3) and, on
   * success, stores the issued token + account summary. Race-guarded with
   * the same `requestId` pattern as `refresh`/`logout` so a stale in-flight
   * submission can't clobber a newer one. Errors are rethrown as-is (the
   * real `{error:{code,message}}` body from the API) for the caller to
   * display — this never adds client-side detail the backend's
   * anti-enumeration behavior deliberately withholds.
   */
  const login = useCallback(async (email: string, password: string) => {
    const id = ++requestId.current
    try {
      const { token, account: summary } = await apiClient.post<LoginResponse>(
        '/auth/login.php',
        { email, password },
      )
      if (id !== requestId.current) {
        // A newer auth action (another login, or logout) has started since
        // this request was sent — never let a superseded success resolve
        // as if it were the caller's own outcome.
        throw new Error('Login superseded by a newer auth action')
      }
      setAuthToken(token)
      setAccount({ ...summary, telephone: null, lastLoginAt: null })
      setStatus('authenticated')
      setError(null)
    } catch (err) {
      if (id === requestId.current) {
        setStatus('anonymous')
      }
      throw err
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
    () => ({ account, status, error, refresh, login, logout }),
    [account, status, error, refresh, login, logout],
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
