import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Brand signature: short cyan uppercase letter-spaced text with a short cyan rule below.
 * Use for page-header eyebrows and section labels only (the accent signals, never decorates).
 */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('inline-flex flex-col gap-1.5', className)}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-text">{children}</p>
      <span aria-hidden className="block h-0.5 w-6 rounded-full bg-signal" />
    </div>
  )
}
