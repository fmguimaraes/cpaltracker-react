import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { mapAccountActionOutcome } from '../../auth/accountActionOutcome'
import type { Account } from '../../auth/AuthContext'
import { useAuth } from '../../auth/AuthContext'

/**
 * KAN-152 (FR13). Client-side validation only GATES submission (rejects an
 * obviously wrong format inline) — it never computes the stored E.164
 * value itself; the raw, trimmed input is sent as-is and
 * `account_logic.php`'s `cpal_compte_changer_telephone` remains the one
 * place that normalizes a French national number to E.164. An empty
 * submission is a valid "clear the number" action, not an error.
 */
interface PhoneFormValues {
  currentPassword: string
  phone: string
}

function isAcceptablePhoneFormat(value: string): boolean {
  const stripped = value.replace(/[\s.()-]/g, '')
  if (stripped === '') return true
  if (/^0[1-9][0-9]{8}$/.test(stripped)) return true
  return /^\+[1-9][0-9]{7,14}$/.test(stripped)
}

export function PhoneForm({ account }: { account: Account }) {
  const { updateAccount } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PhoneFormValues>({
    mode: 'onSubmit',
    defaultValues: { currentPassword: '', phone: account.telephone ?? '' },
  })

  const onSubmit = handleSubmit(async ({ currentPassword, phone }) => {
    setFormError(null)
    setSuccess(null)
    try {
      await updateAccount({ currentPassword, phone: phone.trim() })
      setSuccess(phone.trim() === '' ? 'Numéro supprimé.' : 'Numéro enregistré.')
      reset({ currentPassword: '', phone: phone.trim() })
    } catch (err) {
      setFormError(mapAccountActionOutcome(err).message)
    }
  })

  return (
    <section className="flex flex-col gap-4" data-testid="account-phone-section">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
        Téléphone
      </h2>

      {success && (
        <p
          role="status"
          aria-live="polite"
          data-testid="account-phone-success"
          style={{ color: 'var(--color-text)' }}
        >
          {success}
        </p>
      )}

      <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit} data-testid="account-phone-form">
        {formError && (
          <p
            role="alert"
            aria-live="assertive"
            data-testid="account-phone-form-error"
            className="text-sm"
            style={{ color: 'var(--color-danger)' }}
          >
            {formError}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="account-phone-number" className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            Numéro
          </label>
          <input
            id="account-phone-number"
            type="tel"
            placeholder="+33612345678"
            data-testid="account-phone-number"
            aria-invalid={errors.phone ? 'true' : 'false'}
            aria-describedby={errors.phone ? 'account-phone-number-error' : undefined}
            className="rounded-md border px-3 py-2 text-sm"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
            }}
            {...register('phone', {
              validate: (value) =>
                isAcceptablePhoneFormat(value) ||
                'Format attendu : +33612345678 (indicatif pays compris).',
            })}
          />
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Format international. Laissez vide pour supprimer le numéro.
          </p>
          {errors.phone && (
            <p
              id="account-phone-number-error"
              role="alert"
              aria-live="assertive"
              data-testid="account-phone-number-error"
              className="text-sm"
              style={{ color: 'var(--color-danger)' }}
            >
              {errors.phone.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="account-phone-current-password" className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            Mot de passe actuel
          </label>
          <input
            id="account-phone-current-password"
            type="password"
            autoComplete="current-password"
            data-testid="account-phone-current-password"
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
          data-testid="account-phone-submit"
          className="self-start rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text)',
          }}
        >
          Enregistrer le numéro
        </button>
      </form>
    </section>
  )
}
