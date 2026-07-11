import { useEffect, useRef, type ReactNode } from 'react'

import { IndexedDbWorkspaceStorageAdapter } from '../persistence/indexeddb-storage-adapter'
import { createWorkspaceStore, type WorkspaceStore } from '../state/workspace-store'
import { WorkspaceStoreContext } from './workspace-store-context'

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<WorkspaceStore | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  if (!storeRef.current) {
    storeRef.current = createWorkspaceStore({
      storage: new IndexedDbWorkspaceStorageAdapter(),
      workspaceId: 'default',
    })
  }

  useEffect(() => {
    const store = storeRef.current
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    void store?.getState().actions.hydrate()
    return () => {
      closeTimerRef.current = window.setTimeout(() => {
        store?.getState().actions.close()
      }, 0)
    }
  }, [])

  return (
    <WorkspaceStoreContext.Provider value={storeRef.current}>
      {children}
    </WorkspaceStoreContext.Provider>
  )
}
