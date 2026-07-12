import type { Node } from '@xyflow/react'

import type {
  IngredientKind,
  InventoryBoard,
  InventoryKind,
  LocalCopy,
  Point,
  UserIsland,
} from '../../domain/types'

export type InventoryCardData = {
  itemId: string
  kind: InventoryKind
  title: string
  note: string
  readOnly: boolean
  onUpdate: (itemId: string, title: string, note: string) => void
  onDuplicate: (itemId: string) => void
  onDelete: (itemId: string) => void
  onMoveToCategory: (itemId: string) => void
}

export type InventoryCardFlowNode = Node<InventoryCardData, 'inventory-card'>

export type CategoryData = {
  categoryId: string
  kind: InventoryKind
  title: string
  itemCount: number
  readOnly: boolean
  onRename: (categoryId: string, title: string) => void
  onDelete: (categoryId: string) => void
  onResize: (categoryId: string, width: number, height: number) => void
}

export type CategoryFlowNode = Node<CategoryData, 'category'>

export type CategoryHeaderFlowNode = Node<CategoryData, 'category-header'>

export type IslandData = {
  island: UserIsland
  activeKind: IngredientKind | 'user' | null
  highlightedCopyId: string | null
  onEditUser: (islandId: string, title: string, note: string) => void
  onEditCopy: (islandId: string, copyId: string, title: string, note: string) => void
  onReorderCopy: (
    islandId: string,
    kind: IngredientKind,
    fromIndex: number,
    toIndex: number,
  ) => void
  onMoveCopy: (copyId: string) => void
  onDuplicateCopy: (copyId: string) => void
  onDeleteCopy: (islandId: string, copyId: string) => void
  onDeleteIsland: (islandId: string) => void
}

export type IslandFlowNode = Node<IslandData, 'island'>

export type WorkshopFlowNode =
  InventoryCardFlowNode | CategoryFlowNode | CategoryHeaderFlowNode | IslandFlowNode

export function alignCategoryDragNodes(
  nodes: WorkshopFlowNode[],
  board: InventoryBoard,
  categoryId: string,
  draggedHeaderId: string,
  position: Point,
): WorkshopFlowNode[] {
  const category = board.categoriesById[categoryId]
  if (!category) return nodes
  const delta = {
    x: position.x - category.position.x,
    y: position.y - category.position.y,
  }
  return nodes.map((node) => {
    if (node.id === draggedHeaderId) return { ...node, position }
    if (node.type === 'category' && node.id === categoryId) {
      return { ...node, position }
    }
    if (node.type !== 'inventory-card') return node
    const item = board.itemsById[node.id]
    if (item?.categoryId !== categoryId) return node
    return {
      ...node,
      position: {
        x: item.position.x + delta.x,
        y: item.position.y + delta.y,
      },
    }
  })
}

export type SourceDragData = {
  type: 'source'
  sourceId: string
  kind: InventoryKind
  title: string
}

export type LocalCopyDragData = {
  type: 'local-copy'
  copy: LocalCopy
  fromIslandId: string
}

export type WorkshopDragData = SourceDragData | LocalCopyDragData
