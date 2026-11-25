import { useState } from 'react'
import { ApiError } from '../api/client'
import { postAnomalyComment, postAnomalyTransition, type AnomalyDetail, type AnomalyStatus } from '../api/anomalies'
import { formatNumber } from './anomalyCard'
import { actionLabel, COMMENT_COUNTER_FROM, COMMENT_MAX_LENGTH, commentError, rankTransitions, READ_ONLY_NOTE } from './anomalyFormat'
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
 * "Commenter" saves the comment alone, status unchanged (client review 2026-11-23); it is offered whenever a
 * transition is (same rule server-side: not on a STD contract, not once closed), and disabled while the
 * comment is blank. Owner redesign 2026-11-25: a 3-row field (counter past 80 % only) and one action row,
 * the status's primary action first (`rankTransitions`); a status change sends the field as its comment.
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
  const [saved, setSaved] = useState(false)

  if (detail.allowedTransitions.length === 0) {
    const note = detail.readOnlyReason ? READ_ONLY_NOTE[detail.readOnlyReason] : null
    return note ? (
      <p className="text-sm text-muted-foreground" data-testid="anomaly-read-only">
        {note}
      </p>
    ) : null
  }

  async function send(error: string | null, request: () => Promise<AnomalyDetail>, isComment: boolean) {
    setFieldError(error)
    setSaved(false)
    if (error) return
    setFailure(null)
    setPending(true)
    try {
      onChanged(await request())
      setComment('')
      setSaved(isComment)
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

  function submit(to: AnomalyStatus, commentRequired: boolean) {
    const request = () => postAnomalyTransition(contractId, detail.anomalyKey, { from: detail.status, to, comment })
    return send(commentError(commentRequired, comment), request, false)
  }

  function saveComment() {
    const error = commentError(false, comment)
    return send(error, () => postAnomalyComment(contractId, detail.anomalyKey, comment), true)
  }

  const [primary, ...others] = rankTransitions(detail.allowedTransitions)
  const transitionButton = ({ to, commentRequired }: AnomalyDetail['allowedTransitions'][number], isPrimary: boolean) => (
    <Button
      key={to}
      disabled={pending}
      variant={isPrimary ? 'default' : 'outline'}
      className="shrink-0"
      data-testid={`anomaly-action-${to}`}
      onClick={() => (to === 'cloturee' ? setConfirming(true) : submit(to, commentRequired))}
    >
      {actionLabel(detail.status, to)}
    </Button>
  )

  return (
    <div className="flex flex-col gap-2" data-testid="anomaly-transition">
      <Field data-invalid={fieldError !== null} className="gap-1">
        <FieldLabel htmlFor="anomaly-comment" className="sr-only">
          Résumé des actions
        </FieldLabel>
        <Textarea
          id="anomaly-comment"
          data-testid="anomaly-comment"
          rows={3}
          // Fixed sizing, so the 3 rows hold instead of the kit's grow-with-content.
          className="min-h-0 field-sizing-fixed"
          placeholder="Résumé des actions…"
          value={comment}
          maxLength={COMMENT_MAX_LENGTH}
          aria-invalid={fieldError !== null}
          onChange={(event) => {
            setComment(event.target.value)
            setSaved(false)
          }}
        />
        {comment.length > COMMENT_COUNTER_FROM ? (
          <FieldDescription className="text-right text-xs tabular-nums" data-testid="anomaly-comment-counter">
            {formatNumber(comment.length, 0)} / {formatNumber(COMMENT_MAX_LENGTH, 0)}
          </FieldDescription>
        ) : null}
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
      {saved ? (
        <p role="status" className="text-xs text-muted-foreground" data-testid="anomaly-comment-saved">
          Commentaire enregistré.
        </p>
      ) : null}
      {/* One row: the status's primary action on the left, "Commenter" as a text button on the right. */}
      <div className="flex min-w-0 items-center gap-2" data-testid="anomaly-actions">
        {transitionButton(primary, true)}
        {others.map((transition) => transitionButton(transition, false))}
        <Button
          variant="ghost"
          className="ml-auto shrink-0"
          disabled={pending || comment.trim() === ''}
          data-testid="anomaly-save-comment"
          onClick={saveComment}
        >
          Commenter
        </Button>
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
