import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { apiClient } from '../api/client'
import { Card } from '../chrome/Card'
import { PageTitle } from '../chrome/PageTitle'
import {
  FORGOT_PASSWORD_MESSAGES,
  mapForgotPasswordOutcome,
  type ForgotPasswordOutcome,
} from '../auth/forgotPasswordOutcome'
import { LOGIN_PATH } from '../auth/paths'

/**
 * KAN-146 — Forgot Password Flow (FR1, FR2, FR3, NFR3).
 *
 * FR1: e-mail format validated client-side (React Hook Form, `mode:
 * 'onChange'`) and the submit button's `disabled` is driven by
 * `formState.isValid` — this story's own AC is explicit that submit "stays
 * disabled until corrected" as the user types, not only blocked at submit
 * time the way `Login.tsx`'s FR5 (`mode: 'onSubmit'`) is.
 * FR3: the submit is routed through `apiClient` only (the shared
 * bearer-token `/api/v1` client — see react-frontend-stack-decision.md §3;
 * this screen is unauthenticated, so no token is ever attached) — no direct
 * `fetch`, no client-side token minting.
 * FR2/NFR3: only the account-existence-related outcomes (success, unknown/
 * inactive/soft-deleted account, per-account rate limit, mail-send
 * failure) render the identical "check your mailbox" confirmation — see
 * `forgotPasswordOutcome.ts` for exactly which wire responses that covers
 * and why a per-IP `429` throttle and a malformed-body `400` are
 * deliberately NOT part of that collapsed set (review gate round 1, B1).
 * There is deliberately no `if (outcome === ...)` branch anywhere below the
 * single `onSubmit` — `outcome` only ever decides which of a fixed set of
 * strings is shown, never which DOM structure renders; this page still has
 * exactly one post-submit screen layout, just with per-outcome copy.
 */

interface ForgotPasswordFormValues {
  email: string
}

export function ForgotPassword() {
  const [outcome, setOutcome] = useState<ForgotPasswordOutcome | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
  } = useForm<ForgotPasswordFormValues>({ mode: 'onChange' })

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await apiClient.post('/auth/forgot-password.php', { email })
      setOutcome('confirmed')
    } catch (err) {
      setOutcome(mapForgotPasswordOutcome(err))
    }
  })

  if (outcome) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
        <PageTitle>Mot de passe oublié</PageTitle>
        <Card className="flex flex-col gap-6">
          <p
            role="status"
            aria-live="polite"
            data-testid="forgot-password-confirmation"
            style={{ color: 'var(--color-text)' }}
          >
            {FORGOT_PASSWORD_MESSAGES[outcome]}
          </p>
          <Link
            to={LOGIN_PATH}
            data-testid="forgot-password-back-to-login"
            className="text-sm underline"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Retour à la connexion
          </Link>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <PageTitle>Mot de passe oublié</PageTitle>
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Saisissez votre adresse e-mail et nous vous enverrons un lien de
        réinitialisation.
      </p>

      <Card>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={onSubmit}
          data-testid="forgot-password-form"
        >
          <div className="flex flex-col gap-1">
            <label
              htmlFor="forgot-password-email"
              className="text-sm font-medium"
              style={{ color: 'var(--color-text)' }}
            >
              Adresse e-mail
            </label>
            <input
              id="forgot-password-email"
              type="email"
              autoComplete="username"
              data-testid="forgot-password-email"
              aria-invalid={errors.email ? 'true' : 'false'}
              aria-describedby={
                errors.email ? 'forgot-password-email-error' : undefined
              }
              className="rounded-md border px-3 py-2 text-sm"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text)',
              }}
              {...register('email', {
                required: 'Adresse e-mail requise.',
                setValueAs: (value: string) => value.trim(),
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: 'Adresse e-mail invalide.',
                },
              })}
            />
            {errors.email && (
              <p
                id="forgot-password-email-error"
                role="alert"
                aria-live="assertive"
                data-testid="forgot-password-email-error"
                className="text-sm"
                style={{ color: 'var(--color-danger)' }}
              >
                {errors.email.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!isValid || isSubmitting}
            data-testid="forgot-password-submit"
            className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
            }}
          >
            Envoyer le lien de réinitialisation
          </button>

          <Link
            to={LOGIN_PATH}
            data-testid="forgot-password-back-to-login"
            className="text-sm underline"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Retour à la connexion
          </Link>
        </form>
      </Card>
    </main>
  )
}
