import { AlertTriangle, LoaderCircle } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import type { InventoryKind } from '../domain/types'
import { inventoryOrder, kindConfig, kindStyle } from '../features/workshop/kind-config'
import { useDialogFocus } from '../hooks/use-dialog-focus'

export type LockCounts = Record<
  InventoryKind,
  { items: number; categories: number; uncategorized: number }
>

type LockDialogProps = {
  counts: LockCounts
  saving: boolean
  error?: string
  onCancel: () => void
  onConfirm: (acknowledgeEmpty: boolean, acknowledgeUncategorized: boolean) => void
}

export function LockDialog({
  counts,
  saving,
  error,
  onCancel,
  onConfirm,
}: LockDialogProps) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogFocus<HTMLElement>({ initialFocusRef: cancelRef })
  const confirmingRef = useRef(false)
  const [acknowledgeEmpty, setAcknowledgeEmpty] = useState(false)
  const [acknowledgeUncategorized, setAcknowledgeUncategorized] = useState(false)
  const hasEmpty = inventoryOrder.some((kind) => counts[kind].items === 0)
  const hasUncategorized = inventoryOrder.some((kind) => counts[kind].uncategorized > 0)
  const ready =
    (!hasEmpty || acknowledgeEmpty) && (!hasUncategorized || acknowledgeUncategorized)

  useEffect(() => {
    if (!saving && error) confirmingRef.current = false
  }, [error, saving])

  const confirm = () => {
    if (!ready || saving || confirmingRef.current) return
    confirmingRef.current = true
    onConfirm(acknowledgeEmpty, acknowledgeUncategorized)
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onCancel()
      }}
    >
      <section
        ref={dialogRef}
        className="dialog paper-grain"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !saving) onCancel()
        }}
      >
        <header className="dialog-header">
          <h2 id={titleId}>Lock inventories?</h2>
          <p>Creates read-only Inventory v1 and starts building.</p>
        </header>

        <div className="lock-summary">
          {inventoryOrder.map((kind) => {
            const count = counts[kind]
            return (
              <div className="lock-summary-row" key={kind} style={kindStyle(kind)}>
                <span className="lock-summary-name">
                  <span className="kind-dot" aria-hidden="true" />
                  {kindConfig[kind].plural}
                </span>
                <span className="lock-stat">
                  {count.items} {count.items === 1 ? 'item' : 'items'}
                </span>
                <span className="lock-stat">
                  {count.categories}{' '}
                  {count.categories === 1 ? 'category' : 'categories'}
                </span>
                <span className="lock-stat">{count.uncategorized} uncategorised</span>
              </div>
            )
          })}
        </div>

        <div className="acknowledgements">
          {hasEmpty ? (
            <label className="ack-row">
              <input
                type="checkbox"
                checked={acknowledgeEmpty}
                onChange={(event) => setAcknowledgeEmpty(event.currentTarget.checked)}
              />
              <span>I want to lock even though one or more inventories are empty.</span>
            </label>
          ) : null}
          {hasUncategorized ? (
            <label className="ack-row">
              <input
                type="checkbox"
                checked={acknowledgeUncategorized}
                onChange={(event) =>
                  setAcknowledgeUncategorized(event.currentTarget.checked)
                }
              />
              <span>I have reviewed the uncategorised items and want to continue.</span>
            </label>
          ) : null}
          {error ? (
            <div className="compact-warning" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>

        <div className="dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="button"
            disabled={saving}
            onClick={onCancel}
          >
            Keep editing
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={!ready || saving}
            onClick={confirm}
          >
            {saving ? (
              <LoaderCircle size={17} className="spin" aria-hidden="true" />
            ) : null}
            Lock and build
          </button>
        </div>
      </section>
    </div>
  )
}
