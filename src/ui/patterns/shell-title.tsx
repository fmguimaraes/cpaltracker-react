import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** The shell's top-bar elements pages portal into (set by AppShell); `null` while not mounted yet. */
export interface ShellSlots {
  /** Left: the page's breadcrumb (page title › selection levels). */
  title: HTMLElement | null
  /** Right: the page-specific global controls (period, pallet selector, …). */
  actions: HTMLElement | null
  /** Right end: last update + refresh. */
  refresh: HTMLElement | null
}

/**
 * Top-bar slots (set by AppShell). `undefined` = no shell around the page (isolated tests, standalone
 * renders): the slot components then render their children in place so the page stays usable.
 */
export const ShellSlotsContext = createContext<ShellSlots | undefined>(undefined)

/** Kept for existing callers: the title slot element alone (null outside a shell). */
export function useShellTitleSlot(): HTMLElement | null {
  return useContext(ShellSlotsContext)?.title ?? null
}

function ShellSlot({ name, children }: { name: keyof ShellSlots; children: ReactNode }) {
  const slots = useContext(ShellSlotsContext)
  if (slots === undefined) return <>{children}</>
  const target = slots[name]
  return target ? createPortal(children, target) : null
}

/** Page title (breadcrumb) shown in the shell's top bar instead of an H1 band. */
export function ShellPageTitle({ children }: { children: ReactNode }) {
  return <ShellSlot name="title">{children}</ShellSlot>
}

/** Page-specific global controls, right side of the top bar. */
export function ShellPageActions({ children }: { children: ReactNode }) {
  return <ShellSlot name="actions">{children}</ShellSlot>
}

/** Last update + refresh, at the right end of the top bar. */
export function ShellPageRefresh({ children }: { children: ReactNode }) {
  return <ShellSlot name="refresh">{children}</ShellSlot>
}
