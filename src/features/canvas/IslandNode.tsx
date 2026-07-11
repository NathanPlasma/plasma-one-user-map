import type { NodeProps } from '@xyflow/react'
import { MoreHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { ActionMenu } from '../../components/ActionMenu'
import type { IngredientKind, LocalCopy } from '../../domain/types'
import { kindStyle } from '../workshop/kind-config'
import { IslandSheet } from './island/IslandSheet'
import type { IslandFlowNode } from './view-models'

const layerOrder: IngredientKind[] = ['problem', 'region', 'monetization']

export function IslandNode({ data }: NodeProps<IslandFlowNode>) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(data.island.userTitle)
  const [note, setNote] = useState(data.island.userNote)
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null)
  const copiesByKind = useMemo(() => {
    return Object.fromEntries(
      layerOrder.map((kind) => [
        kind,
        data.island.copyOrder[kind]
          .map((id) => data.island.copiesById[id])
          .filter((copy): copy is LocalCopy => Boolean(copy)),
      ]),
    ) as Record<IngredientKind, LocalCopy[]>
  }, [data.island.copiesById, data.island.copyOrder])
  const reviewing = data.activeKind === null

  useEffect(() => {
    if (editingTitle) return
    setTitle(data.island.userTitle)
    setNote(data.island.userNote)
  }, [data.island.userNote, data.island.userTitle, editingTitle])

  const cancelTitle = () => {
    setTitle(data.island.userTitle)
    setNote(data.island.userNote)
    setEditingTitle(false)
  }

  const commitTitle = () => {
    const nextTitle = title.trim()
    if (!nextTitle) {
      cancelTitle()
      return
    }
    data.onEditUser(data.island.id, nextTitle, note.trim())
    setEditingTitle(false)
  }

  return (
    <article
      className="user-island"
      style={kindStyle(
        data.activeKind === 'user' || !data.activeKind ? 'user' : data.activeKind,
      )}
      aria-label={`${data.island.userTitle}, user archetype`}
      data-reviewing={reviewing || undefined}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || reviewing) return
        if (event.key === 'Enter') {
          event.preventDefault()
          setEditingTitle(true)
        }
        if (event.shiftKey && event.key === 'F10') {
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          setMenuAnchor({ x: rect.right, y: rect.top + 24 })
        }
      }}
    >
      <header
        className="island-core drag-handle paper-grain"
        onDoubleClick={(event) => {
          event.stopPropagation()
          if (!reviewing) setEditingTitle(true)
        }}
      >
        {editingTitle ? (
          <div
            className="island-user-editor nodrag nopan"
            onPointerDown={(event) => event.stopPropagation()}
            onBlur={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return
              if (title.trim()) commitTitle()
              else cancelTitle()
            }}
          >
            <input
              autoFocus
              value={title}
              maxLength={180}
              aria-label="Archetype title"
              onChange={(event) => setTitle(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') cancelTitle()
                if (event.key === 'Enter') commitTitle()
              }}
            />
            <textarea
              value={note}
              maxLength={1200}
              aria-label="Archetype note"
              placeholder="Optional context"
              onChange={(event) => setNote(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') cancelTitle()
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  commitTitle()
                }
              }}
            />
            <div className="inline-editor-actions">
              <button
                type="button"
                className="button button-quiet"
                onClick={cancelTitle}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-primary"
                disabled={!title.trim()}
                onClick={commitTitle}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="island-title">{data.island.userTitle}</h3>
            {data.island.variantName ? (
              <span className="island-variant">{data.island.variantName}</span>
            ) : null}
            {!reviewing ? (
              <button
                type="button"
                className="card-menu-button island-menu-button nodrag nopan"
                aria-label={`Actions for ${data.island.userTitle}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  const rect = event.currentTarget.getBoundingClientRect()
                  setMenuAnchor({ x: rect.right, y: rect.bottom + 4 })
                }}
              >
                <MoreHorizontal size={18} aria-hidden="true" />
              </button>
            ) : null}
            {data.island.userNote ? (
              <p className="island-user-note">{data.island.userNote}</p>
            ) : null}
          </>
        )}
      </header>
      {layerOrder.map((kind) => (
        <IslandSheet
          key={kind}
          kind={kind}
          islandId={data.island.id}
          copies={copiesByKind[kind]}
          active={data.activeKind === kind}
          highlightedCopyId={data.highlightedCopyId}
          onEditCopy={(copyId, nextTitle, nextNote) =>
            data.onEditCopy(data.island.id, copyId, nextTitle, nextNote)
          }
          onMoveCopy={data.onMoveCopy}
          onDuplicateCopy={data.onDuplicateCopy}
          onDeleteCopy={(copyId) => data.onDeleteCopy(data.island.id, copyId)}
          onReorderCopy={(fromIndex, toIndex) =>
            data.onReorderCopy(data.island.id, kind, fromIndex, toIndex)
          }
          readOnly={reviewing}
        />
      ))}
      {menuAnchor && !reviewing ? (
        <ActionMenu
          anchor={menuAnchor}
          label={`Actions for ${data.island.userTitle}`}
          onClose={() => setMenuAnchor(null)}
          items={[
            { label: 'Edit', onSelect: () => setEditingTitle(true) },
            {
              label: 'Delete archetype',
              danger: true,
              onSelect: () => data.onDeleteIsland(data.island.id),
            },
          ]}
        />
      ) : null}
    </article>
  )
}
