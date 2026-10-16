import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TransferHistory } from './TransferHistory'

describe('TransferHistory (KAN-169 FR18, CB29)', () => {
  it('shows an explicit empty state with no recorded transfers', () => {
    render(<TransferHistory entries={[]} />)

    expect(screen.getByTestId('transfer-history-empty')).toBeInTheDocument()
  })

  it('marks an open-ended transfer as "en cours" rather than a literal sentinel date', () => {
    render(
      <TransferHistory
        entries={[
          {
            deviceId: 'CHIP-001',
            contractId: 12,
            targetContractId: 34,
            targetClientId: 99,
            startDate: '2026-06-10',
            endDate: null,
            openEnded: true,
          },
        ]}
      />,
    )

    expect(screen.getByTestId('transfer-history-row-CHIP-001-0')).toHaveTextContent('en cours')
    expect(screen.getByTestId('transfer-history-row-CHIP-001-0')).not.toHaveTextContent('9999-12-31')
  })

  it("shows the stored end date for a closed transfer", () => {
    render(
      <TransferHistory
        entries={[
          {
            deviceId: 'CHIP-001',
            contractId: 12,
            targetContractId: 34,
            targetClientId: 99,
            startDate: '2026-06-10',
            endDate: '2026-07-01',
            openEnded: false,
          },
        ]}
      />,
    )

    expect(screen.getByTestId('transfer-history-row-CHIP-001-0')).toHaveTextContent('2026-07-01')
    expect(
      screen.queryByTestId('transfer-history-row-CHIP-001-0-ongoing'),
    ).not.toBeInTheDocument()
  })

  it('lists multiple transfers across different devices', () => {
    render(
      <TransferHistory
        entries={[
          {
            deviceId: 'CHIP-001',
            contractId: 12,
            targetContractId: 34,
            targetClientId: 99,
            startDate: '2026-06-10',
            endDate: null,
            openEnded: true,
          },
          {
            deviceId: 'CHIP-002',
            contractId: 12,
            targetContractId: 56,
            targetClientId: 100,
            startDate: '2026-06-11',
            endDate: '2026-06-20',
            openEnded: false,
          },
        ]}
      />,
    )

    expect(screen.getByTestId('transfer-history-row-CHIP-001-0')).toBeInTheDocument()
    expect(screen.getByTestId('transfer-history-row-CHIP-002-1')).toBeInTheDocument()
  })
})
