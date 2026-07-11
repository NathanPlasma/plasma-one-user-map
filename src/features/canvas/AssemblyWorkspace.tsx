import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
} from '@xyflow/react'
import { PanelLeftOpen, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { CanvasToolbar } from '../../components/CanvasToolbar'
import { DestinationDialog } from '../../components/DestinationDialog'
import { SourceShelf } from '../../components/SourceShelf'
import { VariantDialog } from '../../components/VariantDialog'
import type {
  AssemblyPhaseState,
  CommandResult,
  IngredientKind,
  Point,
  UserIsland,
} from '../../domain/types'
import { useReducedMotion } from '../../hooks/use-reduced-motion'
import type { WorkspaceActions } from '../../state/workspace-store'
import { kindConfig, kindStyle, stageConfig } from '../workshop/kind-config'
import { IslandNode } from './IslandNode'
import { AssemblyCanvasSurface } from './assembly/AssemblyCanvasSurface'
import { useAssemblyCanvas } from './assembly/use-assembly-canvas'
import {
  buildSourceSections,
  containsSource,
  findCopyById,
  nextIslandPosition,
  type DestinationRequest,
} from './assembly/workspace-helpers'
import type { IslandFlowNode, WorkshopDragData } from './view-models'

const nodeTypes = { island: IslandNode }

type AssemblyWorkspaceProps = {
  workspace: AssemblyPhaseState
  revision: number
  actions: WorkspaceActions
}

function AssemblyWorkspaceInner({
  workspace,
  revision,
  actions,
}: AssemblyWorkspaceProps) {
  const { fitView, screenToFlowPosition } = useReactFlow<IslandFlowNode>()
  const reducedMotion = useReducedMotion()
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select')
  const [dndSession, setDndSession] = useState(0)
  const [activeDrag, setActiveDrag] = useState<WorkshopDragData | null>(null)
  const [destinationRequest, setDestinationRequest] =
    useState<DestinationRequest | null>(null)
  const [variantRequest, setVariantRequest] = useState<{
    sourceId: string
    title: string
  } | null>(null)
  const [highlightedCopyId, setHighlightedCopyId] = useState<string | null>(null)
  const highlightTimerRef = useRef<number | null>(null)

  const showError = useCallback((result: CommandResult<unknown>) => {
    if (!result.ok) toast.error(result.message)
    return result.ok
  }, [])

  useEffect(() => {
    const cancel = () => {
      setActiveDrag(null)
      setDndSession((session) => session + 1)
    }
    window.addEventListener('workshop:cancel-drag', cancel)
    return () => window.removeEventListener('workshop:cancel-drag', cancel)
  }, [])

  const highlightExistingCopy = useCallback((copyId: string) => {
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current)
    }

    setHighlightedCopyId(copyId)
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedCopyId(null)
      highlightTimerRef.current = null
    }, 650)
  }, [])

  useEffect(
    () => () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current)
      }
    },
    [],
  )

  const requestCopyMove = useCallback(
    (mode: 'move' | 'duplicate', copyId: string) => {
      const found = findCopyById(workspace.assembly.islandsById, copyId)
      if (!found) return
      setDestinationRequest({
        mode,
        fromIslandId: found.island.id,
        copy: found.copy,
        title: found.copy.title,
      })
    },
    [workspace.assembly.islandsById],
  )

  const activeStageKind = stageConfig[workspace.assembly.activeStage].sourceKind
  const activeIngredientKind =
    activeStageKind && activeStageKind !== 'user' ? activeStageKind : null

  const {
    handleMoveEnd,
    handleNodeDragStop,
    layoutAnimating,
    nodes,
    onNodesChange,
    setWrapperNode,
  } = useAssemblyCanvas({
    workspace,
    revision,
    actions,
    highlightedCopyId,
    reducedMotion,
    requestCopyMove,
    showError,
  })

  const sourceSections = activeStageKind
    ? buildSourceSections(workspace, activeStageKind)
    : []

  const seedUser = useCallback(
    (sourceId: string, position?: Point) => {
      const source = workspace.checkpoint.inventories.user.itemsById[sourceId]
      if (!source) return
      const targetPosition =
        position ??
        nextIslandPosition(Object.values(workspace.assembly.layout.freeformPositions))
      void actions.seedUserIsland(sourceId, targetPosition).then((result) => {
        if (!showError(result) || !result.ok) return
        if (!result.value.created) {
          toast.info('This user already has an island', {
            action: {
              label: 'Create variant',
              onClick: () => setVariantRequest({ sourceId, title: source.title }),
            },
          })
        }
      })
    },
    [
      actions,
      showError,
      workspace.assembly.layout.freeformPositions,
      workspace.checkpoint.inventories.user.itemsById,
    ],
  )

  const addSources = useCallback(
    (islandId: string, kind: IngredientKind, sourceIds: string[]) => {
      void actions.addSourcesToIsland(islandId, kind, sourceIds).then((result) => {
        if (!showError(result) || !result.ok) return
        if (result.value.alreadyPresentSourceIds.length) {
          const island = workspace.assembly.islandsById[islandId]
          const existing = Object.values(island?.copiesById ?? {}).find((copy) =>
            result.value.alreadyPresentSourceIds.includes(copy.sourceId),
          )
          if (existing) {
            highlightExistingCopy(existing.id)
          }
          toast.info('Already in this archetype')
        }
      })
    },
    [actions, highlightExistingCopy, showError, workspace.assembly.islandsById],
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as WorkshopDragData | undefined
    if (data) setActiveDrag(data)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const data = event.active.data.current as WorkshopDragData | undefined
      const overId = event.over?.id ? String(event.over.id) : null
      setActiveDrag(null)
      if (!data) return

      if (data.type === 'source' && data.kind === 'user') {
        if (overId !== 'assembly-canvas') {
          toast.info('Drop the user onto the open canvas')
          return
        }
        const rect = event.active.rect.current.translated
        if (!rect) return
        const point = screenToFlowPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        })
        seedUser(data.sourceId, { x: point.x - 204, y: point.y - 36 })
        return
      }

      if (!overId?.startsWith('layer:')) {
        if (!overId?.startsWith('copy:')) {
          toast.info('Drop onto a compatible archetype layer')
          return
        }

        const target = findCopyById(
          workspace.assembly.islandsById,
          overId.slice('copy:'.length),
        )
        if (!target) return
        const targetKind = target.copy.kind

        if (data.type === 'source') {
          if (data.kind !== targetKind) {
            toast.info('That source belongs in a different layer')
            return
          }
          addSources(target.island.id, targetKind, [data.sourceId])
          return
        }

        if (data.copy.kind !== targetKind) {
          toast.info('Local copies stay in their matching layer')
          return
        }
        if (data.fromIslandId !== target.island.id) {
          void actions
            .moveLocalCopyToIsland(data.fromIslandId, target.island.id, data.copy.id)
            .then(showError)
          return
        }

        const order = target.island.copyOrder[targetKind]
        const fromIndex = order.indexOf(data.copy.id)
        const toIndex = order.indexOf(target.copy.id)
        void actions
          .reorderLocalCopy(target.island.id, targetKind, fromIndex, toIndex)
          .then(showError)
        return
      }
      const [, targetIslandId, targetKindValue] = overId.split(':')
      const targetKind = targetKindValue as IngredientKind
      if (!targetIslandId) return

      if (data.type === 'source') {
        if (data.kind !== targetKind) {
          toast.info('That source belongs in a different layer')
          return
        }
        addSources(targetIslandId, targetKind, [data.sourceId])
        return
      }

      if (data.copy.kind !== targetKind) {
        toast.info('Local copies stay in their matching layer')
        return
      }
      if (data.fromIslandId === targetIslandId) return
      void actions
        .moveLocalCopyToIsland(data.fromIslandId, targetIslandId, data.copy.id)
        .then(showError)
    },
    [
      actions,
      addSources,
      screenToFlowPosition,
      seedUser,
      showError,
      workspace.assembly.islandsById,
    ],
  )

  const activateSource = useCallback(
    (sourceId: string) => {
      if (activeStageKind === 'user') {
        seedUser(sourceId)
        return
      }
      if (!activeIngredientKind) return
      const source =
        workspace.checkpoint.inventories[activeIngredientKind].itemsById[sourceId]
      if (!source) return
      setDestinationRequest({
        mode: 'source',
        sourceIds: [sourceId],
        kind: activeIngredientKind,
        title: source.title,
      })
    },
    [activeIngredientKind, activeStageKind, seedUser, workspace.checkpoint.inventories],
  )

  const activeTitle =
    workspace.assembly.layout.mode === 'tidy'
      ? stageConfig.final
      : stageConfig[workspace.assembly.activeStage]
  const showShelf =
    workspace.assembly.layout.mode === 'freeform' &&
    Boolean(activeStageKind) &&
    workspace.assembly.sourceShelfOpen

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  return (
    <DndContext
      key={dndSession}
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveDrag(null)}
      onDragEnd={handleDragEnd}
    >
      <AssemblyCanvasSurface
        onNode={setWrapperNode}
        layoutAnimating={layoutAnimating}
        style={kindStyle(activeStageKind ?? 'monetization')}
      >
        <div
          className="canvas-title-block assembly-title-block"
          data-shelf-open={showShelf}
        >
          <h1>{activeTitle.title}</h1>
          {activeTitle.description ? <p>{activeTitle.description}</p> : null}
        </div>

        {!workspace.assembly.firstContentMutationCommitted ? (
          <button
            type="button"
            className="button button-quiet unlock-inventories-button"
            onClick={() => {
              void actions.unlockInventoriesBeforeAssembly().then(showError)
            }}
          >
            Unlock inventories
          </button>
        ) : null}

        <ReactFlow<IslandFlowNode>
          nodes={nodes}
          edges={[]}
          nodeTypes={nodeTypes}
          defaultViewport={workspace.assembly.viewport}
          minZoom={0.24}
          maxZoom={1.45}
          panOnScroll
          panOnDrag={activeTool === 'pan'}
          selectionOnDrag={activeTool === 'select'}
          selectionMode={SelectionMode.Partial}
          nodesDraggable={
            workspace.assembly.layout.mode === 'freeform' && !layoutAnimating
          }
          nodesConnectable={false}
          deleteKeyCode={null}
          multiSelectionKeyCode="Shift"
          onNodesChange={onNodesChange}
          onNodeDragStop={handleNodeDragStop}
          onMoveEnd={handleMoveEnd}
          proOptions={{ hideAttribution: true }}
          aria-label="Archetype assembly canvas"
        />

        {activeStageKind ? (
          <SourceShelf
            kind={activeStageKind}
            checkpointVersion={workspace.checkpoint.revision}
            open={showShelf}
            sections={sourceSections}
            onClose={() => void actions.setSourceShelfOpen(false)}
            onActivateSource={activateSource}
            onActivateSection={
              activeIngredientKind
                ? (section) =>
                    setDestinationRequest({
                      mode: 'source',
                      sourceIds: section.items.map((item) => item.id),
                      kind: activeIngredientKind,
                      title: section.title,
                    })
                : undefined
            }
          />
        ) : null}

        {!showShelf &&
        activeStageKind &&
        workspace.assembly.layout.mode === 'freeform' ? (
          <button
            type="button"
            className="button shelf-reopen"
            onClick={() => void actions.setSourceShelfOpen(true)}
          >
            <PanelLeftOpen size={17} aria-hidden="true" />
            Open locked {kindConfig[activeStageKind].plural.toLowerCase()}
          </button>
        ) : null}

        <CanvasToolbar
          phase="assembly"
          activeTool={activeTool}
          shelfOpen={showShelf}
          onToolChange={setActiveTool}
          onShelfToggle={() => void actions.setSourceShelfOpen(!showShelf)}
          onFit={() =>
            void fitView({ padding: 0.18, duration: reducedMotion ? 0 : 240 })
          }
        />

        {destinationRequest ? (
          <DestinationDialog
            title={
              destinationRequest.mode === 'source'
                ? `Add “${destinationRequest.title}”`
                : `${destinationRequest.mode === 'move' ? 'Move' : 'Duplicate'} “${destinationRequest.title}”`
            }
            destinations={workspace.assembly.islandOrder
              .map((islandId) => workspace.assembly.islandsById[islandId])
              .filter((island): island is UserIsland => Boolean(island))
              .map((island) => {
                const currentIsland =
                  destinationRequest.mode !== 'source' &&
                  destinationRequest.fromIslandId === island.id
                const sourceIds =
                  destinationRequest.mode === 'source'
                    ? destinationRequest.sourceIds
                    : [destinationRequest.copy.sourceId]
                const alreadyPresent = sourceIds.filter((sourceId) =>
                  containsSource(island, sourceId),
                ).length
                const newCount = sourceIds.length - alreadyPresent
                const conflict = newCount === 0
                return {
                  id: island.id,
                  title: island.userTitle,
                  disabled: currentIsland || conflict,
                  reason: currentIsland
                    ? 'Current archetype'
                    : conflict
                      ? 'Already included'
                      : alreadyPresent > 0
                        ? `${newCount} new · ${alreadyPresent} already here`
                        : undefined,
                }
              })}
            onCancel={() => setDestinationRequest(null)}
            onChoose={(islandId) => {
              if (destinationRequest.mode === 'source') {
                addSources(
                  islandId,
                  destinationRequest.kind,
                  destinationRequest.sourceIds,
                )
              } else {
                const command =
                  destinationRequest.mode === 'move'
                    ? actions.moveLocalCopyToIsland(
                        destinationRequest.fromIslandId,
                        islandId,
                        destinationRequest.copy.id,
                      )
                    : actions.duplicateLocalCopyToIsland(
                        destinationRequest.fromIslandId,
                        islandId,
                        destinationRequest.copy.id,
                      )
                void command.then(showError)
              }
              setDestinationRequest(null)
            }}
          />
        ) : null}

        {variantRequest ? (
          <VariantDialog
            userTitle={variantRequest.title}
            onCancel={() => setVariantRequest(null)}
            onCreate={(name) =>
              actions
                .createUserVariant(
                  variantRequest.sourceId,
                  name,
                  nextIslandPosition(
                    Object.values(workspace.assembly.layout.freeformPositions),
                  ),
                )
                .then((result) => {
                  const created = showError(result)
                  if (created) setVariantRequest(null)
                  return created
                })
            }
          />
        ) : null}

        <DragOverlay dropAnimation={null}>
          {activeDrag ? (
            <div
              className="drag-overlay"
              style={kindStyle(
                activeDrag.type === 'source' ? activeDrag.kind : activeDrag.copy.kind,
              )}
            >
              {activeDrag.type === 'source' ? activeDrag.title : activeDrag.copy.title}
              {activeDrag.type === 'source' ? (
                <span className="copy-badge">
                  <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
                </span>
              ) : null}
            </div>
          ) : null}
        </DragOverlay>
      </AssemblyCanvasSurface>
    </DndContext>
  )
}

export function AssemblyWorkspace(props: AssemblyWorkspaceProps) {
  return (
    <ReactFlowProvider>
      <AssemblyWorkspaceInner {...props} />
    </ReactFlowProvider>
  )
}
