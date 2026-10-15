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
    throw await parseErrorBody(response)
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
