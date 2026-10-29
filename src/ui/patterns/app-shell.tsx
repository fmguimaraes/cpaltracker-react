import { ChevronsUpDown, LogOut, Settings, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '@/app/theme'
import { useIsMobile } from '@/hooks/use-mobile'
import { Avatar, AvatarFallback } from '@/ui/avatar'
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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/ui/sidebar'
import { Separator } from '@/ui/separator'
import { ThemeToggle, type ThemeToggleLabels } from '@/ui/patterns/theme-toggle'
import { MOBILE_FRAME_WIDTH, useViewport, ViewportToggle } from '@/ui/patterns/viewport-toggle'

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
  /** Client-logo slot, rendered in the sidebar header (link, image, name: all up to the app). */
  logo: ReactNode
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
  /** Copy of the theme control (partial override of the defaults). */
  themeLabels?: Partial<ThemeToggleLabels>
}

const MAIN_ID = 'main-content'

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
          <ChevronsUpDown className="ml-auto" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={isMobile ? 'top' : 'right'} align="end" className="w-56">
        <DropdownMenuLabel>{menu.caption}</DropdownMenuLabel>
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
  'sections' | 'userMenu' | 'logo' | 'navigationLabel' | 'sidebarTestId' | 'navTestId'
>

function AppSidebar({
  sections,
  userMenu,
  logo,
  navigationLabel,
  sidebarTestId = 'app-sidebar',
  navTestId = 'app-nav',
}: AppSidebarProps) {
  const { pathname } = useLocation()
  const { withViewport } = useViewport()
  const { setOpenMobile } = useSidebar()
  return (
    <Sidebar collapsible="icon" aria-label={navigationLabel} data-testid={sidebarTestId}>
      <SidebarHeader>
        {logo}
      </SidebarHeader>
      <SidebarContent data-testid={navTestId}>
        {sections.map((section) => (
          <SidebarGroup key={section.title}>
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
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
                        className="relative data-[active=true]:before:absolute data-[active=true]:before:inset-y-1 data-[active=true]:before:left-0 data-[active=true]:before:w-0.5 data-[active=true]:before:rounded-full data-[active=true]:before:bg-primary"
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
      <SidebarFooter>
        <UserMenu menu={userMenu} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
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
 * The one app shell: collapsible sidebar (sheet on mobile), top bar with theme + viewport toggles,
 * and the routed page. Navigation, user menu and logo come from the app via props; the single
 * <main> is the skip-link target. `?view=mobile` frames the page in a 390 px iframe; `?frame=1` (inside it)
 * hides the toolbar's toggles and keeps only the menu trigger.
 */
export function AppShell({
  sections,
  userMenu,
  logo,
  skipToContentLabel = 'Aller au contenu',
  navigationLabel = 'Navigation principale',
  sidebarTestId,
  navTestId,
  sidebarTriggerLabel = 'Réduire ou ouvrir le menu',
  themeLabels,
}: AppShellProps) {
  const { mode, isFrame } = useViewport()
  const isMobile = useIsMobile()
  const framed = mode === 'mobile' && !isFrame && !isMobile
  return (
    <SidebarProvider>
      <SkipLink label={skipToContentLabel} />
      <AppSidebar
        sections={sections}
        userMenu={userMenu}
        logo={logo}
        navigationLabel={navigationLabel}
        sidebarTestId={sidebarTestId}
        navTestId={navTestId}
      />
      <SidebarInset
        id={MAIN_ID}
        tabIndex={-1}
        className="min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3" data-testid="shell-toolbar">
          <SidebarTrigger aria-label={sidebarTriggerLabel} />
          {!isFrame && (
            <>
              <Separator orientation="vertical" className="h-5" />
              <div className="ml-auto flex items-center gap-2">
                <ViewportToggle />
                <ThemeToggle labels={themeLabels} />
              </div>
            </>
          )}
        </div>
        {framed ? (
          <MobileFrame />
        ) : (
          <div className="min-w-0 flex-1">
            <Outlet />
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}
