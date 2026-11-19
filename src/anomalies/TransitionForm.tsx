import { useState } from 'react'
import { ApiError } from '../api/client'
import { postAnomalyTransition, type AnomalyDetail, type AnomalyStatus } from '../api/anomalies'
import { actionLabel, COMMENT_MAX_LENGTH, commentError, READ_ONLY_NOTE } from './anomalyFormat'
import { Alert, AlertDescription } from '@/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/alert-dialog'
import { Button } from '@/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/field'
import { Textarea } from '@/ui/textarea'

const CONFLICT_CODE = 'status_conflict'

/**
 * KAN-263 (FR14-FR19): the allowed actions of the server's `allowedTransitions` (never computed here), one
 * comment field (required to close for review), a confirmation before the final closing, and a conflict
 * notice asking to reload. The server's own refusal message is shown for any other error.
 */
export function TransitionForm({
  contractId,
  detail,
  onChanged,
  onReload,
}: {
  contractId: number
  detail: AnomalyDetail
  onChanged: (updated: AnomalyDetail) => void
  onReload: () => void
}) {
  const [comment, setComment] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ message: string; conflict: boolean } | null>(null)
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)

  if (detail.allowedTransitions.length === 0) {
    const note = detail.readOnlyReason ? READ_ONLY_NOTE[detail.readOnlyReason] : null
    return note ? (
      <p className="text-sm text-muted-foreground" data-testid="anomaly-read-only">
        {note}
      </p>
    ) : null
  }

  async function submit(to: AnomalyStatus, commentRequired: boolean) {
    const error = commentError(commentRequired, comment)
    setFieldError(error)
    if (error) return
    setFailure(null)
    setPending(true)
    try {
      onChanged(await postAnomalyTransition(contractId, detail.anomalyKey, { from: detail.status, to, comment }))
      setComment('')
    } catch (caught) {
      const refused = caught instanceof ApiError
      setFailure({
        message: refused ? caught.message : 'Le service est momentanément indisponible.',
        conflict: refused && caught.code === CONFLICT_CODE,
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="anomaly-transition">
      <Field data-invalid={fieldError !== null}>
        <FieldLabel htmlFor="anomaly-comment">Résumé des actions</FieldLabel>
        <Textarea
          id="anomaly-comment"
          data-testid="anomaly-comment"
          value={comment}
          maxLength={COMMENT_MAX_LENGTH}
          aria-invalid={fieldError !== null}
          onChange={(event) => setComment(event.target.value)}
        />
        <FieldDescription>
          {comment.length} / {COMMENT_MAX_LENGTH}
        </FieldDescription>
        {fieldError ? <FieldError data-testid="anomaly-comment-error">{fieldError}</FieldError> : null}
      </Field>
      {failure ? (
        <Alert variant="destructive" data-testid="anomaly-transition-error">
          <AlertDescription className="flex flex-wrap items-center gap-2">
            {failure.message}
            {failure.conflict ? (
              <Button variant="outline" size="sm" onClick={onReload} data-testid="anomaly-reload">
                Recharger
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {detail.allowedTransitions.map(({ to, commentRequired }) => (
          <Button
            key={to}
            disabled={pending}
            variant={to === 'cloturee' ? 'destructive' : 'default'}
            data-testid={`anomaly-action-${to}`}
            onClick={() => (to === 'cloturee' ? setConfirming(true) : submit(to, commentRequired))}
          >
            {actionLabel(detail.status, to)}
          </Button>
        ))}
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clôturer cette anomalie ?</AlertDialogTitle>
            <AlertDialogDescription>La clôture est définitive et ne peut pas être annulée.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction data-testid="anomaly-confirm-close" onClick={() => submit('cloturee', false)}>
              Clôturer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
