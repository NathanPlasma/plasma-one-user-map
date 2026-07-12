import { describe, expect, it } from 'vitest'

import {
  createBlankAssembly,
  createBlankWorkspace,
  createUserIsland,
} from '../../domain/factories'
import type { WorkspaceState } from '../../domain/types'
import {
  MAX_WORKSPACE_COPY_BYTES,
  WORKSPACE_COPY_LIMITS,
  parseWorkspaceCopy,
  parseWorkspaceCopyText,
  serializeWorkspaceCopy,
} from '../workspace-copy'

function createWorkspace() {
  const workspace = createBlankWorkspace({
    idFactory: () => 'foreign-workspace',
    clock: () => '2026-07-12T12:00:00.000Z',
    workspaceId: 'foreign-workspace',
    title: 'Imported workshop',
  })
  if (workspace.phase !== 'inventory') throw new Error('Expected inventory phase')
  workspace.drafts.problem.itemsById['problem-1'] = {
    id: 'problem-1',
    kind: 'problem',
    title: 'Slow transfer confirmation',
    note: 'A long but valid note.',
    categoryId: null,
    position: { x: 10, y: 20 },
  }
  return workspace
}

function envelope(workspace: WorkspaceState) {
  return {
    formatVersion: 1 as const,
    exportedAt: '2026-07-12T12:00:00.000Z',
    workspace,
  }
}

function createAssemblyWorkspace(): WorkspaceState {
  const inventory = createWorkspace()
  if (inventory.phase !== 'inventory') throw new Error('Expected inventory phase')
  inventory.drafts.user.itemsById['user-1'] = {
    id: 'user-1',
    kind: 'user',
    title: 'Remote founder',
    note: 'Needs dependable access.',
    categoryId: null,
    position: { x: 30, y: 40 },
  }

  const checkpointId = 'checkpoint-1'
  const checkpoint = {
    id: checkpointId,
    revision: 1,
    lockedAt: '2026-07-12T12:05:00.000Z',
    inventories: structuredClone(inventory.drafts),
  }
  const assembly = createBlankAssembly(checkpointId)
  const island = createUserIsland({
    id: 'island-1',
    checkpointId,
    sourceUserId: 'user-1',
    title: 'Remote founder',
    note: 'Needs dependable access.',
  })
  island.copiesById['copy-1'] = {
    id: 'copy-1',
    checkpointId,
    sourceId: 'problem-1',
    sourceCategoryId: null,
    kind: 'problem',
    title: 'Slow transfer confirmation',
    note: 'A long but valid note.',
    order: 0,
  }
  island.copyOrder.problem.push('copy-1')
  assembly.islandsById[island.id] = island
  assembly.islandOrder.push(island.id)
  assembly.layout.freeformPositions[island.id] = { x: 100, y: 120 }
  assembly.firstContentMutationCommitted = true

  return {
    schemaVersion: 1,
    workspaceId: inventory.workspaceId,
    title: inventory.title,
    createdAt: inventory.createdAt,
    updatedAt: inventory.updatedAt,
    contentRevision: inventory.contentRevision,
    previousBoardGeneration: inventory.previousBoardGeneration,
    phase: 'assembly',
    checkpoint,
    assembly,
  }
}

