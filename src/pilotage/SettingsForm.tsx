import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { fetchDeviceConfig, type DeviceConfig } from '../api/deviceConfig'
import { STORED_ONLY_FIELDS, TRANSMITTED_FIELDS, type SettingsFieldDef } from './settingsFields'
import { validateSettingsField } from './settingsValidation'

type FormValues = Record<string, string>

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
 * Submission (FR11/FR13 — "accepted/no-change/inactive" result feedback and
 * the post-success config refresh) is KAN-166's story, not this one. This
 * component still validates and assembles the change set on submit (so
 * KAN-166 has a real `onSubmit(deviceId, changes)` contract to call into),
 * but defaults to `noopSettingsSubmit` — an explicit, documented no-op —
 * when no `onSubmit` is supplied, rather than silently wiring an
 * unspecified write to `/api/v1`. Once KAN-166 lands its POST handler, it
 * passes its own `onSubmit` into this component (or this default is
 * replaced); nothing here computes or assumes the API's accept/reject
 * semantics (NFR4 is about contract gating specifically, but the same
 * "server is sole authority" principle applies to the write's result).
 */
export function SettingsForm({
  deviceId,
  onSubmit = noopSettingsSubmit,
}: {
  deviceId: string
  onSubmit?: (deviceId: string, changes: Record<string, string>) => Promise<void>
}) {
  const [phase, setPhase] = useState<Phase>({ status: 'loading' })
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>()

  useEffect(() => {
    let cancelled = false
    setPhase({ status: 'loading' })
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
    await onSubmit(deviceId, changes)
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
    </form>
  )
}

const SETTINGS_FIELDS_FOR_SUBMIT: readonly SettingsFieldDef[] = [
  ...TRANSMITTED_FIELDS,
  ...STORED_ONLY_FIELDS,
]

/**
 * KAN-163 — explicit no-op default for `onSubmit`. Submission/feedback/
 * config-refresh is KAN-166's story; this function deliberately does
 * nothing rather than guess at a POST contract or result-handling UX ahead
 * of that story.
 */
async function noopSettingsSubmit(): Promise<void> {
  return Promise.resolve()
}
