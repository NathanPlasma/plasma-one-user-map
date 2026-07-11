import type {
  AssemblyState,
  Clock,
  IdFactory,
  IngredientKind,
  InventoryBoard,
  InventoryKind,
  InventoryMap,
  Viewport,
  UserIsland,
  WorkspaceState,
} from './types'
import { INVENTORY_KINDS } from './types'

export const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 } as const

export function createBlankInventoryBoard(kind: InventoryKind): InventoryBoard {
  return {
    kind,
    itemsById: {},
    categoriesById: {},
    viewport: { ...DEFAULT_VIEWPORT },
    selectedIds: [],
  }
}

export function createBlankInventoryMap(): InventoryMap<InventoryBoard> {
  return Object.fromEntries(
    INVENTORY_KINDS.map((kind) => [kind, createBlankInventoryBoard(kind)]),
  ) as InventoryMap<InventoryBoard>
}

export function createBlankWorkspace(options: {
  idFactory: IdFactory
  clock: Clock
  workspaceId?: string
  title?: string
}): WorkspaceState {
  const now = options.clock()
  return {
    schemaVersion: 1,
    workspaceId: options.workspaceId ?? options.idFactory(),
    title: options.title ?? 'Plasma One User Map',
    createdAt: now,
    updatedAt: now,
    contentRevision: 0,
    previousBoardGeneration: null,
    phase: 'inventory',
    activeInventory: 'problem',
    drafts: createBlankInventoryMap(),
  }
}

export function createBlankAssembly(
  checkpointId: string,
  lockedInventoryViewports?: InventoryMap<Viewport>,
): AssemblyState {
  return {
    checkpointId,
    activeStage: 'seed-users',
    islandsById: {},
    islandOrder: [],
    layout: {
      mode: 'freeform',
      freeformPositions: {},
      tidyPositions: null,
    },
    viewport: { ...DEFAULT_VIEWPORT },
    lockedInventoryViewports:
      lockedInventoryViewports ??
      (Object.fromEntries(
        INVENTORY_KINDS.map((kind) => [kind, { ...DEFAULT_VIEWPORT }]),
      ) as InventoryMap<Viewport>),
    sourceShelfOpen: true,
    inspectedInventory: null,
    firstContentMutationCommitted: false,
  }
}

export function createBlankCopyOrder(): Record<IngredientKind, string[]> {
  return { problem: [], region: [], monetization: [] }
}

export function createUserIsland(input: {
  id: string
  checkpointId: string
  sourceUserId: string
  title: string
  note: string
  variantName?: string | null
}): UserIsland {
  return {
    id: input.id,
    checkpointId: input.checkpointId,
    sourceUserId: input.sourceUserId,
    variantName: input.variantName ?? null,
    userTitle: input.title,
    userNote: input.note,
    copiesById: {},
    copyOrder: createBlankCopyOrder(),
  }
}

export function defaultIdFactory(): string {
  return crypto.randomUUID()
}

export function defaultClock(): string {
  return new Date().toISOString()
}