describe('workspace copies', () => {
  it('round-trips the current V1 envelope and derives its preview', () => {
    const text = serializeWorkspaceCopy(createWorkspace(), '2026-07-12T12:30:00.000Z')
    const parsed = parseWorkspaceCopyText(text)

    expect(parsed.copy).toMatchObject({
      formatVersion: 1,
      exportedAt: '2026-07-12T12:30:00.000Z',
      workspace: { title: 'Imported workshop' },
    })
    expect(parsed.preview).toMatchObject({
      title: 'Imported workshop',
      phase: 'inventory',
      inventories: {
        problem: { items: 1, categories: 0, uncategorized: 1 },
      },
      archetypes: 0,
      localCopies: 0,
    })
  })

  it.each([
    ['future format', { formatVersion: 2 }],
    ['missing workspace', { formatVersion: 1, exportedAt: '2026-07-12T12:00:00Z' }],
    [
      'invalid timestamp',
      {
        formatVersion: 1,
        exportedAt: 'not-a-date',
        workspace: createWorkspace(),
      },
    ],
  ])('rejects %s', (_, value) => {
    expect(() => parseWorkspaceCopy(value)).toThrow()
  })

  it('rejects invalid JSON and broken relational invariants', () => {
    expect(() => parseWorkspaceCopyText('{')).toThrow()

    const workspace = createWorkspace()
    if (workspace.phase !== 'inventory') throw new Error('Expected inventory phase')
    workspace.drafts.problem.itemsById['problem-1'].id = 'different-id'
    expect(() =>
      parseWorkspaceCopy({
        formatVersion: 1,
        exportedAt: '2026-07-12T12:00:00.000Z',
        workspace,
      }),
    ).toThrow()
  })

  it('rejects persisted ids that collide with category view-node ids', () => {
    const workspace = createWorkspace()
    if (workspace.phase !== 'inventory') throw new Error('Expected inventory phase')
    workspace.drafts.problem.categoriesById['category-1'] = {
      id: 'category-1',
      kind: 'problem',
      title: 'Access',
      position: { x: 0, y: 0 },
      size: { width: 320, height: 220 },
    }
    workspace.drafts.problem.itemsById['category-header:category-1'] = {
      id: 'category-header:category-1',
      kind: 'problem',
      title: 'Conflicting card',
      note: '',
      categoryId: null,
      position: { x: 10, y: 20 },
    }

    expect(() => parseWorkspaceCopy(envelope(workspace))).toThrow(/reserved id/i)
  })

  it('rejects an id shared by an inventory item and category', () => {
    const workspace = createWorkspace()
    if (workspace.phase !== 'inventory') throw new Error('Expected inventory phase')
    workspace.drafts.problem.categoriesById['problem-1'] = {
      id: 'problem-1',
      kind: 'problem',
      title: 'Conflicting category',
      position: { x: 0, y: 0 },
      size: { width: 320, height: 220 },
    }

    expect(() => parseWorkspaceCopy(envelope(workspace))).toThrow(
      /both an item and a category/i,
    )
  })

  it('derives assembly preview counts from validated content', () => {
    expect(
      parseWorkspaceCopy(envelope(createAssemblyWorkspace())).preview,
    ).toMatchObject({
      phase: 'assembly',
      archetypes: 1,
      localCopies: 1,
      inventories: {
        problem: { items: 1 },
        user: { items: 1 },
      },
    })
  })

  it.each([
    [
      'island order',
      (workspace: WorkspaceState) => {
        if (workspace.phase !== 'assembly') throw new Error('Expected assembly phase')
        workspace.assembly.islandsById = {}
        workspace.assembly.islandOrder = ['constructor']
        workspace.assembly.layout.freeformPositions = {}
        workspace.assembly.firstContentMutationCommitted = false
      },
    ],
    [
      'User source',
      (workspace: WorkspaceState) => {
        if (workspace.phase !== 'assembly') throw new Error('Expected assembly phase')
        workspace.assembly.islandsById['island-1'].sourceUserId = 'constructor'
      },
    ],
    [
      'source category',
      (workspace: WorkspaceState) => {
        if (workspace.phase !== 'assembly') throw new Error('Expected assembly phase')
        workspace.assembly.islandsById['island-1'].copiesById[
          'copy-1'
        ].sourceCategoryId = 'constructor'
      },
    ],
  ])('rejects a reserved prototype id used as a missing %s', (_, mutate) => {
    const workspace = createAssemblyWorkspace()
    mutate(workspace)
    expect(() => parseWorkspaceCopy(envelope(workspace))).toThrow()
  })

  it('accepts the inventory item limit and rejects one item beyond it', () => {
    const workspace = createWorkspace()
    if (workspace.phase !== 'inventory') throw new Error('Expected inventory phase')
    const board = workspace.drafts.problem
    for (let index = 2; index <= WORKSPACE_COPY_LIMITS.inventoryItems; index += 1) {
      const id = `problem-${index}`
      board.itemsById[id] = {
        id,
        kind: 'problem',
        title: `Problem ${index}`,
        note: '',
        categoryId: null,
        position: { x: index, y: index },
      }
    }

    expect(() => parseWorkspaceCopy(envelope(workspace))).not.toThrow()
    const extraId = `problem-${WORKSPACE_COPY_LIMITS.inventoryItems + 1}`
    board.itemsById[extraId] = {
      id: extraId,
      kind: 'problem',
      title: 'One problem too many',
      note: '',
      categoryId: null,
      position: { x: 0, y: 0 },
    }
    expect(() => parseWorkspaceCopy(envelope(workspace))).toThrow(
      /too many inventory items/i,
    )
  })

  it('accepts the note length limit and rejects one character beyond it', () => {
    const workspace = createWorkspace()
    if (workspace.phase !== 'inventory') throw new Error('Expected inventory phase')
    const item = workspace.drafts.problem.itemsById['problem-1']
    item.note = 'x'.repeat(WORKSPACE_COPY_LIMITS.stringCharacters)
    expect(() => parseWorkspaceCopy(envelope(workspace))).not.toThrow()

    item.note += 'x'
    expect(() => parseWorkspaceCopy(envelope(workspace))).toThrow(/overlong/i)
  })

  it('rejects an oversized copy before JSON parsing', () => {
    expect(() =>
      parseWorkspaceCopyText(' '.repeat(MAX_WORKSPACE_COPY_BYTES + 1)),
    ).toThrow(/too large/i)
  })
})
