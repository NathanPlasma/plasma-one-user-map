import type { Draft } from 'immer'
import type {
  CommandResult,
  IdFactory,
  InventoryBoard,
  InventoryCategory,
  InventoryKind,
  InventoryPhaseState,
  Point,
  Size,
} from '../domain/types'
import { INVENTORY_KINDS } from '../domain/types'
import { MutationRejected } from './command-utils'
import type { WorkspaceActions } from './workspace-actions'

const DEFAULT_CATEGORY_SIZE: Size = { width: 320, height: 260 }
const CATEGORY_PADDING_X = 18
const CATEGORY_CONTENT_TOP = 68
const CATEGORY_PADDING_BOTTOM = 18
const CARD_LAYOUT_WIDTH = 220
const CARD_LAYOUT_HEIGHT = 112
const CARD_LAYOUT_GAP = 16

type CardRect = Point & Size

function overlaps(a: CardRect, b: CardRect): boolean {
  return (
    a.x < b.x + b.width + CARD_LAYOUT_GAP &&
    a.x + a.width + CARD_LAYOUT_GAP > b.x &&
    a.y < b.y + b.height + CARD_LAYOUT_GAP &&
    a.y + a.height + CARD_LAYOUT_GAP > b.y
  )
}

function growCategoryToItems(board: InventoryBoard, category: InventoryCategory): void {
  const items = Object.values(board.itemsById).filter(
    (item) => item.categoryId === category.id,
  )
  if (!items.length) return
  const requiredRight = Math.max(
    ...items.map((item) => item.position.x + CARD_LAYOUT_WIDTH + CATEGORY_PADDING_X),
  )
  const requiredBottom = Math.max(
    ...items.map(
      (item) => item.position.y + CARD_LAYOUT_HEIGHT + CATEGORY_PADDING_BOTTOM,
    ),
  )
  category.size = {
    width: Math.max(category.size.width, requiredRight - category.position.x),
    height: Math.max(category.size.height, requiredBottom - category.position.y),
  }
}

function placeItemsInCategory(
  board: InventoryBoard,
  category: InventoryCategory,
  itemIds: readonly string[],
): void {
  const incoming = new Set(itemIds)
  const occupied: CardRect[] = Object.values(board.itemsById)
    .filter((item) => item.categoryId === category.id && !incoming.has(item.id))
    .map((item) => ({
      ...item.position,
      width: CARD_LAYOUT_WIDTH,
      height: CARD_LAYOUT_HEIGHT,
    }))
  const availableWidth = Math.max(
    CARD_LAYOUT_WIDTH,
    category.size.width - CATEGORY_PADDING_X * 2,
  )
  const columns = Math.max(
    1,
    Math.floor(
      (availableWidth + CARD_LAYOUT_GAP) / (CARD_LAYOUT_WIDTH + CARD_LAYOUT_GAP),
    ),
  )

  for (const itemId of itemIds) {
    const item = board.itemsById[itemId]
    if (!item) throw new MutationRejected('NOT_FOUND', 'Item not found.')
    let candidate: CardRect | null = null
    for (let slot = 0; slot < 1_000; slot += 1) {
      const next = {
        x:
          category.position.x +
          CATEGORY_PADDING_X +
          (slot % columns) * (CARD_LAYOUT_WIDTH + CARD_LAYOUT_GAP),
        y:
          category.position.y +
          CATEGORY_CONTENT_TOP +
          Math.floor(slot / columns) * (CARD_LAYOUT_HEIGHT + CARD_LAYOUT_GAP),
        width: CARD_LAYOUT_WIDTH,
        height: CARD_LAYOUT_HEIGHT,
      }
      if (!occupied.some((rect) => overlaps(next, rect))) {
        candidate = next
        break
      }
    }
    if (!candidate) {
      throw new MutationRejected('PERSISTENCE_FAILED', 'Category layout is full.')
    }
    item.categoryId = category.id
    item.position = { x: candidate.x, y: candidate.y }
    occupied.push(candidate)
  }
  growCategoryToItems(board, category)
}

type InventoryActionKey =
  | 'createInventoryItem'
  | 'updateInventoryItem'
  | 'moveInventoryItems'
  | 'moveInventoryItemsToCategory'
  | 'duplicateInventoryItems'
  | 'pasteInventoryItems'
  | 'deleteInventoryItems'
  | 'createInventoryCategory'
  | 'groupInventoryItems'
  | 'updateInventoryCategory'
  | 'assignItemsToCategory'
  | 'removeItemsFromCategory'
  | 'deleteCategoryPreservingItems'

