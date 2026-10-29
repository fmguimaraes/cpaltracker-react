import type { Account } from '../../auth/AuthContext'

/**
 * FR10 (KAN-152): first-connection mode is `mustChangePassword` on the authenticated account OR a
 * `?premiere` query flag, as `account.php`'s own `$premiere` branch. Shared by the route layout
 * (shell or not, FR12) and the page body, so both always agree.
 */
export function isFirstConnection(
  account: Pick<Account, 'mustChangePassword'> | null | undefined,
  searchParams: URLSearchParams,
): boolean {
  return Boolean(account?.mustChangePassword) || searchParams.has('premiere')
}
