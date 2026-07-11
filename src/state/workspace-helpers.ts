import type { Draft } from 'immer'
import type {
  AssemblyPhaseState,
  AssemblyStage,
  IngredientKind,
  InventoryKind,
  InventoryPhaseState,
  LockInventoryCounts,
  LockReview,
  Point,
} from '../domain/types'
import { INGREDIENT_KINDS, INVENTORY_KINDS } from '../domain/types'
import type { TidyLayoutOptions } from './workspace-actions'

const DEFAULT_TIDY_COLUMNS = 3
const DEFAULT_TIDY_COLUMN_WIDTH = 440
const DEFAULT_TIDY_ROW_GAP = 30
const DEFAULT_TIDY_ISLAND_HEIGHT = 330
const MAX_TIDY_COLUMNS = 12
const MAX_TIDY_DISTANCE = 10_000

function positiveFiniteOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(value, MAX_TIDY_DISTANCE)
    : fallback
}

function nonnegativeFiniteOrDefault(
  value: number | undefined,
  fallback: number,
): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(value, MAX_TIDY_DISTANCE)
    : fallback
}

function finiteCoordinateOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0
}

export function computeTidyPositions(
  islandOrder: readonly string[],
  origin: Point,
  options?: TidyLayoutOptions,
): Record<string, Point> {
  const requestedColumns = options?.columns
  const columns =
    typeof requestedColumns === 'number' &&
    Number.isFinite(requestedColumns) &&
    requestedColumns > 0
      ? Math.min(Math.max(Math.trunc(requestedColumns), 1), MAX_TIDY_COLUMNS)
      : DEFAULT_TIDY_COLUMNS
  const columnWidth = positiveFiniteOrDefault(
    options?.columnWidth,
    DEFAULT_TIDY_COLUMN_WIDTH,
  )
  const rowGap = nonnegativeFiniteOrDefault(options?.rowGap, DEFAULT_TIDY_ROW_GAP)
  const safeOrigin = {
    x: finiteCoordinateOrZero(origin.x),
    y: finiteCoordinateOrZero(origin.y),
  }
  const columnHeights = Array.from({ length: columns }, () => 0)
  const positions: Record<string, Point> = {}

  for (const islandId of islandOrder) {
    let targetColumn = 0
    for (let column = 1; column < columns; column += 1) {
      if ((columnHeights[column] ?? 0) < (columnHeights[targetColumn] ?? 0)) {
        targetColumn = column
      }
    }
    const height = positiveFiniteOrDefault(
      options?.islandHeights?.[islandId],
      DEFAULT_TIDY_ISLAND_HEIGHT,
    )
    positions[islandId] = {
      x: safeOrigin.x + targetColumn * columnWidth,
      y: safeOrigin.y + (columnHeights[targetColumn] ?? 0),
    }
    columnHeights[targetColumn] = (columnHeights[targetColumn] ?? 0) + height + rowGap
  }

  return positions
}

export function stageForIngredient(kind: IngredientKind): AssemblyStage {
  if (kind === 'problem') return 'add-problems'
  if (kind === 'region') return 'add-regions'
  return 'add-monetization'
}

export function buildLockReview(workspace: InventoryPhaseState): LockReview {
  const counts = Object.fromEntries(
    INVENTORY_KINDS.map((kind) => {
      const board = workspace.drafts[kind]
      const items = Object.values(board.itemsById)
      const value: LockInventoryCounts = {
        items: items.length,
        categories: Object.keys(board.categoriesById).length,
        uncategorized: items.filter((item) => item.categoryId === null).length,
      }
      return [kind, value]
    }),
  ) as Record<InventoryKind, LockInventoryCounts>

  return {
    token: `${workspace.workspaceId}:${workspace.contentRevision}`,
    contentRevision: workspace.contentRevision,
    counts,
    emptyKinds: INVENTORY_KINDS.filter((kind) => counts[kind].items === 0),
    uncategorizedKinds: INVENTORY_KINDS.filter(
      (kind) => counts[kind].uncategorized > 0,
    ),
  }
}

export function acknowledgementCovers(
  required: InventoryKind[],
  acknowledged: InventoryKind[],
): boolean {
  const accepted = new Set(acknowledged)
  return required.every((kind) => accepted.has(kind))
}

export function normalizeCopyOrder(
  island: Draft<AssemblyPhaseState>['assembly']['islandsById'][string],
): void {
  for (const kind of INGREDIENT_KINDS) {
    island.copyOrder[kind].forEach((copyId, order) => {
      const copy = island.copiesById[copyId]
      if (copy) copy.order = order
    })
  }
}
