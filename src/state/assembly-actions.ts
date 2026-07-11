import type { Draft } from 'immer'
import { createUserIsland } from '../domain/factories'
import type { AssemblyPhaseState, CommandResult, IdFactory } from '../domain/types'
import { MutationRejected } from './command-utils'
import type { WorkspaceActions } from './workspace-actions'
import {
  computeTidyPositions,
  normalizeCopyOrder,
  stageForIngredient,
} from './workspace-helpers'

type AssemblyActionKey =
  | 'seedUserIsland'
  | 'createUserVariant'
  | 'moveIsland'
  | 'updateUserIsland'
  | 'deleteIsland'
  | 'addSourcesToIsland'
  | 'updateLocalCopy'
  | 'reorderLocalCopy'
  | 'removeLocalCopy'
  | 'moveLocalCopyToIsland'
  | 'duplicateLocalCopyToIsland'
  | 'tidyIslands'
  | 'restoreFreeform'

export type AssemblyContentActions = Pick<WorkspaceActions, AssemblyActionKey>

type RunPhase2Mutation = <T>(
  label: string,
  recipe: (draft: Draft<AssemblyPhaseState>) => T,
) => Promise<CommandResult<T>>

export function createAssemblyContentActions(options: {
  idFactory: IdFactory
  runPhase2Mutation: RunPhase2Mutation
}): AssemblyContentActions {
  const { idFactory, runPhase2Mutation } = options

  return {
    seedUserIsland: (sourceUserId, position) =>
      runPhase2Mutation('Seed User island', (draft) => {
        if (draft.assembly.activeStage !== 'seed-users') {
          throw new MutationRejected(
            'INVALID_STAGE',
            'Users can only be seeded during Seed users.',
          )
        }
        const existing = Object.values(draft.assembly.islandsById).find(
          (island) =>
            island.sourceUserId === sourceUserId && island.variantName === null,
        )
        if (existing) return { islandId: existing.id, created: false }

        const source = draft.checkpoint.inventories.user.itemsById[sourceUserId]
        if (!source) {
          throw new MutationRejected('NOT_FOUND', 'User source not found.')
        }
        const islandId = idFactory()
        draft.assembly.islandsById[islandId] = createUserIsland({
          id: islandId,
          checkpointId: draft.checkpoint.id,
          sourceUserId,
          title: source.title,
          note: source.note,
        })
        draft.assembly.islandOrder.push(islandId)
        draft.assembly.layout.freeformPositions[islandId] = position
        return { islandId, created: true }
      }),

    createUserVariant: (sourceUserId, variantName, position) =>
      runPhase2Mutation('Create User variant', (draft) => {
        if (draft.assembly.activeStage !== 'seed-users') {
          throw new MutationRejected(
            'INVALID_STAGE',
            'User variants can only be created during Seed users.',
          )
        }
        const normalizedName = variantName.trim()
        if (!normalizedName) {
          throw new MutationRejected(
            'VARIANT_NAME_REQUIRED',
            'A User variant requires a name.',
          )
        }
        const duplicate = Object.values(draft.assembly.islandsById).some(
          (island) =>
            island.sourceUserId === sourceUserId &&
            island.variantName?.toLowerCase() === normalizedName.toLowerCase(),
        )
        if (duplicate) {
          throw new MutationRejected(
            'DUPLICATE_SOURCE',
            'This named User variant already exists.',
          )
        }
        const source = draft.checkpoint.inventories.user.itemsById[sourceUserId]
        if (!source) {
          throw new MutationRejected('NOT_FOUND', 'User source not found.')
        }
        const islandId = idFactory()
        draft.assembly.islandsById[islandId] = createUserIsland({
          id: islandId,
          checkpointId: draft.checkpoint.id,
          sourceUserId,
          title: source.title,
          note: source.note,
          variantName: normalizedName,
        })
        draft.assembly.islandOrder.push(islandId)
        draft.assembly.layout.freeformPositions[islandId] = position
        return { islandId }
      }),

    moveIsland: (islandId, position) =>
      runPhase2Mutation('Move User island', (draft) => {
        if (!draft.assembly.islandsById[islandId]) {
          throw new MutationRejected('NOT_FOUND', 'User island not found.')
        }
        if (draft.assembly.layout.mode === 'tidy') {
          if (!draft.assembly.layout.tidyPositions) {
            throw new MutationRejected(
              'INVALID_PARENTAGE',
              'Tidy positions are unavailable.',
            )
          }
          draft.assembly.layout.tidyPositions[islandId] = position
        } else {
          draft.assembly.layout.freeformPositions[islandId] = position
        }
        return undefined
      }),

    updateUserIsland: (islandId, patch) =>
      runPhase2Mutation('Update User island', (draft) => {
        const island = draft.assembly.islandsById[islandId]
        if (!island) {
          throw new MutationRejected('NOT_FOUND', 'User island not found.')
        }
        if (patch.variantName !== undefined) {
          const normalized = patch.variantName?.trim() ?? null
          if (normalized === '') {
            throw new MutationRejected(
              'VARIANT_NAME_REQUIRED',
              'A User variant requires a name.',
            )
          }
          if (
            normalized === null &&
            Object.values(draft.assembly.islandsById).some(
              (candidate) =>
                candidate.id !== islandId &&
                candidate.sourceUserId === island.sourceUserId &&
                candidate.variantName === null,
            )
          ) {
            throw new MutationRejected(
              'DUPLICATE_SOURCE',
              'This User already has a normal island.',
            )
          }
          if (
            normalized !== null &&
            Object.values(draft.assembly.islandsById).some(
              (candidate) =>
                candidate.id !== islandId &&
                candidate.sourceUserId === island.sourceUserId &&
                candidate.variantName?.toLowerCase() === normalized.toLowerCase(),
            )
          ) {
            throw new MutationRejected(
              'DUPLICATE_SOURCE',
              'This named User variant already exists.',
            )
          }
          island.variantName = normalized
        }
        if (patch.userTitle !== undefined) island.userTitle = patch.userTitle
        if (patch.userNote !== undefined) island.userNote = patch.userNote
        return undefined
      }),

    deleteIsland: (islandId) =>
      runPhase2Mutation('Delete User island', (draft) => {
        if (!draft.assembly.islandsById[islandId]) {
          throw new MutationRejected('NOT_FOUND', 'User island not found.')
        }
        delete draft.assembly.islandsById[islandId]
        draft.assembly.islandOrder = draft.assembly.islandOrder.filter(
          (id) => id !== islandId,
        )
        delete draft.assembly.layout.freeformPositions[islandId]
        if (draft.assembly.layout.tidyPositions) {
          delete draft.assembly.layout.tidyPositions[islandId]
        }
        if (draft.assembly.islandOrder.length === 0) {
          draft.assembly.layout.mode = 'freeform'
          draft.assembly.layout.tidyPositions = null
        }
        return undefined
      }),

    addSourcesToIsland: (islandId, kind, sourceIds) =>
      runPhase2Mutation(`Add ${kind} sources`, (draft) => {
        if (draft.assembly.activeStage !== stageForIngredient(kind)) {
          throw new MutationRejected(
            'INVALID_STAGE',
            `${kind} sources cannot be added during this pass.`,
          )
        }
        const island = draft.assembly.islandsById[islandId]
        if (!island) {
          throw new MutationRejected('NOT_FOUND', 'User island not found.')
        }
        const existingSourceIds = new Set(
          Object.values(island.copiesById).map((copy) => copy.sourceId),
        )
        const addedCopyIds: string[] = []
        const alreadyPresentSourceIds: string[] = []

        for (const sourceId of sourceIds) {
          if (existingSourceIds.has(sourceId)) {
            alreadyPresentSourceIds.push(sourceId)
            continue
          }
          const source = draft.checkpoint.inventories[kind].itemsById[sourceId]
          if (!source) {
            throw new MutationRejected('NOT_FOUND', `${kind} source not found.`)
          }
          const copyId = idFactory()
          island.copiesById[copyId] = {
            id: copyId,
            checkpointId: draft.checkpoint.id,
            sourceId,
            sourceCategoryId: source.categoryId,
            kind,
            title: source.title,
            note: source.note,
            order: island.copyOrder[kind].length,
          }
          island.copyOrder[kind].push(copyId)
          existingSourceIds.add(sourceId)
          addedCopyIds.push(copyId)
        }
        return { addedCopyIds, alreadyPresentSourceIds }
      }),

    updateLocalCopy: (islandId, copyId, patch) =>
      runPhase2Mutation('Update local copy', (draft) => {
        const copy = draft.assembly.islandsById[islandId]?.copiesById[copyId]
        if (!copy) {
          throw new MutationRejected('NOT_FOUND', 'Local copy not found.')
        }
        if (patch.title !== undefined) copy.title = patch.title
        if (patch.note !== undefined) copy.note = patch.note
        return undefined
      }),

    reorderLocalCopy: (islandId, kind, fromIndex, toIndex) =>
      runPhase2Mutation('Reorder local copy', (draft) => {
        const island = draft.assembly.islandsById[islandId]
        if (!island) {
          throw new MutationRejected('NOT_FOUND', 'User island not found.')
        }
        const order = island.copyOrder[kind]
        if (
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= order.length ||
          toIndex >= order.length ||
          fromIndex === toIndex
        ) {
          return { moved: false }
        }

        const [copyId] = order.splice(fromIndex, 1)
        if (!copyId) return { moved: false }
        order.splice(toIndex, 0, copyId)
        normalizeCopyOrder(island)
        return { moved: true }
      }),

    removeLocalCopy: (islandId, copyId) =>
      runPhase2Mutation('Remove local copy', (draft) => {
        const island = draft.assembly.islandsById[islandId]
        const copy = island?.copiesById[copyId]
        if (!island || !copy) {
          throw new MutationRejected('NOT_FOUND', 'Local copy not found.')
        }
        delete island.copiesById[copyId]
        island.copyOrder[copy.kind] = island.copyOrder[copy.kind].filter(
          (id) => id !== copyId,
        )
        normalizeCopyOrder(island)
        return undefined
      }),

    moveLocalCopyToIsland: (sourceIslandId, targetIslandId, copyId) =>
      runPhase2Mutation('Move local copy to island', (draft) => {
        const sourceIsland = draft.assembly.islandsById[sourceIslandId]
        const targetIsland = draft.assembly.islandsById[targetIslandId]
        const copy = sourceIsland?.copiesById[copyId]
        if (!sourceIsland || !targetIsland || !copy) {
          throw new MutationRejected('NOT_FOUND', 'Local copy or island not found.')
        }
        if (
          Object.values(targetIsland.copiesById).some(
            (candidate) => candidate.sourceId === copy.sourceId,
          )
        ) {
          throw new MutationRejected(
            'TARGET_CONFLICT',
            'The target island already contains this source.',
          )
        }
        delete sourceIsland.copiesById[copyId]
        sourceIsland.copyOrder[copy.kind] = sourceIsland.copyOrder[copy.kind].filter(
          (id) => id !== copyId,
        )
        targetIsland.copiesById[copyId] = copy
        targetIsland.copyOrder[copy.kind].push(copyId)
        normalizeCopyOrder(sourceIsland)
        normalizeCopyOrder(targetIsland)
        return undefined
      }),

    duplicateLocalCopyToIsland: (sourceIslandId, targetIslandId, copyId) => {
      const newCopyId = idFactory()
      return runPhase2Mutation('Duplicate local copy to island', (draft) => {
        if (sourceIslandId === targetIslandId) {
          throw new MutationRejected(
            'TARGET_CONFLICT',
            'Explicit Duplicate must target another island.',
          )
        }
        const sourceIsland = draft.assembly.islandsById[sourceIslandId]
        const targetIsland = draft.assembly.islandsById[targetIslandId]
        const sourceCopy = sourceIsland?.copiesById[copyId]
        if (!sourceIsland || !targetIsland || !sourceCopy) {
          throw new MutationRejected('NOT_FOUND', 'Local copy or island not found.')
        }
        if (
          Object.values(targetIsland.copiesById).some(
            (candidate) => candidate.sourceId === sourceCopy.sourceId,
          )
        ) {
          throw new MutationRejected(
            'TARGET_CONFLICT',
            'The target island already contains this source.',
          )
        }
        targetIsland.copiesById[newCopyId] = {
          ...sourceCopy,
          id: newCopyId,
          order: targetIsland.copyOrder[sourceCopy.kind].length,
        }
        targetIsland.copyOrder[sourceCopy.kind].push(newCopyId)
        return { copyId: newCopyId }
      })
    },

    tidyIslands: (origin = { x: 0, y: 0 }, options) =>
      runPhase2Mutation('Tidy islands', (draft) => {
        if (
          draft.assembly.activeStage !== 'add-monetization' &&
          draft.assembly.activeStage !== 'final'
        ) {
          throw new MutationRejected(
            'INVALID_STAGE',
            'Tidy is available only after monetization assembly.',
          )
        }
        if (draft.assembly.islandOrder.length === 0) {
          throw new MutationRejected('NOT_FOUND', 'There are no islands to tidy.')
        }
        const positions = computeTidyPositions(
          draft.assembly.islandOrder,
          origin,
          options,
        )
        draft.assembly.layout.mode = 'tidy'
        draft.assembly.layout.tidyPositions = positions
        return undefined
      }),

    restoreFreeform: () =>
      runPhase2Mutation('Restore freeform', (draft) => {
        if (draft.assembly.layout.mode !== 'tidy') {
          throw new MutationRejected(
            'INVALID_STAGE',
            'The assembly is already in freeform mode.',
          )
        }
        draft.assembly.layout.mode = 'freeform'
        draft.assembly.layout.tidyPositions = null
        return undefined
      }),
  }
}
