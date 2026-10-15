import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getAuthOutcomeMessage } from '../auth/authOutcome'
import { CHANGE_PASSWORD_PATH, HOME_PATH } from '../auth/paths'
import { sanitizeSuite } from '../auth/suite'

/**
 * KAN-145 — Login Screen & Credential Submission.
 * Covers FR1 (themed login form), FR4 (submit to /api/v1 auth endpoint via
 * the bearer-token `apiClient`), FR5 (block empty-field submission inline,
 * no request issued), NFR4 (no blocking work before first paint — the form
 * renders immediately; `AuthContext` bootstrap runs independently),
 * NFR5 (labeled, keyboard-navigable fields; errors announced via
 * `aria-live`) and NFR6 (styling from design tokens only — see
 * `src/theme/tokens.css`).
 *
 * KAN-149 adds FR2 (an already-authenticated bootstrap — or a login that
 * just succeeded — skips this form and redirects to the validated `suite`
 * target, else home) and the FR3/FR14 redirect-targeting it depends on
 * (`sanitizeSuite`, the `MustChangePassword` redirect to
 * `CHANGE_PASSWORD_PATH`). Single effect below, reacting to `status`/
 * `account`, so there is exactly one place that decides "where does an
 * authenticated visitor on this screen go" — no separate manual navigate on
 * submit success racing it.
 *
 * KAN-155 adds FR7/FR8/NFR9: on failure this screen never shows the raw
 * `{error:{code,message}}` body — it maps the thrown `ApiError` through
 * `mapAuthOutcome`/`getAuthOutcomeMessage` (`src/auth/authOutcome.ts`) to one
 * of a fixed set of non-revealing, French, anti-enumeration-safe messages.
 */

interface LoginFormValues {
  email: string
  password: string
}

export function Login() {
  const { login, status, account } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ mode: 'onSubmit' })

  // FR2/FR3/FR14 — once a session is authenticated (bootstrap found one, or
  // a submit just succeeded), skip the form: send a MustChangePassword
  // account to the password-change route, otherwise to the validated
  // `suite` target, else home (replicates CB1).
  useEffect(() => {
    if (status !== 'authenticated') return
    if (account?.mustChangePassword) {
      navigate(CHANGE_PASSWORD_PATH, { replace: true })
      return
    }
    const suite = sanitizeSuite(searchParams.get('suite'))
    navigate(suite || HOME_PATH, { replace: true })
  }, [status, account, searchParams, navigate])

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setSubmitError(null)
    try {
      await login(email, password)
    } catch (err) {
      // FR7/FR8/NFR9 — mapped, non-revealing copy only; never the raw
      // backend message (see authOutcome.ts for why).
      setSubmitError(getAuthOutcomeMessage(err))
    }
  })

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <h1
        className="text-xl font-semibold"
        style={{ color: 'var(--color-text)' }}
      >
        Sign in
      </h1>

      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={onSubmit}
        data-testid="login-form"
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="login-email"
            className="text-sm font-medium"
            style={{ color: 'var(--color-text)' }}
          >
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            data-testid="login-email"
            aria-invalid={errors.email ? 'true' : 'false'}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
            className="rounded-md border px-3 py-2 text-sm"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
            }}
            {...register('email', {
              required: 'Email is required.',
              setValueAs: (value: string) => value.trim(),
            })}
          />
          {errors.email && (
            <p
              id="login-email-error"
              role="alert"
              aria-live="assertive"
              data-testid="login-email-error"
              className="text-sm"
              style={{ color: 'var(--color-danger)' }}
            >
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="login-password"
            className="text-sm font-medium"
            style={{ color: 'var(--color-text)' }}
          >
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            data-testid="login-password"
            aria-invalid={errors.password ? 'true' : 'false'}
            aria-describedby={
              errors.password ? 'login-password-error' : undefined
            }
            className="rounded-md border px-3 py-2 text-sm"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
            }}
            {...register('password', { required: 'Password is required.' })}
          />
          {errors.password && (
            <p
              id="login-password-error"
              role="alert"
              aria-live="assertive"
              data-testid="login-password-error"
              className="text-sm"
              style={{ color: 'var(--color-danger)' }}
            >
              {errors.password.message}
            </p>
          )}
        </div>

        {submitError && (
          <p
            role="alert"
            aria-live="assertive"
            data-testid="login-error"
            className="text-sm"
            style={{ color: 'var(--color-danger)' }}
          >
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="login-submit"
          className="rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-60"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-primary-contrast)',
          }}
        >
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
