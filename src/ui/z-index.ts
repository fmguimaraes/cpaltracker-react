/**
 * KAN-252 code review — single source of truth for the "above any map" stacking z-index.
 *
 * The map kit (`FleetMap`/`TimelineMap`) positions its own controls/panes at `z-[1000]` (see
 * `src/ui/map/FleetMap.tsx`, `src/history/TimelineMap.tsx`). Any dialog-like overlay that can
 * appear on the same page as a map (`Dialog`, `AlertDialog`) must sit strictly above that, or it
 * renders behind the map's controls/panes instead of on top of them (the bug this fixes).
 *
 * Only `Dialog`/`AlertDialog` use this — `Select`/`Popover`/`DropdownMenu`/`HoverCard`/
 * `Tooltip`/`Sheet` stay at the Tailwind default `z-50`; none of them are used over a map in any
 * current story, and a full kit-wide z-index audit is a separate concern.
 */
export const Z_OVERLAY_ABOVE_MAP = 'z-[1100]'
