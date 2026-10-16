import { useDeviceVisibilityStore } from './deviceVisibilityStore'

/**
 * KAN-162 (FR8) — one checkbox per currently-fetched device, plus a
 * "show all" reset. Purely a view over `useDeviceVisibilityStore` — no
 * network request is ever triggered by a change here.
 */
export function DeviceFilter({ chipIds }: { chipIds: string[] }) {
  const hiddenChipIds = useDeviceVisibilityStore((state) => state.hiddenChipIds)
  const toggleDevice = useDeviceVisibilityStore((state) => state.toggleDevice)
  const showAll = useDeviceVisibilityStore((state) => state.showAll)

  if (chipIds.length === 0) return null

  return (
    <fieldset
      className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm"
      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
      data-testid="device-filter"
    >
      <legend className="px-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Appareils affichés
      </legend>
      <button
        type="button"
        onClick={showAll}
        data-testid="device-filter-show-all"
        className="rounded-md border px-2 py-1 text-xs"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
      >
        Tout afficher
      </button>
      {chipIds.map((chipId) => (
        <label key={chipId} className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={!hiddenChipIds.has(chipId)}
            onChange={() => toggleDevice(chipId)}
            data-testid={`device-filter-${chipId}`}
          />
          {chipId}
        </label>
      ))}
    </fieldset>
  )
}
