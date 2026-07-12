import { useGSAP } from '@gsap/react'
import {
  type FitViewOptions,
  type OnMoveEnd,
  type OnNodeDrag,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'

import type {
  AssemblyPhaseState,
  CommandResult,
  UserIsland,
} from '../../../domain/types'
import type { WorkspaceActions } from '../../../state/workspace-store'
import { stageConfig } from '../../workshop/kind-config'
import { resolveVerticalOverlaps } from '../layout/resolve-overlaps'
import type { IslandFlowNode } from '../view-models'
import { measureCanvasSafePadding } from './canvas-safe-padding'

gsap.registerPlugin(useGSAP, CustomEase)
CustomEase.create('workshop-layout', '0.77,0,0.175,1')

type IslandSurface = { id: string; element: HTMLElement }
type VisibleIslandRects = Map<string, { left: number; top: number }>
type LayoutRequestDetail = { mode: 'tidy' | 'freeform' }
type SafeFitViewOptions = Omit<FitViewOptions<IslandFlowNode>, 'padding'>

type UseAssemblyCanvasOptions = {
  workspace: AssemblyPhaseState
  revision: number
  actions: WorkspaceActions
  highlightedCopyId: string | null
  reducedMotion: boolean
  requestCopyMove: (mode: 'move' | 'duplicate', copyId: string) => void
  showError: (result: CommandResult<unknown>) => boolean
}

function getIslandSurfaces(root: HTMLElement | null): IslandSurface[] {
  if (!root) return []

  return Array.from(
    root.querySelectorAll<HTMLElement>('.react-flow__node-island'),
  ).flatMap((node) => {
    const id = node.dataset.id
    const element = node.querySelector<HTMLElement>(':scope > .user-island')
    return id && element ? [{ id, element }] : []
  })
}

function measureCompactIslandHeights(
  root: HTMLElement | null,
  surfaces: IslandSurface[],
): Record<string, number> {
  if (!root) return {}

  root.dataset.tidyMeasuring = 'true'
  try {
    return Object.fromEntries(
      surfaces.map(({ id, element }) => [id, element.offsetHeight]),
    )
  } finally {
    delete root.dataset.tidyMeasuring
  }
}

export function useAssemblyCanvas({
  workspace,
  revision,
  actions,
  highlightedCopyId,
  reducedMotion,
  requestCopyMove,
  showError,
}: UseAssemblyCanvasOptions) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const setWrapperNode = useCallback((node: HTMLDivElement | null) => {
    wrapperRef.current = node
  }, [])
  const { fitView, getViewport } = useReactFlow<IslandFlowNode>()
  const [layoutAnimating, setLayoutAnimating] = useState(false)
  const previousLayoutMode = useRef(workspace.assembly.layout.mode)
  const layoutTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const flipRequestRef = useRef(0)
  const fitAfterLayoutRef = useRef(false)
  const reflowFrameRef = useRef<number | null>(null)
  const reflowCommitRef = useRef(false)
  const pendingReflowRectsRef = useRef<VisibleIslandRects | null>(null)
  const lastIslandDimensionsRef = useRef(
    new Map<string, { width: number; height: number }>(),
  )
  const focusAfterReflowRef = useRef<string[]>([])
  const { contextSafe } = useGSAP({ scope: wrapperRef })

  const fitWithSafePadding = useCallback(
    (options: SafeFitViewOptions = {}) => {
      window.requestAnimationFrame(() => {
        void fitView({
          ...options,
          padding: measureCanvasSafePadding(wrapperRef.current),
        })
      })
    },
    [fitView],
  )

  const fitCanvas = useCallback(() => {
    fitWithSafePadding({ duration: reducedMotion ? 0 : 240 })
  }, [fitWithSafePadding, reducedMotion])

  const fitAfterLayout = useCallback(() => {
    if (!fitAfterLayoutRef.current) return
    fitAfterLayoutRef.current = false
    fitWithSafePadding({
      maxZoom: 1,
      duration: reducedMotion ? 0 : 220,
    })
  }, [fitWithSafePadding, reducedMotion])

  const focusGrownIslands = useCallback(() => {
    const islandIds = focusAfterReflowRef.current
    focusAfterReflowRef.current = []
    if (!islandIds.length) return
    const currentZoom = getViewport().zoom
    fitWithSafePadding({
      nodes: islandIds.map((id) => ({ id })),
      minZoom: Math.min(islandIds.length > 1 ? 0.46 : 0.62, currentZoom),
      maxZoom: currentZoom,
      duration: reducedMotion ? 0 : 220,
    })
  }, [fitWithSafePadding, getViewport, reducedMotion])

  useEffect(() => {
    const handleLayoutRequest = (event: Event) => {
      const mode = (event as CustomEvent<LayoutRequestDetail>).detail?.mode
      if (mode !== 'tidy' && mode !== 'freeform') return

      fitAfterLayoutRef.current = true
      const command =
        mode === 'tidy'
          ? (() => {
              const root = wrapperRef.current
              const surfaces = getIslandSurfaces(root)
              const islandHeights = measureCompactIslandHeights(root, surfaces)
              return actions.tidyIslands(
                { x: 70, y: 90 },
                {
                  columns:
                    (root?.clientWidth ?? 1200) < 1200 && surfaces.length <= 4 ? 2 : 3,
                  columnWidth: 440,
                  rowGap: 40,
                  islandHeights,
                },
              )
            })()
          : actions.restoreFreeform()

      void command.then((result) => {
        if (result.ok) return
        fitAfterLayoutRef.current = false
        showError(result)
      })
    }

    window.addEventListener('workshop:layout-request', handleLayoutRequest)
    return () =>
      window.removeEventListener('workshop:layout-request', handleLayoutRequest)
  }, [actions, showError])

  const activeStageKind = stageConfig[workspace.assembly.activeStage].sourceKind
  const positions =
    workspace.assembly.layout.mode === 'tidy' && workspace.assembly.layout.tidyPositions
      ? workspace.assembly.layout.tidyPositions
      : workspace.assembly.layout.freeformPositions

  const buildNodes = useCallback((): IslandFlowNode[] => {
    return workspace.assembly.islandOrder
      .map((islandId) => workspace.assembly.islandsById[islandId])
      .filter((island): island is UserIsland => Boolean(island))
      .map((island) => ({
        id: island.id,
        type: 'island',
        position: positions[island.id] ?? { x: 360, y: 120 },
        zIndex: 2,
        draggable: workspace.assembly.layout.mode === 'freeform',
        dragHandle: '.drag-handle',
        selectable: true,
        focusable: false,
        data: {
          island,
          activeKind:
            workspace.assembly.layout.mode === 'tidy' ? null : activeStageKind,
          highlightedCopyId,
          onEditUser: (islandId, title, note) => {
            void actions
              .updateUserIsland(islandId, { userTitle: title, userNote: note })
              .then(showError)
          },
          onEditCopy: (islandId, copyId, title, note) => {
            void actions
              .updateLocalCopy(islandId, copyId, { title, note })
              .then(showError)
          },
          onReorderCopy: (islandId, kind, fromIndex, toIndex) => {
            void actions
              .reorderLocalCopy(islandId, kind, fromIndex, toIndex)
              .then(showError)
          },
          onMoveCopy: (copyId) => requestCopyMove('move', copyId),
          onDuplicateCopy: (copyId) => requestCopyMove('duplicate', copyId),
          onDeleteCopy: (islandId, copyId) => {
            void actions.removeLocalCopy(islandId, copyId).then((result) => {
              if (showError(result)) {
                toast.success('Removed', {
                  action: { label: 'Undo', onClick: () => void actions.undo() },
                })
              }
            })
          },
          onDeleteIsland: (islandId) => {
            void actions.deleteIsland(islandId).then((result) => {
              if (showError(result)) {
                toast.success('Archetype removed', {
                  action: { label: 'Undo', onClick: () => void actions.undo() },
                })
              }
            })
          },
        },
      }))
  }, [
    actions,
    activeStageKind,
    highlightedCopyId,
    positions,
    requestCopyMove,
    showError,
    workspace.assembly.islandOrder,
    workspace.assembly.islandsById,
    workspace.assembly.layout.mode,
  ])

  const [nodes, setNodes, onNodesChange] = useNodesState<IslandFlowNode>(buildNodes())

  const startLayoutFlip = useMemo(
    () =>
      contextSafe((visibleRects: VisibleIslandRects) => {
        const surfaces = getIslandSurfaces(wrapperRef.current)
        const movements = surfaces.flatMap(({ id, element }) => {
          const before = visibleRects.get(id)
          if (!before) return []
          const after = element.getBoundingClientRect()
          const x = before.left - after.left
          const y = before.top - after.top
          return Math.abs(x) > 0.5 || Math.abs(y) > 0.5 ? [{ element, x, y }] : []
        })

        if (movements.length === 0) {
          setLayoutAnimating(false)
          fitAfterLayout()
          focusGrownIslands()
          return
        }

        const elements = surfaces.map(({ element }) => element)
        const finish = () => {
          gsap.set(elements, { clearProps: 'transform' })
          layoutTimelineRef.current = null
          setLayoutAnimating(false)
          fitAfterLayout()
          focusGrownIslands()
        }
        const timeline = gsap.timeline({
          paused: true,
          onComplete: finish,
          onInterrupt: () => {
            layoutTimelineRef.current = null
            setLayoutAnimating(false)
          },
        })

        movements.forEach(({ element, x, y }) => {
          timeline.fromTo(
            element,
            { x, y },
            {
              x: 0,
              y: 0,
              duration: 0.28,
              ease: 'workshop-layout',
              overwrite: 'auto',
            },
            0,
          )
        })
        layoutTimelineRef.current = timeline
        timeline.play(0)
      }),
    [contextSafe, fitAfterLayout, focusGrownIslands],
  )

  useEffect(() => {
    if (
      workspace.assembly.layout.mode !== 'freeform' ||
      layoutAnimating ||
      reflowCommitRef.current
    ) {
      return
    }
    if (reflowFrameRef.current !== null) {
      window.cancelAnimationFrame(reflowFrameRef.current)
    }
    reflowFrameRef.current = window.requestAnimationFrame(() => {
      reflowFrameRef.current = null
      const surfaces = getIslandSurfaces(wrapperRef.current)
      if (surfaces.length === 0) return
      const dimensions = new Map(
        surfaces.map(({ id, element }) => [
          id,
          { width: element.offsetWidth, height: element.offsetHeight },
        ]),
      )
      const rootRect = wrapperRef.current?.getBoundingClientRect()
      const growthState = surfaces.map(({ id, element }) => {
        const previous = lastIslandDimensionsRef.current.get(id)
        const current = dimensions.get(id)
        const rect = element.getBoundingClientRect()
        const grew = Boolean(
          previous && current && current.height > previous.height + 1,
        )
        const outside = Boolean(
          rootRect &&
          (rect.bottom > rootRect.bottom - 24 || rect.top < rootRect.top + 24),
        )
        return { id, grew, outside }
      })
      const grownIslandIds = growthState.flatMap(({ id, grew }) => (grew ? [id] : []))
      const grownOutsideViewport = growthState.flatMap(({ id, grew, outside }) =>
        grew && outside ? [id] : [],
      )
      lastIslandDimensionsRef.current = dimensions
      const boxes = workspace.assembly.islandOrder.flatMap((id) => {
        const position = workspace.assembly.layout.freeformPositions[id]
        const size = dimensions.get(id)
        return position && size ? [{ id, position, size }] : []
      })
      const nextPositions = resolveVerticalOverlaps(boxes)
      const updates = Object.fromEntries(
        boxes.flatMap((box) => {
          const next = nextPositions[box.id]
          if (!next) return []
          return next.x !== box.position.x || next.y !== box.position.y
            ? [[box.id, next] as const]
            : []
        }),
      )
      const displacedIslandIds = Object.keys(updates)
      if (displacedIslandIds.length) {
        const displacedBoxes = boxes.filter((box) => updates[box.id])
        focusAfterReflowRef.current = boxes.flatMap((box) =>
          displacedBoxes.some(
            (displaced) =>
              box.position.x < displaced.position.x + displaced.size.width &&
              box.position.x + box.size.width > displaced.position.x,
          )
            ? [box.id]
            : [],
        )
      } else if (grownOutsideViewport.length) {
        focusAfterReflowRef.current = [
          ...new Set([...grownIslandIds, ...grownOutsideViewport]),
        ]
      }
      if (Object.keys(updates).length === 0) {
        focusGrownIslands()
        return
      }

      pendingReflowRectsRef.current = new Map(
        surfaces.map(({ id, element }) => {
          const rect = element.getBoundingClientRect()
          return [id, { left: rect.left, top: rect.top }]
        }),
      )
      reflowCommitRef.current = true
      if (!reducedMotion) setLayoutAnimating(true)
      void actions.stabilizeAssemblyLayout(updates, revision).then((result) => {
        reflowCommitRef.current = false
        if (result.ok) return
        pendingReflowRectsRef.current = null
        setLayoutAnimating(false)
        showError(result)
      })
    })
    return () => {
      if (reflowFrameRef.current !== null) {
        window.cancelAnimationFrame(reflowFrameRef.current)
        reflowFrameRef.current = null
      }
    }
  }, [
    actions,
    focusGrownIslands,
    layoutAnimating,
    reducedMotion,
    revision,
    showError,
    workspace.assembly.islandOrder,
    workspace.assembly.layout.freeformPositions,
    workspace.assembly.layout.mode,
  ])

  useLayoutEffect(() => {
    const nextNodes = buildNodes()
    const layoutChanged = workspace.assembly.layout.mode !== previousLayoutMode.current

    if (reducedMotion && layoutTimelineRef.current) {
      const timeline = layoutTimelineRef.current
      timeline.progress(1)
      timeline.kill()
      layoutTimelineRef.current = null
    }

    if (reducedMotion) {
      flipRequestRef.current += 1
      gsap.set(
        getIslandSurfaces(wrapperRef.current).map(({ element }) => element),
        { clearProps: 'transform' },
      )
    }

    const pendingReflowRects = pendingReflowRectsRef.current
    if (pendingReflowRects) {
      pendingReflowRectsRef.current = null
      setNodes(nextNodes)
      if (reducedMotion) {
        setLayoutAnimating(false)
        window.requestAnimationFrame(focusGrownIslands)
      } else {
        window.queueMicrotask(() => startLayoutFlip(pendingReflowRects))
      }
      return
    }

    if (layoutChanged) {
      previousLayoutMode.current = workspace.assembly.layout.mode
      const surfaces = getIslandSurfaces(wrapperRef.current)

      if (!reducedMotion && surfaces.length > 0) {
        const requestId = flipRequestRef.current + 1
        flipRequestRef.current = requestId
        const visibleRects = new Map(
          surfaces.map(({ id, element }) => {
            const rect = element.getBoundingClientRect()
            return [id, { left: rect.left, top: rect.top }]
          }),
        )
        layoutTimelineRef.current?.kill()
        gsap.set(
          surfaces.map(({ element }) => element),
          { clearProps: 'transform' },
        )
        setLayoutAnimating(true)
        setNodes(nextNodes)
        window.queueMicrotask(() => {
          if (flipRequestRef.current === requestId) {
            startLayoutFlip(visibleRects)
          }
        })
        return
      } else {
        setLayoutAnimating(false)
      }
    }

    setNodes(nextNodes)
    if (layoutChanged) fitAfterLayout()
  }, [
    buildNodes,
    reducedMotion,
    revision,
    setNodes,
    startLayoutFlip,
    fitAfterLayout,
    focusGrownIslands,
    workspace.assembly.layout.mode,
  ])

  useEffect(
    () => () => {
      flipRequestRef.current += 1
      layoutTimelineRef.current?.kill()
      if (reflowFrameRef.current !== null) {
        window.cancelAnimationFrame(reflowFrameRef.current)
      }
    },
    [],
  )

  const handleNodeDragStop: OnNodeDrag<IslandFlowNode> = useCallback(
    (_, node) => {
      if (workspace.assembly.layout.mode !== 'freeform') return
      void actions.moveIsland(node.id, node.position).then((result) => {
        if (!showError(result)) setNodes(buildNodes())
      })
    },
    [actions, buildNodes, setNodes, showError, workspace.assembly.layout.mode],
  )

  const handleMoveEnd: OnMoveEnd = useCallback(
    (_, viewport) => void actions.setAssemblyViewport(viewport).then(showError),
    [actions, showError],
  )

  return {
    fitCanvas,
    handleMoveEnd,
    handleNodeDragStop,
    layoutAnimating,
    nodes,
    onNodesChange,
    setWrapperNode,
  }
}
