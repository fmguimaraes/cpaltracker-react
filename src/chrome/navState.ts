import { useCallback, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { HISTORY_DASHBOARD_PATH, LIVE_TRACKING_PATH, PULSE_PATH } from '../auth/paths'

/** The user's nav choice ("expanded" | "rail"), kept across visits; it overrides the per-page default. */
export const NAV_STATE_KEY = 'cpal.shell.nav'

export type NavChoice = 'expanded' | 'rail'

/**
 * Map pages open with the icon rail so the map gets the width (Pulse, and Suivi en direct / Historique while
 * they exist); every other page opens expanded.
 */
export const MAP_PAGE_PATHS = [PULSE_PATH, LIVE_TRACKING_PATH, HISTORY_DASHBOARD_PATH]

export function isMapPage(pathname: string): boolean {
  return MAP_PAGE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export function readNavChoice(): NavChoice | null {
  try {
    const stored = window.localStorage.getItem(NAV_STATE_KEY)
    return stored === 'expanded' || stored === 'rail' ? stored : null
  } catch {
    return null
  }
}

function writeNavChoice(choice: NavChoice) {
  try {
    window.localStorage.setItem(NAV_STATE_KEY, choice)
  } catch {
    // Storage unavailable (private mode, quota): the choice lasts for this visit only.
  }
}

/** Whether the nav is expanded: the remembered choice, else the page's default (rail on map pages). */
export function navOpenFor(pathname: string, choice: NavChoice | null): boolean {
  if (choice) return choice === 'expanded'
  return !isMapPage(pathname)
}

/** The shell's controlled nav state (☰ toggles it; the choice is remembered and wins over the defaults). */
export function useNavState(): [boolean, (open: boolean) => void] {
  const { pathname } = useLocation()
  const [choice, setChoice] = useState<NavChoice | null>(readNavChoice)
  const setOpen = useCallback((open: boolean) => {
    const next: NavChoice = open ? 'expanded' : 'rail'
    setChoice(next)
    writeNavChoice(next)
  }, [])
  return [navOpenFor(pathname, choice), setOpen]
}
