import { TriangleAlert } from 'lucide-react'
import { Alert } from '@/ui/alert'

/**
 * KAN-175 (FR22) — the downsampling warning banner, replicating CB10/CB11
 * exactly: shown only when the response is flagged `sampled: true`, naming
 * both the post-sampling `count` and the pre-sampling `total`, and
 * suggesting the user narrow the date range.
 */
export function SamplingBanner({ sampled, count, total }: { sampled: boolean; count: number; total: number }) {
  if (!sampled) return null

  return (
    <Alert variant="warning" role="status" data-testid="history-sampling-banner">
      <TriangleAlert aria-hidden />
      <div>
        Résultat échantillonné : affichage de {count} mesure(s) sur {total} au total. Réduisez la période pour plus
        de précision.
      </div>
    </Alert>
  )
}
