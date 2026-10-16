import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HistoryHook, HistoryRow } from '../api/history'
import { TimelineMap } from './TimelineMap'

function row(overrides: Partial<HistoryRow>): HistoryRow {
  return {
    c: 'CHIP-1',
    t: 0,
    ts: '2026-01-01T00:00:00',
    p: 1,
    la: 43.5,
    lo: 5.4,
    ta: 20,
    hr: 50,
    m: 300,
    g: 1,
    tm: 22,
    ...overrides,
  }
}

const hooks: HistoryHook[] = []

describe('TimelineMap (KAN-174 FR10-18, NFR1, NFR3)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders one marker per visible device at the slider max (series end) on initial load', async () => {
    const rows: HistoryRow[] = [
      row({ c: 'CHIP-1', t: 1000, la: 1, lo: 1 }),
      row({ c: 'CHIP-2', t: 1000, la: 2, lo: 2 }),
    ]
    render(<TimelineMap rows={rows} hooks={hooks} />)

    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(2))
  })

  it('omits a device with no reading yet at the current instant (FR12/CB20)', async () => {
    const rows: HistoryRow[] = [
      row({ c: 'CHIP-1', t: 1000, la: 1, lo: 1 }),
      row({ c: 'CHIP-2', t: 5000, la: 2, lo: 2 }),
    ]
    render(<TimelineMap rows={rows} hooks={hooks} />)
    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(2))

    // Scrub to the very first instant: CHIP-2 has no reading yet.
    const slider = screen.getByTestId('timeline-slider') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '1000' } })

    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1))
  })

  it('re-renders the marker (same device, new position) as the slider scrubs, with no network call', async () => {
    const rows: HistoryRow[] = [
      row({ c: 'CHIP-1', t: 1000, la: 1, lo: 1, m: 100 }), // red fill (<200)
      row({ c: 'CHIP-1', t: 2000, la: 2, lo: 2, m: 600 }), // green fill (>=500)
    ]
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    render(<TimelineMap rows={rows} hooks={hooks} />)
    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1))
    expect(document.querySelector('.leaflet-marker-icon')?.innerHTML).toContain('#2e7d32')

    fireEvent.change(screen.getByTestId('timeline-slider'), { target: { value: '1000' } })

    await waitFor(() => expect(document.querySelector('.leaflet-marker-icon')?.innerHTML).toContain('#c62828'))
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  // CB23's actual `<Polyline>` rendering is deliberately NOT exercised by
  // any component test here: jsdom's SVG support is too incomplete for
  // Leaflet's vector (`SVG`) renderer — merely MOUNTING a `<Polyline>`
  // throws inside `leaflet/src/layer/vector/Path.js` under jsdom
  // (`getRenderer`/`hasLayer` dereferencing a null pane), independent of
  // this component's own code, and independent of what's asserted
  // afterwards. This is the same class of gap every other Leaflet vector
  // layer in this codebase would hit — neither `PositionsMap` (KAN-160)
  // nor `ContractPositions` happen to exercise it today because neither
  // renders a `<Polyline>`. The trail's actual math (which points, in
  // what order, and the `idx <= 0` → no line rule) is fully covered by
  // `timelineData.test.ts`'s `trailPositions` unit tests; the real SVG
  // rendering is covered end-to-end, in a real browser, by
  // `e2e/history-timeline-map.spec.ts`.
  it('renders the "Afficher la trace" toggle unchecked by default', async () => {
    const rows: HistoryRow[] = [row({ c: 'CHIP-1', t: 1000, la: 1, lo: 1 })]
    render(<TimelineMap rows={rows} hooks={hooks} />)
    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1))
    expect(screen.getByTestId('timeline-trail-toggle')).not.toBeChecked()
  })

  it('"Rejouer" advances the instant over time and stops automatically at the end (CB24)', async () => {
    vi.useFakeTimers()
    const rows: HistoryRow[] = [row({ c: 'CHIP-1', t: 0, la: 1, lo: 1 }), row({ c: 'CHIP-1', t: 1000, la: 2, lo: 2 })]
    render(<TimelineMap rows={rows} hooks={hooks} />)

    const playButton = screen.getByTestId('timeline-play-toggle')
    expect(playButton).toHaveTextContent('Rejouer')

    fireEvent.click(playButton)
    expect(playButton).toHaveTextContent('Pause')

    // step = max(1000, floor(1000/200)) = 1000ms per 80ms tick; one tick
    // already reaches tMax (1000) and should auto-stop.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80)
    })

    expect(playButton).toHaveTextContent('Rejouer')
    expect((screen.getByTestId('timeline-slider') as HTMLInputElement).value).toBe('1000')
  })

  it('disables the slider and play button, and shows a dash label, when there are no rows', () => {
    render(<TimelineMap rows={[]} hooks={hooks} />)
    expect(screen.getByTestId('timeline-slider')).toBeDisabled()
    expect(screen.getByTestId('timeline-play-toggle')).toBeDisabled()
    expect(screen.getByTestId('timeline-instant-label')).toHaveTextContent('—')
  })

  it('a new rows set resets the slider to the end and re-arms auto-fit', async () => {
    const first: HistoryRow[] = [row({ c: 'CHIP-1', t: 1000, la: 1, lo: 1 })]
    const { rerender } = render(<TimelineMap rows={first} hooks={hooks} />)
    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1))

    const second: HistoryRow[] = [row({ c: 'CHIP-1', t: 9000, la: 9, lo: 9 })]
    rerender(<TimelineMap rows={second} hooks={hooks} />)

    await waitFor(() =>
      expect((screen.getByTestId('timeline-slider') as HTMLInputElement).value).toBe('9000'),
    )
  })
})
