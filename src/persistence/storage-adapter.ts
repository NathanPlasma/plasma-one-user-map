import type {
  NewerWriteNotice,
  WorkspaceGeneration,
  WorkspaceState,
} from '../domain/types'

export type LoadLatestResult = {
  record: WorkspaceGeneration | null
  headGeneration: number
  recoveredFromCorruption: boolean
  skippedGenerations: number[]
}

export type PersistGenerationResult =
  | { ok: true; record: WorkspaceGeneration }
  | {
      ok: false
      reason: 'conflict' | 'unavailable' | 'invalid'
      latestGeneration?: number
      error?: unknown
    }

export type PersistGenerationInput = {
  workspace: WorkspaceState
  expectedGeneration: number
  writerId: string
  savedAt: string
}

export interface WorkspaceStorageAdapter {
  loadLatest(workspaceId: string): Promise<LoadLatestResult>
  loadGeneration(
    workspaceId: string,
    generation: number,
  ): Promise<WorkspaceGeneration | null>
  persistGeneration(input: PersistGenerationInput): Promise<PersistGenerationResult>
  subscribeToNewerWrites(listener: (notice: NewerWriteNotice) => void): () => void
  close(): void
}
