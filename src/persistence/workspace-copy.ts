import { z } from 'zod'

import type { InventoryKind, WorkspaceState } from '../domain/types'
import { INVENTORY_KINDS } from '../domain/types'
import { parseWorkspaceState, workspaceStateSchema } from './schema'

export const MAX_WORKSPACE_COPY_BYTES = 10 * 1024 * 1024

export const WORKSPACE_COPY_LIMITS = {
  inventoryItems: 500,
  categories: 100,
  islands: 100,
  localCopies: 1_000,
  totalEntities: 2_000,
  workspaceTitleCharacters: 80,
  categoryTitleCharacters: 80,
  itemTitleCharacters: 180,
  variantNameCharacters: 80,
  stringCharacters: 1_200,
  totalStringCharacters: 1_500_000,
} as const

export type WorkspaceCopy = {
  formatVersion: 1
  exportedAt: string
  workspace: WorkspaceState
}

export type WorkspaceCopyInventoryPreview = {
  items: number
  categories: number
  uncategorized: number
}

export type WorkspaceCopyPreview = {
  title: string
  exportedAt: string
  phase: WorkspaceState['phase']
  inventories: Record<InventoryKind, WorkspaceCopyInventoryPreview>
  archetypes: number
  localCopies: number
}

export type ParsedWorkspaceCopy = {
  copy: WorkspaceCopy
  preview: WorkspaceCopyPreview
}

const workspaceCopySchema = z
  .object({
    formatVersion: z.literal(1),
    exportedAt: z.iso.datetime({ offset: true }),
    workspace: workspaceStateSchema,
  })
  .strict()

function assertWithinLimit(value: number, limit: number, label: string): void {
  if (value > limit) {
    throw new Error(`The saved copy contains too many ${label}.`)
  }
}

function assertTextLength(value: string, limit: number, label: string): void {
  if (value.length > limit) {
    throw new Error(`The saved copy contains an overlong ${label}.`)
  }
}

function assertStringBudget(workspace: WorkspaceState): void {
  const pending: unknown[] = [workspace]
  let totalCharacters = 0

  while (pending.length > 0) {
    const value = pending.pop()
    if (typeof value === 'string') {
      assertTextLength(value, WORKSPACE_COPY_LIMITS.stringCharacters, 'text field')
      totalCharacters += value.length
      continue
    }
    if (Array.isArray(value)) {
      pending.push(...value)
      continue
    }
    if (value && typeof value === 'object') {
      pending.push(...Object.values(value))
    }
  }

  assertWithinLimit(
    totalCharacters,
    WORKSPACE_COPY_LIMITS.totalStringCharacters,
    'text content',
  )
}

function assertWorkspaceCopyResourceBudget(workspace: WorkspaceState): void {
  assertStringBudget(workspace)
  assertTextLength(
    workspace.title,
    WORKSPACE_COPY_LIMITS.workspaceTitleCharacters,
    'workspace title',
  )

  const inventories =
    workspace.phase === 'inventory'
      ? workspace.drafts
      : workspace.checkpoint.inventories
  const boards = INVENTORY_KINDS.map((kind) => inventories[kind])
  const inventoryItems = boards.reduce(
    (total, board) => total + Object.keys(board.itemsById).length,
    0,
  )
  const categories = boards.reduce(
    (total, board) => total + Object.keys(board.categoriesById).length,
    0,
  )

  for (const board of boards) {
    for (const item of Object.values(board.itemsById)) {
      assertTextLength(
        item.title,
        WORKSPACE_COPY_LIMITS.itemTitleCharacters,
        'inventory title',
      )
    }
    for (const category of Object.values(board.categoriesById)) {
      assertTextLength(
        category.title,
        WORKSPACE_COPY_LIMITS.categoryTitleCharacters,
        'category title',
      )
    }
  }

  const islands =
    workspace.phase === 'assembly' ? Object.values(workspace.assembly.islandsById) : []
  const localCopies = islands.reduce(
    (total, island) => total + Object.keys(island.copiesById).length,
    0,
  )

  for (const island of islands) {
    assertTextLength(
      island.userTitle,
      WORKSPACE_COPY_LIMITS.itemTitleCharacters,
      'archetype title',
    )
    if (island.variantName !== null) {
      assertTextLength(
        island.variantName,
        WORKSPACE_COPY_LIMITS.variantNameCharacters,
        'variant name',
      )
    }
    for (const copy of Object.values(island.copiesById)) {
      assertTextLength(
        copy.title,
        WORKSPACE_COPY_LIMITS.itemTitleCharacters,
        'local copy title',
      )
    }
  }

  assertWithinLimit(
    inventoryItems,
    WORKSPACE_COPY_LIMITS.inventoryItems,
    'inventory items',
  )
  assertWithinLimit(categories, WORKSPACE_COPY_LIMITS.categories, 'categories')
  assertWithinLimit(islands.length, WORKSPACE_COPY_LIMITS.islands, 'archetypes')
  assertWithinLimit(localCopies, WORKSPACE_COPY_LIMITS.localCopies, 'local copies')
  assertWithinLimit(
    inventoryItems + categories + islands.length + localCopies,
    WORKSPACE_COPY_LIMITS.totalEntities,
    'workshop entities',
  )
}

function previewWorkspaceCopy(copy: WorkspaceCopy): WorkspaceCopyPreview {
  const inventories =
    copy.workspace.phase === 'inventory'
      ? copy.workspace.drafts
      : copy.workspace.checkpoint.inventories

  return {
    title: copy.workspace.title,
    exportedAt: copy.exportedAt,
    phase: copy.workspace.phase,
    inventories: Object.fromEntries(
      INVENTORY_KINDS.map((kind) => {
        const board = inventories[kind]
        const items = Object.values(board.itemsById)
        return [
          kind,
          {
            items: items.length,
            categories: Object.keys(board.categoriesById).length,
            uncategorized: items.filter((item) => item.categoryId === null).length,
          },
        ]
      }),
    ) as Record<InventoryKind, WorkspaceCopyInventoryPreview>,
    archetypes:
      copy.workspace.phase === 'assembly'
        ? copy.workspace.assembly.islandOrder.length
        : 0,
    localCopies:
      copy.workspace.phase === 'assembly'
        ? Object.values(copy.workspace.assembly.islandsById).reduce(
            (total, island) => total + Object.keys(island.copiesById).length,
            0,
          )
        : 0,
  }
}

export function parseWorkspaceCopy(value: unknown): ParsedWorkspaceCopy {
  const parsed = workspaceCopySchema.parse(value)
  const workspace = parseWorkspaceState(parsed.workspace)
  assertWorkspaceCopyResourceBudget(workspace)
  const copy: WorkspaceCopy = {
    formatVersion: 1,
    exportedAt: parsed.exportedAt,
    workspace,
  }
  return { copy, preview: previewWorkspaceCopy(copy) }
}

export function parseWorkspaceCopyText(text: string): ParsedWorkspaceCopy {
  if (new TextEncoder().encode(text).byteLength > MAX_WORKSPACE_COPY_BYTES) {
    throw new Error('The saved copy is too large to open safely.')
  }

  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('The selected file is not valid JSON.')
  }
  return parseWorkspaceCopy(value)
}

export function serializeWorkspaceCopy(
  workspace: WorkspaceState,
  exportedAt = new Date().toISOString(),
): string {
  const copy = parseWorkspaceCopy({ formatVersion: 1, exportedAt, workspace }).copy
  return JSON.stringify(copy, null, 2)
}
