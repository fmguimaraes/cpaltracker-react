/**
 * Thin wrapper over fetch() against cpaltracker.web's /api/v1 (KAN-116).
 * Base URL is resolved from VITE_API_BASE_URL at build/runtime (KAN-60 FR2)
 * — no backend host is ever hardcoded here. The API is bearer-token
 * authenticated and never relies on cookies (api/v1/_lib.php — no
 * Access-Control-Allow-Credentials header is ever sent); the token issued by
 * POST /auth/login.php is held in memory here and attached as
 * `Authorization: Bearer <token>` (stack decision §3).
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

let authToken: string | null = null

export function setAuthToken(token: string | null): void {
  authToken = token
}

/**
 * KAN-156 (FR11/FR12) — shared session-loss notification.
 *
 * A plain `fetch`-wrapping module like this one can't call back into a React
 * context directly, so `AuthContext` registers itself here (mirroring
 * `setAuthToken`'s own module-variable pattern) instead of this file
 * importing React/AuthContext — keeping the dependency pointed the one way
 * it's safe to point (client.ts has no React import, same as today).
 */
type SessionLossHandler = () => void
let sessionLossHandler: SessionLossHandler | null = null

export function setSessionLossHandler(handler: SessionLossHandler | null): void {
  sessionLossHandler = handler
}

function resolveBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL
  if (!baseUrl) {
    throw new Error(
      'VITE_API_BASE_URL is not set — the app cannot resolve an /api/v1 target.',
    )
  }
  return baseUrl.replace(/\/+$/, '')
}

interface ErrorBody {
  error?: { code?: unknown; message?: unknown }
}

async function parseErrorBody(response: Response): Promise<ApiError> {
  let message = response.statusText
  let code: string | undefined
  try {
    const body = (await response.json()) as ErrorBody
    if (typeof body.error?.message === 'string') message = body.error.message
    if (typeof body.error?.code === 'string') code = body.error.code
  } catch {
    // body wasn't JSON — fall back to statusText
  }
  return new ApiError(response.status, message, code)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Captured before the request is sent: the session-loss check below needs
  // to know whether *this* call believed it was authenticated, not whatever
  // `authToken` happens to hold by the time the response comes back.
  const hadToken = authToken !== null
  const url = `${resolveBaseUrl()}${path}`
  const response = await fetch(url, {
    ...init,
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const apiError = await parseErrorBody(response)
    // FR11/FR12 — the real `/api/v1` (`cpal_api_require_auth_error()`,
    // `auth.php`) sends exactly one distinguishable signal for every one of
    // the legacy idle-timeout/absolute-timeout/account-disabled/
    // epoch-mismatch session-loss cases: `401 unauthorized`
    // ("Missing, invalid or expired token."). The same code/status is also
    // what a bearer-less request gets (e.g. the very first anonymous
    // bootstrap call, which never had a session to lose) — `hadToken` is
    // what tells those two apart: only a request that *was* carrying a
    // token and still got rejected as unauthorized counts as a session
    // dropping out from under an already-authenticated caller. A failed
    // `POST /auth/login.php` never qualifies either way: that endpoint
    // requires no bearer token at all (`security: []`) and always replies
    // with code `invalid_credentials`, never `unauthorized` — see
    // react-frontend-stack-decision.md §8 for the full reconciliation.
    if (hadToken && apiError.status === 401 && apiError.code === 'unauthorized') {
      sessionLossHandler?.()
    }
    throw apiError
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
}
