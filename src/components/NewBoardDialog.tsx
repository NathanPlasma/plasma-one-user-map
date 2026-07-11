import { useEffect, useId, useRef } from 'react'

import { useDialogFocus } from '../hooks/use-dialog-focus'

type NewBoardDialogProps = {
  clearing: boolean
  canRestorePrevious?: boolean
  onCancel: () => void
  onConfirm: () => void
  onRestorePrevious?: () => void
}

export function NewBoardDialog({
  clearing,
  canRestorePrevious = false,
  onCancel,
  onConfirm,
  onRestorePrevious,
}: NewBoardDialogProps) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogFocus<HTMLElement>({ initialFocusRef: cancelRef })
  const actionPendingRef = useRef(false)

  useEffect(() => {
    if (!clearing) actionPendingRef.current = false
  }, [clearing])

  const runOnce = (action: () => void) => {
    if (clearing || actionPendingRef.current) return
    actionPendingRef.current = true
    action()
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !clearing) onCancel()
        }}
      >
        <header className="dialog-header">
          <h2 id={titleId}>Start a new blank board?</h2>
          <p>Your current board stays recoverable.</p>
        </header>
        {canRestorePrevious && onRestorePrevious ? (
          <div className="dialog-recovery-option">
            <p>Previous board available.</p>
            <button
              type="button"
              className="button"
              disabled={clearing}
              onClick={() => runOnce(onRestorePrevious)}
            >
              Restore previous board
            </button>
          </div>
        ) : null}
        <div className="dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="button"
            disabled={clearing}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={clearing}
            onClick={() => runOnce(onConfirm)}
          >
            Start new board
          </button>
        </div>
      </section>
    </div>
  )
}
