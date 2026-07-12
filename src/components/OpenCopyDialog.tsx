import { useEffect, useId, useRef } from 'react'

import type { WorkspaceCopyPreview } from '../persistence/workspace-copy'
import { useDialogFocus } from '../hooks/use-dialog-focus'

type OpenCopyDialogProps = {
  fileName: string
  preview: WorkspaceCopyPreview
  opening: boolean
  error?: string
  onCancel: () => void
  onConfirm: () => void
}

const inventoryLabels = {
  problem: 'Problems',
  user: 'Users',
  region: 'Regions',
  monetization: 'Monetization',
} as const

export function OpenCopyDialog({
  fileName,
  preview,
  opening,
  error,
  onCancel,
  onConfirm,
}: OpenCopyDialogProps) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogFocus<HTMLElement>({ initialFocusRef: cancelRef })
  const actionPendingRef = useRef(false)

  useEffect(() => {
    if (!opening) actionPendingRef.current = false
  }, [opening])

  const confirmOnce = () => {
    if (opening || actionPendingRef.current) return
    actionPendingRef.current = true
    onConfirm()
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !opening) onCancel()
        }}
      >
        <header className="dialog-header">
          <h2 id={titleId}>Open saved copy?</h2>
          <p>
            This creates a new local generation. Your current board remains available
            through New board, then Restore previous board.
          </p>
        </header>

        <div className="copy-preview">
          <div className="copy-preview-heading">
            <strong>{preview.title}</strong>
            <span>{fileName}</span>
          </div>
          <div className="copy-preview-stats" aria-label="Saved copy contents">
            {Object.entries(inventoryLabels).map(([kind, label]) => (
              <span key={kind}>
                {preview.inventories[kind as keyof typeof inventoryLabels].items}{' '}
                {label}
              </span>
            ))}
            <span>{preview.archetypes} archetypes</span>
            <span>{preview.localCopies} local copies</span>
          </div>
        </div>

        {error ? (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="button"
            disabled={opening}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={opening}
            onClick={confirmOnce}
          >
            Open copy
          </button>
        </div>
      </section>
    </div>
  )
}
