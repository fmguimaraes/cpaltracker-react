import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  CHANGE_PASSWORD_PATH,
  DEVICE_PILOTAGE_PATH,
  FORGOT_PASSWORD_PATH,
  HISTORY_DASHBOARD_PATH,
  HOME_PATH,
  LIVE_TRACKING_PATH,
  LOGIN_PATH,
  RESET_PASSWORD_PATH,
} from '../auth/paths'

const APP_NAME = 'cpaltracker-react'

/** Per-route page names, each in the language the page already shows (no translation). */
const ROUTE_TITLES: Record<string, string> = {
  [LOGIN_PATH]: 'Sign in',
  [FORGOT_PASSWORD_PATH]: 'Mot de passe oublié',
  [RESET_PASSWORD_PATH]: 'Nouveau mot de passe',
  [CHANGE_PASSWORD_PATH]: 'Mon compte',
  [LIVE_TRACKING_PATH]: 'Suivi en direct',
  [HISTORY_DASHBOARD_PATH]: 'Historique',
  [DEVICE_PILOTAGE_PATH]: 'Pilotage des devices',
  [HOME_PATH]: '',
}

/** Page name of a pathname; unknown paths are the 404 screen. */
function titleFor(pathname: string) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const name = ROUTE_TITLES[path] ?? '404 — Page not found'
  return name ? `${name} · ${APP_NAME}` : APP_NAME
}

/** Sets `document.title` for the current route (F-45). Renders nothing. */
export function DocumentTitle() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.title = titleFor(pathname)
  }, [pathname])
  return null
}
