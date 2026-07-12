import { describe, expect, it } from 'vitest'

import type { CommandResult, InventoryKind } from '../../domain/types'
import { MemoryWorkspaceStorageAdapter } from '../../persistence/memory-storage-adapter'
import { createWorkspaceStore, type WorkspaceStore } from '../workspace-store'

function unwrap<T>(result: CommandResult<T>): T {
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`)
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
    clock: () => `2026-07-12T13:00:${String(tick++).padStart(2, '0')}Z`,
  })
  return { storage, store }
}

async function createItem(
  store: WorkspaceStore,
  kind: InventoryKind,
  title: string,
): Promise<string> {
  return unwrap(
    await store.getState().actions.createInventoryItem({
      kind,
      title,
      position: { x: 10, y: 20 },
    }),
  ).itemId
}

describe('workspace copy import', () => {
  it('writes one generation and restores the displaced board', async () => {
    const { store, storage } = createHarness()
    await createItem(store, 'problem', 'Displaced problem')
    unwrap(await store.getState().actions.setTitle('Displaced board'))
    const displacedGeneration = store.getState().verifiedGeneration

    const source = createHarness().store
    await createItem(source, 'problem', 'Imported problem')
    unwrap(await source.getState().actions.setTitle('Imported board'))
    const imported = structuredClone(source.getState().workspace)
    imported.workspaceId = 'foreign-workspace'
    imported.previousBoardGeneration = 999

    unwrap(
      await store.getState().actions.openWorkspaceCopy({
        formatVersion: 1,
        exportedAt: '2026-07-12T13:00:00.000Z',
        workspace: imported,
      }),
    )

    let workspace = store.getState().workspace
    expect(workspace).toMatchObject({
      workspaceId: 'test-workspace',
      title: 'Imported board',
      previousBoardGeneration: displacedGeneration,
    })
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: false })
    expect(storage.getRawGenerations('test-workspace')).toHaveLength(3)

    const reloaded = createHarness(storage).store
    unwrap(await reloaded.getState().actions.hydrate())
    expect(reloaded.getState().workspace.title).toBe('Imported board')
    unwrap(await reloaded.getState().actions.restorePreviousBoard())
    workspace = reloaded.getState().workspace
    expect(workspace.title).toBe('Displaced board')
  })

  it('leaves the current board untouched when validation or persistence fails', async () => {
    const { store, storage } = createHarness()
    await createItem(store, 'problem', 'Keep current')
    const before = structuredClone(store.getState().workspace)
    const beforeGeneration = store.getState().generation
    expect(store.getState().canUndo).toBe(true)

    const invalid = await store
      .getState()
      .actions.openWorkspaceCopy({ formatVersion: 2 })
    expect(invalid).toMatchObject({ ok: false, code: 'INVALID_COPY' })
    expect(store.getState().workspace).toEqual(before)
    expect(store.getState().canUndo).toBe(true)

    storage.failNextPersist('unavailable')
    const failed = await store.getState().actions.openWorkspaceCopy({
      formatVersion: 1,
      exportedAt: '2026-07-12T13:00:00.000Z',
      workspace: before,
    })
    expect(failed).toMatchObject({ ok: false, code: 'PERSISTENCE_FAILED' })
    expect(store.getState().workspace).toEqual(before)
    expect(store.getState().generation).toBe(beforeGeneration)
    expect(store.getState().canUndo).toBe(true)

    storage.failNextPersist('conflict')
    const conflicted = await store.getState().actions.openWorkspaceCopy({
      formatVersion: 1,
      exportedAt: '2026-07-12T13:00:00.000Z',
      workspace: before,
    })
    expect(conflicted).toMatchObject({ ok: false, code: 'EXTERNAL_WRITE_CONFLICT' })
    expect(store.getState().workspace).toEqual(before)
    expect(store.getState().generation).toBe(beforeGeneration)
    expect(store.getState().canUndo).toBe(true)
  })
})
