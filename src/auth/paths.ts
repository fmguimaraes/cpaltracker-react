/**
 * KAN-149 — route path constants shared by the login redirect logic (FR2),
 * the protected-route guard (FR13) and the `MustChangePassword` guard (FR14).
 * Centralized here so every consumer agrees on the same strings.
 */

export const HOME_PATH = '/'
export const LOGIN_PATH = '/login'

/** KAN-146 — the forgot-password request page (FR1-FR3). */
export const FORGOT_PASSWORD_PATH = '/forgot-password'

/** KAN-148 — the reset-password redeem-token page (FR4-FR8). */
export const RESET_PASSWORD_PATH = '/reset-password'

/**
 * `RequireAuth`'s `MustChangePassword` gate (KAN-149 FR14) redirects here.
 * KAN-152 (FR9-FR15) builds the real page at this path — the account
 * self-service screen (`Account.tsx`), which also serves as this redirect's
 * first-connection mode (the KAN-149-era `ChangePassword` placeholder, and
 * its stale "KAN-155" attribution, are gone).
 */
export const CHANGE_PASSWORD_PATH = '/change-password'

/** KAN-158 — the Live Tracking contract selector / last-known-position view. */
export const LIVE_TRACKING_PATH = '/live-tracking'

/**
 * KAN-165 (FR14) — originally added only so Live Tracking's "Open History
 * Dashboard" link had somewhere to point. KAN-172 (FR1, FR2) builds the
 * route itself (`routes/HistoryDashboard.tsx`); KAN-174/KAN-175 build the
 * rest of its content on top.
 */
export const HISTORY_DASHBOARD_PATH = '/history'

/**
 * KAN-159 — the Device Pilotage contract selector / device-list workspace
 * (epic KAN-140, `pilotage.php` equivalent, CB1/CB2).
 */
export const DEVICE_PILOTAGE_PATH = '/pilotage'
