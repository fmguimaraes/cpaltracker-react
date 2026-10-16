import { useEffect, useState } from 'react'
import { fetchPositions, type Position } from '../api/positions'
import { PositionsMap } from './PositionsMap'

type LoadState = 'loading' | 'loaded' | 'error'

/**
 * KAN-160 (FR3/FR4) — fetches and renders the selected contract's
 * last-known device positions. Split out of `LiveTracking.tsx` so that
 * component stays focused on FR1/FR2 (gate + contract selector); this one
 * owns the FR3-FR7 map concern, re-fetching whenever `contractId` changes.
 *
 * NFR5 ("markers visible < 1.5s after the response resolves"): nothing
 * here does extra work between the fetch resolving and the map receiving
 * its `positions` prop — there is no intermediate transform step that
 * could itself become the bottleneck; `PositionsMap`'s own render is a
 * plain Leaflet marker-per-device pass over an already-small list.
 */
export function ContractPositions({ contractId }: { contractId: number }) {
  const [state, setState] = useState<LoadState>('loading')
  const [positions, setPositions] = useState<Position[]>([])

  useEffect(() => {
    let cancelled = false
    setState('loading')
    fetchPositions(contractId)
      .then((result) => {
        if (cancelled) return
        setPositions(result)
        setState('loaded')
      })
      .catch(() => {
        if (cancelled) return
        setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [contractId])

  if (state === 'loading') {
    return (
      <p data-testid="positions-loading" style={{ color: 'var(--color-text-muted)' }}>
        Chargement des positions…
      </p>
    )
  }

  if (state === 'error') {
    return (
      <p data-testid="positions-error" role="alert" style={{ color: 'var(--color-danger)' }}>
        Impossible de charger les positions de ce contrat. Réessayez plus tard.
      </p>
    )
  }

  if (positions.length === 0) {
    return (
      <p data-testid="positions-empty" style={{ color: 'var(--color-text-muted)' }}>
        Aucune position disponible pour ce contrat.
      </p>
    )
  }

  return <PositionsMap positions={positions} />
}
