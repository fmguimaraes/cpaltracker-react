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
import {
  apiClient,
  ApiError,
  getAuthToken,
  setAuthToken,
  setSessionLossHandler,
} from '../api/client'
import type { LoginNotice } from './loginNotice'

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
  /**
   * FR15 — the account's role, re-exposed as a dedicated boolean so in-app
   * RBAC gating never has to re-derive it from the `role` enum itself.
   * `false` whenever there is no account (loading/anonymous).
   */
  isAdmin: boolean
  /**
   * KAN-156 (FR10/FR11) — why the user is currently anonymous, for the
   * login screen to show a one-time indicator: `'logged-out'` right after
   * an explicit logout action, `'session-expired'` after the shared
   * session-loss interceptor (FR11/FR12) dropped an authenticated session.
   * `null` for every other anonymous case (e.g. a visitor who was never
   * signed in) — that case must never be mislabeled "session expired".
   */
  notice: LoginNotice | null
  refresh: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [status, setStatus] = useState<AuthState['status']>('loading')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<LoginNotice | null>(null)
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
      setNotice(null)
    } catch (err) {
      if (id !== requestId.current) return
      // KAN-151 review round 3 (A1): a stale token must never survive a
      // failed refresh — otherwise it keeps being sent as `Authorization:
      // Bearer` on later requests (including the next login attempt) after
      // the account it belonged to is no longer considered authenticated.
      setAuthToken(null)
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
   * real `ApiError` carrying the API's `{error:{code,message}}` body) for
   * the caller to map — see `src/auth/authOutcome.ts` (KAN-155) for the
   * outcome→copy translation; this function never renders raw backend text
   * itself.
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
      setNotice(null)
    } catch (err) {
      if (id === requestId.current) {
        setStatus('anonymous')
      }
      throw err
    }
  }, [])

  /**
   * KAN-156 (FR10) — logout is an explicit, authenticated POST only (never a
   * GET or third-party-triggerable link — `POST /api/v1/auth/logout.php`
   * rejects anything but POST with a 405, and this is the only call site in
   * the app). Mirrors CB21/CB35's "always ends the session client-side"
   * intent: `setAuthToken(null)` runs unconditionally in `finally`
   * regardless of whether the server call itself succeeded, same as
   * `cpal_logout()` never refuses to end the local session. The caller
   * (the logout button) is expected to swallow a thrown `ApiError` here —
   * the point of logging out is to stop being authenticated locally, which
   * has already happened by the time this throws.
   *
   * `notice` is set to `'logged-out'` here specifically so `RequireAuth`'s
   * existing anonymous-redirect (FR13, reused as-is) also carries FR10's
   * "logged out" indicator with no second redirect path. Edge case, not
   * further engineered around: if the session-loss interceptor fires for
   * this very request (the token was already server-invalidated the moment
   * the user clicked logout), its `requestId` bump makes this block's own
   * `id === requestId.current` check fail, so `notice` is left as
   * `'session-expired'` (set by the interceptor) rather than
   * `'logged-out'` — both are truthful, and a stricter tie-break isn't
   * worth the added complexity for a race this narrow.
   *
   * Review gate round 1 (B1): `setAuthToken(null)` must NOT run
   * unconditionally — a slow logout POST (or a double-click sending a
   * second one, see `e2e/logout-session.spec.ts`) that settles after a
   * session-loss → re-login cycle would otherwise wipe out the newer token
   * a later successful login already installed. Capturing the token this
   * call actually sent and only clearing it if it's still the current one
   * (the same guard `client.ts`'s `request()` applies to firing session
   * loss) makes ending *this* call's own session never clobber a different,
   * newer one.
   */
  const logout = useCallback(async () => {
    const id = ++requestId.current
    const sentToken = getAuthToken()
    try {
      await apiClient.post('/auth/logout.php')
    } finally {
      if (getAuthToken() === sentToken) {
        setAuthToken(null)
      }
      if (id === requestId.current) {
        setAccount(null)
        setStatus('anonymous')
        setNotice('logged-out')
      }
    }
  }, [])

  /**
   * KAN-156 (FR11/FR12) — registered with `client.ts` (`setSessionLossHandler`)
   * so a plain `fetch` wrapper that can't reach into React state has a way to
   * tell this context "whatever request you had in flight, the server no
   * longer considers it authenticated". Bumps `requestId` first so any
   * already-in-flight `refresh()`/`login()`/`logout()` call's own `finally`/
   * `catch` treats itself as superseded instead of double-applying (or
   * racily overwriting) the state this sets — the same guard those three
   * already use against each other.
   */
  const handleSessionLoss = useCallback(() => {
    requestId.current += 1
    setAuthToken(null)
    setAccount(null)
    setStatus('anonymous')
    setError(null)
    setNotice('session-expired')
  }, [])

  useEffect(() => {
    setSessionLossHandler(handleSessionLoss)
    return () => setSessionLossHandler(null)
  }, [handleSessionLoss])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const isAdmin = account?.role === 'admin'

  const value = useMemo(
    () => ({ account, status, error, isAdmin, notice, refresh, login, logout }),
    [account, status, error, isAdmin, notice, refresh, login, logout],
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
