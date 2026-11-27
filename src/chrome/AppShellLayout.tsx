import { Activity, BellRing, SlidersHorizontal, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import {
  ALERTS_PATH,
  ACCOUNT_PATH,
  DEVICE_PILOTAGE_PATH,
  PULSE_PATH,
  TRENDS_PATH,
} from '../auth/paths'
import { useIsMobile } from '@/hooks/use-mobile'
import { AppShell, type ShellNavSection } from '@/ui/patterns/app-shell'
import { ContractProvider } from '../contracts/ContractContext'
import { ContractSelect } from '../contracts/ContractSelect'
import { CpalBrandMark } from './CpalBrandMark'
import { RailMark } from '@/ui/patterns/rail-mark'
import { ShellClientLogo } from './ShellClientLogo'
import { Toaster } from '@/ui/sonner'
import { useNavState } from './navState'

/** Labels are kept exactly as the app showed them before the shell (no translation). */
const SECTIONS: ShellNavSection[] = [
  {
    title: 'Navigation',
    items: [
      { to: PULSE_PATH, label: 'Pulse', icon: Activity, testId: 'nav-pulse' },
      { to: TRENDS_PATH, label: 'Tendances', icon: TrendingUp, testId: 'nav-trends' },
      { to: ALERTS_PATH, label: 'Alertes', icon: BellRing, testId: 'nav-alerts' },
      {
        to: DEVICE_PILOTAGE_PATH,
        label: 'Pilotage',
        icon: SlidersHorizontal,
        testId: 'nav-pilotage',
      },
    ],
  },
]

function initialsOf(prenom: string, nom: string, mail: string) {
  const letters = `${prenom.charAt(0)}${nom.charAt(0)}`.trim()
  return (letters || mail.charAt(0)).toUpperCase()
}

/**
 * The one shell of every authenticated route (layout route, renders `<Outlet/>` through the
 * kit `AppShell`): sidebar + mobile drawer, c-PAL mark, client logo, user menu.
 */
export function AppShellLayout() {
  const { account, isAdmin, logout } = useAuth()
  const mail = account?.mail ?? ''
  const prenom = account?.prenom ?? ''
  const nom = account?.nom ?? ''
  const name = `${prenom} ${nom}`.trim() || mail
  const isMobile = useIsMobile()
  const [loggingOut, setLoggingOut] = useState(false)
  // ☰: expanded nav or icon rail (rail by default on the map pages); the user's choice is remembered.
  const [navOpen, setNavOpen] = useNavState()

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
            <div className="flex w-full items-center justify-center">
              <CpalBrandMark />
              <RailMark data-testid="cpal-rail-mark" />
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
            to: ACCOUNT_PATH,
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
        navOpen={navOpen}
        onNavOpenChange={setNavOpen}
        skipToContentLabel="Aller au contenu"
        navigationLabel="Navigation principale"
      />
      {/* FBK-TOAST: one toaster for every page's action outcome, centred at the top. */}
      <Toaster position="top-center" />
    </ContractProvider>
  )
}
