import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/ui/breadcrumb'
import { Eyebrow } from '@/ui/patterns/eyebrow'
import { cn } from '@/lib/utils'
import { Fragment } from 'react'

export interface BreadcrumbEntry {
  label: string
  /** Omit on the last (current) entry. */
  to?: string
}

export interface PageHeaderProps {
  /** Short orange uppercase label above the title. */
  eyebrow?: string
  /** Trail above the title; the last entry is the current page. */
  breadcrumb?: BreadcrumbEntry[]
  /** Page title (h1). */
  title: ReactNode
  /** Status chips beside the title (e.g. StatusBadge). */
  chips?: ReactNode
  /** Right-aligned slot: primary action, TimePicker, ... */
  actions?: ReactNode
  /** Below the title row: typically a <FilterBar />. */
  children?: ReactNode
  className?: string
}

/** Page header: eyebrow, breadcrumb, title, chips, actions (top right) and a filter-bar slot. */
export function PageHeader({ eyebrow, breadcrumb, title, chips, actions, children, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3 border-b border-border px-4 pb-4 pt-5 md:px-6', className)} data-testid="page-header">
      {breadcrumb && breadcrumb.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumb.map((entry, index) => {
              const last = index === breadcrumb.length - 1
              return (
                <Fragment key={`${entry.label}-${index}`}>
                  <BreadcrumbItem>
                    {last || !entry.to ? (
                      <BreadcrumbPage>{entry.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link to={entry.to}>{entry.label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!last && <BreadcrumbSeparator />}
                </Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-2">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            {chips && <div className="flex flex-wrap items-center gap-2">{chips}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  )
}
