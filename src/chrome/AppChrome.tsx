import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { ClientLogo } from '../live-tracking/ClientLogo'
import {
  DEVICE_PILOTAGE_PATH,
  HISTORY_DASHBOARD_PATH,
  HOME_PATH,
  LIVE_TRACKING_PATH,
} from '../auth/paths'
import { CpalBrandMark } from './CpalBrandMark'

interface AppChromeProps {
  children: ReactNode
}

const NAV_LINKS = [
  { to: HOME_PATH, label: 'Accueil', testId: 'nav-home' },
  {
    to: LIVE_TRACKING_PATH,
    label: 'Suivi en direct',
    testId: 'nav-live-tracking',
  },
  { to: HISTORY_DASHBOARD_PATH, label: 'Historique', testId: 'nav-history' },
  { to: DEVICE_PILOTAGE_PATH, label: 'Pilotage', testId: 'nav-pilotage' },
]

/**
 * KAN-171 (FR1, FR8, FR9) — the app's first shared chrome/layout component.
 *
 * KAN-161 built `ClientLogo` but left it mounted ad hoc inside
 * `LiveTracking`'s own header, flagging explicitly that no shared chrome
 * existed yet in this repo and that this story would need to either build
 * one or confirm that placement. This component is that decision: a
 * persistent sidebar (FR8's "sidebar/chrome") wraps every authenticated
 * dashboard route (`App.tsx`), carrying:
 *
 * - the c-PAL brand mark (FR8, `CpalBrandMark`) at the top of the sidebar,
 *   replicating `.cpal-logo-sidebar`'s placement (CB17) — separate from and
 *   above the primary navigation;
 * - primary navigation between the dashboard routes, which previously had
 *   no shared way to move between them other than typing a URL;
 * - the signed-in client's OWN logo (FR1's "app chrome's branding slot"),
 *   mounted exactly once here instead of being duplicated into every route
 *   that wants it — this is the "move it into new chrome" resolution KAN-161
 *   flagged, replacing the one-off mount inside `LiveTracking.tsx`.
 *
 * Deliberately NOT wrapped around `Login`/`ForgotPassword`/`ResetPassword`
 * (no session yet, so no client/brand context to show — FR2 territory) nor
 * around `Account` (the `mustChangePassword` first-connection screen mirrors
 * the legacy `account.php`'s own standalone, chrome-less layout; FR12's
 * shared card idiom covers that screen's visual identity instead).
 *
 * Existing tests render each route component directly (not through
 * `AppChrome`) and never assert layout/chrome markup, so adding this wrapper
 * at the `App.tsx` routing layer — rather than inside each route component —
 * does not change any existing unit test's rendered output.
 */
export function AppChrome({ children }: AppChromeProps) {
  return (
    <div className="flex min-h-screen">
      <aside
        data-testid="app-sidebar"
        className="flex w-56 flex-shrink-0 flex-col gap-6 border-r p-4 max-md:w-16"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div
          className="flex justify-center border-b pb-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <CpalBrandMark />
        </div>

        <nav
          aria-label="Navigation principale"
          className="flex flex-col gap-1"
          data-testid="app-nav"
        >
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              data-testid={link.testId}
              className="rounded-md px-3 py-2 text-sm max-md:hidden"
              style={({ isActive }) => ({
                color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
                backgroundColor: isActive ? 'var(--color-bg)' : 'transparent',
                fontWeight: isActive ? 600 : 400,
              })}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header
          className="flex items-center justify-end border-b p-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <ClientLogo />
        </header>

        <div className="flex-1">{children}</div>
      </div>
    </div>
  )
}
