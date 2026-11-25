import { render, screen } from '@testing-library/react'
import type { AnomalyHistoryEntry } from '../api/anomalies'
import { AnomalyLifecycle, lifecycleReached } from './AnomalyLifecycle'

const by = { name: 'Marie Curie', sameOrganisation: true }
const entry = (at: string, from: AnomalyHistoryEntry['from'], to: AnomalyHistoryEntry['to']): AnomalyHistoryEntry =>
  ({ at, from, to, by, comment: null }) as AnomalyHistoryEntry

describe('lifecycleReached', () => {
  it('dates the detection and the latest entry into each step up to the current one', () => {
    const reached = lifecycleReached({
      status: 'en_cours',
      detectedAt: '2026-11-20 08:00:00',
      // Newest first: reopened after a provisional closure.
      history: [
        entry('2026-11-22 10:00:00', 'fermee', 'en_cours'),
        entry('2026-11-21 10:00:00', 'en_cours', 'fermee'),
        entry('2026-11-20 09:00:00', 'detectee', 'en_cours'),
      ],
    })
    expect(reached[0]?.by).toBe('Système')
    expect(reached[1]?.at.toISOString()).toBe('2026-11-22T10:00:00.000Z')
    expect(reached[1]?.by).toBe('Marie Curie')
    // After the reopening, the closure steps are pending again.
    expect(reached[2]).toBeNull()
    expect(reached[3]).toBeNull()
  })
})

describe('AnomalyLifecycle', () => {
  it('marks the steps done, current and pending', () => {
    render(
      <AnomalyLifecycle
        now={new Date('2026-11-25T12:00:00Z')}
        detail={
          {
            status: 'fermee',
            detectedAt: '2026-11-20 08:00:00',
            history: [entry('2026-11-21 10:00:00', 'en_cours', 'fermee'), entry('2026-11-20 09:00:00', 'detectee', 'en_cours')],
          } as never
        }
      />,
    )
    expect(screen.getByTestId('anomaly-lifecycle-detectee')).toHaveAttribute('data-state', 'done')
    expect(screen.getByTestId('anomaly-lifecycle-en_cours')).toHaveAttribute('data-state', 'done')
    expect(screen.getByTestId('anomaly-lifecycle-fermee')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByTestId('anomaly-lifecycle-cloturee')).toHaveAttribute('data-state', 'pending')
    expect(screen.getByTestId('anomaly-lifecycle-fermee').querySelector('time')).not.toBeNull()
    expect(screen.getByTestId('anomaly-lifecycle-cloturee').querySelector('time')).toBeNull()
  })
})
