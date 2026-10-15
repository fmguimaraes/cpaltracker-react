import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

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
 * Out of scope here (owned by sibling stories): outcome→copy mapping and
 * lockout UX (FR7/FR8 — KAN-155), CSRF (FR9 — KAN-151),
 * `suite`/`MustChangePassword` redirect targeting (FR3/FR6/FR14 —
 * KAN-149/KAN-155). On success this screen redirects to `/` unconditionally;
 * on failure it surfaces the API's own `{error:{code,message}}` text
 * verbatim, never inventing extra detail the backend's anti-enumeration
 * behavior withholds.
 */

interface LoginFormValues {
  email: string
  password: string
}

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ mode: 'onSubmit' })

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setSubmitError(null)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setSubmitError(message || 'Something went wrong. Please try again.')
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
