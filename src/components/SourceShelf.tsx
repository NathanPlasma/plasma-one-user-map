import { useDraggable } from '@dnd-kit/core'
import { GripVertical, PanelLeftClose } from 'lucide-react'

import type { InventoryKind } from '../domain/types'
import { kindConfig, kindStyle } from '../features/workshop/kind-config'
import type { SourceDragData } from '../features/canvas/view-models'

export type SourceItemView = {
  id: string
  title: string
  categoryId: string | null
  presentInIslandIds: string[]
}

export type SourceSectionView = {
  id: string
  title: string
  items: SourceItemView[]
}

type SourceShelfProps = {
  kind: InventoryKind
  checkpointVersion: number
  open: boolean
  sections: SourceSectionView[]
  onClose: () => void
  onActivateSource: (sourceId: string) => void
  onActivateSection?: (section: SourceSectionView) => void
}

function DraggableSource({
  item,
  kind,
  onActivate,
}: {
  item: SourceItemView
  kind: InventoryKind
  onActivate: () => void
}) {
  const dragData: SourceDragData = {
    type: 'source',
    sourceId: item.id,
    kind,
    title: item.title,
  }
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `source:${kind}:${item.id}`,
    data: dragData,
  })

  return (
    <button
      ref={setNodeRef}
      type="button"
      className="source-card"
      data-dragging={isDragging || undefined}
      style={kindStyle(kind)}
      aria-label={`${item.title}. Press Enter to add to an archetype, or drag to copy.`}
      onClick={onActivate}
      {...attributes}
      {...listeners}
    >
      <GripVertical size={15} aria-hidden="true" />
      <span>{item.title}</span>
    </button>
  )
}

export function SourceShelf({
  kind,
  checkpointVersion,
  open,
  sections,
  onClose,
  onActivateSource,
  onActivateSection,
}: SourceShelfProps) {
  return (
    <aside
      className="source-shelf paper-grain"
      style={kindStyle(kind)}
      data-open={open}
      aria-label={`Locked ${kindConfig[kind].plural.toLowerCase()}`}
      aria-hidden={!open}
      inert={!open}
    >
      <header className="source-shelf-header">
        <div>
          <h2 className="source-shelf-title">
            Locked {kindConfig[kind].plural.toLowerCase()}
          </h2>
          <p className="source-shelf-meta">Inventory v{checkpointVersion}</p>
        </div>
        <button
          type="button"
          className="card-menu-button"
          aria-label="Collapse source shelf"
          onClick={onClose}
        >
          <PanelLeftClose size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="source-shelf-scroll">
        {sections.length ? (
          sections.map((section) => (
            <section className="source-section" key={section.id}>
              <div className="source-section-heading">
                <h3>{section.title}</h3>
                {onActivateSection && section.items.length > 1 ? (
                  <button
                    type="button"
                    className="source-section-action"
                    onClick={() => onActivateSection(section)}
                  >
                    Add group
                  </button>
                ) : null}
              </div>
              <div className="source-list">
                {section.items.map((item) => (
                  <DraggableSource
                    key={item.id}
                    item={item}
                    kind={kind}
                    onActivate={() => onActivateSource(item.id)}
                  />
                ))}
              </div>
            </section>
          ))
        ) : (
          <p className="source-shelf-meta">This locked inventory is empty.</p>
        )}
      </div>
    </aside>
  )
}
