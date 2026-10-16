import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  fetchDeviceConfig,
  isNoChangeError,
  postDeviceConfig,
  type DeviceConfig,
} from '../api/deviceConfig'
import { isContractInactiveError } from './activeState'
import { STORED_ONLY_FIELDS, TRANSMITTED_FIELDS, type SettingsFieldDef } from './settingsFields'
import { validateSettingsField } from './settingsValidation'

type FormValues = Record<string, string>

type Flash = { kind: 'success' | 'info' | 'error'; message: string }

type Phase =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; config: DeviceConfig['config'] }

/**
 * KAN-163 (FR7-FR10, FR12) — the pilotage settings form for one device.
 *
 * - FR7/CB8: current values are read via the shared `fetchDeviceConfig()`
 *   (KAN-159) and shown as `placeholder` text, never pre-filled as the
 *   input's value — an untouched field must stay visually "blank" so FR10's
 *   keep-current semantics are legible.
 * - FR8/GAP6: fields render in two `<fieldset>` groups, each with its own
 *   `<legend>`, from `settingsFields.ts`'s TRANSMITTED_FIELDS/
 *   STORED_ONLY_FIELDS split.
 * - FR9/CB13: each field is validated on submit (and on blur, via RHF's
 *   default mode) with `validateSettingsField()`.
 * - FR10/CB14: a blank field validates to `{ value: null }` — reported to
 *   the operator via the per-field hint text, and excluded from the
 *   `changes` map handed to `onSubmit` (never submitted as an empty
 *   string).
 * - FR12/CB16: `WiFi_SSID_CL`/`WiFi_PASS_CL` are not in `settingsFields.ts`
 *   at all, so they can never appear here.
 *
 * KAN-166 (FR11, FR13, FR20) addition:
 * - FR11: `onValid` always calls `onSubmit` (now defaulting to
 *   `submitDeviceConfig`, a real `POST /devices/{deviceId}/config`, replacing
 *   KAN-163's documented `noopSettingsSubmit` stub) and renders the result as
 *   a flash: "accepted" (no throw) is a client-authored success message
 *   (the API's 202 body carries no message of its own — see
 *   `src/api/deviceConfig.ts`); "no values changed" and "contract not
 *   active" are the API's own `error.message`, shown verbatim — same
 *   "server is sole authority" principle NFR4 states for gating, applied
 *   here to the write's result — never a client-side guess at either
 *   message's wording. `isNoChangeError()`/`isContractInactiveError()`
 *   distinguish the two from a generic failure.
 * - FR13: on acceptance, `refreshConfig()` re-runs the same
 *   `fetchDeviceConfig()` the mount effect uses, so the placeholders reflect
 *   the just-saved values (and `reset({})` clears the now-stale typed
 *   values, since they've become "current" rather than "pending").
 * - FR20 ("refresh safety"): the feature spec (FR20/CB19/CB28) is about a
 *   *browser* refresh never replaying the POST — true here by construction
 *   (`handleSubmit` always calls `preventDefault`; there is no
 *   `<form action>`/native navigation for a reload to ever resubmit, unlike
 *   `pilotage.php`'s POST-redirect pattern this replaces). The second,
 *   related hazard this component guards against is a *stale* in-flight
 *   submit's result landing after the operator has already switched to a
 *   different device: `latestDeviceIdRef` records the device actually
 *   selected *now*, and the success/failure handlers below drop their
 *   `setFlash`/`setPhase` calls once the submit's own `deviceId` no longer
 *   matches it — the same "cancelled" guard the mount effect already uses,
 *   applied to the submit's async tail instead of the fetch's.
 */
