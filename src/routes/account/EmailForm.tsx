import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { mapAccountActionOutcome } from '../../auth/accountActionOutcome'
import type { Account } from '../../auth/AuthContext'
import { useAuth } from '../../auth/AuthContext'

/**
 * KAN-152 (FR14). Lowercases/trims client-side, validates format and
 * rejects a value identical to the current address before ever submitting
 * — the API's own duplicate-with-another-account rejection (400
 * invalid_field) can only be known server-side and is rendered verbatim by
 * `accountActionOutcome.ts`. `GET`/`PATCH /account.php` never return
 * `MailVerifieAt` (it isn't part of the `Account` schema at all), so the
 * "becomes unverified" fact FR14 asks for is shown as a fixed line in the
 * success confirmation, not a live, persisted indicator.
 */
interface EmailFormValues {
  currentPassword: string
  email: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function EmailForm({ account }: { account: Account }) {
  const { updateAccount } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EmailFormValues>({
    mode: 'onSubmit',
    defaultValues: { currentPassword: '', email: account.mail },
  })

  const onSubmit = handleSubmit(async ({ currentPassword, email }) => {
    setFormError(null)
    setSuccess(false)
    const normalized = email.trim().toLowerCase()
    try {
      await updateAccount({ currentPassword, email: normalized })
      setSuccess(true)
      reset({ currentPassword: '', email: normalized })
    } catch (err) {
      setFormError(mapAccountActionOutcome(err).message)
    }
  })

  return (
    <section className="flex flex-col gap-4" data-testid="account-email-section">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
        Adresse de connexion
      </h2>

      {success && (
        <p
          role="status"
          aria-live="polite"
          data-testid="account-email-success"
          style={{ color: 'var(--color-text)' }}
        >
          Adresse enregistrée. Elle n'est pas encore vérifiée.
        </p>
      )}

      <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit} data-testid="account-email-form">
        {formError && (
          <p
            role="alert"
            aria-live="assertive"
            data-testid="account-email-form-error"
            className="text-sm"
            style={{ color: 'var(--color-danger)' }}
          >
            {formError}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="account-email-address" className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            Nouvelle adresse e-mail
          </label>
          <input
            id="account-email-address"
            type="email"
            data-testid="account-email-address"
            aria-invalid={errors.email ? 'true' : 'false'}
            aria-describedby={errors.email ? 'account-email-address-error' : undefined}
            className="rounded-md border px-3 py-2 text-sm"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
            }}
            {...register('email', {
              required: 'Adresse e-mail requise.',
              setValueAs: (value: string) => value.trim().toLowerCase(),
              validate: (value) => {
                if (!EMAIL_PATTERN.test(value)) return 'Adresse e-mail invalide.'
                if (value === account.mail.trim().toLowerCase()) {
                  return "C'est déjà votre adresse actuelle."
                }
                return true
              },
            })}
          />
          {errors.email && (
            <p
              id="account-email-address-error"
              role="alert"
              aria-live="assertive"
              data-testid="account-email-address-error"
              className="text-sm"
              style={{ color: 'var(--color-danger)' }}
            >
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="account-email-current-password" className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            Mot de passe actuel
          </label>
          <input
            id="account-email-current-password"
            type="password"
            autoComplete="current-password"
            data-testid="account-email-current-password"
            className="rounded-md border px-3 py-2 text-sm"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
            }}
            {...register('currentPassword', { required: 'Mot de passe actuel requis.' })}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="account-email-submit"
          className="self-start rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text)',
          }}
        >
          Enregistrer l'adresse
        </button>
      </form>
    </section>
  )
}
