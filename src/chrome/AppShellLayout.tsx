import { Clock, Home, MapPin, SlidersHorizontal, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import {
  CHANGE_PASSWORD_PATH,
  DEVICE_PILOTAGE_PATH,
  HISTORY_DASHBOARD_PATH,
  HOME_PATH,
  LIVE_TRACKING_PATH,
  TRENDS_PATH,
} from '../auth/paths'
import { useIsMobile } from '@/hooks/use-mobile'
import { AppShell, type ShellNavSection } from '@/ui/patterns/app-shell'
import { ContractProvider } from '../contracts/ContractContext'
import { ContractSelect } from '../contracts/ContractSelect'
import { CpalBrandMark } from './CpalBrandMark'
import { ShellClientLogo } from './ShellClientLogo'

/** Labels are kept exactly as the app showed them before the shell (no translation). */
const SECTIONS: ShellNavSection[] = [
  {
    title: 'Navigation',
    items: [
      { to: HOME_PATH, label: 'Accueil', icon: Home, testId: 'nav-home' },
      {
        to: LIVE_TRACKING_PATH,
        label: 'Suivi en direct',
        icon: MapPin,
        testId: 'nav-live-tracking',
      },
      {
        to: HISTORY_DASHBOARD_PATH,
        label: 'Historique',
        icon: Clock,
        testId: 'nav-history',
      },
      {
        to: DEVICE_PILOTAGE_PATH,
        label: 'Pilotage',
        icon: SlidersHorizontal,
        testId: 'nav-pilotage',
      },
      { to: TRENDS_PATH, label: 'Tendances', icon: TrendingUp, testId: 'nav-trends' },
    ],
  },
]

function initialsOf(prenom: string, nom: string, mail: string) {
  const letters = `${prenom.charAt(0)}${nom.charAt(0)}`.trim()
  return (letters || mail.charAt(0)).toUpperCase()
}

/**
 * The one shell of every authenticated route (layout route, renders `<Outlet/>` through the
 * kit `AppShell`): sidebar + mobile drawer, c-PAL mark, client logo, theme toggle, user menu.
 */
export function AppShellLayout() {
  const { account, isAdmin, logout } = useAuth()
  const mail = account?.mail ?? ''
  const prenom = account?.prenom ?? ''
  const nom = account?.nom ?? ''
  const name = `${prenom} ${nom}`.trim() || mail
  const isMobile = useIsMobile()
  const [loggingOut, setLoggingOut] = useState(false)

  /**
   * Guard against a double POST (KAN-156 review): the entry is disabled while the logout is in
   * flight. logout() always clears the local session, so a failed POST is intentionally ignored.
   */
  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      // See above.
    } finally {
      setLoggingOut(false)
    }
  }

  // One instance only (the test ids stay unique): in the sidebar from 768 px (the c-PAL mark in
  // the header row, aligned with the top bar and kept when collapsed; the client logo above the
  // user menu), and in a compact strip above the page below it, because the sidebar is then a
  // closed drawer.
  const brand = (
    <div className="flex items-center gap-4">
      <CpalBrandMark />
      <ShellClientLogo />
    </div>
  )

  return (
    <ContractProvider>
      {isMobile && (
        <div className="flex items-center justify-center border-b border-border bg-background px-3 py-2">
          {brand}
        </div>
      )}
      <AppShell
        sections={SECTIONS}
        logo={
          isMobile ? null : (
            <div className="flex items-center gap-2">
              <CpalBrandMark />
              <span className="text-sm font-bold tracking-tight text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden">
                c-PAL Tracker
              </span>
            </div>
          )
        }
        clientLogo={isMobile ? null : <ShellClientLogo />}
        sidebarTop={<ContractSelect isAdmin={isAdmin} />}
        userMenu={{
          name,
          initials: initialsOf(prenom, nom, mail),
          caption: account?.role === 'admin' ? 'Administrateur' : 'Client',
          triggerLabel: 'Menu utilisateur',
          account: {
            to: CHANGE_PASSWORD_PATH,
            label: 'Mon compte',
            testId: 'user-menu-account',
          },
          signOut: {
            label: 'Se déconnecter',
            onSelect: handleLogout,
            pending: loggingOut,
            testId: 'logout-button',
          },
        }}
        skipToContentLabel="Aller au contenu"
        navigationLabel="Navigation principale"
        themeLabels={{
          group: 'Thème',
          toLight: 'Passer au thème clair',
          toDark: 'Passer au thème sombre',
        }}
      />
    </ContractProvider>
  )
}
