import { useId, useRef } from 'react'

import { useDialogFocus } from '../hooks/use-dialog-focus'

type Destination = {
  id: string
  title: string
  disabled?: boolean
  reason?: string
}

type DestinationDialogProps = {
  title: string
  destinations: Destination[]
  onCancel: () => void
  onChoose: (destinationId: string) => void
}

export function DestinationDialog({
  title,
  destinations,
  onCancel,
  onChoose,
}: DestinationDialogProps) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogFocus<HTMLElement>({ initialFocusRef: cancelRef })

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
          if (event.key === 'Escape') onCancel()
        }}
      >
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
        </header>
        <div className="destination-list">
          {destinations.length ? (
            destinations.map((destination) => (
              <button
                key={destination.id}
                type="button"
                className="destination-option"
                disabled={destination.disabled}
                onClick={() => onChoose(destination.id)}
              >
                <span>{destination.title}</span>
                {destination.reason ? <small>{destination.reason}</small> : null}
              </button>
            ))
          ) : (
            <p className="destination-empty">Create a user island first.</p>
          )}
        </div>
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  )
}
