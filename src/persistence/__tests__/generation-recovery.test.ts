import { describe, expect, it } from 'vitest'
import { createWorkspaceStore } from '../../state/workspace-store'
import { MemoryWorkspaceStorageAdapter } from '../memory-storage-adapter'

function createStore(storage: MemoryWorkspaceStorageAdapter, writerId: string) {
  let id = 0
  return createWorkspaceStore({
    storage,
    workspaceId: 'recovery-workspace',
    writerId,
    idFactory: () => `${writerId}-id-${id++}`,
    clock: () => '2026-07-11T12:00:00Z',
  })
}

describe('immutable generation recovery', () => {
  it('falls back to the last valid generation without deleting corruption', async () => {
    const storage = new MemoryWorkspaceStorageAdapter()
    const first = createStore(storage, 'writer-a')
    const created = await first.getState().actions.createInventoryItem({
      kind: 'problem',
      title: 'Persisted problem',
      position: { x: 10, y: 20 },
    })
    expect(created.ok).toBe(true)
    storage.injectRawGeneration('recovery-workspace', {
      workspaceId: 'recovery-workspace',
      generation: 2,
      writerId: 'writer-b',
      savedAt: '2026-07-11T12:01:00Z',
      workspace: { malformed: true },
    })

    const recovered = createStore(storage, 'writer-c')
    const hydration = await recovered.getState().actions.hydrate()

    expect(hydration.ok).toBe(true)
    expect(recovered.getState().generation).toBe(2)
    expect(recovered.getState().recoveredFromCorruption).toBe(true)
    expect(recovered.getState().skippedGenerations).toEqual([2])
    const workspace = recovered.getState().workspace
    expect(workspace.phase).toBe('inventory')
    if (workspace.phase !== 'inventory') return
    expect(Object.values(workspace.drafts.problem.itemsById)[0]?.title).toBe(
      'Persisted problem',
    )
    expect(storage.getRawGenerations('recovery-workspace')).toHaveLength(2)

    const afterRecovery = await recovered.getState().actions.setTitle('Recovered')
    expect(afterRecovery.ok).toBe(true)
    expect(recovered.getState().generation).toBe(3)
  })

  it('signals a newer write from another tab and rejects local mutation', async () => {
    const storage = new MemoryWorkspaceStorageAdapter()
    const store = createStore(storage, 'writer-a')
    storage.emitNewerWrite({
      workspaceId: 'recovery-workspace',
      generation: 1,
      writerId: 'writer-b',
    })

    expect(store.getState().externalWriteConflict).toEqual({
      workspaceId: 'recovery-workspace',
      generation: 1,
      writerId: 'writer-b',
    })
    const result = await store.getState().actions.setTitle('Blocked')
    expect(result).toMatchObject({
      ok: false,
      code: 'EXTERNAL_WRITE_CONFLICT',
    })
  })

  it('opens a blank board without claiming a valid recovery when all generations are corrupt', async () => {
    const storage = new MemoryWorkspaceStorageAdapter()
    storage.injectRawGeneration('recovery-workspace', {
      workspaceId: 'recovery-workspace',
      generation: 1,
      writerId: 'writer-a',
      savedAt: '2026-07-11T12:01:00Z',
      workspace: { malformed: true },
    })
    const recovered = createStore(storage, 'writer-b')

    const hydration = await recovered.getState().actions.hydrate()

    expect(hydration).toMatchObject({ ok: true, value: 'blank' })
    expect(recovered.getState()).toMatchObject({
      generation: 1,
      verifiedGeneration: 0,
      recoveredFromCorruption: true,
      skippedGenerations: [1],
    })
    expect(storage.getRawGenerations('recovery-workspace')).toHaveLength(1)
  })

  it('points New board recovery at the last verified generation after corruption', async () => {
    const storage = new MemoryWorkspaceStorageAdapter()
    const first = createStore(storage, 'writer-a')
    await first.getState().actions.createInventoryItem({
      kind: 'problem',
      title: 'Verified board',
      position: { x: 0, y: 0 },
    })
    storage.injectRawGeneration('recovery-workspace', {
      workspaceId: 'recovery-workspace',
      generation: 2,
      writerId: 'writer-b',
      savedAt: '2026-07-11T12:01:00Z',
      workspace: { malformed: true },
    })
    const recovered = createStore(storage, 'writer-c')
    await recovered.getState().actions.hydrate()

    const started = await recovered.getState().actions.startNewBoard()
    expect(started.ok).toBe(true)
    expect(recovered.getState().workspace.previousBoardGeneration).toBe(1)
    const restored = await recovered.getState().actions.restorePreviousBoard()
    expect(restored.ok).toBe(true)
    const workspace = recovered.getState().workspace
    expect(workspace.phase).toBe('inventory')
    if (workspace.phase !== 'inventory') return
    expect(Object.values(workspace.drafts.problem.itemsById)[0]?.title).toBe(
      'Verified board',
    )
  })
})
