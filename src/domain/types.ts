export const INVENTORY_KINDS = ['problem', 'user', 'region', 'monetization'] as const

export type InventoryKind = (typeof INVENTORY_KINDS)[number]

export const INGREDIENT_KINDS = ['problem', 'region', 'monetization'] as const
export type IngredientKind = (typeof INGREDIENT_KINDS)[number]

export const ASSEMBLY_STAGES = [
  'seed-users',
  'add-problems',
  'add-regions',
  'add-monetization',
  'final',
] as const

export type AssemblyStage = (typeof ASSEMBLY_STAGES)[number]

export type Point = { x: number; y: number }
export type Size = { width: number; height: number }
export type Viewport = { x: number; y: number; zoom: number }

export type InventoryItem = {
  id: string
  kind: InventoryKind
  title: string
  note: string
  categoryId: string | null
  position: Point
}

export type InventoryCategory = {
  id: string
  kind: InventoryKind
  title: string
  position: Point
  size: Size
}

export type InventoryBoard = {
  kind: InventoryKind
  itemsById: Record<string, InventoryItem>
  categoriesById: Record<string, InventoryCategory>
  viewport: Viewport
  selectedIds: string[]
}

export type InventoryMap<T> = Record<InventoryKind, T>

export type Phase1Checkpoint = {
  id: string
  revision: number
  lockedAt: string
  inventories: InventoryMap<InventoryBoard>
}

export type LocalCopy = {
  id: string
  checkpointId: string
  sourceId: string
  sourceCategoryId: string | null
  kind: IngredientKind
  title: string
  note: string
  order: number
}

export type UserIsland = {
  id: string
  checkpointId: string
  sourceUserId: string
  variantName: string | null
  userTitle: string
  userNote: string
  copiesById: Record<string, LocalCopy>
  copyOrder: Record<IngredientKind, string[]>
}

export type AssemblyLayout = {
  mode: 'freeform' | 'tidy'
  freeformPositions: Record<string, Point>
  tidyPositions: Record<string, Point> | null
}

export type AssemblyState = {
  checkpointId: string
  activeStage: AssemblyStage
  islandsById: Record<string, UserIsland>
  islandOrder: string[]
  layout: AssemblyLayout
  viewport: Viewport
  lockedInventoryViewports: InventoryMap<Viewport>
  sourceShelfOpen: boolean
  inspectedInventory: InventoryKind | null
  firstContentMutationCommitted: boolean
}

export type WorkspaceMeta = {
  schemaVersion: 1
  workspaceId: string
  title: string
  createdAt: string
  updatedAt: string
  contentRevision: number
  previousBoardGeneration: number | null
}

export type InventoryPhaseState = WorkspaceMeta & {
  phase: 'inventory'
  activeInventory: InventoryKind
  drafts: InventoryMap<InventoryBoard>
}

export type AssemblyPhaseState = WorkspaceMeta & {
  phase: 'assembly'
  checkpoint: Phase1Checkpoint
  assembly: AssemblyState
}

export type WorkspaceState = InventoryPhaseState | AssemblyPhaseState

export type LockInventoryCounts = {
  items: number
  categories: number
  uncategorized: number
}

export type LockReview = {
  token: string
  contentRevision: number
  counts: InventoryMap<LockInventoryCounts>
  emptyKinds: InventoryKind[]
  uncategorizedKinds: InventoryKind[]
}

export type CommandErrorCode =
  | 'WRONG_PHASE'
  | 'PHASE1_LOCKED'
  | 'STALE_LOCK_REVIEW'
  | 'LOCK_ACK_REQUIRED'
  | 'CHECKPOINT_NOT_PERSISTED'
  | 'HISTORY_BOUNDARY'
  | 'NOT_FOUND'
  | 'INVALID_KIND'
  | 'INVALID_STAGE'
  | 'INVALID_PARENTAGE'
  | 'DUPLICATE_SOURCE'
  | 'TARGET_CONFLICT'
  | 'VARIANT_NAME_REQUIRED'
  | 'PERSISTENCE_FAILED'
  | 'EXTERNAL_WRITE_CONFLICT'

export type CommandResult<T = undefined> =
  | { ok: true; value: T; contentRevision: number }
  | { ok: false; code: CommandErrorCode; message: string }

export type WorkspaceGeneration = {
  workspaceId: string
  generation: number
  writerId: string
  savedAt: string
  workspace: WorkspaceState
}

export type NewerWriteNotice = {
  workspaceId: string
  generation: number
  writerId: string
}

export type IdFactory = () => string
export type Clock = () => string
