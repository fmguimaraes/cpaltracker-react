import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/ui/breadcrumb'
import { cn } from '@/lib/utils'

/** One breadcrumb level: the page first, then its selection levels; the last one is the current level. */
export interface ShellBreadcrumbLevel {
  label: string
  /** Navigate back to this level (history-aware callers); takes precedence over `to`. */
  onSelect?: () => void
  /** Plain link to this level. */
  to?: string
  testId?: string
}

/** Separator between levels in the tooltip text (the visible one is the kit chevron). */
export const BREADCRUMB_SEPARATOR = ' › '

/** The full path as one string ("Pulse › DEMO-CHIP-001 › Température 31 °C"). */
export function breadcrumbPath(levels: Pick<ShellBreadcrumbLevel, 'label'>[]): string {
  return levels.map((level) => level.label).join(BREADCRUMB_SEPARATOR)
}

/**
 * The shell's single breadcrumb pattern (top bar, left): page › selection levels. Every level but the last
 * is clickable; the page level never shrinks, the middle levels truncate first ("…"), then the last one.
 * The full path is the tooltip (`title`) of the whole trail.
 */
export function ShellBreadcrumb({ levels, className }: { levels: ShellBreadcrumbLevel[]; className?: string }) {
  if (levels.length === 0) return null
  const path = breadcrumbPath(levels)
  return (
    <Breadcrumb aria-label="Fil d’Ariane" title={path} className={cn('min-w-0', className)} data-testid="shell-breadcrumb">
      <BreadcrumbList className="flex-nowrap gap-1.5 text-sm sm:gap-1.5">
        {levels.map((level, index) => {
          const first = index === 0
          const last = index === levels.length - 1
          const itemClass = cn(
            'min-w-0',
            // The page title keeps its width; middle levels give way first, then the current level.
            first ? 'shrink-0' : last ? 'shrink' : 'max-w-48 shrink-2',
          )
          const testId = level.testId ?? `breadcrumb-level-${index}`
          return (
            <Fragment key={`${index}-${level.label}`}>
              <BreadcrumbItem className={itemClass}>
                {last ? (
                  <BreadcrumbPage className={cn('truncate', first && 'font-semibold')} data-testid={testId}>
                    {level.label}
                  </BreadcrumbPage>
                ) : level.onSelect ? (
                  <BreadcrumbLink asChild className="truncate no-underline hover:underline">
                    <button type="button" onClick={level.onSelect} data-testid={testId} className="min-w-0 cursor-pointer truncate">
                      {level.label}
                    </button>
                  </BreadcrumbLink>
                ) : level.to ? (
                  <BreadcrumbLink asChild className="truncate no-underline hover:underline">
                    <Link to={level.to} data-testid={testId}>
                      {level.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <span className="truncate" data-testid={testId}>
                    {level.label}
                  </span>
                )}
              </BreadcrumbItem>
              {!last && <BreadcrumbSeparator className="shrink-0" />}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
