import {
  INGREDIENT_KINDS,
  INVENTORY_KINDS,
  type InventoryBoard,
  type InventoryKind,
  type WorkspaceState,
} from './types'
import { isReservedWorkspaceEntityId } from './entity-ids'

export class WorkspaceInvariantError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(`Workspace invariant violation:\n${issues.join('\n')}`)
    this.name = 'WorkspaceInvariantError'
    this.issues = issues
  }
}

function hasOwn(record: object, id: PropertyKey): boolean {
  return Object.hasOwn(record, id)
}

function validateBoard(
  board: InventoryBoard,
  expectedKind: InventoryKind,
  prefix: string,
): string[] {
  const issues: string[] = []

  if (board.kind !== expectedKind) {
    issues.push(`${prefix}.kind must be ${expectedKind}`)
  }

  for (const [id, category] of Object.entries(board.categoriesById)) {
    if (isReservedWorkspaceEntityId(id)) {
      issues.push(`${prefix}.categoriesById.${id} uses a reserved id`)
    }
    if (category.id !== id) {
      issues.push(`${prefix}.categoriesById.${id} has mismatched id`)
    }
    if (category.kind !== expectedKind) {
      issues.push(`${prefix}.categoriesById.${id} has mismatched kind`)
    }
  }

  for (const [id, item] of Object.entries(board.itemsById)) {
    if (isReservedWorkspaceEntityId(id)) {
      issues.push(`${prefix}.itemsById.${id} uses a reserved id`)
    }
    if (hasOwn(board.categoriesById, id)) {
      issues.push(`${prefix} uses id ${id} for both an item and a category`)
    }
    if (item.id !== id) {
      issues.push(`${prefix}.itemsById.${id} has mismatched id`)
    }
    if (item.kind !== expectedKind) {
      issues.push(`${prefix}.itemsById.${id} has mismatched kind`)
    }
    if (item.categoryId !== null) {
      if (!hasOwn(board.categoriesById, item.categoryId)) {
        issues.push(`${prefix}.itemsById.${id} references a missing category`)
      } else if (board.categoriesById[item.categoryId].kind !== item.kind) {
        issues.push(`${prefix}.itemsById.${id} references another inventory kind`)
      }
    }
  }

  for (const selectedId of board.selectedIds) {
    if (
      !hasOwn(board.itemsById, selectedId) &&
      !hasOwn(board.categoriesById, selectedId)
    ) {
      issues.push(`${prefix}.selectedIds contains missing id ${selectedId}`)
    }
  }

  return issues
}

