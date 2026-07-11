import { useDroppable } from '@dnd-kit/core'
import { rectSortingStrategy, SortableContext } from '@dnd-kit/sortable'

import type { IngredientKind, LocalCopy } from '../../../domain/types'
import { kindConfig, kindStyle } from '../../workshop/kind-config'
import { LocalCopyChip } from './LocalCopyChip'

type IslandSheetProps = {
  kind: IngredientKind
  islandId: string
  copies: LocalCopy[]
  active: boolean
  highlightedCopyId: string | null
  onEditCopy: (copyId: string, title: string, note: string) => void
  onMoveCopy: (copyId: string) => void
  onDuplicateCopy: (copyId: string) => void
  onDeleteCopy: (copyId: string) => void
  onReorderCopy: (fromIndex: number, toIndex: number) => void
  readOnly: boolean
}

export function IslandSheet({
  kind,
  islandId,
  copies,
  active,
  highlightedCopyId,
  onEditCopy,
  onMoveCopy,
  onDuplicateCopy,
  onDeleteCopy,
  onReorderCopy,
  readOnly,
}: IslandSheetProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `layer:${islandId}:${kind}`,
    data: { islandId, kind },
  })
  if (!active && copies.length === 0) return null

  return (
    <section
      ref={setNodeRef}
      className={`island-sheet island-sheet-${kind}`}
      style={kindStyle(kind)}
      data-over={isOver || undefined}
      aria-label={`${kindConfig[kind].plural} in this archetype`}
    >
      <h4 className="sheet-label">{kindConfig[kind].plural}</h4>
      <SortableContext
        items={copies.map((copy) => `copy:${copy.id}`)}
        strategy={rectSortingStrategy}
      >
        <div className="copy-grid">
          {copies.map((copy, index) => (
            <LocalCopyChip
              key={copy.id}
              copy={copy}
              islandId={islandId}
              highlighted={copy.id === highlightedCopyId}
              onEdit={(title, note) => onEditCopy(copy.id, title, note)}
              onMove={() => onMoveCopy(copy.id)}
              onDuplicate={() => onDuplicateCopy(copy.id)}
              onDelete={() => onDeleteCopy(copy.id)}
              onReorder={(direction) =>
                onReorderCopy(
                  index,
                  Math.max(0, Math.min(copies.length - 1, index + direction)),
                )
              }
              readOnly={readOnly}
            />
          ))}
          {active && copies.length === 0 ? (
            <div className="drop-placeholder">
              Drop {kindConfig[kind].label.toLowerCase()} here
            </div>
          ) : null}
        </div>
      </SortableContext>
    </section>
  )
}
