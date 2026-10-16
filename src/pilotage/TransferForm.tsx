import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Contract } from '../api/contracts'
import { ApiError } from '../api/client'
import { postDeviceTransfer, type TransferResult } from '../api/transfer'
import { isContractInactiveError } from './activeState'
import { fetchTransferTargets } from './transferTargets'

type FormValues = {
  targetContractId: string
  startDate: string
  endDate: string
}

type Phase =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; targets: Contract[] }

type Flash = { kind: 'ok' | 'ko'; message: string }

/**
 * KAN-169 (FR14-FR17) — the device transfer form.
 *
 * - FR14/CB22: the target select is built only from `fetchTransferTargets()`
 *   (see that file's doc comment for the FR14 gap this proxies around) —
 *   never a free-text contract id.
 * - FR15/CB23: `startDate` is required; `endDate` is optional — omitting it
 *   is explicitly messaged as "open-ended" rather than left ambiguous.
 * - FR16/CB24: a basic client-side check that `endDate` (if supplied) is
 *   strictly after `startDate`; window/overlap/parentage/active checks are
 *   `/api/v1`'s alone (GAP5 — this component never recomputes them).
 * - FR17/CB20-CB28: submits only to `POST /devices/{deviceId}/transfer`
 *   (`src/api/transfer.ts`) and renders the API's own accept/reject result
 *   verbatim as a flash — never a client-guessed message. A `409
 *   contract_inactive` (GAP2/GAP3, same shared primitive as
 *   `src/pilotage/activeState.ts` documents for KAN-166's settings submit)
 *   additionally disables the submit control going forward, since the API
 *   has now told us this contract cannot accept writes today (FR4's
 *   disabled-submit intent, reactively — there is still no proactive
 *   active/inactive flag to read ahead of a write, see
 *   `loadPilotageWorkspace.ts`'s doc comment for that same gap).
 * - FR20: the flash is plain component state, never persisted to the URL
 *   or session storage, so a browser refresh after a submit starts the
 *   component fresh rather than replaying anything.
 */
