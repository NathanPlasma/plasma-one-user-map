import { parseWorkspaceGeneration } from './schema'
import type { NewerWriteNotice } from '../domain/types'
import type {
  LoadLatestResult,
  PersistGenerationInput,
  PersistGenerationResult,
  WorkspaceStorageAdapter,
} from './storage-adapter'

export class MemoryWorkspaceStorageAdapter implements WorkspaceStorageAdapter {
  private records = new Map<string, unknown[]>()
  private listeners = new Set<(notice: NewerWriteNotice) => void>()
  private failNextReason: 'conflict' | 'unavailable' | 'invalid' | null = null

  async loadLatest(workspaceId: string): Promise<LoadLatestResult> {
    const values = [...(this.records.get(workspaceId) ?? [])].reverse()
    const headGeneration = values.reduce<number>((highest, value) => {
      const generation = (value as { generation?: unknown })?.generation
      return typeof generation === 'number' ? Math.max(highest, generation) : highest
    }, 0)
    const skippedGenerations: number[] = []

    for (const value of values) {
      try {
        const record = parseWorkspaceGeneration(structuredClone(value))
        return {
          record,
          headGeneration,
          recoveredFromCorruption: skippedGenerations.length > 0,
          skippedGenerations,
        }
      } catch {
        const generation = (value as { generation?: unknown })?.generation
        if (typeof generation === 'number') {
          skippedGenerations.push(generation)
        }
      }
    }

    return {
      record: null,
      headGeneration,
      recoveredFromCorruption: skippedGenerations.length > 0,
      skippedGenerations,
    }
  }

  async persistGeneration(
    input: PersistGenerationInput,
  ): Promise<PersistGenerationResult> {
    if (this.failNextReason) {
      const reason = this.failNextReason
      this.failNextReason = null
      return { ok: false, reason }
    }

    const values = this.records.get(input.workspace.workspaceId) ?? []
    const latestGeneration = values.reduce<number>((highest, value) => {
      const generation = (value as { generation?: unknown })?.generation
      return typeof generation === 'number' ? Math.max(highest, generation) : highest
    }, 0)

    if (latestGeneration !== input.expectedGeneration) {
      return { ok: false, reason: 'conflict', latestGeneration }
    }

    const record = parseWorkspaceGeneration({
      workspaceId: input.workspace.workspaceId,
      generation: latestGeneration + 1,
      writerId: input.writerId,
      savedAt: input.savedAt,
      workspace: structuredClone(input.workspace),
    })
    values.push(structuredClone(record))
    this.records.set(input.workspace.workspaceId, values)
    return { ok: true, record }
  }

  async loadGeneration(
    workspaceId: string,
    generation: number,
  ): Promise<import('../domain/types').WorkspaceGeneration | null> {
    const value = (this.records.get(workspaceId) ?? []).find(
      (candidate) => (candidate as { generation?: unknown })?.generation === generation,
    )
    if (!value) return null
    try {
      return parseWorkspaceGeneration(structuredClone(value))
    } catch {
      return null
    }
  }

  subscribeToNewerWrites(listener: (notice: NewerWriteNotice) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close(): void {
    this.listeners.clear()
  }

  failNextPersist(reason: 'conflict' | 'unavailable' | 'invalid'): void {
    this.failNextReason = reason
  }

  injectRawGeneration(workspaceId: string, value: unknown): void {
    const values = this.records.get(workspaceId) ?? []
    values.push(structuredClone(value))
    this.records.set(workspaceId, values)
  }

  replaceRawGeneration(workspaceId: string, generation: number, value: unknown): void {
    const values = this.records.get(workspaceId) ?? []
    const index = values.findIndex(
      (candidate) => (candidate as { generation?: unknown })?.generation === generation,
    )
    if (index >= 0) values[index] = structuredClone(value)
    this.records.set(workspaceId, values)
  }

  emitNewerWrite(notice: NewerWriteNotice): void {
    for (const listener of this.listeners) {
      listener(notice)
    }
  }

  getRawGenerations(workspaceId: string): unknown[] {
    return structuredClone(this.records.get(workspaceId) ?? [])
  }
}
