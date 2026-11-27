import { EllipsisVertical, LogOut, Menu, Settings, type LucideIcon } from 'lucide-react'
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '@/app/theme'
import { useIsMobile } from '@/hooks/use-mobile'
import { Avatar, AvatarFallback } from '@/ui/avatar'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from '@/ui/sidebar'
import { MOBILE_FRAME_WIDTH, useViewport } from '@/ui/patterns/viewport-toggle'
import { ShellSlotsContext, type ShellSlots } from '@/ui/patterns/shell-title'

/** One sidebar link. `testId` is rendered as data-testid on the link. */
export interface ShellNavItem {
  to: string
  label: string
  icon: LucideIcon
  testId?: string
}

export interface ShellNavSection {
  title: string
  items: ShellNavItem[]
}

/** User-menu content supplied by the app: identity, account link and sign out. */
export interface ShellUserMenu {
  /** Display name, and its short initials for the avatar. */
  name: string
  initials: string
  /** Second line under the name (e.g. "Mon compte"); also the tooltip and the menu heading. */
  caption: string
  /** aria-label of the trigger. */
  triggerLabel: string
  /** data-testid of the trigger (default "user-menu"). */
  testId?: string
  account: { to: string; label: string; testId?: string }
  /**
   * Sign-out entry. Omit it to hide it (e.g. not authenticated). Give `onSelect` for an async
   * action (the app runs its logout); `to` is only a plain-navigation fallback.
   * `pending` disables the entry while the action runs.
   */
  signOut?: { label: string; onSelect?: () => void; to?: string; pending?: boolean; testId?: string }
}

export interface AppShellProps {
  /** Sidebar navigation (paths and testIds belong to the app). */
  sections: ShellNavSection[]
  userMenu: ShellUserMenu
  /**
   * Brand slot of the sidebar header: a fixed 48 px row aligned with the top bar, visible in the
   * expanded AND the collapsed (icon) sidebar, so keep it compact (about 28 px high).
   */
  logo: ReactNode
  /** Optional second logo (e.g. the client's), shown above the user menu and hidden when collapsed. */
  clientLogo?: ReactNode
  /**
   * Optional slot at the top of the sidebar content, above the nav sections (e.g. a global contract
   * selector). Rendered inside the sidebar, so it can call `useSidebar()` to adapt to the collapsed rail.
   */
  sidebarTop?: ReactNode
  /** Label of the skip-to-content link (shown on focus). */
  skipToContentLabel?: string
  /** aria-label of the sidebar landmark. */
  navigationLabel?: string
  /** data-testid of the sidebar landmark (default "app-sidebar"). */
  sidebarTestId?: string
  /** data-testid of the block holding the nav sections (default "app-nav"). */
  navTestId?: string
  /** aria-label of the sidebar collapse/open button. */
  sidebarTriggerLabel?: string
  /**
   * Controlled nav state from 768 px: `true` = expanded (~256 px, labels), `false` = the icon rail (56 px,
   * tooltips). Absent = the kit's own state (expanded by default).
   */
  navOpen?: boolean
  onNavOpenChange?: (open: boolean) => void
}

/** The icon rail's width (56 px): room for the 32 px icon squares with a 12 px gutter each side. */
const RAIL_STYLE = { '--sidebar-width-icon': '3.5rem' } as CSSProperties

const MAIN_ID = 'main-content'

/**
 * Nav row, full bleed (edge to edge, square, h-10). Inactive: --text-secondary, hover --surface-subtle.
 * Active (spec 2026-11-25): --surface-subtle, --text at 600, and a full-height 3px --signal bar on the left
 * edge (3.01:1 on the subtle surface in light). The collapsed icon rail keeps the kit's rounded 32px squares.
 * Focus ring is inset so the scroll container never clips it.
 */
const NAV_ITEM_CLASS =
  'relative h-10 gap-3 rounded-none px-4 focus-visible:ring-inset [&_svg]:size-[18px] group-data-[collapsible=icon]:rounded-md group-data-[collapsible=icon]:[&_svg]:size-4 data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground data-[active=true]:before:absolute data-[active=true]:before:inset-y-0 data-[active=true]:before:left-0 data-[active=true]:before:w-[3px] data-[active=true]:before:bg-signal group-data-[collapsible=icon]:data-[active=true]:before:hidden'

