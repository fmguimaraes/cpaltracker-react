/**
 * KAN-149 — route path constants shared by the login redirect logic (FR2),
 * the protected-route guard (FR13) and the `MustChangePassword` guard (FR14).
 * Centralized here so every consumer agrees on the same strings.
 */

export const HOME_PATH = '/'
export const LOGIN_PATH = '/login'

/** KAN-146 — the forgot-password request page (FR1-FR3). */
export const FORGOT_PASSWORD_PATH = '/forgot-password'

/**
 * FR14 — `RequireAuth`'s `MustChangePassword` gate needs a concrete route to
 * redirect to today. This repo has no password-change screen yet (its
 * actual form/UX is KAN-155's job, FR6-8/NFR9); `ChangePassword` is a thin
 * placeholder that reserves this path so the gate is fully wired end to end.
 */
export const CHANGE_PASSWORD_PATH = '/change-password'
