import { RotateCw } from 'lucide-react'
import { Button } from '@/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/tooltip'
import { cn } from '@/lib/utils'

/** "11:02" — local time, fr-FR. */
export function formatUpdateTime(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date)
}

/** Tooltip of the refresh button: "Rafraîchir · dernière mise à jour 11:02". */
export function refreshTooltip(lastUpdated: Date | null): string {
  return lastUpdated ? `Rafraîchir · dernière mise à jour ${formatUpdateTime(lastUpdated)}` : 'Rafraîchir'
}

/**
 * The top bar's last update + "↻" (right end of the shell, every page with a refresh): the time of the last
 * successful load (from `lg`), and an icon button whose tooltip repeats it. Spins while `refreshing`.
 */
export function ShellRefreshButton({
  lastUpdated,
  onRefresh,
  refreshing = false,
  testId = 'shell-refresh',
  lastUpdatedTestId = 'shell-last-updated',
}: {
  lastUpdated: Date | null
  onRefresh: () => void
  refreshing?: boolean
  testId?: string
  lastUpdatedTestId?: string
}) {
  const tooltip = refreshTooltip(lastUpdated)
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {lastUpdated && (
        <span data-testid={lastUpdatedTestId} className="text-xs whitespace-nowrap text-muted-foreground tabular-nums max-lg:sr-only">
          Mis à jour à {formatUpdateTime(lastUpdated)}
        </span>
      )}
      {/* Own provider: the button also renders outside the app's provider (isolated pages, tests). */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={refreshing ? 'Rafraîchissement…' : tooltip}
              aria-busy={refreshing || undefined}
              disabled={refreshing}
              onClick={onRefresh}
              data-testid={testId}
            >
              <RotateCw aria-hidden className={cn(refreshing && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