export function SettingsForm({
  deviceId,
  onSubmit = submitDeviceConfig,
}: {
  deviceId: string
  onSubmit?: (deviceId: string, changes: Record<string, string>) => Promise<void>
}) {
  const [phase, setPhase] = useState<Phase>({ status: 'loading' })
  const [flash, setFlash] = useState<Flash | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>()

  // FR20 — see this file's header comment: records the device actually
  // selected *now*, so a submit's async result (success or failure) can tell
  // it's gone stale if the operator switched devices while it was in flight.
  const latestDeviceIdRef = useRef(deviceId)
  latestDeviceIdRef.current = deviceId

  useEffect(() => {
    let cancelled = false
    setPhase({ status: 'loading' })
    setFlash(null)
    reset({})
    fetchDeviceConfig(deviceId)
      .then((result) => {
        if (cancelled) return
        setPhase({ status: 'ready', config: result.config })
      })
      .catch(() => {
        if (cancelled) return
        setPhase({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [deviceId, reset])

  if (phase.status === 'loading') {
    return (
      <p data-testid="settings-form-loading" style={{ color: 'var(--color-text-muted)' }}>
        Chargement des réglages…
      </p>
    )
  }

  if (phase.status === 'error') {
    return (
      <p data-testid="settings-form-error" role="alert" style={{ color: 'var(--color-danger)' }}>
        Impossible de charger les réglages actuels de ce device. Réessayez plus tard.
      </p>
    )
  }

  const config = phase.config

  async function onValid(values: FormValues) {
    const changes: Record<string, string> = {}
    for (const def of SETTINGS_FIELDS_FOR_SUBMIT) {
      const validated = validateSettingsField(values[def.name] ?? '', def)
      if ('value' in validated && validated.value !== null) {
        changes[def.name] = validated.value
      }
    }

    const submittedFor = deviceId
    try {
      await onSubmit(submittedFor, changes)
      if (latestDeviceIdRef.current !== submittedFor) return // FR20 — stale, device switched meanwhile
      setFlash({
        kind: 'success',
        message:
          'Réglages enregistrés. Ils seront transmis au device lors de sa prochaine remontée sur le port 3.',
      })
      // FR13 — refresh the displayed current config so placeholders reflect
      // what was just saved. Best-effort: a failed refresh keeps showing the
      // (now slightly stale) previous config rather than hiding the success
      // flash the write itself did get.
      try {
        const result = await fetchDeviceConfig(submittedFor)
        if (latestDeviceIdRef.current !== submittedFor) return
        setPhase({ status: 'ready', config: result.config })
        reset({})
      } catch {
        // see comment above — keep the success flash, keep the stale config.
      }
    } catch (error) {
      if (latestDeviceIdRef.current !== submittedFor) return // FR20 — stale, device switched meanwhile
      if (isContractInactiveError(error)) {
        setFlash({ kind: 'error', message: (error as Error).message })
      } else if (isNoChangeError(error)) {
        setFlash({ kind: 'info', message: (error as Error).message })
      } else {
        setFlash({
          kind: 'error',
          message: "Impossible d'enregistrer les réglages. Réessayez plus tard.",
        })
      }
    }
  }

  function renderField(def: SettingsFieldDef) {
    const currentValue = config[def.name]
    const fieldError = errors[def.name]
    const hintId = `settings-field-${def.name}-hint`
    const errorId = `settings-field-${def.name}-error`

    return (
      <div key={def.name} className="flex flex-col gap-1">
        <label
          htmlFor={`settings-field-${def.name}`}
          style={{ color: 'var(--color-text)' }}
        >
          {def.label}
        </label>
        <input
          id={`settings-field-${def.name}`}
          data-testid={`settings-field-${def.name}`}
          placeholder={currentValue ?? undefined}
          aria-describedby={fieldError ? `${hintId} ${errorId}` : hintId}
          aria-invalid={Boolean(fieldError)}
          className="rounded-md border px-2 py-1 text-sm"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
          {...register(def.name, {
            validate: (value) => {
              const result = validateSettingsField(value ?? '', def)
              return 'error' in result ? result.error : true
            },
          })}
        />
        <p id={hintId} data-testid={`settings-field-${def.name}-hint`} style={{ color: 'var(--color-text-muted)' }}>
          {def.hint} — laissez vide pour conserver la valeur actuelle
          {currentValue ? ` (${currentValue})` : ' (aucune valeur enregistrée)'}.
        </p>
        {fieldError && (
          <p id={errorId} data-testid={errorId} role="alert" style={{ color: 'var(--color-danger)' }}>
            {String(fieldError.message)}
          </p>
        )}
      </div>
    )
  }

  return (
    <form data-testid="settings-form" onSubmit={handleSubmit(onValid)} className="flex flex-col gap-4">
      <fieldset data-testid="settings-group-transmitted" className="flex flex-col gap-3">
        <legend style={{ color: 'var(--color-text)' }}>Transmises au device</legend>
        {TRANSMITTED_FIELDS.map(renderField)}
      </fieldset>

      <fieldset data-testid="settings-group-stored-only" className="flex flex-col gap-3">
        <legend style={{ color: 'var(--color-text)' }}>
          Conservées uniquement — jamais envoyées au device
        </legend>
        {STORED_ONLY_FIELDS.map(renderField)}
      </fieldset>

      <button
        type="submit"
        data-testid="settings-form-submit"
        disabled={isSubmitting}
        className="self-start rounded-md border px-3 py-1 text-sm"
        style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
      >
        Enregistrer
      </button>

      {flash && (
        <p
          data-testid="settings-form-flash"
          data-flash-kind={flash.kind}
          role={flash.kind === 'error' ? 'alert' : 'status'}
          style={{
            color:
              flash.kind === 'error'
                ? 'var(--color-danger)'
                : flash.kind === 'success'
                  ? 'var(--color-success)'
                  : 'var(--color-text)',
          }}
        >
          {flash.message}
        </p>
      )}
    </form>
  )
}

const SETTINGS_FIELDS_FOR_SUBMIT: readonly SettingsFieldDef[] = [
  ...TRANSMITTED_FIELDS,
  ...STORED_ONLY_FIELDS,
]

/**
 * KAN-166 (FR11) — the real default `onSubmit`: `POST
 * /devices/{deviceId}/config` (`src/api/deviceConfig.ts`'s
 * `postDeviceConfig()`), replacing KAN-163's documented `noopSettingsSubmit`
 * stub now that this story defines the write contract and its result
 * handling (see this component's own `onValid`). Kept as a thin adapter
 * (discarding `postDeviceConfig`'s 202 body) so the `onSubmit` prop's
 * `Promise<void>` shape — and so tests injecting their own mock — are
 * unaffected by this change.
 */
async function submitDeviceConfig(
  deviceId: string,
  changes: Record<string, string>,
): Promise<void> {
  await postDeviceConfig(deviceId, changes)
}
