import { useId, useRef, useState } from 'react'

import { useDialogFocus } from '../hooks/use-dialog-focus'

type VariantDialogProps = {
  userTitle: string
  onCancel: () => void
  onCreate: (name: string) => Promise<boolean>
}

export function VariantDialog({ userTitle, onCancel, onCreate }: VariantDialogProps) {
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useDialogFocus<HTMLElement>({ initialFocusRef: inputRef })
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  const submit = async () => {
    if (submittingRef.current || !name.trim()) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      const created = await onCreate(name.trim())
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
          <h2 id={titleId}>Create a user variant</h2>
          <p>Name this version of {userTitle}.</p>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <div className="dialog-form">
            <label htmlFor="variant-name">Variant name</label>
            <input
              ref={inputRef}
              id="variant-name"
              value={name}
              maxLength={80}
              placeholder="Frequent traveller"
              onChange={(event) => setName(event.currentTarget.value)}
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
              disabled={!name.trim() || submitting}
            >
              Create variant
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