export function collectWorkspaceInvariantIssues(workspace: WorkspaceState): string[] {
  const issues: string[] = []

  if (workspace.schemaVersion !== 1) {
    issues.push('schemaVersion must be 1')
  }

  if (workspace.phase === 'inventory') {
    for (const kind of INVENTORY_KINDS) {
      const board = workspace.drafts[kind]
      if (!board) {
        issues.push(`drafts.${kind} is missing`)
      } else {
        issues.push(...validateBoard(board, kind, `drafts.${kind}`))
      }
    }
    return issues
  }

  const { checkpoint, assembly } = workspace
  if (assembly.checkpointId !== checkpoint.id) {
    issues.push('assembly.checkpointId must match checkpoint.id')
  }

  for (const kind of INVENTORY_KINDS) {
    const board = checkpoint.inventories[kind]
    if (!board) {
      issues.push(`checkpoint.inventories.${kind} is missing`)
    } else {
      issues.push(...validateBoard(board, kind, `checkpoint.inventories.${kind}`))
    }
  }

  const orderedIslands = new Set(assembly.islandOrder)
  if (orderedIslands.size !== assembly.islandOrder.length) {
    issues.push('assembly.islandOrder contains duplicate ids')
  }

  for (const id of assembly.islandOrder) {
    if (!hasOwn(assembly.islandsById, id)) {
      issues.push(`assembly.islandOrder references missing island ${id}`)
    }
  }

  const normalUserSources = new Set<string>()
  for (const [islandId, island] of Object.entries(assembly.islandsById)) {
    if (island.id !== islandId) {
      issues.push(`assembly.islandsById.${islandId} has mismatched id`)
    }
    if (!orderedIslands.has(islandId)) {
      issues.push(`assembly island ${islandId} is missing from islandOrder`)
    }
    if (island.checkpointId !== checkpoint.id) {
      issues.push(`assembly island ${islandId} uses another checkpoint`)
    }
    if (!hasOwn(checkpoint.inventories.user.itemsById, island.sourceUserId)) {
      issues.push(`assembly island ${islandId} references a missing User source`)
    }
    if (island.variantName === null) {
      if (normalUserSources.has(island.sourceUserId)) {
        issues.push(`User source ${island.sourceUserId} has multiple normal islands`)
      }
      normalUserSources.add(island.sourceUserId)
    } else if (island.variantName.trim().length === 0) {
      issues.push(`assembly island ${islandId} has an empty variant name`)
    }

    if (!hasOwn(assembly.layout.freeformPositions, islandId)) {
      issues.push(`assembly island ${islandId} has no freeform position`)
    }
    if (
      assembly.layout.mode === 'tidy' &&
      (!assembly.layout.tidyPositions ||
        !hasOwn(assembly.layout.tidyPositions, islandId))
    ) {
      issues.push(`assembly island ${islandId} has no tidy position`)
    }

    const orderedCopies = new Set<string>()
    const sourceIds = new Set<string>()
    for (const kind of INGREDIENT_KINDS) {
      for (const copyId of island.copyOrder[kind]) {
        if (orderedCopies.has(copyId)) {
          issues.push(`assembly island ${islandId} orders copy ${copyId} twice`)
        }
        orderedCopies.add(copyId)
        if (!hasOwn(island.copiesById, copyId)) {
          issues.push(`assembly island ${islandId} orders missing copy ${copyId}`)
        } else if (island.copiesById[copyId].kind !== kind) {
          issues.push(`assembly copy ${copyId} is ordered under the wrong sheet`)
        }
      }
    }

    for (const [copyId, copy] of Object.entries(island.copiesById)) {
      if (copy.id !== copyId) {
        issues.push(`assembly copy ${copyId} has mismatched id`)
      }
      if (!orderedCopies.has(copyId)) {
        issues.push(`assembly copy ${copyId} is missing from copyOrder`)
      }
      if (copy.checkpointId !== checkpoint.id) {
        issues.push(`assembly copy ${copyId} uses another checkpoint`)
      }
      if (sourceIds.has(copy.sourceId)) {
        issues.push(
          `assembly island ${islandId} contains source ${copy.sourceId} twice`,
        )
      }
      sourceIds.add(copy.sourceId)

      if (!hasOwn(checkpoint.inventories[copy.kind].itemsById, copy.sourceId)) {
        issues.push(`assembly copy ${copyId} references a missing source`)
      }
      if (
        copy.sourceCategoryId !== null &&
        !hasOwn(checkpoint.inventories[copy.kind].categoriesById, copy.sourceCategoryId)
      ) {
        issues.push(`assembly copy ${copyId} references a missing source category`)
      }
    }
  }

  for (const islandId of Object.keys(assembly.layout.freeformPositions)) {
    if (!hasOwn(assembly.islandsById, islandId)) {
      issues.push(`freeform layout references missing island ${islandId}`)
    }
  }
  for (const islandId of Object.keys(assembly.layout.tidyPositions ?? {})) {
    if (!hasOwn(assembly.islandsById, islandId)) {
      issues.push(`tidy layout references missing island ${islandId}`)
    }
  }

  if (
    Object.keys(assembly.islandsById).length > 0 &&
    !assembly.firstContentMutationCommitted
  ) {
    issues.push('non-empty assembly must have a committed content boundary')
  }

  return issues
}

export function assertWorkspaceInvariants(workspace: WorkspaceState): void {
  const issues = collectWorkspaceInvariantIssues(workspace)
  if (issues.length > 0) {
    throw new WorkspaceInvariantError(issues)
  }
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested)
    }
  }
  return value
}

export function freezeCheckpoint<T extends WorkspaceState>(workspace: T): T {
  if (workspace.phase === 'assembly') {
    deepFreeze(workspace.checkpoint)
  }
  return workspace
}