export function TransferForm({
  deviceId,
  onTransferred,
}: {
  deviceId: string
  onTransferred?: (result: TransferResult) => void
}) {
  const [phase, setPhase] = useState<Phase>({ status: 'loading' })
  const [flash, setFlash] = useState<Flash | null>(null)
  const [contractInactive, setContractInactive] = useState(false)
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { targetContractId: '', startDate: '', endDate: '' } })

  const startDate = watch('startDate')

  useEffect(() => {
    let cancelled = false
    setPhase({ status: 'loading' })
    fetchTransferTargets()
      .then((targets) => {
        if (cancelled) return
        setPhase({ status: 'ready', targets })
      })
      .catch(() => {
        if (cancelled) return
        setPhase({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [deviceId])

  if (phase.status === 'loading') {
    return (
      <p data-testid="transfer-form-loading" style={{ color: 'var(--color-text-muted)' }}>
        Chargement des contrats destinataires…
      </p>
    )
  }

  if (phase.status === 'error') {
    return (
      <p data-testid="transfer-form-error" role="alert" style={{ color: 'var(--color-danger)' }}>
        Impossible de charger les contrats destinataires. Réessayez plus tard.
      </p>
    )
  }

  const { targets } = phase

  async function onValid(values: FormValues) {
    setFlash(null)
    try {
      const result = await postDeviceTransfer(deviceId, {
        targetContractId: Number(values.targetContractId),
        startDate: values.startDate,
        endDate: values.endDate === '' ? null : values.endDate,
      })
      setFlash({
        kind: 'ok',
        message: result.openEnded
          ? 'Transfert enregistré (en cours, sans date de fin).'
          : `Transfert enregistré, jusqu'au ${result.endDate}.`,
      })
      reset({ targetContractId: '', startDate: '', endDate: '' })
      onTransferred?.(result)
    } catch (error) {
      if (error instanceof ApiError) {
        if (isContractInactiveError(error)) {
          setContractInactive(true)
        }
        setFlash({ kind: 'ko', message: error.message })
        return
      }
      setFlash({
        kind: 'ko',
        message: 'Impossible d\'enregistrer ce transfert. Réessayez plus tard.',
      })
    }
  }

  return (
    <form
      data-testid="transfer-form"
      onSubmit={handleSubmit(onValid)}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="transfer-field-target" style={{ color: 'var(--color-text)' }}>
          Contrat destinataire (STD)
        </label>
        <select
          id="transfer-field-target"
          data-testid="transfer-field-target"
          aria-describedby="transfer-field-target-hint"
          aria-invalid={Boolean(errors.targetContractId)}
          className="rounded-md border px-2 py-1 text-sm"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
          {...register('targetContractId', { required: 'Sélectionnez un contrat destinataire.' })}
        >
          <option value="">— Sélectionner —</option>
          {targets.map((target) => (
            <option
              key={target.contractId}
              value={target.contractId}
              data-testid={`transfer-target-option-${target.contractId}`}
            >
              {target.contractRef}
            </option>
          ))}
        </select>
        <p id="transfer-field-target-hint" style={{ color: 'var(--color-text-muted)' }}>
          Seuls les contrats STD renvoyés par l'API sont proposés ici.
        </p>
        {targets.length === 0 && (
          <p data-testid="transfer-targets-empty" style={{ color: 'var(--color-text-muted)' }}>
            Aucun contrat STD disponible pour ce compte.
          </p>
        )}
        {errors.targetContractId && (
          <p data-testid="transfer-field-target-error" role="alert" style={{ color: 'var(--color-danger)' }}>
            {errors.targetContractId.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="transfer-field-startDate" style={{ color: 'var(--color-text)' }}>
          Date de début
        </label>
        <input
          id="transfer-field-startDate"
          data-testid="transfer-field-startDate"
          type="date"
          aria-invalid={Boolean(errors.startDate)}
          className="rounded-md border px-2 py-1 text-sm"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
          {...register('startDate', { required: 'La date de début est obligatoire.' })}
        />
        {errors.startDate && (
          <p data-testid="transfer-field-startDate-error" role="alert" style={{ color: 'var(--color-danger)' }}>
            {errors.startDate.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="transfer-field-endDate" style={{ color: 'var(--color-text)' }}>
          Date de fin (optionnelle)
        </label>
        <input
          id="transfer-field-endDate"
          data-testid="transfer-field-endDate"
          type="date"
          aria-describedby="transfer-field-endDate-hint"
          aria-invalid={Boolean(errors.endDate)}
          className="rounded-md border px-2 py-1 text-sm"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
          {...register('endDate', {
            validate: (value) => {
              if (!value) return true
              if (!startDate) return true
              return value > startDate || 'La fin du transfert doit suivre son début.'
            },
          })}
        />
        <p id="transfer-field-endDate-hint" style={{ color: 'var(--color-text-muted)' }}>
          Laissez vide pour un transfert en cours, sans date de fin.
        </p>
        {errors.endDate && (
          <p data-testid="transfer-field-endDate-error" role="alert" style={{ color: 'var(--color-danger)' }}>
            {errors.endDate.message}
          </p>
        )}
      </div>

      {contractInactive && (
        <p data-testid="transfer-contract-inactive" role="alert" style={{ color: 'var(--color-danger)' }}>
          Ce contrat n'est pas actif aujourd'hui : les formulaires sont consultables mais désactivés.
        </p>
      )}

      {flash && (
        <p
          data-testid={flash.kind === 'ok' ? 'transfer-flash-ok' : 'transfer-flash-ko'}
          role="alert"
          style={{ color: flash.kind === 'ok' ? 'var(--color-text)' : 'var(--color-danger)' }}
        >
          {flash.message}
        </p>
      )}

      <button
        type="submit"
        data-testid="transfer-form-submit"
        disabled={isSubmitting || contractInactive}
        className="self-start rounded-md border px-3 py-1 text-sm"
        style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
      >
        Transférer
      </button>
    </form>
  )
}
