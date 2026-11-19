import { render, screen, waitFor } from '@testing-library/react'
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
    expect(screen.getByRole('button', { name: 'Clôturer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rouvrir' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fermer' })).not.toBeInTheDocument()
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
