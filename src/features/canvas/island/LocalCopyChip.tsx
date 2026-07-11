import { useSortable } from '@dnd-kit/sortable'
import { MoreHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'

import { ActionMenu } from '../../../components/ActionMenu'
import type { LocalCopy } from '../../../domain/types'
import { useReducedMotion } from '../../../hooks/use-reduced-motion'
import { kindConfig, kindStyle } from '../../workshop/kind-config'
import type { LocalCopyDragData } from '../view-models'

type LocalCopyChipProps = {
  copy: LocalCopy
  islandId: string
  highlighted: boolean
  onEdit: (title: string, note: string) => void
  onMove: () => void
  onDuplicate: () => void
  onDelete: () => void
  onReorder: (direction: -1 | 1) => void
  readOnly: boolean
}

export function LocalCopyChip({
  copy,
  islandId,
  highlighted,
  onEdit,
  onMove,
  onDuplicate,
  onDelete,
  onReorder,
  readOnly,
}: LocalCopyChipProps) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(copy.title)
  const [note, setNote] = useState(copy.note)
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null)
  const reducedMotion = useReducedMotion()
  const dragData: LocalCopyDragData = {
    type: 'local-copy',
    copy,
    fromIslandId: islandId,
  }
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `copy:${copy.id}`,
    data: dragData,
    disabled: readOnly,
    transition: reducedMotion ? null : undefined,
  })

  useEffect(() => {
    if (editing) return
    setTitle(copy.title)
    setNote(copy.note)
  }, [copy.note, copy.title, editing])

  const cancel = () => {
    setTitle(copy.title)
    setNote(copy.note)
    setEditing(false)
  }

  const commit = () => {
    const nextTitle = title.trim()
    if (!nextTitle) {
      cancel()
      return
    }
    onEdit(nextTitle, note.trim())
    setEditing(false)
  }

  return (
    <div
      ref={setNodeRef}
      className="local-copy nodrag nopan"
      style={{
        ...kindStyle(copy.kind),
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
        opacity: isDragging ? 0.45 : undefined,
      }}
      data-highlight={highlighted || undefined}
      data-editing={editing || undefined}
      data-read-only={readOnly || undefined}
      aria-label={`${copy.title}. Local ${kindConfig[copy.kind].label.toLowerCase()} copy.`}
      onDoubleClick={(event) => {
        event.stopPropagation()
        if (!readOnly) setEditing(true)
      }}
    >
      {!editing ? (
        <>
          <span
            ref={setActivatorNodeRef}
            className="copy-title copy-drag-handle"
            {...(readOnly ? {} : attributes)}
            {...(readOnly ? {} : listeners)}
            aria-label={
              readOnly
                ? copy.title
                : `${copy.title}. Drag to reorder or move. Press Enter to edit.`
            }
            onKeyDown={(event) => {
              if (readOnly) return
              if (event.key === 'Enter') setEditing(true)
              if (event.shiftKey && event.key === 'ArrowUp') {
                event.preventDefault()
                onReorder(-1)
              }
              if (event.shiftKey && event.key === 'ArrowDown') {
                event.preventDefault()
                onReorder(1)
              }
              if (event.shiftKey && event.key === 'F10') {
                event.preventDefault()
                const rect = event.currentTarget.getBoundingClientRect()
                setMenuAnchor({ x: rect.right, y: rect.top })
              }
            }}
          >
            {copy.title}
          </span>
          {!readOnly ? (
            <button
              type="button"
              className="card-menu-button nodrag nopan"
              aria-label={`Actions for ${copy.title}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                const rect = event.currentTarget.getBoundingClientRect()
                setMenuAnchor({ x: rect.right, y: rect.bottom + 4 })
              }}
            >
              <MoreHorizontal size={15} aria-hidden="true" />
            </button>
          ) : null}
          {copy.note ? <p className="copy-note">{copy.note}</p> : null}
        </>
      ) : null}

      {editing ? (
        <div
          className="inline-editor nodrag nopan"
          onPointerDown={(event) => event.stopPropagation()}
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return
            if (title.trim()) commit()
            else cancel()
          }}
        >
          <input
            autoFocus
            value={title}
            maxLength={180}
            aria-label="Local copy title"
            onChange={(event) => setTitle(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancel()
              if (event.key === 'Enter') commit()
            }}
          />
          <textarea
            value={note}
            maxLength={1200}
            aria-label="Local copy note"
            placeholder="Optional local context"
            onChange={(event) => setNote(event.currentTarget.value)}
          />
          <div className="inline-editor-actions">
            <button type="button" className="button button-quiet" onClick={cancel}>
              Cancel
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={!title.trim()}
              onClick={commit}
            >
              Save
            </button>
          </div>
        </div>
      ) : null}

      {menuAnchor && !readOnly ? (
        <ActionMenu
          anchor={menuAnchor}
          label={`Actions for ${copy.title}`}
          onClose={() => setMenuAnchor(null)}
          items={[
            { label: 'Edit local copy', onSelect: () => setEditing(true) },
            { label: 'Move up', onSelect: () => onReorder(-1) },
            { label: 'Move down', onSelect: () => onReorder(1) },
            { label: 'Move to archetype…', onSelect: onMove },
            { label: 'Duplicate to…', onSelect: onDuplicate },
            { label: 'Remove', danger: true, onSelect: onDelete },
          ]}
        />
      ) : null}
    </div>
  )
}
