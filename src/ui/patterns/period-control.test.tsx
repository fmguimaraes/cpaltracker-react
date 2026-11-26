import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PeriodControl, monthShortcuts, parseDay } from './period-control'

const day = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()]

describe('parseDay', () => {
  it('reads a jj/mm/aaaa day', () => {
    expect(day(parseDay(' 15/09/2026 ')!)).toEqual([2026, 9, 15])
  })

  it('rejects text that is not a real day', () => {
    expect(parseDay('31/02/2026')).toBeNull()
    expect(parseDay('2026-09-15')).toBeNull()
    expect(parseDay('15/09/26')).toBeNull()
    expect(parseDay('')).toBeNull()
  })
})

describe('monthShortcuts', () => {
  const now = new Date(2026, 10, 26, 14, 0)
  const byKey = Object.fromEntries(monthShortcuts(now).map((s) => [s.key, s]))

  it('aligns every shortcut on whole months', () => {
    expect(day(byKey['this-month'].from)).toEqual([2026, 11, 1])
    expect(byKey['this-month'].to).toBe(now)
    expect(day(byKey['last-month'].from)).toEqual([2026, 10, 1])
    expect(day(byKey['last-month'].to)).toEqual([2026, 10, 31])
    expect(day(byKey['3-months'].from)).toEqual([2026, 9, 1])
    expect(day(byKey['6-months'].from)).toEqual([2026, 6, 1])
    expect(day(byKey['this-year'].from)).toEqual([2026, 1, 1])
  })

  it('crosses the year boundary', () => {
    const jan = Object.fromEntries(monthShortcuts(new Date(2027, 0, 10)).map((s) => [s.key, s]))
    expect(day(jan['last-month'].from)).toEqual([2026, 12, 1])
    expect(day(jan['last-month'].to)).toEqual([2026, 12, 31])
  })
})

// Opening the two-month calendar costs ~0.5 s in jsdom and each typed key re-renders it: one test took 1 to 2 s
// alone and hit the 5 s default on a loaded full run (KAN-351). Days go in as one paste, with a wider timeout.
describe('PeriodControl custom range', { timeout: 15_000 }, () => {
  let user: ReturnType<typeof userEvent.setup>
  beforeEach(() => {
    user = userEvent.setup()
  })
  const range = { from: new Date(2026, 9, 27), to: new Date(2026, 10, 26) }

  async function open(onCustom = vi.fn()) {
    render(<PeriodControl preset="30d" range={range} onPreset={vi.fn()} onCustom={onCustom} testId="p" />)
    await user.click(screen.getByTestId('p-custom'))
    return onCustom
  }

  it('applies typed days as whole local days, in order', async () => {
    const onCustom = await open()
    const from = screen.getByTestId('p-custom-from')
    const to = screen.getByTestId('p-custom-to')
    await user.click(to)
    await user.paste('20/12/2026')
    await user.keyboard('{Enter}')
    await user.click(from)
    await user.paste('15/09/2026')
    await user.keyboard('{Enter}')
    await user.click(screen.getByTestId('p-custom-apply'))
    const [start, end] = onCustom.mock.calls[0]
    expect([...day(start), start.getHours()]).toEqual([2026, 9, 15, 0])
    expect([...day(end), end.getHours(), end.getMinutes()]).toEqual([2026, 12, 20, 23, 59])
  })

  it('swaps a start typed after the end', async () => {
    const onCustom = await open()
    await user.click(screen.getByTestId('p-custom-from'))
    await user.paste('05/12/2026')
    await user.keyboard('{Enter}')
    await user.click(screen.getByTestId('p-custom-apply'))
    const [start, end] = onCustom.mock.calls[0]
    expect(day(start)).toEqual([2026, 11, 26])
    expect(day(end)).toEqual([2026, 12, 5])
  })

  it('blocks Appliquer while a typed day is invalid', async () => {
    await open()
    const from = screen.getByTestId('p-custom-from')
    await user.click(from)
    await user.paste('31/02/2026')
    expect(from).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('p-custom-apply')).toBeDisabled()
  })

  it('fills both days from a shortcut', async () => {
    await open()
    await user.click(screen.getByTestId('p-shortcut-last-month'))
    expect(screen.getByTestId('p-custom-from')).toHaveValue(
      monthShortcuts().find((s) => s.key === 'last-month')!.from.toLocaleDateString('fr-FR'),
    )
  })
})
