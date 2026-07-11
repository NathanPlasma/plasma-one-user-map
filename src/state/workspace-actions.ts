import type {
  AssemblyStage,
  Clock,
  CommandResult,
  IdFactory,
  IngredientKind,
  InventoryCategory,
  InventoryKind,
  LockReview,
  NewerWriteNotice,
  Point,
  Size,
  Viewport,
  WorkspaceState,
} from '../domain/types'
import type { WorkspaceStorageAdapter } from '../persistence/storage-adapter'

export type WorkspaceStoreOptions = {
  storage: WorkspaceStorageAdapter
  workspaceId?: string
  writerId?: string
  idFactory?: IdFactory
  clock?: Clock
}

export type InventoryItemInput = {
  kind: InventoryKind
  title: string
  note?: string
  position: Point
}

export type InventoryItemPatch = {
  title?: string
  note?: string
}

export type InventoryCategoryInput = {
  kind: InventoryKind
  title: string
  position: Point
  size?: Size
}

export type LockAcknowledgements = {
  emptyKinds: InventoryKind[]
  uncategorizedKinds: InventoryKind[]
}

export type AddSourcesResult = {
  addedCopyIds: string[]
  alreadyPresentSourceIds: string[]
}

export type SeedUserResult = {
  islandId: string
  created: boolean
}

export type TidyLayoutOptions = {
  columns?: number
  columnWidth?: number
  rowGap?: number
  islandHeights?: Readonly<Record<string, number>>
}

export type InventoryCategoryLayout = {
  position: Point
  size: Size
  itemPositions: Record<string, Point>
}

export type WorkspaceActions = {
  hydrate: () => Promise<CommandResult<'loaded' | 'blank'>>
  close: () => void
  setTitle: (title: string) => Promise<CommandResult>
  setActiveInventory: (kind: InventoryKind) => Promise<CommandResult>
  setInventoryViewport: (
    kind: InventoryKind,
    viewport: Viewport,
  ) => Promise<CommandResult>
  setAssemblyStage: (stage: AssemblyStage) => Promise<CommandResult>
  setAssemblyViewport: (viewport: Viewport) => Promise<CommandResult>
  setSourceShelfOpen: (open: boolean) => Promise<CommandResult>
  stabilizeInventoryLayout: (
    kind: InventoryKind,
    categories: Record<string, InventoryCategoryLayout>,
    expectedRevision: number,
  ) => Promise<CommandResult>
  stabilizeAssemblyLayout: (
    positions: Record<string, Point>,
    expectedRevision: number,
  ) => Promise<CommandResult>
  startNewBoard: (title?: string) => Promise<CommandResult>
  restorePreviousBoard: () => Promise<CommandResult>

  createInventoryItem: (
    input: InventoryItemInput,
  ) => Promise<CommandResult<{ itemId: string }>>
  updateInventoryItem: (
    kind: InventoryKind,
    itemId: string,
    patch: InventoryItemPatch,
  ) => Promise<CommandResult>
  moveInventoryItems: (
    kind: InventoryKind,
    positions: Record<string, Point>,
  ) => Promise<CommandResult>
  moveInventoryItemsToCategory: (
    kind: InventoryKind,
    positions: Record<string, Point>,
    categoryId: string | null,
  ) => Promise<CommandResult>
  duplicateInventoryItems: (
    kind: InventoryKind,
    itemIds: string[],
    offset?: Point,
  ) => Promise<CommandResult<{ itemIds: string[] }>>
  pasteInventoryItems: (
    kind: InventoryKind,
    items: Omit<InventoryItemInput, 'kind'>[],
  ) => Promise<CommandResult<{ itemIds: string[] }>>
  deleteInventoryItems: (
    kind: InventoryKind,
    itemIds: string[],
  ) => Promise<CommandResult>
  createInventoryCategory: (
    input: InventoryCategoryInput,
  ) => Promise<CommandResult<{ categoryId: string }>>
  groupInventoryItems: (
    kind: InventoryKind,
    itemIds: string[],
    title: string,
    position: Point,
    size?: Size,
  ) => Promise<CommandResult<{ categoryId: string }>>
  updateInventoryCategory: (
    kind: InventoryKind,
    categoryId: string,
    patch: Partial<Pick<InventoryCategory, 'title' | 'position' | 'size'>>,
  ) => Promise<CommandResult>
  assignItemsToCategory: (
    kind: InventoryKind,
    itemIds: string[],
    categoryId: string,
  ) => Promise<CommandResult>
  removeItemsFromCategory: (
    kind: InventoryKind,
    itemIds: string[],
  ) => Promise<CommandResult>
  deleteCategoryPreservingItems: (
    kind: InventoryKind,
    categoryId: string,
  ) => Promise<CommandResult>

  prepareLockInventories: () => CommandResult<LockReview>
  commitLockInventories: (
    token: string,
    acknowledgements: LockAcknowledgements,
  ) => Promise<CommandResult<{ checkpointId: string }>>
  unlockInventoriesBeforeAssembly: () => Promise<CommandResult>

  seedUserIsland: (
    sourceUserId: string,
    position: Point,
  ) => Promise<CommandResult<SeedUserResult>>
  createUserVariant: (
    sourceUserId: string,
    variantName: string,
    position: Point,
  ) => Promise<CommandResult<{ islandId: string }>>
  moveIsland: (islandId: string, position: Point) => Promise<CommandResult>
  updateUserIsland: (
    islandId: string,
    patch: {
      userTitle?: string
      userNote?: string
      variantName?: string | null
    },
  ) => Promise<CommandResult>
  deleteIsland: (islandId: string) => Promise<CommandResult>
  addSourcesToIsland: (
    islandId: string,
    kind: IngredientKind,
    sourceIds: string[],
  ) => Promise<CommandResult<AddSourcesResult>>
  updateLocalCopy: (
    islandId: string,
    copyId: string,
    patch: InventoryItemPatch,
  ) => Promise<CommandResult>
  reorderLocalCopy: (
    islandId: string,
    kind: IngredientKind,
    fromIndex: number,
    toIndex: number,
  ) => Promise<CommandResult<{ moved: boolean }>>
  removeLocalCopy: (islandId: string, copyId: string) => Promise<CommandResult>
  moveLocalCopyToIsland: (
    sourceIslandId: string,
    targetIslandId: string,
    copyId: string,
  ) => Promise<CommandResult>
  duplicateLocalCopyToIsland: (
    sourceIslandId: string,
    targetIslandId: string,
    copyId: string,
  ) => Promise<CommandResult<{ copyId: string }>>
  tidyIslands: (origin?: Point, options?: TidyLayoutOptions) => Promise<CommandResult>
  restoreFreeform: () => Promise<CommandResult>
  undo: () => Promise<CommandResult>
  redo: () => Promise<CommandResult>
}

export type WorkspaceStoreState = {
  workspace: WorkspaceState
  generation: number
  verifiedGeneration: number
  hydrationStatus: 'idle' | 'loading' | 'ready' | 'error'
  recoveredFromCorruption: boolean
  skippedGenerations: number[]
  externalWriteConflict: NewerWriteNotice | null
  canUndo: boolean
  canRedo: boolean
  canRestorePreviousBoard: boolean
  actions: WorkspaceActions
}
