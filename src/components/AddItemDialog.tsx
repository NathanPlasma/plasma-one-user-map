import { useId, useRef, useState } from 'react'

import type { InventoryKind } from '../domain/types'
import { kindConfig } from '../features/workshop/kind-config'
import { useDialogFocus } from '../hooks/use-dialog-focus'

type AddItemDialogProps = {
  kind: InventoryKind
  initialTitle?: string
  onCancel: () => void
  onCreate: (title: string, note: string) => Promise<boolean>
}

export function AddItemDialog({
  kind,
  initialTitle = '',
  onCancel,
  onCreate,
}: AddItemDialogProps) {
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useDialogFocus<HTMLElement>({ initialFocusRef: inputRef })
  const [title, setTitle] = useState(initialTitle)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  const submit = async () => {
    if (submittingRef.current || !title.trim()) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      const created = await onCreate(title.trim(), note.trim())
      if (!created) {
        submittingRef.current = false
        setSubmitting(false)
      }
    } catch {
      submittingRef.current = false
      setSubmitting(false)
    }
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
          if (event.key === 'Escape' && !submitting) onCancel()
        }}
      >
        <header className="dialog-header">
          <h2 id={titleId}>Add {kindConfig[kind].label.toLowerCase()}</h2>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              void submit()
            }
          }}
        >
          <div className="dialog-form">
            <label htmlFor="new-item-title">Title</label>
            <input
              ref={inputRef}
              id="new-item-title"
              value={title}
              maxLength={180}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
            <label htmlFor="new-item-note">Optional note</label>
            <textarea
              id="new-item-note"
              value={note}
              maxLength={1200}
              placeholder={
                kind === 'problem' ? 'Moment, context or feeling' : 'Optional context'
              }
              onChange={(event) => setNote(event.currentTarget.value)}
            />
          </div>
          <div className="dialog-actions">
            <button
              type="button"
              className="button"
              disabled={submitting}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={!title.trim() || submitting}
            >
              {kindConfig[kind].addLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
