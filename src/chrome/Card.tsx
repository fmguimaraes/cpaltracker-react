import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  'data-testid'?: string
}

/**
 * KAN-171 (FR12) — the shared soft-shadow "card" idiom auth and account
 * screens render their content in, rebuilt on this story's theme tokens
 * rather than `auth.css`'s hardcoded `.carte-auth`/`.fiche` rules (CB20):
 * `--color-surface`/`--color-border` for the surface, `--radius-lg` for the
 * corner radius, and `--shadow-md` for the soft shadow — the same tokens
 * every other themed surface in this app already draws from (FR5), so the
 * card switches with the rest of the app between light and dark (FR6).
 */
export function Card({
  children,
  className = '',
  'data-testid': testId,
}: CardProps) {
  return (
    <div
      data-testid={testId}
      className={`rounded-[length:var(--radius-lg)] border p-6 ${className}`}
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      {children}
    </div>
  )
}
