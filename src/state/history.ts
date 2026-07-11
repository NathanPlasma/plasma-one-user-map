import type { Patch } from 'immer'
import type { InventoryKind } from '../domain/types'
import { INVENTORY_KINDS } from '../domain/types'

export type PatchEntry = {
  label: string
  patches: readonly Patch[]
  inversePatches: readonly Patch[]
}

type HistoryStack = {
  undo: PatchEntry[]
  redo: PatchEntry[]
}

function createStack(): HistoryStack {
  return { undo: [], redo: [] }
}

export class SplitHistory {
  private readonly phase1 = Object.fromEntries(
    INVENTORY_KINDS.map((kind) => [kind, createStack()]),
  ) as Record<InventoryKind, HistoryStack>

  private readonly phase2 = createStack()

  pushPhase1(kind: InventoryKind, entry: PatchEntry): void {
    const stack = this.phase1[kind]
    stack.undo.push(entry)
    stack.redo.length = 0
  }

  amendLatestPhase1(
    kind: InventoryKind,
    patches: readonly Patch[],
    inversePatches: readonly Patch[],
  ): void {
    const entry = this.phase1[kind].undo.at(-1)
    if (!entry) return
    entry.patches = [...entry.patches, ...patches]
    entry.inversePatches = [...inversePatches, ...entry.inversePatches]
  }

  takePhase1Undo(kind: InventoryKind): PatchEntry | undefined {
    return this.phase1[kind].undo.pop()
  }

  commitPhase1Undo(kind: InventoryKind, entry: PatchEntry): void {
    this.phase1[kind].redo.push(entry)
  }

  restorePhase1Undo(kind: InventoryKind, entry: PatchEntry): void {
    this.phase1[kind].undo.push(entry)
  }

  takePhase1Redo(kind: InventoryKind): PatchEntry | undefined {
    return this.phase1[kind].redo.pop()
  }

  commitPhase1Redo(kind: InventoryKind, entry: PatchEntry): void {
    this.phase1[kind].undo.push(entry)
  }

  restorePhase1Redo(kind: InventoryKind, entry: PatchEntry): void {
    this.phase1[kind].redo.push(entry)
  }

  pushPhase2(entry: PatchEntry): void {
    this.phase2.undo.push(entry)
    this.phase2.redo.length = 0
  }

  amendLatestPhase2(patches: readonly Patch[], inversePatches: readonly Patch[]): void {
    const entry = this.phase2.undo.at(-1)
    if (!entry) return
    entry.patches = [...entry.patches, ...patches]
    entry.inversePatches = [...inversePatches, ...entry.inversePatches]
  }

  takePhase2Undo(): PatchEntry | undefined {
    return this.phase2.undo.pop()
  }

  commitPhase2Undo(entry: PatchEntry): void {
    this.phase2.redo.push(entry)
  }

  restorePhase2Undo(entry: PatchEntry): void {
    this.phase2.undo.push(entry)
  }

  takePhase2Redo(): PatchEntry | undefined {
    return this.phase2.redo.pop()
  }

  commitPhase2Redo(entry: PatchEntry): void {
    this.phase2.undo.push(entry)
  }

  restorePhase2Redo(entry: PatchEntry): void {
    this.phase2.redo.push(entry)
  }

  clearPhase1(): void {
    for (const kind of INVENTORY_KINDS) {
      this.phase1[kind].undo.length = 0
      this.phase1[kind].redo.length = 0
    }
  }

  clearPhase2(): void {
    this.phase2.undo.length = 0
    this.phase2.redo.length = 0
  }

  canUndoPhase1(kind: InventoryKind): boolean {
    return this.phase1[kind].undo.length > 0
  }

  canRedoPhase1(kind: InventoryKind): boolean {
    return this.phase1[kind].redo.length > 0
  }

  canUndoPhase2(): boolean {
    return this.phase2.undo.length > 0
  }

  canRedoPhase2(): boolean {
    return this.phase2.redo.length > 0
  }

  clearAll(): void {
    this.clearPhase1()
    this.clearPhase2()
  }
}
