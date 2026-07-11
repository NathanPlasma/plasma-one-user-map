import { useId, useRef } from 'react'

import { useDialogFocus } from '../hooks/use-dialog-focus'

type CategoryOption = { id: string; title: string }

type CategoryPickerDialogProps = {
  itemTitle: string
  categories: CategoryOption[]
  currentCategoryId: string | null
  onCancel: () => void
  onChoose: (categoryId: string | null) => void
}

export function CategoryPickerDialog({
  itemTitle,
  categories,
  currentCategoryId,
  onCancel,
  onChoose,
}: CategoryPickerDialogProps) {
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
          <h2 id={titleId}>Move to category</h2>
          <p>{itemTitle}</p>
        </header>
        <div className="destination-list">
          <button
            type="button"
            className="destination-option"
            disabled={currentCategoryId === null}
            onClick={() => onChoose(null)}
          >
            Uncategorised
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className="destination-option"
              disabled={category.id === currentCategoryId}
              onClick={() => onChoose(category.id)}
            >
              {category.title}
            </button>
          ))}
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
