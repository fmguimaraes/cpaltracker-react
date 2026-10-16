import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import { Card } from '../chrome/Card'
import { PageTitle } from '../chrome/PageTitle'
import { FORGOT_PASSWORD_PATH, LOGIN_PATH } from '../auth/paths'
import { isTokenTerminalOutcome, mapResetPasswordOutcome } from '../auth/resetPasswordOutcome'

/**
 * KAN-148 — Reset Password Flow (FR4-FR8, NFR4, NFR7).
 *
 * FR4/NFR4: the `t` token is read from the URL once, into component state
 * (not re-read from `location.search` on every render) and never shown as
 * page text, logged, or written to any persisted storage; a
 * `<meta name="referrer">` of `no-referrer` is installed for the lifetime
 * of this screen only, to stop it leaking via the `Referer` header of any
 * third-party resource this page might load.
 * FR5: match-check is the only client-side password rule — FR6 forbids
 * re-implementing the NIST/HIBP policy itself, so length/strength are
 * left entirely to the server's verbatim rejection text.
 * FR7: `resetPasswordOutcome.ts`'s `invalidToken`/`ipThrottle` buckets are
 * both token-terminal (the link itself can't be redeemed) — this mirrors
 * `reset_password.php`'s own `$compte === null` branch: hide the form,
 * show the (already distinct, server-authored) message, and offer a link
 * to request a new one. Every other outcome (`weakPassword`,
 * `invalidRequest`, `serviceUnavailable`) is recoverable — the form stays
 * up with an inline error banner, matching that same legacy page's
 * `$compte !== null` branch.
 * FR8: success replaces the form with a confirmation stating the password
 * changed and that every other session/API token was revoked (NFR8), with
 * a route to log in.
 */

interface ResetPasswordFormValues {
  password: string
  confirmation: string
}

export function ResetPassword() {
  const [searchParams] = useSearchParams()
  const [token] = useState(() => searchParams.get('t')?.trim() ?? '')
  const [tokenProblem, setTokenProblem] = useState<string | null>(
    token === ''
      ? 'Lien incomplet. Reprenez le message reçu par e-mail.'
      : null,
  )
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, isValid },
  } = useForm<ResetPasswordFormValues>({ mode: 'onChange' })

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'referrer'
    meta.content = 'no-referrer'
    document.head.appendChild(meta)
    return () => {
      meta.remove()
    }
  }, [])

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null)
    try {
      await apiClient.post('/auth/reset-password.php', { token, password })
      setSuccess(true)
    } catch (err) {
      const mapped = mapResetPasswordOutcome(err)
      if (isTokenTerminalOutcome(mapped.outcome)) {
        setTokenProblem(mapped.message)
      } else {
        setFormError(mapped.message)
      }
    }
  })

  if (success) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
        <PageTitle>Nouveau mot de passe</PageTitle>
        <Card className="flex flex-col gap-6">
          <p
            role="status"
            aria-live="polite"
            data-testid="reset-password-success"
            style={{ color: 'var(--color-text)' }}
          >
            Votre mot de passe a été modifié. Toutes vos autres sessions ont été
            fermées — reconnectez-vous avec votre nouveau mot de passe.
          </p>
          <Link
            to={LOGIN_PATH}
            data-testid="reset-password-login-link"
            className="text-sm underline"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Se connecter
          </Link>
        </Card>
      </main>
    )
  }

  if (tokenProblem) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
        <PageTitle>Nouveau mot de passe</PageTitle>
        <Card className="flex flex-col gap-6">
          <p
            role="alert"
            aria-live="assertive"
            data-testid="reset-password-token-problem"
            style={{ color: 'var(--color-danger)' }}
          >
            {tokenProblem}
          </p>
          <Link
            to={FORGOT_PASSWORD_PATH}
            data-testid="reset-password-request-new-link"
            className="text-sm underline"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Demander un nouveau lien
          </Link>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <PageTitle>Nouveau mot de passe</PageTitle>

      <Card>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={onSubmit}
          data-testid="reset-password-form"
        >
          {formError && (
            <p
              role="alert"
              aria-live="assertive"
              data-testid="reset-password-form-error"
              className="text-sm"
              style={{ color: 'var(--color-danger)' }}
            >
              {formError}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label
              htmlFor="reset-password-password"
              className="text-sm font-medium"
              style={{ color: 'var(--color-text)' }}
            >
              Nouveau mot de passe
            </label>
            <input
              id="reset-password-password"
              type="password"
              autoComplete="new-password"
              data-testid="reset-password-password"
              aria-invalid={errors.password ? 'true' : 'false'}
              aria-describedby={
                errors.password ? 'reset-password-password-error' : undefined
              }
              className="rounded-md border px-3 py-2 text-sm"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text)',
              }}
              {...register('password', {
                required: 'Mot de passe requis.',
                deps: ['confirmation'],
              })}
            />
            {errors.password && (
              <p
                id="reset-password-password-error"
                role="alert"
                aria-live="assertive"
                data-testid="reset-password-password-error"
                className="text-sm"
                style={{ color: 'var(--color-danger)' }}
              >
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="reset-password-confirmation"
              className="text-sm font-medium"
              style={{ color: 'var(--color-text)' }}
            >
              Confirmer le mot de passe
            </label>
            <input
              id="reset-password-confirmation"
              type="password"
              autoComplete="new-password"
              data-testid="reset-password-confirmation"
              aria-invalid={errors.confirmation ? 'true' : 'false'}
              aria-describedby={
                errors.confirmation
                  ? 'reset-password-confirmation-error'
                  : undefined
              }
              className="rounded-md border px-3 py-2 text-sm"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text)',
              }}
              {...register('confirmation', {
                required: 'Confirmation requise.',
                validate: (value) =>
                  value === watch('password') || 'Les deux saisies diffèrent.',
              })}
            />
            {errors.confirmation && (
              <p
                id="reset-password-confirmation-error"
                role="alert"
                aria-live="assertive"
                data-testid="reset-password-confirmation-error"
                className="text-sm"
                style={{ color: 'var(--color-danger)' }}
              >
                {errors.confirmation.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!isValid || isSubmitting}
            data-testid="reset-password-submit"
            className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
            }}
          >
            Enregistrer
          </button>
        </form>
      </Card>
    </main>
  )
}
