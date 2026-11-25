import { describe, expect, it } from 'vitest'
import {
  actionLabel,
  commentError,
  COMMENT_COUNTER_FROM,
  DETAIL_STATUS_LABEL,
  formatDelay,
  rankTransitions,
  STATUS_DISPLAY,
  STATUS_FILTER_OPTIONS,
  STATUS_LABEL,
  statusesForFilter,
} from './anomalyFormat'

describe('anomalyFormat (KAN-261)', () => {
  it('always requests explicit statuses; "non clôturées" excludes both closed statuses (fermee and cloturee)', () => {
    // Regression (owner spec §7): "non clôturées" used to send no status, and the server default only
    // excludes `cloturee`, so a `fermee` anomaly — shown as "Clôturée" — still appeared.
    expect(statusesForFilter('open')).toEqual(['detectee', 'en_cours'])
    expect(statusesForFilter('closed')).toEqual(['fermee', 'cloturee'])
    expect(statusesForFilter('all')).toEqual(['detectee', 'en_cours', 'fermee', 'cloturee'])
  })

  it('shows both closed statuses as "Clôturée", qualified only in the detail view; detectee reads "À traiter"', () => {
    expect(STATUS_LABEL.detectee).toBe('À traiter')
    expect(STATUS_LABEL.fermee).toBe('Clôturée')
    expect(STATUS_LABEL.cloturee).toBe('Clôturée')
    expect(DETAIL_STATUS_LABEL.fermee).not.toBe(DETAIL_STATUS_LABEL.cloturee)
    expect(STATUS_FILTER_OPTIONS.map((option) => option.label)).toEqual(['Ouvertes', 'Clôturées', 'Toutes'])
  })

  it('defines "Clôturée (provisoire)": the Clôturée pill, a muted qualifier, the Clôturées tab', () => {
    expect(STATUS_DISPLAY.fermee).toEqual({ label: 'Clôturée', tone: 'neutral', qualifier: 'provisoire', tab: 'closed' })
    expect(STATUS_DISPLAY.cloturee.qualifier).toBeNull()
    expect(DETAIL_STATUS_LABEL.fermee).toBe('Clôturée (provisoire)')
    expect(DETAIL_STATUS_LABEL.cloturee).toBe('Clôturée')
  })

  it('formats the measurement → detection delay in hours, then days', () => {
    expect(formatDelay(90 * 60_000)).toBe('+1\u00a0h')
    expect(formatDelay(23.9 * 3_600_000)).toBe('+23\u00a0h')
    expect(formatDelay((6 * 24 + 1) * 3_600_000)).toBe('+6\u00a0j')
  })

  it('puts the primary status action first and shows the counter past 80 %', () => {
    const order = (targets: ('en_cours' | 'fermee' | 'cloturee')[]) => rankTransitions(targets.map((to) => ({ to }))).map(({ to }) => to)
    expect(order(['cloturee', 'en_cours'])).toEqual(['en_cours', 'cloturee'])
    expect(order(['fermee'])).toEqual(['fermee'])
    expect(COMMENT_COUNTER_FROM).toBe(1600)
  })

  it('labels the actions and validates the comment (KAN-263)', () => {
    expect(actionLabel('detectee', 'en_cours')).toBe('Prendre en charge')
    expect(actionLabel('fermee', 'en_cours')).toBe('Rouvrir')
    expect(actionLabel('en_cours', 'fermee')).toBe('Clôturer')
    expect(actionLabel('fermee', 'cloturee')).toBe('Clôturer définitivement')
    expect(commentError(true, ' \n')).toMatch(/obligatoire/)
    expect(commentError(false, '')).toBeNull()
    expect(commentError(false, 'x'.repeat(2001))).toMatch(/2000/)
  })
})