export type InventoryContentActions = Pick<WorkspaceActions, InventoryActionKey>

type RunPhase1Mutation = <T>(
  kind: InventoryKind,
  label: string,
  recipe: (draft: Draft<InventoryPhaseState>) => T,
) => Promise<CommandResult<T>>

export function createInventoryContentActions(options: {
  idFactory: IdFactory
  runPhase1Mutation: RunPhase1Mutation
}): InventoryContentActions {
  const { idFactory, runPhase1Mutation } = options

  return {
    createInventoryItem: (input) => {
      const itemId = idFactory()
      return runPhase1Mutation(input.kind, 'Create inventory item', (draft) => {
        draft.drafts[input.kind].itemsById[itemId] = {
          id: itemId,
          kind: input.kind,
          title: input.title,
          note: input.note ?? '',
          categoryId: null,
          position: input.position,
        }
        return { itemId }
      })
    },

    updateInventoryItem: (kind, itemId, patch) =>
      runPhase1Mutation(kind, 'Update inventory item', (draft) => {
        const item = draft.drafts[kind].itemsById[itemId]
        if (!item) throw new MutationRejected('NOT_FOUND', 'Item not found.')
        if (patch.title !== undefined) item.title = patch.title
        if (patch.note !== undefined) item.note = patch.note
        return undefined
      }),

    moveInventoryItems: (kind, positions) =>
      runPhase1Mutation(kind, 'Move inventory items', (draft) => {
        for (const [itemId, position] of Object.entries(positions)) {
          const item = draft.drafts[kind].itemsById[itemId]
          if (!item) throw new MutationRejected('NOT_FOUND', 'Item not found.')
          item.position = position
        }
        return undefined
      }),

    moveInventoryItemsToCategory: (kind, positions, categoryId) =>
      runPhase1Mutation(kind, 'Move inventory items and reparent', (draft) => {
        const board = draft.drafts[kind]
        if (categoryId !== null && !board.categoriesById[categoryId]) {
          throw new MutationRejected('NOT_FOUND', 'Category not found.')
        }
        const category = categoryId ? board.categoriesById[categoryId] : undefined
        const requestedPositions = Object.values(positions)
        if (requestedPositions.length === 0) return undefined
        const shift = category
          ? {
              x: Math.max(
                0,
                category.position.x +
                  CATEGORY_PADDING_X -
                  Math.min(...requestedPositions.map((position) => position.x)),
              ),
              y: Math.max(
                0,
                category.position.y +
                  CATEGORY_CONTENT_TOP -
                  Math.min(...requestedPositions.map((position) => position.y)),
              ),
            }
          : { x: 0, y: 0 }
        for (const [itemId, position] of Object.entries(positions)) {
          const item = board.itemsById[itemId]
          if (!item) {
            const belongsToAnotherKind = INVENTORY_KINDS.some(
              (candidateKind) =>
                candidateKind !== kind &&
                Boolean(draft.drafts[candidateKind].itemsById[itemId]),
            )
            throw new MutationRejected(
              belongsToAnotherKind ? 'INVALID_KIND' : 'NOT_FOUND',
              belongsToAnotherKind
                ? 'Items cannot move across inventories.'
                : 'Item not found.',
            )
          }
          item.position = {
            x: position.x + shift.x,
            y: position.y + shift.y,
          }
          item.categoryId = categoryId
        }
        if (category) growCategoryToItems(board, category)
        return undefined
      }),

    duplicateInventoryItems: (kind, itemIds, offset = { x: 24, y: 24 }) => {
      const newIds = itemIds.map(() => idFactory())
      return runPhase1Mutation(kind, 'Duplicate inventory items', (draft) => {
        itemIds.forEach((itemId, index) => {
          const source = draft.drafts[kind].itemsById[itemId]
          if (!source) throw new MutationRejected('NOT_FOUND', 'Item not found.')
          const newId = newIds[index]
          if (!newId) return
          draft.drafts[kind].itemsById[newId] = {
            ...source,
            id: newId,
            position: {
              x: source.position.x + offset.x,
              y: source.position.y + offset.y,
            },
          }
        })
        for (const category of Object.values(draft.drafts[kind].categoriesById)) {
          growCategoryToItems(draft.drafts[kind], category)
        }
        return { itemIds: newIds }
      })
    },

    pasteInventoryItems: (kind, items) => {
      const itemIds = items.map(() => idFactory())
      return runPhase1Mutation(kind, 'Paste inventory items', (draft) => {
        items.forEach((item, index) => {
          const itemId = itemIds[index]
          if (!itemId) return
          draft.drafts[kind].itemsById[itemId] = {
            id: itemId,
            kind,
            title: item.title,
            note: item.note ?? '',
            categoryId: null,
            position: item.position,
          }
        })
        return { itemIds }
      })
    },

    deleteInventoryItems: (kind, itemIds) =>
      runPhase1Mutation(kind, 'Delete inventory items', (draft) => {
        for (const itemId of itemIds) {
          if (!draft.drafts[kind].itemsById[itemId]) {
            throw new MutationRejected('NOT_FOUND', 'Item not found.')
          }
          delete draft.drafts[kind].itemsById[itemId]
        }
        draft.drafts[kind].selectedIds = draft.drafts[kind].selectedIds.filter(
          (id) => !itemIds.includes(id),
        )
        return undefined
      }),

    createInventoryCategory: (input) => {
      const categoryId = idFactory()
      return runPhase1Mutation(input.kind, 'Create inventory category', (draft) => {
        draft.drafts[input.kind].categoriesById[categoryId] = {
          id: categoryId,
          kind: input.kind,
          title: input.title,
          position: input.position,
          size: input.size ?? DEFAULT_CATEGORY_SIZE,
        }
        return { categoryId }
      })
    },

    groupInventoryItems: (kind, itemIds, title, position, size) => {
      const categoryId = idFactory()
      return runPhase1Mutation(kind, 'Group inventory items', (draft) => {
        const board = draft.drafts[kind]
        for (const itemId of itemIds) {
          if (board.itemsById[itemId]) continue
          const belongsToAnotherKind = INVENTORY_KINDS.some(
            (candidateKind) =>
              candidateKind !== kind &&
              Boolean(draft.drafts[candidateKind].itemsById[itemId]),
          )
          throw new MutationRejected(
            belongsToAnotherKind ? 'INVALID_KIND' : 'NOT_FOUND',
            belongsToAnotherKind
              ? 'Items cannot be grouped across inventories.'
              : 'Item not found.',
          )
        }
        board.categoriesById[categoryId] = {
          id: categoryId,
          kind,
          title,
          position,
          size: size ?? DEFAULT_CATEGORY_SIZE,
        }
        for (const itemId of itemIds) {
          const item = board.itemsById[itemId]
          if (item) item.categoryId = categoryId
        }
        growCategoryToItems(board, board.categoriesById[categoryId])
        return { categoryId }
      })
    },

    updateInventoryCategory: (kind, categoryId, patch) =>
      runPhase1Mutation(kind, 'Update inventory category', (draft) => {
        const category = draft.drafts[kind].categoriesById[categoryId]
        if (!category) {
          throw new MutationRejected('NOT_FOUND', 'Category not found.')
        }
        if (patch.title !== undefined) category.title = patch.title
        if (patch.position !== undefined) {
          const delta = {
            x: patch.position.x - category.position.x,
            y: patch.position.y - category.position.y,
          }
          category.position = patch.position
          for (const item of Object.values(draft.drafts[kind].itemsById)) {
            if (item.categoryId === categoryId) {
              item.position = {
                x: item.position.x + delta.x,
                y: item.position.y + delta.y,
              }
            }
          }
        }
        if (patch.size !== undefined) category.size = patch.size
        return undefined
      }),

    assignItemsToCategory: (kind, itemIds, categoryId) =>
      runPhase1Mutation(kind, 'Assign items to category', (draft) => {
        const board = draft.drafts[kind]
        const category = board.categoriesById[categoryId]
        if (!category) {
          throw new MutationRejected('NOT_FOUND', 'Category not found.')
        }
        placeItemsInCategory(board, category, itemIds)
        return undefined
      }),

    removeItemsFromCategory: (kind, itemIds) =>
      runPhase1Mutation(kind, 'Remove items from category', (draft) => {
        for (const itemId of itemIds) {
          const item = draft.drafts[kind].itemsById[itemId]
          if (!item) throw new MutationRejected('NOT_FOUND', 'Item not found.')
          item.categoryId = null
        }
        return undefined
      }),

    deleteCategoryPreservingItems: (kind, categoryId) =>
      runPhase1Mutation(kind, 'Delete category preserving items', (draft) => {
        const board = draft.drafts[kind]
        if (!board.categoriesById[categoryId]) {
          throw new MutationRejected('NOT_FOUND', 'Category not found.')
        }
        for (const item of Object.values(board.itemsById)) {
          if (item.categoryId === categoryId) item.categoryId = null
        }
        delete board.categoriesById[categoryId]
        board.selectedIds = board.selectedIds.filter((id) => id !== categoryId)
        return undefined
      }),
  }
}
