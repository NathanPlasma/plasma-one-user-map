import { useCallback, useEffect, useMemo, useState } from 'react'
import { Toaster, toast } from 'sonner'

import { useWorkspace, useWorkspaceStore } from './app/workspace-store-context'
import { JourneyRail } from './components/JourneyRail'
import { LockDialog } from './components/LockDialog'
import { NewBoardDialog } from './components/NewBoardDialog'
import { RecoveryBanner } from './components/RecoveryBanner'
import { TopBar } from './components/TopBar'
import type { AssemblyStage, InventoryKind, LockReview } from './domain/types'
import { AssemblyWorkspace } from './features/canvas/AssemblyWorkspace'
import { InventoryWorkspace } from './features/canvas/InventoryWorkspace'

function exportWorkspace(workspace: unknown, title: string) {
  const payload = JSON.stringify(
    { formatVersion: 1, exportedAt: new Date().toISOString(), workspace },
    null,
    2,
  )
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const safeTitle = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  anchor.href = url
  anchor.download = `${safeTitle || 'plasma-one-user-map'}-${new Date()
    .toISOString()
    .slice(0, 10)}.json`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function nextStage(stage: AssemblyStage): AssemblyStage | null {
  if (stage === 'seed-users') return 'add-problems'
  if (stage === 'add-problems') return 'add-regions'
  if (stage === 'add-regions') return 'add-monetization'
  return null
}

function App() {
  const store = useWorkspaceStore()
  const workspace = useWorkspace((state) => state.workspace)
  const actions = useWorkspace((state) => state.actions)
  const generation = useWorkspace((state) => state.generation)
  const verifiedGeneration = useWorkspace((state) => state.verifiedGeneration)
  const hydrationStatus = useWorkspace((state) => state.hydrationStatus)
  const recoveredFromCorruption = useWorkspace((state) => state.recoveredFromCorruption)
  const skippedGenerations = useWorkspace((state) => state.skippedGenerations)
  const externalWriteConflict = useWorkspace((state) => state.externalWriteConflict)
  const canUndo = useWorkspace((state) => state.canUndo)
  const canRedo = useWorkspace((state) => state.canRedo)
  const canRestorePreviousBoard = useWorkspace((state) => state.canRestorePreviousBoard)

  const [titleDraft, setTitleDraft] = useState(workspace.title)
  const [lockReview, setLockReview] = useState<LockReview | null>(null)
  const [locking, setLocking] = useState(false)
  const [lockError, setLockError] = useState<string | undefined>()
  const [showNewBoard, setShowNewBoard] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => setTitleDraft(workspace.title), [workspace.title])
  useEffect(() => {
    if (titleDraft === workspace.title || !titleDraft.trim()) return
    const timeout = window.setTimeout(() => {
      void actions.setTitle(titleDraft.trim()).then((result) => {
        if (!result.ok) toast.error(result.message)
      })
    }, 420)
    return () => window.clearTimeout(timeout)
  }, [actions, titleDraft, workspace.title])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, [contenteditable="true"]')
      ) {
        return
      }
      event.preventDefault()
      const command = event.shiftKey ? actions.redo() : actions.undo()
      void command.then((result) => {
        if (!result.ok && result.code !== 'HISTORY_BOUNDARY')
          toast.error(result.message)
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [actions])

  const phase = workspace.phase
  const activeInventory =
    phase === 'inventory'
      ? workspace.activeInventory
      : (workspace.assembly.inspectedInventory ?? 'problem')
  const activeStage =
    phase === 'assembly' ? workspace.assembly.activeStage : 'seed-users'
  const inspectedInventory =
    phase === 'assembly' ? workspace.assembly.inspectedInventory : null

  const primary = useMemo(() => {
    if (phase === 'inventory') return { label: 'Lock inventories', disabled: false }
    const next = nextStage(workspace.assembly.activeStage)
    if (next) {
      return {
        label:
          next === 'add-problems'
            ? 'Next: problems'
            : next === 'add-regions'
              ? 'Next: regions'
              : 'Next: monetization',
        disabled:
          workspace.assembly.activeStage === 'seed-users' &&
          workspace.assembly.islandOrder.length === 0,
      }
    }
    return {
      label: workspace.assembly.layout.mode === 'tidy' ? 'Restore freeform' : 'Tidy',
      disabled: workspace.assembly.islandOrder.length === 0,
    }
  }, [phase, workspace])

  const cancelActiveDrag = useCallback(() => {
    window.dispatchEvent(new CustomEvent('workshop:cancel-drag'))
  }, [])

  const handleSaveCopy = useCallback(async () => {
    const normalizedTitle = titleDraft.trim() || 'Plasma One User Map'
    const titleResult = await actions.setTitle(normalizedTitle)
    if (!titleResult.ok) {
      toast.error(titleResult.message)
      return
    }
    const latest = store.getState().workspace
    exportWorkspace(latest, latest.title)
  }, [actions, store, titleDraft])

  const handleInventoryChange = useCallback(
    (kind: InventoryKind) => {
      cancelActiveDrag()
      void actions.setActiveInventory(kind).then((result) => {
        if (!result.ok) toast.error(result.message)
      })
    },
    [actions, cancelActiveDrag],
  )

  const handleStageChange = useCallback(
    (stage: AssemblyStage) => {
      if (phase !== 'assembly') return
      cancelActiveDrag()
      void actions.setAssemblyStage(stage).then((result) => {
        if (!result.ok) toast.error(result.message)
      })
    },
    [actions, cancelActiveDrag, phase],
  )

  const handlePrimaryAction = useCallback(() => {
    if (phase === 'inventory') {
      const review = actions.prepareLockInventories()
      if (!review.ok) {
        toast.error(review.message)
        return
      }
      setLockReview(review.value)
      setLockError(undefined)
      return
    }

    if (inspectedInventory) {
      void actions.setAssemblyStage(workspace.assembly.activeStage)
      return
    }
    const next = nextStage(workspace.assembly.activeStage)
    if (next) {
      handleStageChange(next)
      return
    }
    cancelActiveDrag()
    window.dispatchEvent(
      new CustomEvent('workshop:layout-request', {
        detail: {
          mode: workspace.assembly.layout.mode === 'tidy' ? 'freeform' : 'tidy',
        },
      }),
    )
  }, [
    actions,
    cancelActiveDrag,
    handleStageChange,
    inspectedInventory,
    phase,
    workspace,
  ])

  const saveStatus = externalWriteConflict
    ? 'conflict'
    : hydrationStatus === 'error'
      ? 'error'
      : hydrationStatus === 'ready'
        ? 'saved'
        : 'loading'

  if (hydrationStatus === 'idle' || hydrationStatus === 'loading') {
    return (
      <main className="loading-screen" aria-busy="true">
        <span className="loading-paper paper-grain" aria-hidden="true" />
        <h1>Opening your board</h1>
        <p>Recovering the latest complete local generation.</p>
      </main>
    )
  }

  return (
    <main className="workshop-shell">
      <TopBar
        title={titleDraft}
        saveStatus={saveStatus}
        canUndo={canUndo}
        canRedo={canRedo}
        primaryLabel={inspectedInventory ? 'Return to build' : primary.label}
        primaryDisabled={inspectedInventory ? false : primary.disabled}
        onTitleChange={setTitleDraft}
        onUndo={() => void actions.undo()}
        onRedo={() => void actions.redo()}
        onSaveCopy={() => void handleSaveCopy()}
        onNewBoard={() => setShowNewBoard(true)}
        onPrimaryAction={handlePrimaryAction}
      />
      <JourneyRail
        phase={phase}
        activeInventory={activeInventory}
        inspectedInventory={inspectedInventory}
        activeStage={activeStage}
        checkpointVersion={
          phase === 'assembly' ? workspace.checkpoint.revision : undefined
        }
        canBuildBeyondSeed={
          phase === 'assembly' && workspace.assembly.islandOrder.length > 0
        }
        reviewing={phase === 'assembly' && workspace.assembly.layout.mode === 'tidy'}
        onInventoryChange={handleInventoryChange}
        onStageChange={handleStageChange}
      />

      {phase === 'inventory' ? (
        <InventoryWorkspace
          key={workspace.activeInventory}
          kind={workspace.activeInventory}
          board={workspace.drafts[workspace.activeInventory]}
          readOnly={false}
          revision={workspace.contentRevision}
          actions={actions}
        />
      ) : inspectedInventory ? (
        <InventoryWorkspace
          key={`locked-${inspectedInventory}`}
          kind={inspectedInventory}
          board={workspace.checkpoint.inventories[inspectedInventory]}
          readOnly
          revision={workspace.contentRevision}
          actions={actions}
        />
      ) : (
        <AssemblyWorkspace
          workspace={workspace}
          revision={workspace.contentRevision}
          actions={actions}
        />
      )}

      {lockReview ? (
        <LockDialog
          counts={lockReview.counts}
          saving={locking}
          error={lockError}
          onCancel={() => {
            if (!locking) setLockReview(null)
          }}
          onConfirm={(acknowledgeEmpty, acknowledgeUncategorized) => {
            setLocking(true)
            setLockError(undefined)
            void actions
              .commitLockInventories(lockReview.token, {
                emptyKinds: acknowledgeEmpty ? lockReview.emptyKinds : [],
                uncategorizedKinds: acknowledgeUncategorized
                  ? lockReview.uncategorizedKinds
                  : [],
              })
              .then((result) => {
                setLocking(false)
                if (!result.ok) {
                  setLockError(result.message)
                  return
                }
                setLockReview(null)
                toast.success('Inventory v1 locked')
              })
          }}
        />
      ) : null}

      {showNewBoard ? (
        <NewBoardDialog
          clearing={clearing}
          canRestorePrevious={canRestorePreviousBoard}
          onCancel={() => setShowNewBoard(false)}
          onRestorePrevious={() => {
            setClearing(true)
            void actions.restorePreviousBoard().then((result) => {
              setClearing(false)
              if (!result.ok) {
                toast.error(result.message)
                return
              }
              setShowNewBoard(false)
              toast.success('Previous board restored')
            })
          }}
          onConfirm={() => {
            setClearing(true)
            void actions.startNewBoard().then((result) => {
              setClearing(false)
              if (!result.ok) {
                toast.error(result.message)
                return
              }
              setShowNewBoard(false)
              toast.success('Started a new blank board', {
                action: {
                  label: 'Restore previous',
                  onClick: () => void actions.restorePreviousBoard(),
                },
              })
            })
          }}
        />
      ) : null}

      {hydrationStatus === 'error' ||
      externalWriteConflict ||
      recoveredFromCorruption ? (
        <RecoveryBanner
          message={
            externalWriteConflict
              ? 'Another tab saved a newer generation. Reload it before making more changes.'
              : hydrationStatus === 'error'
                ? 'The local workspace could not be opened. Your stored data was not overwritten.'
                : verifiedGeneration === 0
                  ? `Stored generations were unreadable, so a new blank board opened. Skipped ${skippedGenerations.length} corrupt ${skippedGenerations.length === 1 ? 'generation' : 'generations'} without overwriting them.`
                  : `Recovered the last valid local generation. Skipped ${skippedGenerations.length} corrupt ${skippedGenerations.length === 1 ? 'generation' : 'generations'}.`
          }
          canRetry={Boolean(externalWriteConflict) || hydrationStatus === 'error'}
          onRetry={() => void actions.hydrate()}
          onSaveCopy={() => exportWorkspace(workspace, workspace.title)}
        />
      ) : null}

      <Toaster position="bottom-right" closeButton toastOptions={{ duration: 3200 }} />
      <span className="sr-only" aria-live="polite">
        Local generation {generation}
      </span>
    </main>
  )
}

export default App
