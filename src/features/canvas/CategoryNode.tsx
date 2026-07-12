import { NodeResizer, type NodeProps } from '@xyflow/react'
import { MoreHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'

import { ActionMenu } from '../../components/ActionMenu'
import { kindStyle } from '../workshop/kind-config'
import type { CategoryFlowNode, CategoryHeaderFlowNode } from './view-models'

export function CategoryNode({ data, selected }: NodeProps<CategoryFlowNode>) {
  return (
    <section
      className="category-node paper-grain"
      style={kindStyle(data.kind)}
      aria-hidden="true"
    >
      <NodeResizer
        minWidth={300}
        minHeight={220}
        isVisible={selected && !data.readOnly}
        color="var(--active-colour)"
        onResizeEnd={(_, params) =>
          data.onResize(data.categoryId, params.width, params.height)
        }
      />
    </section>
  )
}

export function CategoryHeaderNode({ data }: NodeProps<CategoryHeaderFlowNode>) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.title)
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!editing) setDraft(data.title)
  }, [data.title, editing])

  const cancel = () => {
    setDraft(data.title)
    setEditing(false)
  }

  const commit = () => {
    const title = draft.trim()
    if (!title) {
      cancel()
      return
    }
    data.onRename(data.categoryId, title)
    setEditing(false)
  }

  return (
    <section
      className="category-node-overlay"
      aria-label={`${data.title}, category with ${data.itemCount} ${data.itemCount === 1 ? 'item' : 'items'}`}
      tabIndex={data.readOnly ? undefined : 0}
      onDoubleClick={(event) => {
        event.stopPropagation()
        if (!data.readOnly) setEditing(true)
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || data.readOnly) return
        if (event.key === 'Enter') {
          event.preventDefault()
          setEditing(true)
        }
        if (event.shiftKey && event.key === 'F10') {
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          setMenuAnchor({ x: rect.right - 10, y: rect.top + 24 })
        }
      }}
    >
      <header
        className="category-node-header category-node-header-raised drag-handle"
        style={kindStyle(data.kind)}
      >
        {editing ? (
          <input
            className="nodrag nopan"
            autoFocus
            value={draft}
            maxLength={80}
            aria-label="Category name"
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancel()
              if (event.key === 'Enter') commit()
            }}
          />
        ) : (
          <span>{data.title}</span>
        )}
        <span className="category-node-count">
          {data.itemCount} {data.itemCount === 1 ? 'item' : 'items'}
        </span>
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
      </header>
      {menuAnchor ? (
        <ActionMenu
          anchor={menuAnchor}
          label={`Actions for ${data.title}`}
          onClose={() => setMenuAnchor(null)}
          items={[
            { label: 'Rename', onSelect: () => setEditing(true) },
            {
              label: 'Remove category',
              danger: true,
              onSelect: () => data.onDelete(data.categoryId),
            },
          ]}
        />
      ) : null}
    </section>
  )
}