function isActivePath(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)
}

function SkipLink({ label }: { label: string }) {
  return (
    <a
      href={`#${MAIN_ID}`}
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-3 focus-visible:top-3 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-background focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-foreground focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(event) => {
        // Move focus to <main> explicitly: a bare hash link only scrolls in some browsers.
        const main = document.getElementById(MAIN_ID)
        if (main) {
          event.preventDefault()
          main.focus()
          main.scrollIntoView()
        }
      }}
    >
      {label}
    </a>
  )
}

function UserMenu({ menu }: { menu: ShellUserMenu }) {
  const { isMobile, setOpenMobile } = useSidebar()
  const { withViewport } = useViewport()
  const navigate = useNavigate()
  const signOut = menu.signOut
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" tooltip={menu.caption} aria-label={menu.triggerLabel} data-testid={menu.testId ?? 'user-menu'}>
          <Avatar className="size-8">
            <AvatarFallback>{menu.initials}</AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-1 flex-col text-left text-sm leading-tight">
            <span className="truncate font-medium">{menu.name}</span>
            <span className="truncate text-xs text-muted-foreground">{menu.caption}</span>
          </span>
          <EllipsisVertical className="ml-auto" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={isMobile ? 'top' : 'right'} align="end" className="w-56">
        {/* Name + role, then the account and sign out. The theme choice lives on the account page. */}
        <DropdownMenuLabel className="flex min-w-0 flex-col" data-testid="user-menu-identity">
          <span className="truncate">{menu.name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{menu.caption}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={withViewport(menu.account.to)} data-testid={menu.account.testId} onClick={() => setOpenMobile(false)}>
            <Settings /> {menu.account.label}
          </Link>
        </DropdownMenuItem>
        {signOut && (
          <DropdownMenuItem
            data-testid={signOut.testId}
            disabled={signOut.pending}
            onSelect={() => {
              if (signOut.onSelect) signOut.onSelect()
              else if (signOut.to) navigate(withViewport(signOut.to))
            }}
          >
            <LogOut /> {signOut.label}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type AppSidebarProps = Pick<
  AppShellProps,
  'sections' | 'userMenu' | 'logo' | 'clientLogo' | 'sidebarTop' | 'navigationLabel' | 'sidebarTestId' | 'navTestId'
>

function AppSidebar({
  sections,
  userMenu,
  logo,
  clientLogo,
  sidebarTop,
  navigationLabel,
  sidebarTestId = 'app-sidebar',
  navTestId = 'app-nav',
}: AppSidebarProps) {
  const { pathname } = useLocation()
  const { withViewport } = useViewport()
  const { setOpenMobile } = useSidebar()
  return (
    <Sidebar collapsible="icon" aria-label={navigationLabel} data-testid={sidebarTestId}>
      <SidebarHeader className="h-12 flex-row items-center justify-start gap-0 border-b border-sidebar-border px-2 py-0">
        {logo}
      </SidebarHeader>
      <SidebarContent data-testid={navTestId}>
        {sidebarTop}
        {sections.map((section) => (
          <SidebarGroup key={section.title} role="group" aria-label={section.title} className="px-0 pt-0 group-data-[collapsible=icon]:px-3">
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const active = isActivePath(pathname, item.to)
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className={NAV_ITEM_CLASS}
                      >
                        <Link
                          to={withViewport(item.to)}
                          aria-current={active ? 'page' : undefined}
                          data-testid={item.testId}
                          onClick={() => setOpenMobile(false)}
                        >
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      {/* Rail: the avatar (initials) stays at the bottom, centred; a click opens the user menu. */}
      <SidebarFooter className="group-data-[collapsible=icon]:px-3">
        {clientLogo && <div className="flex justify-center px-1 pb-1 group-data-[collapsible=icon]:hidden">{clientLogo}</div>}
        <UserMenu menu={userMenu} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

/** ☰: toggles the expanded nav and the icon rail (the drawer below 768 px). */
function NavToggle({ label }: { label: string }) {
  const { toggleSidebar, open, openMobile, isMobile } = useSidebar()
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-expanded={isMobile ? openMobile : open}
      onClick={toggleSidebar}
      data-testid="nav-toggle"
      data-sidebar="trigger"
    >
      <Menu aria-hidden />
    </Button>
  )
}

function MobileFrame() {
  const { pathname, search } = useLocation()
  const { theme } = useTheme()
  const params = new URLSearchParams(search)
  params.delete('view')
  params.set('frame', '1')
  const src = `${pathname}?${params.toString()}`
  return (
    <div className="flex min-h-full justify-center bg-muted p-4" data-testid="mobile-frame-host">
      {/* key: the framed document reads the theme once at load, so reload it when the choice changes */}
      <iframe
        key={theme}
        src={src}
        title={`Aperçu mobile ${MOBILE_FRAME_WIDTH} px`}
        data-testid="mobile-frame"
        className="h-[calc(100svh-6.5rem)] w-[390px] max-w-full shrink-0 rounded-xl border border-border bg-background shadow-overlay"
      />
    </div>
  )
}

/**
 * The one app shell: collapsible sidebar (sheet on mobile), top bar,
 * and the routed page. Navigation, user menu and logo come from the app via props; the single
 * <main> is the skip-link target. `?view=mobile` frames the page in a 390 px iframe; `?frame=1` (inside it)
 * hides the toolbar's toggles and keeps only the menu trigger.
 */
export function AppShell({
  sections,
  userMenu,
  logo,
  clientLogo,
  sidebarTop,
  skipToContentLabel = 'Aller au contenu',
  navigationLabel = 'Navigation principale',
  sidebarTestId,
  navTestId,
  sidebarTriggerLabel = 'Réduire ou déplier le menu',
  navOpen,
  onNavOpenChange,
}: AppShellProps) {
  const { mode, isFrame } = useViewport()
  const isMobile = useIsMobile()
  const framed = mode === 'mobile' && !isFrame && !isMobile
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null)
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null)
  const [refreshSlot, setRefreshSlot] = useState<HTMLElement | null>(null)
  const slots = useMemo<ShellSlots>(
    () => ({ title: titleSlot, actions: actionsSlot, refresh: refreshSlot }),
    [titleSlot, actionsSlot, refreshSlot],
  )
  return (
    <SidebarProvider open={navOpen} onOpenChange={onNavOpenChange} style={RAIL_STYLE}>
      <SkipLink label={skipToContentLabel} />
      <AppSidebar
        sections={sections}
        userMenu={userMenu}
        logo={logo}
        clientLogo={clientLogo}
        sidebarTop={sidebarTop}
        navigationLabel={navigationLabel}
        sidebarTestId={sidebarTestId}
        navTestId={navTestId}
      />
      <SidebarInset
        id={MAIN_ID}
        tabIndex={-1}
        className="min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {/*
          The context bar, one row on every page: ☰, the page's breadcrumb (left, shrinks first), its global
          controls, then last update + refresh (right). The theme lives on the account page. Pages fill the three slots
          through ShellPageTitle / ShellPageActions / ShellPageRefresh. z-20 + the pages' isolated map
          stacking context keep this bar's popovers and menus above the Leaflet panes (z 400–1000).
        */}
        <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background pl-3 pr-4 md:pr-6" data-testid="shell-toolbar">
          <NavToggle label={sidebarTriggerLabel} />
          <div ref={setTitleSlot} data-testid="shell-title" className="flex min-w-0 flex-1 items-center gap-3 text-sm" />
          <div
            ref={setActionsSlot}
            data-testid="shell-actions"
            className="flex min-w-0 shrink items-center gap-2 overflow-x-auto empty:hidden max-md:no-scrollbar"
          />
          <div ref={setRefreshSlot} data-testid="shell-refresh-slot" className="flex shrink-0 items-center empty:hidden" />
        </div>
        {framed ? (
          <MobileFrame />
        ) : (
          <div className="min-w-0 flex-1">
            <ShellSlotsContext.Provider value={slots}>
              <Outlet />
            </ShellSlotsContext.Provider>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}
