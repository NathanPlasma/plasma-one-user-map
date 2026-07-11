import { z } from 'zod'
import { assertWorkspaceInvariants } from '../domain/invariants'
import type { WorkspaceGeneration, WorkspaceState } from '../domain/types'

const pointSchema = z.object({ x: z.number(), y: z.number() })
const sizeSchema = z.object({ width: z.number(), height: z.number() })
const viewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number().positive(),
})

const inventoryKindSchema = z.enum(['problem', 'user', 'region', 'monetization'])
const ingredientKindSchema = z.enum(['problem', 'region', 'monetization'])
const assemblyStageSchema = z.enum([
  'seed-users',
  'add-problems',
  'add-regions',
  'add-monetization',
  'final',
])

const inventoryItemSchema = z.object({
  id: z.string().min(1),
  kind: inventoryKindSchema,
  title: z.string(),
  note: z.string(),
  categoryId: z.string().min(1).nullable(),
  position: pointSchema,
})

const inventoryCategorySchema = z.object({
  id: z.string().min(1),
  kind: inventoryKindSchema,
  title: z.string(),
  position: pointSchema,
  size: sizeSchema,
})

const inventoryBoardSchema = z.object({
  kind: inventoryKindSchema,
  itemsById: z.record(z.string(), inventoryItemSchema),
  categoriesById: z.record(z.string(), inventoryCategorySchema),
  viewport: viewportSchema,
  selectedIds: z.array(z.string()),
})

const inventoryMapSchema = z.object({
  problem: inventoryBoardSchema,
  user: inventoryBoardSchema,
  region: inventoryBoardSchema,
  monetization: inventoryBoardSchema,
})

const workspaceMetaSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: z.string().min(1),
  title: z.string(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  contentRevision: z.number().int().nonnegative(),
  previousBoardGeneration: z.number().int().nonnegative().nullable(),
})

const inventoryWorkspaceSchema = workspaceMetaSchema.extend({
  phase: z.literal('inventory'),
  activeInventory: inventoryKindSchema,
  drafts: inventoryMapSchema,
})

const checkpointSchema = z.object({
  id: z.string().min(1),
  revision: z.number().int().positive(),
  lockedAt: z.string().min(1),
  inventories: inventoryMapSchema,
})

const localCopySchema = z.object({
  id: z.string().min(1),
  checkpointId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceCategoryId: z.string().min(1).nullable(),
  kind: ingredientKindSchema,
  title: z.string(),
  note: z.string(),
  order: z.number().int().nonnegative(),
})

const userIslandSchema = z.object({
  id: z.string().min(1),
  checkpointId: z.string().min(1),
  sourceUserId: z.string().min(1),
  variantName: z.string().nullable(),
  userTitle: z.string(),
  userNote: z.string(),
  copiesById: z.record(z.string(), localCopySchema),
  copyOrder: z.object({
    problem: z.array(z.string()),
    region: z.array(z.string()),
    monetization: z.array(z.string()),
  }),
})

const assemblySchema = z.object({
  checkpointId: z.string().min(1),
  activeStage: assemblyStageSchema,
  islandsById: z.record(z.string(), userIslandSchema),
  islandOrder: z.array(z.string()),
  layout: z.object({
    mode: z.enum(['freeform', 'tidy']),
    freeformPositions: z.record(z.string(), pointSchema),
    tidyPositions: z.record(z.string(), pointSchema).nullable(),
  }),
  viewport: viewportSchema,
  lockedInventoryViewports: z.object({
    problem: viewportSchema,
    user: viewportSchema,
    region: viewportSchema,
    monetization: viewportSchema,
  }),
  sourceShelfOpen: z.boolean(),
  inspectedInventory: inventoryKindSchema.nullable(),
  firstContentMutationCommitted: z.boolean(),
})

const assemblyWorkspaceSchema = workspaceMetaSchema.extend({
  phase: z.literal('assembly'),
  checkpoint: checkpointSchema,
  assembly: assemblySchema,
})

export const workspaceStateSchema = z.discriminatedUnion('phase', [
  inventoryWorkspaceSchema,
  assemblyWorkspaceSchema,
])

export const workspaceGenerationSchema = z.object({
  workspaceId: z.string().min(1),
  generation: z.number().int().positive(),
  writerId: z.string().min(1),
  savedAt: z.string().min(1),
  workspace: workspaceStateSchema,
})

export function parseWorkspaceState(value: unknown): WorkspaceState {
  const workspace = workspaceStateSchema.parse(value) as WorkspaceState
  assertWorkspaceInvariants(workspace)
  return workspace
}

export function parseWorkspaceGeneration(value: unknown): WorkspaceGeneration {
  const generation = workspaceGenerationSchema.parse(value) as WorkspaceGeneration
  assertWorkspaceInvariants(generation.workspace)
  if (generation.workspace.workspaceId !== generation.workspaceId) {
    throw new Error('Generation workspaceId does not match workspace')
  }
  return generation
}
