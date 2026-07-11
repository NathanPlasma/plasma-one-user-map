import { describe, expect, it } from 'vitest'
import type { CommandResult, InventoryKind } from '../../domain/types'
import { MemoryWorkspaceStorageAdapter } from '../../persistence/memory-storage-adapter'
import { createWorkspaceStore, type WorkspaceStore } from '../workspace-store'

function unwrap<T>(result: CommandResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.code}: ${result.message}`)
  }
  return result.value
}

function createHarness(storage = new MemoryWorkspaceStorageAdapter()): {
  storage: MemoryWorkspaceStorageAdapter
  store: WorkspaceStore
} {
  let id = 0
  let tick = 0
  const store = createWorkspaceStore({
    storage,
    workspaceId: 'test-workspace',
    writerId: `writer-${id++}`,
    idFactory: () => `id-${id++}`,
    clock: () => `2026-07-11T12:00:${String(tick++).padStart(2, '0')}Z`,
  })
  return { storage, store }
}

async function createItem(
  store: WorkspaceStore,
  kind: InventoryKind,
  title: string,
): Promise<string> {
  const result = await store.getState().actions.createInventoryItem({
    kind,
    title,
    position: { x: 10, y: 20 },
  })
  return unwrap(result).itemId
}

async function lockInventories(store: WorkspaceStore): Promise<string> {
  const review = unwrap(store.getState().actions.prepareLockInventories())
  const locked = await store.getState().actions.commitLockInventories(review.token, {
    emptyKinds: review.emptyKinds,
    uncategorizedKinds: review.uncategorizedKinds,
  })
  return unwrap(locked).checkpointId
}

async function seedTidyIslands(
  store: WorkspaceStore,
  count: number,
): Promise<string[]> {
  const userIds: string[] = []
  for (let index = 0; index < count; index += 1) {
    userIds.push(await createItem(store, 'user', `User ${index + 1}`))
  }
  await lockInventories(store)
  const islandIds: string[] = []
  for (const [index, userId] of userIds.entries()) {
    islandIds.push(
      unwrap(
        await store
          .getState()
          .actions.seedUserIsland(userId, { x: index * 137, y: index * 83 }),
      ).islandId,
    )
  }
  unwrap(await store.getState().actions.setAssemblyStage('add-monetization'))
  return islandIds
}

describe('Phase 1 inventory commands', () => {
  it('creates every item uncategorized and keeps inventories isolated', async () => {
    const { store } = createHarness()
    const problemId = await createItem(store, 'problem', 'Problem')
    const workspace = store.getState().workspace

    expect(workspace.phase).toBe('inventory')
    if (workspace.phase !== 'inventory') return
    expect(workspace.drafts.problem.itemsById[problemId]?.categoryId).toBeNull()
    expect(Object.keys(workspace.drafts.user.itemsById)).toHaveLength(0)
  })

  it('groups source items atomically and one Undo removes the group', async () => {
    const { store } = createHarness()
    const firstId = await createItem(store, 'problem', 'First')
    const secondId = await createItem(store, 'problem', 'Second')

    const grouped = await store
      .getState()
      .actions.groupInventoryItems('problem', [firstId, secondId], 'Access', {
        x: 100,
        y: 120,
      })
    const categoryId = unwrap(grouped).categoryId
    let workspace = store.getState().workspace
    expect(workspace.phase).toBe('inventory')
    if (workspace.phase !== 'inventory') return
    expect(workspace.drafts.problem.itemsById[firstId]?.categoryId).toBe(categoryId)

    unwrap(await store.getState().actions.undo())
    workspace = store.getState().workspace
    if (workspace.phase !== 'inventory') return
    expect(workspace.drafts.problem.categoriesById[categoryId]).toBeUndefined()
    expect(workspace.drafts.problem.itemsById[firstId]?.categoryId).toBeNull()
    expect(workspace.drafts.problem.itemsById[secondId]?.categoryId).toBeNull()
  })

  it('rejects grouping an item from another inventory', async () => {
    const { store } = createHarness()
    const userId = await createItem(store, 'user', 'User')
    const result = await store
      .getState()
      .actions.groupInventoryItems('problem', [userId], 'Wrong group', { x: 0, y: 0 })

    expect(result).toMatchObject({ ok: false, code: 'INVALID_KIND' })
  })

  it('moves a category and every contained item by one atomic delta', async () => {
    const { store } = createHarness()
    const itemId = await createItem(store, 'problem', 'Problem')
    const grouped = await store
      .getState()
      .actions.groupInventoryItems('problem', [itemId], 'Access', { x: 100, y: 100 })
    const categoryId = unwrap(grouped).categoryId

    unwrap(
      await store.getState().actions.updateInventoryCategory('problem', categoryId, {
        position: { x: 140, y: 170 },
      }),
    )
    let workspace = store.getState().workspace
    if (workspace.phase !== 'inventory') return
    expect(workspace.drafts.problem.itemsById[itemId]?.position).toEqual({
      x: 50,
      y: 90,
    })

    unwrap(await store.getState().actions.undo())
    workspace = store.getState().workspace
    if (workspace.phase !== 'inventory') return
    expect(workspace.drafts.problem.categoriesById[categoryId]?.position).toEqual({
      x: 100,
      y: 100,
    })
    expect(workspace.drafts.problem.itemsById[itemId]?.position).toEqual({
      x: 10,
      y: 20,
    })
  })

  it('moves and reparents cards in one history entry', async () => {
    const { store } = createHarness()
    const itemId = await createItem(store, 'problem', 'Problem')
    const categoryId = unwrap(
      await store.getState().actions.createInventoryCategory({
        kind: 'problem',
        title: 'Access',
        position: { x: 100, y: 100 },
      }),
    ).categoryId

    unwrap(
      await store
        .getState()
        .actions.moveInventoryItemsToCategory(
          'problem',
          { [itemId]: { x: 150, y: 160 } },
          categoryId,
        ),
    )
    let workspace = store.getState().workspace
    if (workspace.phase !== 'inventory') return
    expect(workspace.drafts.problem.itemsById[itemId]).toMatchObject({
      categoryId,
      position: { x: 150, y: 168 },
    })

    unwrap(await store.getState().actions.undo())
    workspace = store.getState().workspace
    if (workspace.phase !== 'inventory') return
    expect(workspace.drafts.problem.itemsById[itemId]).toMatchObject({
      categoryId: null,
      position: { x: 10, y: 20 },
    })
  })

  it('packs category-picker assignments into visible slots and grows the category', async () => {
    const { store } = createHarness()
    const itemIds = await Promise.all(
      ['First', 'Second', 'Third'].map((title) => createItem(store, 'problem', title)),
    )
    const categoryId = unwrap(
      await store.getState().actions.createInventoryCategory({
        kind: 'problem',
        title: 'Access',
        position: { x: 100, y: 100 },
        size: { width: 320, height: 260 },
      }),
    ).categoryId

    unwrap(
      await store
        .getState()
        .actions.assignItemsToCategory('problem', itemIds, categoryId),
    )
    let workspace = store.getState().workspace
    if (workspace.phase !== 'inventory') return
    const board = workspace.drafts.problem
    const category = board.categoriesById[categoryId]
    const positions = itemIds.map((itemId) => board.itemsById[itemId]?.position)
    expect(new Set(positions.map((position) => JSON.stringify(position))).size).toBe(3)
    expect(category?.size.height ?? 0).toBeGreaterThan(260)
    expect(
      itemIds.every((itemId) => board.itemsById[itemId]?.categoryId === categoryId),
    ).toBe(true)

    unwrap(await store.getState().actions.undo())
    workspace = store.getState().workspace
    if (workspace.phase !== 'inventory') return
    expect(
      itemIds.every(
        (itemId) => workspace.drafts.problem.itemsById[itemId]?.categoryId === null,
      ),
    ).toBe(true)
  })
})

describe('lock boundary and split history', () => {
  it('does not activate Phase 2 until the immutable checkpoint persists', async () => {
    const { store, storage } = createHarness()
    await createItem(store, 'user', 'User')
    const review = unwrap(store.getState().actions.prepareLockInventories())
    storage.failNextPersist('unavailable')

    const result = await store.getState().actions.commitLockInventories(review.token, {
      emptyKinds: review.emptyKinds,
      uncategorizedKinds: review.uncategorizedKinds,
    })

    expect(result).toMatchObject({ ok: false, code: 'PERSISTENCE_FAILED' })
    expect(store.getState().workspace.phase).toBe('inventory')
  })

  it('deep-freezes a detached checkpoint after a successful lock', async () => {
    const { store } = createHarness()
    const problemId = await createItem(store, 'problem', 'Problem')
    await lockInventories(store)
    const workspace = store.getState().workspace

    expect(workspace.phase).toBe('assembly')
    if (workspace.phase !== 'assembly') return
    expect(Object.isFrozen(workspace.checkpoint)).toBe(true)
    expect(Object.isFrozen(workspace.checkpoint.inventories.problem.itemsById)).toBe(
      true,
    )
    expect(workspace.checkpoint.inventories.problem.itemsById[problemId]?.title).toBe(
      'Problem',
    )
  })

  it('persists locked inventory viewport outside the checkpoint', async () => {
    const { store } = createHarness()
    await lockInventories(store)
    unwrap(
      await store
        .getState()
        .actions.setInventoryViewport('problem', { x: 80, y: 90, zoom: 1.5 }),
    )
    const workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    expect(workspace.assembly.lockedInventoryViewports.problem).toEqual({
      x: 80,
      y: 90,
      zoom: 1.5,
    })
    expect(workspace.checkpoint.inventories.problem.viewport).toEqual({
      x: 0,
      y: 0,
      zoom: 1,
    })
  })

  it('rejects every Phase 1 mutation path after lock', async () => {
    const { store } = createHarness()
    const userId = await createItem(store, 'user', 'User')
    const problemId = await createItem(store, 'problem', 'Problem')
    const categoryId = unwrap(
      await store.getState().actions.createInventoryCategory({
        kind: 'problem',
        title: 'Category',
        position: { x: 0, y: 0 },
      }),
    ).categoryId
    await lockInventories(store)

    const mutations = [
      () =>
        store.getState().actions.createInventoryItem({
          kind: 'problem',
          title: 'New',
          position: { x: 0, y: 0 },
        }),
      () =>
        store
          .getState()
          .actions.updateInventoryItem('problem', problemId, { title: 'Edit' }),
      () =>
        store.getState().actions.moveInventoryItems('problem', {
          [problemId]: { x: 1, y: 1 },
        }),
      () =>
        store
          .getState()
          .actions.moveInventoryItemsToCategory(
            'problem',
            { [problemId]: { x: 1, y: 1 } },
            categoryId,
          ),
      () => store.getState().actions.duplicateInventoryItems('problem', [problemId]),
      () =>
        store
          .getState()
          .actions.pasteInventoryItems('problem', [
            { title: 'Paste', position: { x: 0, y: 0 } },
          ]),
      () => store.getState().actions.deleteInventoryItems('problem', [problemId]),
      () =>
        store.getState().actions.createInventoryCategory({
          kind: 'problem',
          title: 'New',
          position: { x: 0, y: 0 },
        }),
      () =>
        store
          .getState()
          .actions.groupInventoryItems('problem', [problemId], 'New', { x: 0, y: 0 }),
      () =>
        store.getState().actions.updateInventoryCategory('problem', categoryId, {
          title: 'Edit',
        }),
      () =>
        store
          .getState()
          .actions.assignItemsToCategory('problem', [problemId], categoryId),
      () => store.getState().actions.removeItemsFromCategory('problem', [problemId]),
      () =>
        store.getState().actions.deleteCategoryPreservingItems('problem', categoryId),
    ]

    for (const mutate of mutations) {
      const result = await mutate()
      expect(result).toMatchObject({ ok: false, code: 'PHASE1_LOCKED' })
    }

    const workspace = store.getState().workspace
    expect(workspace.phase).toBe('assembly')
    if (workspace.phase !== 'assembly') return
    expect(workspace.checkpoint.inventories.user.itemsById[userId]).toBeDefined()
  })

  it('stops Undo at the immutable checkpoint after the first Phase 2 mutation', async () => {
    const { store } = createHarness()
    const userId = await createItem(store, 'user', 'User')
    await lockInventories(store)

    unwrap(await store.getState().actions.seedUserIsland(userId, { x: 100, y: 100 }))
    expect(store.getState().canUndo).toBe(true)
    unwrap(await store.getState().actions.undo())
    const floor = await store.getState().actions.undo()

    expect(floor).toMatchObject({ ok: false, code: 'HISTORY_BOUNDARY' })
    const workspace = store.getState().workspace
    expect(workspace.phase).toBe('assembly')
    if (workspace.phase !== 'assembly') return
    expect(workspace.assembly.islandOrder).toHaveLength(0)
    expect(workspace.assembly.firstContentMutationCommitted).toBe(true)
    expect(store.getState().canUndo).toBe(false)
  })
})

describe('Phase 2 local copies and layout', () => {
  it('edits a User island without changing its locked User source', async () => {
    const { store } = createHarness()
    const userId = await createItem(store, 'user', 'Locked User')
    await lockInventories(store)
    const islandId = unwrap(
      await store.getState().actions.seedUserIsland(userId, { x: 0, y: 0 }),
    ).islandId

    unwrap(
      await store.getState().actions.updateUserIsland(islandId, {
        userTitle: 'Local User title',
        userNote: 'Local context',
      }),
    )
    const workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    expect(workspace.assembly.islandsById[islandId]?.userTitle).toBe('Local User title')
    expect(workspace.checkpoint.inventories.user.itemsById[userId]?.title).toBe(
      'Locked User',
    )
  })

  it('enforces one source identity per island', async () => {
    const { store } = createHarness()
    const userId = await createItem(store, 'user', 'User')
    const problemId = await createItem(store, 'problem', 'Problem')
    await lockInventories(store)
    const islandId = unwrap(
      await store.getState().actions.seedUserIsland(userId, { x: 0, y: 0 }),
    ).islandId
    const generationBeforeDuplicateSeed = store.getState().generation
    const duplicateSeed = unwrap(
      await store.getState().actions.seedUserIsland(userId, { x: 200, y: 200 }),
    )
    expect(duplicateSeed).toMatchObject({ islandId, created: false })
    expect(store.getState().generation).toBe(generationBeforeDuplicateSeed)
    unwrap(await store.getState().actions.setAssemblyStage('add-problems'))

    const first = unwrap(
      await store
        .getState()
        .actions.addSourcesToIsland(islandId, 'problem', [problemId]),
    )
    const second = unwrap(
      await store
        .getState()
        .actions.addSourcesToIsland(islandId, 'problem', [problemId]),
    )

    expect(first.addedCopyIds).toHaveLength(1)
    expect(second).toEqual({
      addedCopyIds: [],
      alreadyPresentSourceIds: [problemId],
    })
    const workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    expect(
      Object.keys(workspace.assembly.islandsById[islandId]?.copiesById ?? {}),
    ).toHaveLength(1)
  })

  it('serializes concurrent assembly commands through one generation queue', async () => {
    const { store } = createHarness()
    const userId = await createItem(store, 'user', 'User')
    const firstProblemId = await createItem(store, 'problem', 'First problem')
    const secondProblemId = await createItem(store, 'problem', 'Second problem')
    await lockInventories(store)
    const islandId = unwrap(
      await store.getState().actions.seedUserIsland(userId, { x: 0, y: 0 }),
    ).islandId
    unwrap(await store.getState().actions.setAssemblyStage('add-problems'))
    const generationBefore = store.getState().generation

    const results = await Promise.all([
      store
        .getState()
        .actions.addSourcesToIsland(islandId, 'problem', [firstProblemId]),
      store
        .getState()
        .actions.addSourcesToIsland(islandId, 'problem', [secondProblemId]),
    ])

    expect(results.every((result) => result.ok)).toBe(true)
    expect(store.getState().generation).toBe(generationBefore + 2)
    expect(store.getState().externalWriteConflict).toBeNull()
    const workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    const sourceIds = Object.values(
      workspace.assembly.islandsById[islandId]?.copiesById ?? {},
    ).map((copy) => copy.sourceId)
    expect(sourceIds).toEqual([firstProblemId, secondProblemId])
  })

  it('keeps local copies independent from sources and sibling islands', async () => {
    const { store } = createHarness()
    const firstUserId = await createItem(store, 'user', 'First User')
    const secondUserId = await createItem(store, 'user', 'Second User')
    const problemId = await createItem(store, 'problem', 'Shared problem')
    await lockInventories(store)
    const firstIslandId = unwrap(
      await store.getState().actions.seedUserIsland(firstUserId, { x: 0, y: 0 }),
    ).islandId
    const secondIslandId = unwrap(
      await store.getState().actions.seedUserIsland(secondUserId, { x: 500, y: 0 }),
    ).islandId
    unwrap(await store.getState().actions.setAssemblyStage('add-problems'))
    const firstCopyId = unwrap(
      await store
        .getState()
        .actions.addSourcesToIsland(firstIslandId, 'problem', [problemId]),
    ).addedCopyIds[0]
    const secondCopyId = unwrap(
      await store
        .getState()
        .actions.addSourcesToIsland(secondIslandId, 'problem', [problemId]),
    ).addedCopyIds[0]
    if (!firstCopyId || !secondCopyId) throw new Error('Copies were not created')

    unwrap(
      await store.getState().actions.updateLocalCopy(firstIslandId, firstCopyId, {
        title: 'Tailored problem',
      }),
    )
    const workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    expect(workspace.checkpoint.inventories.problem.itemsById[problemId]?.title).toBe(
      'Shared problem',
    )
    expect(
      workspace.assembly.islandsById[secondIslandId]?.copiesById[secondCopyId]?.title,
    ).toBe('Shared problem')
  })

  it('reorders one local sheet atomically without touching the checkpoint', async () => {
    const { store } = createHarness()
    const userId = await createItem(store, 'user', 'User')
    const problemIds = await Promise.all([
      createItem(store, 'problem', 'First'),
      createItem(store, 'problem', 'Second'),
      createItem(store, 'problem', 'Third'),
    ])
    await lockInventories(store)
    const islandId = unwrap(
      await store.getState().actions.seedUserIsland(userId, { x: 0, y: 0 }),
    ).islandId
    unwrap(await store.getState().actions.setAssemblyStage('add-problems'))
    const copyIds = unwrap(
      await store
        .getState()
        .actions.addSourcesToIsland(islandId, 'problem', problemIds),
    ).addedCopyIds
    const beforeWorkspace = store.getState().workspace
    if (beforeWorkspace.phase !== 'assembly') return
    const checkpointBefore = structuredClone(beforeWorkspace.checkpoint)
    const generationBefore = store.getState().generation

    const invalid = unwrap(
      await store.getState().actions.reorderLocalCopy(islandId, 'problem', -1, 2),
    )
    expect(invalid.moved).toBe(false)
    expect(store.getState().generation).toBe(generationBefore)

    const reordered = unwrap(
      await store.getState().actions.reorderLocalCopy(islandId, 'problem', 0, 2),
    )
    expect(reordered.moved).toBe(true)
    expect(store.getState().generation).toBe(generationBefore + 1)
    let workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    expect(workspace.assembly.islandsById[islandId]?.copyOrder.problem).toEqual([
      copyIds[1],
      copyIds[2],
      copyIds[0],
    ])
    expect(workspace.checkpoint).toEqual(checkpointBefore)

    unwrap(await store.getState().actions.undo())
    workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    expect(workspace.assembly.islandsById[islandId]?.copyOrder.problem).toEqual(copyIds)
    unwrap(await store.getState().actions.redo())
    workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    expect(workspace.assembly.islandsById[islandId]?.copyOrder.problem).toEqual([
      copyIds[1],
      copyIds[2],
      copyIds[0],
    ])
  })

  it('does not persist or consume Undo for duplicate source actions', async () => {
    const { store } = createHarness()
    const userId = await createItem(store, 'user', 'User')
    const problemId = await createItem(store, 'problem', 'Problem')
    await lockInventories(store)
    const islandId = unwrap(
      await store.getState().actions.seedUserIsland(userId, { x: 0, y: 0 }),
    ).islandId
    unwrap(await store.getState().actions.setAssemblyStage('add-problems'))
    const copyId = unwrap(
      await store
        .getState()
        .actions.addSourcesToIsland(islandId, 'problem', [problemId]),
    ).addedCopyIds[0]
    const generationBeforeDuplicate = store.getState().generation

    const duplicate = unwrap(
      await store
        .getState()
        .actions.addSourcesToIsland(islandId, 'problem', [problemId]),
    )
    expect(duplicate).toMatchObject({
      addedCopyIds: [],
      alreadyPresentSourceIds: [problemId],
    })
    expect(store.getState().generation).toBe(generationBeforeDuplicate)

    unwrap(await store.getState().actions.undo())
    const workspace = store.getState().workspace
    if (workspace.phase !== 'assembly' || !copyId) return
    expect(workspace.assembly.islandsById[islandId]?.copiesById[copyId]).toBeUndefined()
    expect(workspace.assembly.islandsById[islandId]).toBeDefined()
  })

  it('restores exact freeform coordinates after Tidy', async () => {
    const { store } = createHarness()
    const firstUserId = await createItem(store, 'user', 'First User')
    const secondUserId = await createItem(store, 'user', 'Second User')
    await lockInventories(store)
    const firstIslandId = unwrap(
      await store.getState().actions.seedUserIsland(firstUserId, { x: 31, y: 47 }),
    ).islandId
    const secondIslandId = unwrap(
      await store.getState().actions.seedUserIsland(secondUserId, { x: 719, y: 233 }),
    ).islandId

    unwrap(await store.getState().actions.setAssemblyStage('add-monetization'))
    unwrap(await store.getState().actions.tidyIslands({ x: 100, y: 100 }))
    unwrap(await store.getState().actions.restoreFreeform())
    const workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    expect(workspace.assembly.layout.mode).toBe('freeform')
    expect(workspace.assembly.layout.freeformPositions).toEqual({
      [firstIslandId]: { x: 31, y: 47 },
      [secondIslandId]: { x: 719, y: 233 },
    })
  })

  it('folds automatic island displacement into the triggering Undo entry', async () => {
    const { store } = createHarness()
    const firstUserId = await createItem(store, 'user', 'First User')
    const secondUserId = await createItem(store, 'user', 'Second User')
    await lockInventories(store)
    const firstIslandId = unwrap(
      await store.getState().actions.seedUserIsland(firstUserId, { x: 0, y: 0 }),
    ).islandId
    const secondIslandId = unwrap(
      await store.getState().actions.seedUserIsland(secondUserId, { x: 0, y: 300 }),
    ).islandId

    unwrap(
      await store
        .getState()
        .actions.stabilizeAssemblyLayout(
          { [secondIslandId]: { x: 0, y: 520 } },
          store.getState().workspace.contentRevision,
        ),
    )
    let workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    expect(workspace.assembly.layout.freeformPositions[secondIslandId]).toEqual({
      x: 0,
      y: 520,
    })

    unwrap(await store.getState().actions.undo())
    workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    expect(workspace.assembly.islandsById[firstIslandId]).toBeDefined()
    expect(workspace.assembly.islandsById[secondIslandId]).toBeUndefined()

    unwrap(await store.getState().actions.redo())
    workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    expect(workspace.assembly.layout.freeformPositions[secondIslandId]).toEqual({
      x: 0,
      y: 520,
    })
  })

  it('restores composition when Undo reverses content-driven island growth', async () => {
    const { store } = createHarness()
    const problemId = await createItem(store, 'problem', 'Slow transfers')
    const firstUserId = await createItem(store, 'user', 'First User')
    const secondUserId = await createItem(store, 'user', 'Second User')
    await lockInventories(store)
    const firstIslandId = unwrap(
      await store.getState().actions.seedUserIsland(firstUserId, { x: 0, y: 0 }),
    ).islandId
    const secondIslandId = unwrap(
      await store.getState().actions.seedUserIsland(secondUserId, { x: 0, y: 300 }),
    ).islandId
    unwrap(await store.getState().actions.setAssemblyStage('add-problems'))
    const copyId = unwrap(
      await store
        .getState()
        .actions.addSourcesToIsland(firstIslandId, 'problem', [problemId]),
    ).addedCopyIds[0]
    if (!copyId) throw new Error('Expected a local copy.')
    unwrap(
      await store
        .getState()
        .actions.updateLocalCopy(firstIslandId, copyId, { note: 'Long note' }),
    )
    unwrap(
      await store
        .getState()
        .actions.stabilizeAssemblyLayout(
          { [secondIslandId]: { x: 0, y: 520 } },
          store.getState().workspace.contentRevision,
        ),
    )

    unwrap(await store.getState().actions.undo())
    let workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    expect(
      workspace.assembly.islandsById[firstIslandId]?.copiesById[copyId]?.note,
    ).toBe('')
    expect(workspace.assembly.layout.freeformPositions[secondIslandId]).toEqual({
      x: 0,
      y: 300,
    })

    unwrap(await store.getState().actions.redo())
    workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    expect(
      workspace.assembly.islandsById[firstIslandId]?.copiesById[copyId]?.note,
    ).toBe('Long note')
    expect(workspace.assembly.layout.freeformPositions[secondIslandId]).toEqual({
      x: 0,
      y: 520,
    })
  })

  it('returns to a seedable freeform board after deleting the last tidy island', async () => {
    const { store, storage } = createHarness()
    const userId = await createItem(store, 'user', 'User')
    await lockInventories(store)
    const islandId = unwrap(
      await store.getState().actions.seedUserIsland(userId, { x: 40, y: 60 }),
    ).islandId
    unwrap(await store.getState().actions.setAssemblyStage('add-monetization'))
    unwrap(await store.getState().actions.tidyIslands())
    unwrap(await store.getState().actions.deleteIsland(islandId))

    let workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    expect(workspace.assembly.layout).toMatchObject({
      mode: 'freeform',
      tidyPositions: null,
    })
    expect(workspace.assembly.islandOrder).toEqual([])

    const reloaded = createHarness(storage).store
    unwrap(await reloaded.getState().actions.hydrate())
    unwrap(await reloaded.getState().actions.setAssemblyStage('seed-users'))
    const replacement = unwrap(
      await reloaded.getState().actions.seedUserIsland(userId, { x: 100, y: 120 }),
    )
    expect(replacement.created).toBe(true)
  })

  it('packs uneven island heights without overlap using stable masonry columns', async () => {
    const { store } = createHarness()
    const islandIds = await seedTidyIslands(store, 5)
    const heights = {
      [islandIds[0] ?? 'missing-0']: 300,
      [islandIds[1] ?? 'missing-1']: 100,
      [islandIds[2] ?? 'missing-2']: 200,
      [islandIds[3] ?? 'missing-3']: 50,
      [islandIds[4] ?? 'missing-4']: 60,
    }

    unwrap(
      await store.getState().actions.tidyIslands(
        { x: 10, y: 20 },
        {
          columns: 2,
          columnWidth: 500,
          rowGap: 20,
          islandHeights: heights,
        },
      ),
    )
    let workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    const tidyPositions = workspace.assembly.layout.tidyPositions
    expect(tidyPositions).toEqual({
      [islandIds[0] ?? 'missing-0']: { x: 10, y: 20 },
      [islandIds[1] ?? 'missing-1']: { x: 510, y: 20 },
      [islandIds[2] ?? 'missing-2']: { x: 510, y: 140 },
      [islandIds[3] ?? 'missing-3']: { x: 10, y: 340 },
      [islandIds[4] ?? 'missing-4']: { x: 510, y: 360 },
    })
    expect(workspace.assembly.islandOrder).toEqual(islandIds)

    for (const columnX of [10, 510]) {
      const columnIds = islandIds
        .filter((islandId) => tidyPositions?.[islandId]?.x === columnX)
        .sort(
          (left, right) =>
            (tidyPositions?.[left]?.y ?? 0) - (tidyPositions?.[right]?.y ?? 0),
        )
      for (let index = 1; index < columnIds.length; index += 1) {
        const previousId = columnIds[index - 1]
        const currentId = columnIds[index]
        if (!previousId || !currentId) continue
        const previousBottom =
          (tidyPositions?.[previousId]?.y ?? 0) + (heights[previousId] ?? 330)
        expect(tidyPositions?.[currentId]?.y).toBeGreaterThanOrEqual(
          previousBottom + 20,
        )
      }
    }

    unwrap(await store.getState().actions.undo())
    workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    expect(workspace.assembly.layout).toMatchObject({
      mode: 'freeform',
      tidyPositions: null,
    })

    unwrap(await store.getState().actions.redo())
    workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    expect(workspace.assembly.layout.tidyPositions).toEqual(tidyPositions)
  })

  it('uses the stable leftmost column when masonry heights tie', async () => {
    const { store } = createHarness()
    const islandIds = await seedTidyIslands(store, 3)

    unwrap(
      await store.getState().actions.tidyIslands(
        { x: 0, y: 0 },
        {
          columns: 2,
          columnWidth: 400,
          rowGap: 10,
          islandHeights: Object.fromEntries(
            islandIds.map((islandId) => [islandId, 100]),
          ),
        },
      ),
    )
    const workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    expect(workspace.assembly.layout.tidyPositions).toEqual({
      [islandIds[0] ?? 'missing-0']: { x: 0, y: 0 },
      [islandIds[1] ?? 'missing-1']: { x: 400, y: 0 },
      [islandIds[2] ?? 'missing-2']: { x: 0, y: 110 },
    })
  })

  it('falls back to the legacy three-column geometry for malformed options', async () => {
    const { store } = createHarness()
    const islandIds = await seedTidyIslands(store, 4)

    unwrap(
      await store.getState().actions.tidyIslands(
        { x: Number.NaN, y: Number.POSITIVE_INFINITY },
        {
          columns: 0,
          columnWidth: -100,
          rowGap: -1,
          islandHeights: {
            [islandIds[0] ?? 'missing-0']: Number.NaN,
            [islandIds[1] ?? 'missing-1']: -20,
            [islandIds[2] ?? 'missing-2']: Number.POSITIVE_INFINITY,
            [islandIds[3] ?? 'missing-3']: 0,
          },
        },
      ),
    )
    const workspace = store.getState().workspace
    if (workspace.phase !== 'assembly') return
    expect(workspace.assembly.layout.tidyPositions).toEqual({
      [islandIds[0] ?? 'missing-0']: { x: 0, y: 0 },
      [islandIds[1] ?? 'missing-1']: { x: 440, y: 0 },
      [islandIds[2] ?? 'missing-2']: { x: 880, y: 0 },
      [islandIds[3] ?? 'missing-3']: { x: 0, y: 360 },
    })
  })
})

describe('history-free persistence and board recovery', () => {
  it('updates observable Undo and Redo availability', async () => {
    const { store } = createHarness()
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: false })
    await createItem(store, 'problem', 'Problem')
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false })
    unwrap(await store.getState().actions.undo())
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: true })
    unwrap(await store.getState().actions.redo())
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false })
  })

  it('reloads title stage viewport shelf and inventory inspection state', async () => {
    const storage = new MemoryWorkspaceStorageAdapter()
    const first = createHarness(storage).store
    const userId = await createItem(first, 'user', 'User')
    unwrap(await first.getState().actions.setTitle('Workshop map'))
    unwrap(
      await first
        .getState()
        .actions.setInventoryViewport('region', { x: 20, y: 30, zoom: 1.4 }),
    )
    await lockInventories(first)
    unwrap(await first.getState().actions.seedUserIsland(userId, { x: 0, y: 0 }))
    unwrap(await first.getState().actions.setActiveInventory('region'))
    unwrap(await first.getState().actions.setAssemblyStage('add-regions'))
    unwrap(
      await first.getState().actions.setAssemblyViewport({ x: 55, y: 65, zoom: 0.8 }),
    )
    unwrap(await first.getState().actions.setSourceShelfOpen(false))

    const second = createHarness(storage).store
    unwrap(await second.getState().actions.hydrate())
    const workspace = second.getState().workspace
    expect(workspace.title).toBe('Workshop map')
    expect(workspace.phase).toBe('assembly')
    if (workspace.phase !== 'assembly') return
    expect(workspace.assembly.activeStage).toBe('add-regions')
    expect(workspace.assembly.inspectedInventory).toBeNull()
    expect(workspace.assembly.viewport).toEqual({ x: 55, y: 65, zoom: 0.8 })
    expect(workspace.assembly.lockedInventoryViewports.region).toEqual({
      x: 20,
      y: 30,
      zoom: 1.4,
    })
    expect(workspace.assembly.sourceShelfOpen).toBe(false)
  })

  it('starts a blank board and restores the immediately prior generation', async () => {
    const { store, storage } = createHarness()
    const problemId = await createItem(store, 'problem', 'Keep me')

    unwrap(await store.getState().actions.startNewBoard('Blank board'))
    let workspace = store.getState().workspace
    expect(workspace.phase).toBe('inventory')
    if (workspace.phase !== 'inventory') return
    expect(Object.keys(workspace.drafts.problem.itemsById)).toHaveLength(0)
    expect(store.getState().canRestorePreviousBoard).toBe(true)

    const reloaded = createHarness(storage).store
    unwrap(await reloaded.getState().actions.hydrate())
    expect(reloaded.getState().canRestorePreviousBoard).toBe(true)
    unwrap(await reloaded.getState().actions.restorePreviousBoard())
    workspace = reloaded.getState().workspace
    if (workspace.phase !== 'inventory') return
    expect(workspace.drafts.problem.itemsById[problemId]?.title).toBe('Keep me')
    expect(reloaded.getState().canRestorePreviousBoard).toBe(false)
    expect(storage.getRawGenerations('test-workspace')).toHaveLength(3)
  })

  it('does not reset the current board when previous-generation recovery fails', async () => {
    const { store, storage } = createHarness()
    await createItem(store, 'problem', 'Prior board')
    unwrap(await store.getState().actions.startNewBoard('Current blank board'))
    storage.replaceRawGeneration('test-workspace', 1, {
      workspaceId: 'test-workspace',
      generation: 1,
      writerId: 'corrupt',
      savedAt: '2026-07-11T12:00:00Z',
      workspace: { malformed: true },
    })

    const result = await store.getState().actions.restorePreviousBoard()
    expect(result).toMatchObject({ ok: false, code: 'PERSISTENCE_FAILED' })
    const workspace = store.getState().workspace
    expect(workspace.title).toBe('Current blank board')
    expect(store.getState().canRestorePreviousBoard).toBe(true)
  })
})
