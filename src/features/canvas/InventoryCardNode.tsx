import type { NodeProps } from '@xyflow/react'
import { MoreHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'

import { ActionMenu } from '../../components/ActionMenu'
import { kindStyle } from '../workshop/kind-config'
import type { InventoryCardFlowNode } from './view-models'

export function InventoryCardNode({ data }: NodeProps<InventoryCardFlowNode>) {
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(data.title)
  const [draftNote, setDraftNote] = useState(data.note)
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (editing) return
    setDraftTitle(data.title)
    setDraftNote(data.note)
  }, [data.note, data.title, editing])

  const cancelEdit = () => {
    setDraftTitle(data.title)
    setDraftNote(data.note)
    setEditing(false)
  }

  const commitEdit = () => {
    const title = draftTitle.trim()
    if (!title) return
    data.onUpdate(data.itemId, title, draftNote.trim())
    setEditing(false)
  }

  return (
    <article
      className="inventory-card paper-grain"
      style={kindStyle(data.kind)}
      data-editing={editing || undefined}
      aria-label={`${data.title}${data.readOnly ? ', read only' : ''}`}
      tabIndex={data.readOnly ? undefined : 0}
      onDoubleClick={(event) => {
        event.stopPropagation()
        if (!data.readOnly) setEditing(true)
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || data.readOnly) return
        if (event.key === 'Enter' && !editing) {
          event.preventDefault()
          setEditing(true)
        }
        if (event.shiftKey && event.key === 'F10') {
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          setMenuAnchor({ x: rect.right - 10, y: rect.top + 20 })
        }
      }}
    >
      {!editing ? (
        <>
          <h3 className="inventory-card-title">{data.title}</h3>
          {!data.readOnly ? (
            <button
              type="button"
              className="card-menu-button nodrag nopan"
              aria-label={`Actions for ${data.title}`}
              onClick={(event) => {
                event.stopPropagation()
                const rect = event.currentTarget.getBoundingClientRect()
                setMenuAnchor({ x: rect.right, y: rect.bottom + 4 })
              }}
            >
              <MoreHorizontal size={18} aria-hidden="true" />
            </button>
          ) : null}
          {data.note ? <p className="inventory-card-note">{data.note}</p> : null}
        </>
      ) : null}

      {editing ? (
        <div
          className="inline-editor nodrag nopan"
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return
            if (draftTitle.trim()) commitEdit()
            else cancelEdit()
          }}
        >
          <label className="sr-only" htmlFor={`title-${data.itemId}`}>
            Title
          </label>
          <input
            id={`title-${data.itemId}`}
            autoFocus
            value={draftTitle}
            maxLength={180}
            onChange={(event) => setDraftTitle(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancelEdit()
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                commitEdit()
              }
            }}
          />
          <label className="sr-only" htmlFor={`note-${data.itemId}`}>
            Optional note
          </label>
          <textarea
            id={`note-${data.itemId}`}
            value={draftNote}
            maxLength={1200}
            placeholder="Optional context, moment or intended feeling"
            onChange={(event) => setDraftNote(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancelEdit()
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter')
                commitEdit()
            }}
          />
          <div className="inline-editor-actions">
            <button type="button" className="button button-quiet" onClick={cancelEdit}>
              Cancel
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={!draftTitle.trim()}
              onClick={commitEdit}
            >
              Save
            </button>
          </div>
        </div>
      ) : null}

      {menuAnchor ? (
        <ActionMenu
          anchor={menuAnchor}
          label={`Actions for ${data.title}`}
          onClose={() => setMenuAnchor(null)}
          items={[
            { label: 'Edit', onSelect: () => setEditing(true) },
            {
              label: 'Move to category…',
              onSelect: () => data.onMoveToCategory(data.itemId),
            },
            { label: 'Duplicate', onSelect: () => data.onDuplicate(data.itemId) },
            {
              label: 'Delete',
              danger: true,
              onSelect: () => data.onDelete(data.itemId),
            },
          ]}
        />
      ) : null}
    </article>
  )
}
