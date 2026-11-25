import { useCallback } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

/**
 * Pulse's selection levels, encoded in the URL (unified shell §1.3) so back/forward walk them and a deep link
 * restores the drawer:
 *
 *   /pulse                                   the contract's anomalies
 *   /pulse?palette=CHIP                      the pallet drawer
 *   /pulse?palette=CHIP&vue=anomalies        the anomalies list narrowed on that pallet
 *   /pulse?anomalie=KEY[&palette=…[&vue=…]]  an anomaly, opened from the level the other params describe
 *
 * `periode=` and `t=` (replay instant) ride along but are not selection levels: they are written with
 * `replace` and never pushed.
 */
export type ListView = { kind: 'contract'; chipId?: string } | { kind: 'pallet'; chipId: string }
export type PanelView = ListView | { kind: 'anomaly'; anomalyKey: string; from: ListView }

export const CONTRACT_VIEW: PanelView = { kind: 'contract' }

export const PALLET_PARAM = 'palette'
export const LIST_PARAM = 'vue'
export const ANOMALY_PARAM = 'anomalie'
export const PERIOD_PARAM = 'periode'
export const INSTANT_PARAM = 't'

const LIST_VALUE = 'anomalies'

export function parseView(params: URLSearchParams): PanelView {
  const chipId = params.get(PALLET_PARAM) || null
  const narrowed = chipId !== null && params.get(LIST_PARAM) === LIST_VALUE
  const list: ListView = chipId === null ? { kind: 'contract' } : narrowed ? { kind: 'contract', chipId } : { kind: 'pallet', chipId }
  const anomalyKey = params.get(ANOMALY_PARAM) || null
  return anomalyKey === null ? list : { kind: 'anomaly', anomalyKey, from: list }
}

/** `params` with the selection params replaced by `view`'s (every other param kept). */
export function withView(params: URLSearchParams, view: PanelView): URLSearchParams {
  const next = new URLSearchParams(params)
  next.delete(PALLET_PARAM)
  next.delete(LIST_PARAM)
  next.delete(ANOMALY_PARAM)
  const list = view.kind === 'anomaly' ? view.from : view
  if (list.chipId !== undefined) next.set(PALLET_PARAM, list.chipId)
  if (list.kind === 'contract' && list.chipId !== undefined) next.set(LIST_PARAM, LIST_VALUE)
  if (view.kind === 'anomaly') next.set(ANOMALY_PARAM, view.anomalyKey)
  return next
}

/** A level's identity for the history trail (selection only: period and instant excluded). */
export function viewKey(view: PanelView): string {
  const list = view.kind === 'anomaly' ? view.from : view
  const base = list.kind === 'pallet' ? `p:${list.chipId}` : list.chipId === undefined ? 'c' : `c:${list.chipId}`
  return view.kind === 'anomaly' ? `${base}|a:${view.anomalyKey}` : base
}

/** `location.state` of an entry pushed by Pulse: the keys of the levels below it in the history stack. */
interface TrailState {
  pulseTrail?: string[]
}

function trailOf(state: unknown): string[] {
  const trail = (state as TrailState | null)?.pulseTrail
  return Array.isArray(trail) ? trail : []
}

/**
 * How to reach `target` from the current entry: `-n` when it is the level `n` entries back in Pulse's own
 * pushes (a "back" — the drawer ← and the breadcrumb then agree with the browser's back button), otherwise
 * a push. `0` = already there.
 */
export function stepTo(trail: string[], currentKey: string, targetKey: string): number | 'push' {
  if (targetKey === currentKey) return 0
  const index = trail.lastIndexOf(targetKey)
  return index < 0 ? 'push' : -(trail.length - index)
}

/** The current level, and `go(view)`: pops back to it when it is below in the history, else pushes it. */
export function usePulseNavigation(): { view: PanelView; go: (view: PanelView) => void; reset: () => void } {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const view = parseView(params)
  const go = useCallback(
    (target: PanelView) => {
      const current = new URLSearchParams(location.search)
      const currentKey = viewKey(parseView(current))
      const trail = trailOf(location.state)
      const step = stepTo(trail, currentKey, viewKey(target))
      if (step === 0) return
      if (step !== 'push') {
        navigate(step)
        return
      }
      const search = withView(current, target).toString()
      navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { state: { pulseTrail: [...trail, currentKey] } })
    },
    [location, navigate],
  )
  // A contract switch: back to the contract's anomalies in place (no history entry, no trail).
  const reset = useCallback(() => {
    const current = new URLSearchParams(location.search)
    const search = withView(current, CONTRACT_VIEW).toString()
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true })
  }, [location, navigate])
  return { view, go, reset }
}
