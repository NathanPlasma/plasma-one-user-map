import type { SourceItemView, SourceSectionView } from '../../../components/SourceShelf'
import type {
  AssemblyPhaseState,
  IngredientKind,
  InventoryKind,
  LocalCopy,
  Point,
  UserIsland,
} from '../../../domain/types'

export type DestinationRequest =
  | {
      mode: 'source'
      sourceIds: string[]
      kind: IngredientKind
      title: string
    }
  | {
      mode: 'move' | 'duplicate'
      fromIslandId: string
      copy: LocalCopy
      title: string
    }

export function findCopyById(
  islands: Record<string, UserIsland>,
  copyId: string,
): { island: UserIsland; copy: LocalCopy } | null {
  for (const island of Object.values(islands)) {
    const copy = island.copiesById[copyId]
    if (copy) return { island, copy }
  }
  return null
}

export function containsSource(island: UserIsland, sourceId: string): boolean {
  return Object.values(island.copiesById).some((copy) => copy.sourceId === sourceId)
}

export function buildSourceSections(
  workspace: AssemblyPhaseState,
  kind: InventoryKind,
): SourceSectionView[] {
  const board = workspace.checkpoint.inventories[kind]
  const islands = Object.values(workspace.assembly.islandsById)
  const toView = (itemId: string): SourceItemView | null => {
    const item = board.itemsById[itemId]
    if (!item) return null
    return {
      id: item.id,
      title: item.title,
      categoryId: item.categoryId,
      presentInIslandIds: islands
        .filter((island) =>
          kind === 'user'
            ? island.sourceUserId === item.id
            : containsSource(island, item.id),
        )
        .map((island) => island.id),
    }
  }

  const sections = Object.values(board.categoriesById).map((category) => ({
    id: category.id,
    title: category.title,
    items: Object.values(board.itemsById)
      .filter((item) => item.categoryId === category.id)
      .map((item) => toView(item.id))
      .filter((item): item is SourceItemView => Boolean(item)),
  }))
  const uncategorized = Object.values(board.itemsById)
    .filter((item) => item.categoryId === null)
    .map((item) => toView(item.id))
    .filter((item): item is SourceItemView => Boolean(item))
  if (uncategorized.length) {
    sections.push({ id: 'uncategorized', title: 'Uncategorised', items: uncategorized })
  }
  return sections
}

export function nextIslandPosition(positions: Point[]): Point {
  for (let slot = 0; slot < 100; slot += 1) {
    const candidate = {
      x: 340 + (slot % 3) * 450,
      y: 120 + Math.floor(slot / 3) * 380,
    }
    const overlaps = positions.some(
      (position) =>
        Math.abs(position.x - candidate.x) < 430 &&
        Math.abs(position.y - candidate.y) < 350,
    )
    if (!overlaps) return candidate
  }
  return { x: 340, y: 120 + positions.length * 380 }
}
