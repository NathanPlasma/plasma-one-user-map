import {
  applyPatches,
  enablePatches,
  produce,
  produceWithPatches,
  type Draft,
} from 'immer'
import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  createBlankAssembly,
  createBlankWorkspace,
  defaultClock,
  defaultIdFactory,
} from '../domain/factories'
import { assertWorkspaceInvariants, freezeCheckpoint } from '../domain/invariants'
import type {
  AssemblyPhaseState,
  CommandResult,
  InventoryKind,
  InventoryPhaseState,
  Viewport,
  WorkspaceState,
} from '../domain/types'
import { INVENTORY_KINDS } from '../domain/types'
import { parseWorkspaceCopy } from '../persistence/workspace-copy'
import { createAssemblyContentActions } from './assembly-actions'
import { fail, MutationRejected, succeed } from './command-utils'
import { SplitHistory } from './history'
import { createInventoryContentActions } from './inventory-actions'
import { acknowledgementCovers, buildLockReview } from './workspace-helpers'
import type {
  WorkspaceActions,
  WorkspaceStoreOptions,
  WorkspaceStoreState,
} from './workspace-actions'

enablePatches()

export function createWorkspaceStore(
  options: WorkspaceStoreOptions,
): StoreApi<WorkspaceStoreState> {
  const idFactory = options.idFactory ?? defaultIdFactory
  const clock = options.clock ?? defaultClock
  const workspaceId = options.workspaceId ?? 'default'
  const writerId = options.writerId ?? idFactory()
  const history = new SplitHistory()
  let queue: Promise<void> = Promise.resolve()

  const blankWorkspace = createBlankWorkspace({
    idFactory,
    clock,
    workspaceId,
  })

  let unsubscribeExternal = (): void => undefined

  const store = createStore<WorkspaceStoreState>()((set, get) => {
    const runExclusive = <T>(operation: () => Promise<T>): Promise<T> => {
      const result = queue.then(operation, operation)
      queue = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    }

    const syncAvailability = (): void => {
      const workspace = get().workspace
      const canUndo =
        workspace.phase === 'inventory'
          ? history.canUndoPhase1(workspace.activeInventory)
          : history.canUndoPhase2() || !workspace.assembly.firstContentMutationCommitted
      const canRedo =
        workspace.phase === 'inventory'
          ? history.canRedoPhase1(workspace.activeInventory)
          : history.canRedoPhase2()
      set({
        canUndo,
        canRedo,
        canRestorePreviousBoard: workspace.previousBoardGeneration !== null,
      })
    }

    const persistAndPublish = async (
      nextWorkspace: WorkspaceState,
    ): Promise<CommandResult<WorkspaceState>> => {
      const current = get()
      if (current.externalWriteConflict) {
        return fail(
          'EXTERNAL_WRITE_CONFLICT',
          'A newer generation was written in another tab.',
        )
      }

      try {
        assertWorkspaceInvariants(nextWorkspace)
      } catch (error) {
        return fail('PERSISTENCE_FAILED', String(error))
      }

      const persisted = await options.storage.persistGeneration({
        workspace: nextWorkspace,
        expectedGeneration: current.generation,
        writerId,
        savedAt: clock(),
      })
      if (!persisted.ok) {
        if (persisted.reason === 'conflict') {
          const notice = {
            workspaceId,
            generation: persisted.latestGeneration ?? current.generation + 1,
            writerId: 'unknown',
          }
          set({ externalWriteConflict: notice })
          return fail(
            'EXTERNAL_WRITE_CONFLICT',
            'Another tab committed a newer generation.',
          )
        }
        return fail('PERSISTENCE_FAILED', 'The generation could not be persisted.')
      }

      const published = freezeCheckpoint(structuredClone(persisted.record.workspace))
      set({
        workspace: published,
        generation: persisted.record.generation,
        verifiedGeneration: persisted.record.generation,
        hydrationStatus: 'ready',
        canRestorePreviousBoard: published.previousBoardGeneration !== null,
      })
      return succeed(published, published.contentRevision)
    }

    const runPhase1Mutation = <T>(
      kind: InventoryKind,
      label: string,
      recipe: (draft: Draft<InventoryPhaseState>) => T,
    ): Promise<CommandResult<T>> =>
      runExclusive(async () => {
        const current = get().workspace
        if (current.phase !== 'inventory') {
          return fail(
            'PHASE1_LOCKED',
            'Phase 1 is immutable after inventories are locked.',
          )
        }

        let producedValue: T | undefined
        try {
          const [contentNext, patches, inversePatches] = produceWithPatches(
            current,
            (draft) => {
              producedValue = recipe(draft)
            },
          )
          if (patches.length === 0) {
            return succeed(producedValue as T, current.contentRevision)
          }
          const next = produce(contentNext, (draft) => {
            draft.contentRevision = current.contentRevision + 1
            draft.updatedAt = clock()
          })
          const persisted = await persistAndPublish(next)
          if (!persisted.ok) return persisted
          history.pushPhase1(kind, { label, patches, inversePatches })
          syncAvailability()
          return succeed(producedValue as T, persisted.value.contentRevision)
        } catch (error) {
          if (error instanceof MutationRejected) {
            return fail(error.code, error.message)
          }
          throw error
        }
      })

    const runPhase2Mutation = <T>(
      label: string,
      recipe: (draft: Draft<AssemblyPhaseState>) => T,
    ): Promise<CommandResult<T>> =>
      runExclusive(async () => {
        const current = get().workspace
        if (current.phase !== 'assembly') {
          return fail('WRONG_PHASE', 'Assembly has not started.')
        }

        let producedValue: T | undefined
        try {
          const [contentNext, patches, inversePatches] = produceWithPatches(
            current,
            (draft) => {
              producedValue = recipe(draft)
            },
          )
          if (patches.length === 0) {
            return succeed(producedValue as T, current.contentRevision)
          }
          const firstMutation = !current.assembly.firstContentMutationCommitted
          const next = produce(contentNext, (draft) => {
            draft.contentRevision = current.contentRevision + 1
            draft.updatedAt = clock()
            if (firstMutation) draft.assembly.firstContentMutationCommitted = true
          })
          const persisted = await persistAndPublish(next)
          if (!persisted.ok) return persisted
          history.pushPhase2({ label, patches, inversePatches })
          if (firstMutation) history.clearPhase1()
          syncAvailability()
          return succeed(producedValue as T, persisted.value.contentRevision)
        } catch (error) {
          if (error instanceof MutationRejected) {
            return fail(error.code, error.message)
          }
          throw error
        }
      })

    const unlockWithinQueue = async (): Promise<CommandResult> => {
      const current = get().workspace
      if (current.phase !== 'assembly') {
        return fail('WRONG_PHASE', 'Inventories are not locked.')
      }
      if (
        current.assembly.firstContentMutationCommitted ||
        current.assembly.islandOrder.length > 0
      ) {
        return fail(
          'HISTORY_BOUNDARY',
          'The committed lock cannot be crossed after Phase 2 content begins.',
        )
      }

      const next: InventoryPhaseState = {
        schemaVersion: 1,
        workspaceId: current.workspaceId,
        title: current.title,
        createdAt: current.createdAt,
        updatedAt: clock(),
        contentRevision: current.contentRevision + 1,
        previousBoardGeneration: current.previousBoardGeneration,
        phase: 'inventory',
        activeInventory: 'problem',
        drafts: structuredClone(current.checkpoint.inventories),
      }
      const persisted = await persistAndPublish(next)
      if (!persisted.ok) return persisted
      history.clearPhase2()
      syncAvailability()
      return succeed(undefined, persisted.value.contentRevision)
    }

    const runHistoryFreeMutation = (
      recipe: (draft: Draft<WorkspaceState>) => void,
      historyTarget?:
        { phase: 'inventory'; kind: InventoryKind } | { phase: 'assembly' },
      expectedRevision?: number,
    ): Promise<CommandResult> =>
      runExclusive(async () => {
        try {
          const current = get().workspace
          if (
            expectedRevision !== undefined &&
            current.contentRevision !== expectedRevision
          ) {
            return succeed(undefined, current.contentRevision)
          }
          const [contentNext, patches, inversePatches] = produceWithPatches(
            current,
            recipe,
          )
          if (patches.length === 0) {
            return succeed(undefined, current.contentRevision)
          }
          const next = produce(contentNext, (draft) => {
            draft.contentRevision = current.contentRevision + 1
            draft.updatedAt = clock()
          })
          const persisted = await persistAndPublish(next)
          if (!persisted.ok) return persisted
          if (historyTarget?.phase === 'inventory') {
            history.amendLatestPhase1(historyTarget.kind, patches, inversePatches)
          } else if (historyTarget?.phase === 'assembly') {
            history.amendLatestPhase2(patches, inversePatches)
          }
          syncAvailability()
          return succeed(undefined, persisted.value.contentRevision)
        } catch (error) {
          if (error instanceof MutationRejected) {
            return fail(error.code, error.message)
          }
          throw error
        }
      })

    const inventoryActions = createInventoryContentActions({
      idFactory,
      runPhase1Mutation,
    })
    const assemblyActions = createAssemblyContentActions({
      idFactory,
      runPhase2Mutation,
    })

    const actions: WorkspaceActions = {
      hydrate: () =>
        runExclusive(async () => {
          set({ hydrationStatus: 'loading' })
          try {
            const loaded = await options.storage.loadLatest(workspaceId)
            if (!loaded.record) {
              history.clearAll()
              set({
                generation: loaded.headGeneration,
                verifiedGeneration: 0,
                hydrationStatus: 'ready',
                recoveredFromCorruption: loaded.recoveredFromCorruption,
                skippedGenerations: loaded.skippedGenerations,
                canUndo: false,
                canRedo: false,
                canRestorePreviousBoard: false,
              })
              return succeed('blank', get().workspace.contentRevision)
            }
            const workspace = freezeCheckpoint(structuredClone(loaded.record.workspace))
            history.clearAll()
            set({
              workspace,
              generation: loaded.headGeneration,
              verifiedGeneration: loaded.record.generation,
              hydrationStatus: 'ready',
              recoveredFromCorruption: loaded.recoveredFromCorruption,
              skippedGenerations: loaded.skippedGenerations,
              externalWriteConflict: null,
              canUndo:
                workspace.phase === 'assembly' &&
                !workspace.assembly.firstContentMutationCommitted,
              canRedo: false,
              canRestorePreviousBoard: workspace.previousBoardGeneration !== null,
            })
            return succeed('loaded', workspace.contentRevision)
          } catch {
            set({ hydrationStatus: 'error' })
            return fail('PERSISTENCE_FAILED', 'Workspace hydration failed.')
          }
        }),

      close: () => {
        unsubscribeExternal()
        options.storage.close()
      },

      setTitle: (title) =>
        runHistoryFreeMutation((draft) => {
          draft.title = title
        }),

      setActiveInventory: (kind) =>
        runHistoryFreeMutation((draft) => {
          if (draft.phase === 'inventory') {
            draft.activeInventory = kind
          } else {
            draft.assembly.inspectedInventory = kind
          }
        }),

      setInventoryViewport: (kind, viewport) =>
        runHistoryFreeMutation((draft) => {
          if (draft.phase === 'inventory') {
            draft.drafts[kind].viewport = viewport
          } else {
            draft.assembly.lockedInventoryViewports[kind] = viewport
          }
        }),

      setAssemblyStage: (stage) =>
        runHistoryFreeMutation((draft) => {
          if (draft.phase !== 'assembly') {
            throw new MutationRejected('WRONG_PHASE', 'Assembly has not started.')
          }
          draft.assembly.activeStage = stage
          draft.assembly.inspectedInventory = null
        }),

      setAssemblyViewport: (viewport) =>
        runHistoryFreeMutation((draft) => {
          if (draft.phase !== 'assembly') {
            throw new MutationRejected('WRONG_PHASE', 'Assembly has not started.')
          }
          draft.assembly.viewport = viewport
        }),

      setSourceShelfOpen: (open) =>
        runHistoryFreeMutation((draft) => {
          if (draft.phase !== 'assembly') {
            throw new MutationRejected('WRONG_PHASE', 'Assembly has not started.')
          }
          draft.assembly.sourceShelfOpen = open
        }),

      stabilizeInventoryLayout: (kind, categories, expectedRevision) =>
        runHistoryFreeMutation(
          (draft) => {
            if (draft.phase !== 'inventory') {
              throw new MutationRejected(
                'PHASE1_LOCKED',
                'Inventory layout is immutable after lock.',
              )
            }
            const board = draft.drafts[kind]
            for (const [categoryId, layout] of Object.entries(categories)) {
              const category = board.categoriesById[categoryId]
              if (!category) continue
              const delta = {
                x: layout.position.x - category.position.x,
                y: layout.position.y - category.position.y,
              }
              category.position = layout.position
              category.size = {
                width: Math.max(category.size.width, layout.size.width),
                height: Math.max(category.size.height, layout.size.height),
              }
              for (const item of Object.values(board.itemsById)) {
                if (item.categoryId !== categoryId) continue
                const itemPosition = layout.itemPositions[item.id] ?? item.position
                item.position = {
                  x: itemPosition.x + delta.x,
                  y: itemPosition.y + delta.y,
                }
              }
            }
          },
          { phase: 'inventory', kind },
          expectedRevision,
        ),

      stabilizeAssemblyLayout: (positions, expectedRevision) =>
        runHistoryFreeMutation(
          (draft) => {
            if (draft.phase !== 'assembly') {
              throw new MutationRejected('WRONG_PHASE', 'Assembly has not started.')
            }
            if (draft.assembly.layout.mode !== 'freeform') return
            for (const [islandId, position] of Object.entries(positions)) {
              if (!draft.assembly.islandsById[islandId]) continue
              draft.assembly.layout.freeformPositions[islandId] = position
            }
          },
          { phase: 'assembly' },
          expectedRevision,
        ),

      startNewBoard: (title) =>
        runExclusive(async () => {
          const current = get()
          const blank = createBlankWorkspace({
            idFactory,
            clock,
            workspaceId,
            title,
          })
          const next = produce(blank, (draft) => {
            draft.contentRevision = current.workspace.contentRevision + 1
            draft.previousBoardGeneration =
              current.verifiedGeneration > 0 ? current.verifiedGeneration : null
          })
          const persisted = await persistAndPublish(next)
          if (!persisted.ok) return persisted
          history.clearAll()
          syncAvailability()
          return succeed(undefined, persisted.value.contentRevision)
        }),

      openWorkspaceCopy: (copy) =>
        runExclusive(async () => {
          let imported: WorkspaceState
          try {
            imported = parseWorkspaceCopy(copy).copy.workspace
          } catch {
            return fail(
              'INVALID_COPY',
              'That file is not a valid Plasma One User Map copy.',
            )
          }

          const current = get()
          const now = clock()
          const next = produce(imported, (draft) => {
            draft.workspaceId = workspaceId
            draft.createdAt = now
            draft.updatedAt = now
            draft.contentRevision = current.workspace.contentRevision + 1
            draft.previousBoardGeneration =
              current.verifiedGeneration > 0 ? current.verifiedGeneration : null
          })
          const persisted = await persistAndPublish(next)
          if (!persisted.ok) return persisted
          history.clearAll()
          syncAvailability()
          return succeed(undefined, persisted.value.contentRevision)
        }),

      restorePreviousBoard: () =>
        runExclusive(async () => {
          const current = get()
          const previousGeneration = current.workspace.previousBoardGeneration
          if (previousGeneration === null) {
            return fail('NOT_FOUND', 'No previous board is available.')
          }
          const previous = await options.storage.loadGeneration(
            workspaceId,
            previousGeneration,
          )
          if (!previous) {
            return fail(
              'PERSISTENCE_FAILED',
              'The previous board generation could not be verified.',
            )
          }
          const next = produce(previous.workspace, (draft) => {
            draft.contentRevision = current.workspace.contentRevision + 1
            draft.updatedAt = clock()
            draft.previousBoardGeneration = null
          })
          const persisted = await persistAndPublish(next)
          if (!persisted.ok) return persisted
          history.clearAll()
          syncAvailability()
          return succeed(undefined, persisted.value.contentRevision)
        }),

      ...inventoryActions,

      prepareLockInventories: () => {
        const current = get().workspace
        if (current.phase !== 'inventory') {
          return fail('PHASE1_LOCKED', 'Inventories are already locked.')
        }
        return succeed(buildLockReview(current), current.contentRevision)
      },

      commitLockInventories: (token, acknowledgements) =>
        runExclusive(async () => {
          const current = get().workspace
          if (current.phase !== 'inventory') {
            return fail('PHASE1_LOCKED', 'Inventories are already locked.')
          }
          const review = buildLockReview(current)
          if (review.token !== token) {
            return fail(
              'STALE_LOCK_REVIEW',
              'Inventory content changed after the lock review.',
            )
          }
          if (
            !acknowledgementCovers(review.emptyKinds, acknowledgements.emptyKinds) ||
            !acknowledgementCovers(
              review.uncategorizedKinds,
              acknowledgements.uncategorizedKinds,
            )
          ) {
            return fail(
              'LOCK_ACK_REQUIRED',
              'Empty and uncategorized inventories must be acknowledged.',
            )
          }

          const checkpointId = idFactory()
          const checkpoint = {
            id: checkpointId,
            revision: 1,
            lockedAt: clock(),
            inventories: structuredClone(current.drafts),
          }
          const next: AssemblyPhaseState = {
            schemaVersion: 1,
            workspaceId: current.workspaceId,
            title: current.title,
            createdAt: current.createdAt,
            updatedAt: clock(),
            contentRevision: current.contentRevision + 1,
            previousBoardGeneration: current.previousBoardGeneration,
            phase: 'assembly',
            checkpoint,
            assembly: createBlankAssembly(
              checkpointId,
              Object.fromEntries(
                INVENTORY_KINDS.map((kind) => [
                  kind,
                  structuredClone(current.drafts[kind].viewport),
                ]),
              ) as Record<InventoryKind, Viewport>,
            ),
          }
          const persisted = await persistAndPublish(next)
          if (!persisted.ok) return persisted
          history.clearPhase2()
          syncAvailability()
          return succeed({ checkpointId }, persisted.value.contentRevision)
        }),

      unlockInventoriesBeforeAssembly: () => runExclusive(unlockWithinQueue),
      ...assemblyActions,

      undo: () =>
        runExclusive(async () => {
          const current = get().workspace
          if (current.phase === 'inventory') {
            const kind = current.activeInventory
            const entry = history.takePhase1Undo(kind)
            if (!entry) {
              return fail('HISTORY_BOUNDARY', 'Nothing to undo.')
            }
            const patched = applyPatches(current, entry.inversePatches)
            const next = produce(patched, (draft) => {
              draft.contentRevision = current.contentRevision + 1
              draft.updatedAt = clock()
            })
            const persisted = await persistAndPublish(next)
            if (!persisted.ok) {
              history.restorePhase1Undo(kind, entry)
              return persisted
            }
            history.commitPhase1Undo(kind, entry)
            syncAvailability()
            return succeed(undefined, persisted.value.contentRevision)
          }

          const entry = history.takePhase2Undo()
          if (!entry) {
            if (!current.assembly.firstContentMutationCommitted) {
              return unlockWithinQueue()
            }
            return fail(
              'HISTORY_BOUNDARY',
              'Undo cannot cross the committed Phase 1 checkpoint.',
            )
          }
          const patched = applyPatches(current, entry.inversePatches)
          const next = produce(patched, (draft) => {
            draft.contentRevision = current.contentRevision + 1
            draft.updatedAt = clock()
            draft.assembly.firstContentMutationCommitted = true
          })
          const persisted = await persistAndPublish(next)
          if (!persisted.ok) {
            history.restorePhase2Undo(entry)
            return persisted
          }
          history.commitPhase2Undo(entry)
          syncAvailability()
          return succeed(undefined, persisted.value.contentRevision)
        }),

      redo: () =>
        runExclusive(async () => {
          const current = get().workspace
          if (current.phase === 'inventory') {
            const kind = current.activeInventory
            const entry = history.takePhase1Redo(kind)
            if (!entry) return fail('HISTORY_BOUNDARY', 'Nothing to redo.')
            const patched = applyPatches(current, entry.patches)
            const next = produce(patched, (draft) => {
              draft.contentRevision = current.contentRevision + 1
              draft.updatedAt = clock()
            })
            const persisted = await persistAndPublish(next)
            if (!persisted.ok) {
              history.restorePhase1Redo(kind, entry)
              return persisted
            }
            history.commitPhase1Redo(kind, entry)
            syncAvailability()
            return succeed(undefined, persisted.value.contentRevision)
          }

          const entry = history.takePhase2Redo()
          if (!entry) return fail('HISTORY_BOUNDARY', 'Nothing to redo.')
          const patched = applyPatches(current, entry.patches)
          const next = produce(patched, (draft) => {
            draft.contentRevision = current.contentRevision + 1
            draft.updatedAt = clock()
            draft.assembly.firstContentMutationCommitted = true
          })
          const persisted = await persistAndPublish(next)
          if (!persisted.ok) {
            history.restorePhase2Redo(entry)
            return persisted
          }
          history.commitPhase2Redo(entry)
          syncAvailability()
          return succeed(undefined, persisted.value.contentRevision)
        }),
    }

    return {
      workspace: blankWorkspace,
      generation: 0,
      verifiedGeneration: 0,
      hydrationStatus: 'idle',
      recoveredFromCorruption: false,
      skippedGenerations: [],
      externalWriteConflict: null,
      canUndo: false,
      canRedo: false,
      canRestorePreviousBoard: false,
      actions,
    }
  })

  unsubscribeExternal = options.storage.subscribeToNewerWrites((notice) => {
    const current = store.getState()
    if (
      notice.workspaceId === workspaceId &&
      notice.writerId !== writerId &&
      notice.generation > current.generation
    ) {
      store.setState({ externalWriteConflict: notice })
    }
  })

  return store
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>
export type * from './workspace-actions'
