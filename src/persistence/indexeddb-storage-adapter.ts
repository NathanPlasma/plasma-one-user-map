import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { NewerWriteNotice, WorkspaceGeneration } from '../domain/types'
import { parseWorkspaceGeneration } from './schema'
import type {
  LoadLatestResult,
  PersistGenerationInput,
  PersistGenerationResult,
  WorkspaceStorageAdapter,
} from './storage-adapter'

type WorkspaceHead = {
  workspaceId: string
  latestGeneration: number
}

interface UserMapDatabase extends DBSchema {
  generations: {
    key: [string, number]
    value: WorkspaceGeneration
    indexes: { 'by-workspace': string }
  }
  heads: {
    key: string
    value: WorkspaceHead
  }
}

const DATABASE_NAME = 'plasma-one-user-map'
const CHANNEL_NAME = 'plasma-one-user-map-generations'

export class IndexedDbWorkspaceStorageAdapter implements WorkspaceStorageAdapter {
  private readonly dbPromise: Promise<IDBPDatabase<UserMapDatabase>>
  private readonly listeners = new Set<(notice: NewerWriteNotice) => void>()
  private readonly channel: BroadcastChannel | null

  constructor(databaseName = DATABASE_NAME) {
    this.dbPromise = openDB<UserMapDatabase>(databaseName, 1, {
      upgrade(database) {
        const generations = database.createObjectStore('generations', {
          keyPath: ['workspaceId', 'generation'],
        })
        generations.createIndex('by-workspace', 'workspaceId')
        database.createObjectStore('heads', { keyPath: 'workspaceId' })
      },
    })

    this.channel =
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel(CHANNEL_NAME)
    this.channel?.addEventListener('message', this.handleChannelMessage)
  }

  async loadLatest(workspaceId: string): Promise<LoadLatestResult> {
    const database = await this.dbPromise
    const records = await database.getAllFromIndex(
      'generations',
      'by-workspace',
      workspaceId,
    )
    records.sort((left, right) => right.generation - left.generation)
    const headGeneration = records[0]?.generation ?? 0
    const skippedGenerations: number[] = []

    for (const candidate of records) {
      try {
        return {
          record: parseWorkspaceGeneration(candidate),
          headGeneration,
          recoveredFromCorruption: skippedGenerations.length > 0,
          skippedGenerations,
        }
      } catch {
        skippedGenerations.push(candidate.generation)
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
    try {
      const database = await this.dbPromise
      const transaction = database.transaction(['generations', 'heads'], 'readwrite')
      const headStore = transaction.objectStore('heads')
      const currentHead = await headStore.get(input.workspace.workspaceId)
      const latestGeneration = currentHead?.latestGeneration ?? 0

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

      await transaction.objectStore('generations').add(record)
      await headStore.put({
        workspaceId: record.workspaceId,
        latestGeneration: record.generation,
      })
      await transaction.done

      const notice = {
        workspaceId: record.workspaceId,
        generation: record.generation,
        writerId: record.writerId,
      }
      this.channel?.postMessage(notice)
      return { ok: true, record }
    } catch (error) {
      return { ok: false, reason: 'unavailable', error }
    }
  }

  async loadGeneration(
    workspaceId: string,
    generation: number,
  ): Promise<WorkspaceGeneration | null> {
    const database = await this.dbPromise
    const value = await database.get('generations', [workspaceId, generation])
    if (!value) return null
    try {
      return parseWorkspaceGeneration(value)
    } catch {
      return null
    }
  }

  subscribeToNewerWrites(listener: (notice: NewerWriteNotice) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close(): void {
    this.channel?.removeEventListener('message', this.handleChannelMessage)
    this.channel?.close()
    void this.dbPromise.then((database) => database.close())
    this.listeners.clear()
  }

  private handleChannelMessage = (event: MessageEvent<unknown>): void => {
    const value = event.data as Partial<NewerWriteNotice>
    if (
      typeof value.workspaceId !== 'string' ||
      typeof value.generation !== 'number' ||
      typeof value.writerId !== 'string'
    ) {
      return
    }
    const notice: NewerWriteNotice = {
      workspaceId: value.workspaceId,
      generation: value.generation,
      writerId: value.writerId,
    }
    for (const listener of this.listeners) {
      listener(notice)
    }
  }
}
