import { Outlet, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { AppShellLayout } from '../chrome/AppShellLayout'
import { isFirstConnection } from './account/firstConnection'

/**
 * FR12 (F-41, F-1): `/change-password` sits in the one shell (sidebar, header, theme toggle, user
 * menu) in normal mode; first-connection mode stays shell-less (PAT-AUTH column, password form
 * only), because the rest of the app is not reachable until the password is replaced (FR14).
 * Mounted behind `RequireAuth allowMustChangePassword`, so `account` is set here.
 */
export function AccountLayout() {
  const { account } = useAuth()
  const [searchParams] = useSearchParams()
  return isFirstConnection(account, searchParams) ? <Outlet /> : <AppShellLayout />
}
