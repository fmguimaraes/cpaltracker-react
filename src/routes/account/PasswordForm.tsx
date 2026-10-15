import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { mapAccountActionOutcome } from '../../auth/accountActionOutcome'
import { useAuth } from '../../auth/AuthContext'

/**
 * KAN-152 (FR11, FR12). On success: (a) renders the explicit "other open
 * sessions closed" message (FR12/GAP2) and (b) keeps the acting session
 * logged in — the latter via `AuthContext.updateAccount`'s own transparent
 * re-authentication (GAP5, stack-decision.md §11), not anything this form
 * does itself.
 */
interface PasswordFormValues {
  currentPassword: string
  password: string
  passwordConfirmation: string
}

export function PasswordForm() {
  const { updateAccount } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting, isValid },
  } = useForm<PasswordFormValues>({ mode: 'onChange' })

  const onSubmit = handleSubmit(async ({ currentPassword, password, passwordConfirmation }) => {
    setFormError(null)
    setSuccess(false)
    try {
      await updateAccount({ currentPassword, password, passwordConfirmation })
      setSuccess(true)
      reset()
    } catch (err) {
      setFormError(mapAccountActionOutcome(err).message)
    }
  })

  return (
    <section className="flex flex-col gap-4" data-testid="account-password-section">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
        Mot de passe
      </h2>

      {success && (
        <p
          role="status"
          aria-live="polite"
          data-testid="account-password-success"
          style={{ color: 'var(--color-text)' }}
        >
          Mot de passe enregistré. Toutes vos autres sessions ont été fermées —
          vous restez connecté ici.
        </p>
      )}

      <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit} data-testid="account-password-form">
        {formError && (
          <p
            role="alert"
            aria-live="assertive"
            data-testid="account-password-form-error"
            className="text-sm"
            style={{ color: 'var(--color-danger)' }}
          >
            {formError}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="account-password-current" className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            Mot de passe actuel
          </label>
          <input
            id="account-password-current"
            type="password"
            autoComplete="current-password"
            data-testid="account-password-current"
            className="rounded-md border px-3 py-2 text-sm"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
            }}
            {...register('currentPassword', {
              required: 'Mot de passe actuel requis.',
              deps: ['password'],
            })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="account-password-new" className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            Nouveau mot de passe
          </label>
          <input
            id="account-password-new"
            type="password"
            autoComplete="new-password"
            data-testid="account-password-new"
            aria-invalid={errors.password ? 'true' : 'false'}
            aria-describedby={errors.password ? 'account-password-new-error' : undefined}
            className="rounded-md border px-3 py-2 text-sm"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
            }}
            {...register('password', {
              required: 'Nouveau mot de passe requis.',
              deps: ['passwordConfirmation'],
              validate: (value) =>
                value !== watch('currentPassword') ||
                'Le nouveau mot de passe doit être différent de l\'ancien.',
            })}
          />
          {errors.password && (
            <p
              id="account-password-new-error"
              role="alert"
              aria-live="assertive"
              data-testid="account-password-new-error"
              className="text-sm"
              style={{ color: 'var(--color-danger)' }}
            >
              {errors.password.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="account-password-confirmation" className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            Confirmer le nouveau mot de passe
          </label>
          <input
            id="account-password-confirmation"
            type="password"
            autoComplete="new-password"
            data-testid="account-password-confirmation"
            aria-invalid={errors.passwordConfirmation ? 'true' : 'false'}
            aria-describedby={
              errors.passwordConfirmation ? 'account-password-confirmation-error' : undefined
            }
            className="rounded-md border px-3 py-2 text-sm"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
            }}
            {...register('passwordConfirmation', {
              required: 'Confirmation requise.',
              validate: (value) => value === watch('password') || 'Les deux saisies diffèrent.',
            })}
          />
          {errors.passwordConfirmation && (
            <p
              id="account-password-confirmation-error"
              role="alert"
              aria-live="assertive"
              data-testid="account-password-confirmation-error"
              className="text-sm"
              style={{ color: 'var(--color-danger)' }}
            >
              {errors.passwordConfirmation.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={!isValid || isSubmitting}
          data-testid="account-password-submit"
          className="self-start rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text)',
          }}
        >
          Enregistrer le mot de passe
        </button>
      </form>
    </section>
  )
}
