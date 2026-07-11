import { createContext, useContext } from 'react'
import { useStore } from 'zustand'

import type { WorkspaceStore, WorkspaceStoreState } from '../state/workspace-store'

export const WorkspaceStoreContext = createContext<WorkspaceStore | null>(null)

export function useWorkspace<T>(selector: (state: WorkspaceStoreState) => T): T {
  const store = useContext(WorkspaceStoreContext)
  if (!store) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return useStore(store, selector)
}

export function useWorkspaceStore(): WorkspaceStore {
  const store = useContext(WorkspaceStoreContext)
  if (!store) throw new Error('useWorkspaceStore must be used inside WorkspaceProvider')
  return store
}
