import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Controller, useForm } from 'react-hook-form'
import type { Contract } from '../api/contracts'
import { ApiError } from '../api/client'
import { postDeviceTransfer, type TransferResult } from '../api/transfer'
import { isContractInactiveError } from './activeState'
import { fetchTransferTargets } from './transferTargets'
import { toTransferDateTime } from './transferDates'
import { Alert, AlertDescription } from '@/ui/alert'
import { Button } from '@/ui/button'
import { Card, CardContent } from '@/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/ui/field'
import { DateTimeField } from '@/ui/date-time-field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Skeleton } from '@/ui/skeleton'

type FormValues = {
  targetContractId: string
  startDate: Date | undefined
  endDate: Date | undefined
}

/** Display of the chosen day in the date button: `AAAA-MM-JJ`, as the rest of the app. */
function formatDay(value: Date): string {
  return format(value, 'yyyy-MM-dd')
}

const DATE_TIME_LABELS = { dateSuffix: '(jour)', timeSuffix: '(heure)', placeholder: 'AAAA-MM-JJ' }

const EMPTY_VALUES: FormValues = { targetContractId: '', startDate: undefined, endDate: undefined }

type Phase =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; targets: Contract[] }

type Flash = { kind: 'ok' | 'ko'; message: string }

/**
 * KAN-227 (FR10): an inline two-column PAT-FORM card (not a dialog: the
 * F-37 confirm step is out of scope) with the kit `Select` for the target
 * (trigger `transfer-field-target`, items `transfer-target-option-{id}`) and
 * the kit `DateTimeField` for both dates, as the monolith's `datetime-local`
 * fields (wrappers `transfer-field-startDate` / `transfer-field-endDate`).
 * Logic, testids and copy unchanged.
 *
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
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: EMPTY_VALUES })

  useEffect(() => {
    let cancelled = false
    setPhase({ status: 'loading' })
    setFlash(null)
    setContractInactive(false)
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
      <div data-testid="transfer-form-loading" role="status" aria-busy className="flex flex-col gap-2">
        <span className="sr-only">Chargement des contrats destinataires…</span>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    )
  }

  if (phase.status === 'error') {
    return (
      <Alert variant="danger" data-testid="transfer-form-error">
        <AlertDescription>
          Impossible de charger les contrats destinataires. Réessayez plus tard.
        </AlertDescription>
      </Alert>
    )
  }

  const { targets } = phase

  async function onValid(values: FormValues) {
    setFlash(null)
    try {
      const result = await postDeviceTransfer(deviceId, {
        targetContractId: Number(values.targetContractId),
        // `startDate` is required by the field rules, so it is set here.
        startDate: toTransferDateTime(values.startDate as Date),
        endDate: values.endDate ? toTransferDateTime(values.endDate) : null,
      })
      setFlash({
        kind: 'ok',
        message: result.openEnded
          ? 'Transfert enregistré (en cours, sans date de fin).'
          : `Transfert enregistré, jusqu'au ${result.endDate}.`,
      })
      reset(EMPTY_VALUES)
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
    <Card>
      <CardContent>
        <form data-testid="transfer-form" onSubmit={handleSubmit(onValid)} className="flex flex-col gap-6">
          <FieldGroup className="grid gap-6 md:grid-cols-2">
            <Field data-invalid={errors.targetContractId ? true : undefined} className="md:col-span-2">
              <FieldLabel htmlFor="transfer-field-target">Contrat destinataire (STD)</FieldLabel>
              <Controller
                control={control}
                name="targetContractId"
                rules={{ required: 'Sélectionnez un contrat destinataire.' }}
                render={({ field }) => (
                  <Select name={field.name} value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="transfer-field-target"
                      ref={field.ref}
                      onBlur={field.onBlur}
                      data-testid="transfer-field-target"
                      aria-describedby="transfer-field-target-hint"
                      aria-invalid={Boolean(errors.targetContractId)}
                      className="w-full"
                    >
                      <SelectValue placeholder="— Sélectionner —" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {targets.map((target) => (
                        <SelectItem
                          key={target.contractId}
                          value={String(target.contractId)}
                          data-testid={`transfer-target-option-${target.contractId}`}
                        >
                          {target.contractRef}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldDescription id="transfer-field-target-hint">
                Seuls les contrats STD renvoyés par l'API sont proposés ici.
              </FieldDescription>
              {targets.length === 0 && (
                <FieldDescription data-testid="transfer-targets-empty">
                  Aucun contrat STD disponible pour ce compte.
                </FieldDescription>
              )}
              {errors.targetContractId && (
                <FieldError data-testid="transfer-field-target-error">{errors.targetContractId.message}</FieldError>
              )}
            </Field>

            <Field data-invalid={errors.startDate ? true : undefined}>
              <FieldLabel htmlFor="transfer-field-startDate-date">Date de début</FieldLabel>
              <Controller
                control={control}
                name="startDate"
                rules={{ required: 'La date de début est obligatoire.' }}
                render={({ field }) => (
                  <div data-testid="transfer-field-startDate">
                    <DateTimeField
                      id="transfer-field-startDate-date"
                      label="Date de début"
                      labels={DATE_TIME_LABELS}
                      formatDate={formatDay}
                      value={field.value}
                      onValueChange={field.onChange}
                      aria-invalid={Boolean(errors.startDate)}
                    />
                  </div>
                )}
              />
              {errors.startDate && (
                <FieldError data-testid="transfer-field-startDate-error">{errors.startDate.message}</FieldError>
              )}
            </Field>

            <Field data-invalid={errors.endDate ? true : undefined}>
              <FieldLabel htmlFor="transfer-field-endDate-date">Date de fin (optionnelle)</FieldLabel>
              <Controller
                control={control}
                name="endDate"
                rules={{
                  validate: (value, values) => {
                    if (!value || !values.startDate) return true
                    return value.getTime() > values.startDate.getTime() || 'La fin du transfert doit suivre son début.'
                  },
                }}
                render={({ field }) => (
                  <div data-testid="transfer-field-endDate">
                    <DateTimeField
                      id="transfer-field-endDate-date"
                      label="Date de fin"
                      labels={DATE_TIME_LABELS}
                      formatDate={formatDay}
                      value={field.value}
                      onValueChange={field.onChange}
                      aria-describedby="transfer-field-endDate-hint"
                      aria-invalid={Boolean(errors.endDate)}
                    />
                  </div>
                )}
              />
              <FieldDescription id="transfer-field-endDate-hint">
                Laissez vide pour un transfert en cours, sans date de fin.
              </FieldDescription>
              {errors.endDate && (
                <FieldError data-testid="transfer-field-endDate-error">{errors.endDate.message}</FieldError>
              )}
            </Field>
          </FieldGroup>

          {contractInactive && (
            <Alert variant="danger" data-testid="transfer-contract-inactive">
              <AlertDescription>
                Ce contrat n'est pas actif aujourd'hui : les formulaires sont consultables mais désactivés.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
            <Button
              type="submit"
              data-testid="transfer-form-submit"
              disabled={isSubmitting || contractInactive}
              loading={isSubmitting}
            >
              Transférer
            </Button>

            {flash && (
              <Alert
                variant={flash.kind === 'ok' ? 'success' : 'danger'}
                data-testid={flash.kind === 'ok' ? 'transfer-flash-ok' : 'transfer-flash-ko'}
                className="flex-1"
              >
                <AlertDescription>{flash.message}</AlertDescription>
              </Alert>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
