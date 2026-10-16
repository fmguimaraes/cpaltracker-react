import { create } from 'zustand'

/**
 * KAN-162 (FR8) — client-side device-visibility filter, applied against
 * already-fetched position data with no network request of its own
 * (Technical Requirement: Zustand, in-memory only). Tracks *hidden* chip
 * ids rather than visible ones, so the default (nothing in the set) is
 * naturally "show everything" — no device needs to be explicitly listed
 * to be visible, and a device that only appears after a later refresh is
 * visible by default too.
 */
interface DeviceVisibilityState {
  hiddenChipIds: Set<string>
  toggleDevice: (chipId: string) => void
  showAll: () => void
  isVisible: (chipId: string) => boolean
}

export const useDeviceVisibilityStore = create<DeviceVisibilityState>((set, get) => ({
  hiddenChipIds: new Set(),
  toggleDevice: (chipId) =>
    set((state) => {
      const next = new Set(state.hiddenChipIds)
      if (next.has(chipId)) {
        next.delete(chipId)
      } else {
        next.add(chipId)
      }
      return { hiddenChipIds: next }
    }),
  showAll: () => set({ hiddenChipIds: new Set() }),
  isVisible: (chipId) => !get().hiddenChipIds.has(chipId),
}))
