import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as anomaliesApi from '../api/anomalies'
import type { AnomalyDetail } from '../api/anomalies'
import { ApiError } from '../api/client'
import { TransitionForm } from './TransitionForm'

const base = {
  anomalyKey: '80480-2',
  status: 'en_cours',
  allowedTransitions: [{ to: 'fermee', commentRequired: true }],
  readOnlyReason: null,
} as unknown as AnomalyDetail

function renderForm(detail: AnomalyDetail = base) {
  const onChanged = vi.fn()
  const onReload = vi.fn()
  render(<TransitionForm contractId={4} detail={detail} onChanged={onChanged} onReload={onReload} />)
  return { onChanged, onReload, user: userEvent.setup() }
}

describe('TransitionForm (KAN-263)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('offers exactly the server-allowed transitions', () => {
    renderForm({ ...base, status: 'fermee', allowedTransitions: [
      { to: 'cloturee', commentRequired: false },
      { to: 'en_cours', commentRequired: false },
    ] })
    // "Clôturée" vocabulary: from `fermee` the final step is "Clôturer définitivement", never "Fermer".
    expect(screen.getByRole('button', { name: 'Clôturer définitivement' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rouvrir' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fermer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clôturer' })).not.toBeInTheDocument()
  })

  it('shows a read-only note and no control when nothing is allowed', () => {
    renderForm({ ...base, allowedTransitions: [], readOnlyReason: 'std_scope' })
    expect(screen.getByTestId('anomaly-read-only')).toHaveTextContent('Consultation seule sur un contrat partagé')
    expect(screen.queryByTestId('anomaly-comment')).not.toBeInTheDocument()
  })

  it('refuses a blank comment to close for review, without calling the API', async () => {
    const post = vi.spyOn(anomaliesApi, 'postAnomalyTransition')
    const { user } = renderForm()
    await user.type(screen.getByTestId('anomaly-comment'), '   ')
    await user.click(screen.getByTestId('anomaly-action-fermee'))
    expect(screen.getByTestId('anomaly-comment-error')).toHaveTextContent('obligatoire')
    expect(post).not.toHaveBeenCalled()
  })

  it('sends from/to/comment and hands the updated detail back', async () => {
    const updated = { ...base, status: 'fermee' } as AnomalyDetail
    const post = vi.spyOn(anomaliesApi, 'postAnomalyTransition').mockResolvedValue(updated)
    const { user, onChanged } = renderForm()
    await user.type(screen.getByTestId('anomaly-comment'), 'Sonde vérifiée')
    await user.click(screen.getByTestId('anomaly-action-fermee'))
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated))
    expect(post).toHaveBeenCalledWith(4, '80480-2', { from: 'en_cours', to: 'fermee', comment: 'Sonde vérifiée' })
  })

  it('asks for a confirmation before the final closing', async () => {
    const post = vi.spyOn(anomaliesApi, 'postAnomalyTransition').mockResolvedValue(base)
    const { user } = renderForm({ ...base, status: 'fermee', allowedTransitions: [{ to: 'cloturee', commentRequired: false }] })
    await user.click(screen.getByTestId('anomaly-action-cloturee'))
    expect(post).not.toHaveBeenCalled()
    expect(await screen.findByText('La clôture est définitive et ne peut pas être annulée.')).toBeInTheDocument()
    await user.click(screen.getByTestId('anomaly-confirm-close'))
    await waitFor(() => expect(post).toHaveBeenCalledWith(4, '80480-2', { from: 'fermee', to: 'cloturee', comment: '' }))
  })

  it('on a 409 conflict keeps the comment and offers to reload', async () => {
    vi.spyOn(anomaliesApi, 'postAnomalyTransition').mockRejectedValue(
      new ApiError(409, 'Le statut de cette anomalie a changé entre-temps. Rechargez pour voir son état actuel.', 'status_conflict'),
    )
    const { user, onReload } = renderForm()
    await user.type(screen.getByTestId('anomaly-comment'), 'mon texte')
    await user.click(screen.getByTestId('anomaly-action-fermee'))
    expect(await screen.findByTestId('anomaly-transition-error')).toHaveTextContent('Rechargez')
    expect(screen.getByTestId('anomaly-comment')).toHaveValue('mon texte')
    await user.click(screen.getByTestId('anomaly-reload'))
    expect(onReload).toHaveBeenCalled()
  })

  it('saves the comment alone, without a status change, and confirms it', async () => {
    const updated = { ...base, history: [] } as unknown as AnomalyDetail
    const post = vi.spyOn(anomaliesApi, 'postAnomalyComment').mockResolvedValue(updated)
    const transition = vi.spyOn(anomaliesApi, 'postAnomalyTransition')
    const { user, onChanged } = renderForm()
    await user.type(screen.getByTestId('anomaly-comment'), 'Sonde changée')
    await user.click(screen.getByRole('button', { name: 'Commenter' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated))
    expect(post).toHaveBeenCalledWith(4, '80480-2', 'Sonde changée')
    expect(transition).not.toHaveBeenCalled()
    expect(screen.getByTestId('anomaly-comment-saved')).toHaveTextContent('Commentaire enregistré')
    expect(screen.getByTestId('anomaly-comment')).toHaveValue('')
  })

  it('keeps "Commenter" disabled while the comment is blank', async () => {
    const post = vi.spyOn(anomaliesApi, 'postAnomalyComment')
    const { user } = renderForm()
    const commenter = screen.getByTestId('anomaly-save-comment')
    expect(commenter).toBeDisabled()
    await user.type(screen.getByTestId('anomaly-comment'), '  ')
    expect(commenter).toBeDisabled()
    await user.type(screen.getByTestId('anomaly-comment'), 'x')
    expect(commenter).toBeEnabled()
    expect(post).not.toHaveBeenCalled()
  })

  it('puts the primary action of the status first, in one row with "Commenter" last', () => {
    renderForm({ ...base, status: 'fermee', allowedTransitions: [
      { to: 'cloturee', commentRequired: false },
      { to: 'en_cours', commentRequired: false },
    ] })
    const row = screen.getByTestId('anomaly-actions')
    expect([...row.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      'Rouvrir',
      'Clôturer définitivement',
      'Commenter',
    ])
  })

  it('shows a 3-row field with its placeholder, and the counter only past 80 % of the limit', async () => {
    renderForm()
    const field = screen.getByTestId('anomaly-comment')
    expect(field).toHaveAttribute('rows', '3')
    expect(field).toHaveAttribute('placeholder', 'Résumé des actions…')
    expect(screen.queryByTestId('anomaly-comment-counter')).not.toBeInTheDocument()
    fireEvent.change(field, { target: { value: 'x'.repeat(1601) } })
    expect(screen.getByTestId('anomaly-comment-counter').textContent?.replace(/[\u00a0\u202f]/g, ' ')).toBe('1 601 / 2 000')
  })

  it('shows the server refusal of a comment and keeps the text', async () => {
    vi.spyOn(anomaliesApi, 'postAnomalyComment').mockRejectedValue(
      new ApiError(409, 'Anomalie clôturée : elle ne peut plus être commentée.', 'anomaly_closed'),
    )
    const { user } = renderForm()
    await user.type(screen.getByTestId('anomaly-comment'), 'trop tard')
    await user.click(screen.getByTestId('anomaly-save-comment'))
    expect(await screen.findByTestId('anomaly-transition-error')).toHaveTextContent('ne peut plus être commentée')
    expect(screen.getByTestId('anomaly-comment')).toHaveValue('trop tard')
    expect(screen.queryByTestId('anomaly-comment-saved')).not.toBeInTheDocument()
  })

  it('offers no comment saving when read only', () => {
    renderForm({ ...base, allowedTransitions: [], readOnlyReason: 'cloturee' })
    expect(screen.queryByTestId('anomaly-save-comment')).not.toBeInTheDocument()
  })

  it('shows the server message of any other refusal', async () => {
    vi.spyOn(anomaliesApi, 'postAnomalyTransition').mockRejectedValue(
      new ApiError(403, 'La clôture est réservée aux responsables.', 'closing_not_permitted'),
    )
    const { user } = renderForm()
    await user.type(screen.getByTestId('anomaly-comment'), 'x')
    await user.click(screen.getByTestId('anomaly-action-fermee'))
    expect(await screen.findByTestId('anomaly-transition-error')).toHaveTextContent('réservée aux responsables')
    expect(screen.queryByTestId('anomaly-reload')).not.toBeInTheDocument()
  })
})
