/**
 * KAN-175 (FR9) — pure selection-set math for the device checklist.
 *
 * Mirrors `TimelineMap`'s own `visibleDeviceIds` contract exactly (KAN-174's
 * deliberate extension point): `null` means "every device is visible" (the
 * default, CB9/CB17 — the legacy page never sends a `devices` filter and
 * always requests the full contract set), and a concrete `string[]` means
 * "only these chip ids". Kept independent of React so the checklist
 * component only wires this to state/events (same split as
 * `timelineData.ts`/`TimelineMap.tsx`).
 *
 * Deliberately collapses back to `null` whenever every known device ends up
 * selected again, rather than leaving an explicit full-length array lying
 * around — keeps `TimelineMap`'s "all devices" fast path exercised whenever
 * it genuinely applies (e.g. after "Tout sélectionner"), not just on first
 * load.
 */

/** `true` when `chipId` is currently visible under `selected` (`null` =
 * every device). */
export function isDeviceSelected(selected: string[] | null, chipId: string): boolean {
  return selected === null || selected.includes(chipId)
}

/**
 * Toggles one device's visibility. `allChipIds` is the full, current
 * contract device list — needed both to expand `null` into an explicit set
 * (so unchecking the first device from "all" only hides that one) and to
 * detect when toggling back ON lands on "every device", collapsing to
 * `null` again.
 */
export function toggleDeviceSelection(
  selected: string[] | null,
  allChipIds: string[],
  chipId: string,
): string[] | null {
  const current = selected === null ? [...allChipIds] : selected
  const next = current.includes(chipId)
    ? current.filter((id) => id !== chipId)
    : [...current, chipId]

  if (next.length === allChipIds.length && allChipIds.every((id) => next.includes(id))) {
    return null
  }
  return next
}

/** "Tout sélectionner" — back to the `null` ("all") fast path. */
export function selectAllDevices(): string[] | null {
  return null
}

/** "Tout désélectionner" — the explicit empty set, distinct from `null`. */
export function selectNoDevices(): string[] {
  return []
}
