import {
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  type NodeChange,
  type OnNodeDrag,
  type OnMoveEnd,
  type OnSelectionChangeParams,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import { LockKeyhole, MousePointer2, Scan } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { AddItemDialog } from '../../components/AddItemDialog'
import { CanvasToolbar } from '../../components/CanvasToolbar'
import { CategoryPickerDialog } from '../../components/CategoryPickerDialog'
import { EmptyState } from '../../components/EmptyState'
import type {
  CommandResult,
  InventoryBoard,
  InventoryKind,
  Point,
} from '../../domain/types'
import type { WorkspaceActions } from '../../state/workspace-store'
import { useReducedMotion } from '../../hooks/use-reduced-motion'
import { kindConfig, kindStyle } from '../workshop/kind-config'
import { CategoryNode } from './CategoryNode'
import { InventoryCardNode } from './InventoryCardNode'
import { resolveVerticalOverlaps } from './layout/resolve-overlaps'
import type {
  CategoryFlowNode,
  InventoryCardFlowNode,
  WorkshopFlowNode,
} from './view-models'

const nodeTypes = {
  'inventory-card': InventoryCardNode,
  category: CategoryNode,
}

type InventoryWorkspaceProps = {
  kind: InventoryKind
  board: InventoryBoard
  readOnly: boolean
  revision: number
  actions: WorkspaceActions
}

type PendingAdd = { position: Point } | null

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('input, textarea, button, [role="menu"], [role="dialog"]'))
  )
}

function InventoryWorkspaceInner({
  kind,
  board,
  readOnly,
  revision,
  actions,
}: InventoryWorkspaceProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, fitView } = useReactFlow<WorkshopFlowNode>()
  const reducedMotion = useReducedMotion()
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select')
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [pendingAdd, setPendingAdd] = useState<PendingAdd>(null)
  const [categoryPickerItemId, setCategoryPickerItemId] = useState<string | null>(null)
  const layoutFrameRef = useRef<number | null>(null)
  const layoutCommitRef = useRef(false)

  const showError = useCallback((result: CommandResult<unknown>) => {
    if (!result.ok) toast.error(result.message)
    return result.ok
  }, [])

  const updateItem = useCallback(
    (itemId: string, title: string, note: string) => {
      void actions.updateInventoryItem(kind, itemId, { title, note }).then(showError)
    },
    [actions, kind, showError],
  )

  const duplicateItem = useCallback(
    (itemId: string) => {
      void actions.duplicateInventoryItems(kind, [itemId]).then(showError)
    },
    [actions, kind, showError],
  )

  const deleteItems = useCallback(
    (itemIds: string[]) => {
      if (!itemIds.length || readOnly) return
      void actions.deleteInventoryItems(kind, itemIds).then((result) => {
        if (!showError(result)) return
        toast.success(
          `Deleted ${itemIds.length} ${itemIds.length === 1 ? 'item' : 'items'}`,
          {
            action: { label: 'Undo', onClick: () => void actions.undo() },
          },
        )
      })
    },
    [actions, kind, readOnly, showError],
  )

  const renameCategory = useCallback(
    (categoryId: string, title: string) => {
      void actions.updateInventoryCategory(kind, categoryId, { title }).then(showError)
    },
    [actions, kind, showError],
  )

  const deleteCategory = useCallback(
    (categoryId: string) => {
      void actions.deleteCategoryPreservingItems(kind, categoryId).then((result) => {
        if (showError(result)) {
          toast.success('Category removed. Its cards are uncategorised.', {
            action: { label: 'Undo', onClick: () => void actions.undo() },
          })
        }
      })
    },
    [actions, kind, showError],
  )

  const resizeCategory = useCallback(
    (categoryId: string, width: number, height: number) => {
      void actions
        .updateInventoryCategory(kind, categoryId, { size: { width, height } })
        .then(showError)
    },
    [actions, kind, showError],
  )

  const buildNodes = useCallback((): WorkshopFlowNode[] => {
    const categoryNodes: CategoryFlowNode[] = Object.values(board.categoriesById).map(
      (category) => ({
        id: category.id,
        type: 'category',
        position: category.position,
        width: category.size.width,
        height: category.size.height,
        zIndex: 0,
        draggable: !readOnly,
        dragHandle: '.drag-handle',
        selectable: true,
        focusable: false,
        data: {
          categoryId: category.id,
          kind,
          title: category.title,
          itemCount: Object.values(board.itemsById).filter(
            (item) => item.categoryId === category.id,
          ).length,
          readOnly,
          onRename: renameCategory,
          onDelete: deleteCategory,
          onResize: resizeCategory,
        },
      }),
    )

    const itemNodes: InventoryCardFlowNode[] = Object.values(board.itemsById).map(
      (item) => ({
        id: item.id,
        type: 'inventory-card',
        position: item.position,
        zIndex: 3,
        draggable: !readOnly,
        selectable: true,
        focusable: false,
        data: {
          itemId: item.id,
          kind,
          title: item.title,
          note: item.note,
          readOnly,
          onUpdate: updateItem,
          onDuplicate: duplicateItem,
          onDelete: (itemId) => deleteItems([itemId]),
          onMoveToCategory: setCategoryPickerItemId,
        },
      }),
    )
    return [...categoryNodes, ...itemNodes]
  }, [
    board.categoriesById,
    board.itemsById,
    deleteCategory,
    deleteItems,
    duplicateItem,
    kind,
    readOnly,
    renameCategory,
    resizeCategory,
    updateItem,
  ])

  const [nodes, setNodes, onNodesChangeBase] =
    useNodesState<WorkshopFlowNode>(buildNodes())

  useEffect(() => {
    setNodes(buildNodes())
  }, [buildNodes, revision, setNodes])

  useEffect(() => {
    if (readOnly || layoutCommitRef.current) return
    if (layoutFrameRef.current !== null) {
      window.cancelAnimationFrame(layoutFrameRef.current)
    }
    layoutFrameRef.current = window.requestAnimationFrame(() => {
      layoutFrameRef.current = null
      const nodeById = new Map(nodes.map((node) => [node.id, node]))
      const boxes = Object.values(board.categoriesById).map((category) => {
        const itemBoxes = Object.values(board.itemsById).flatMap((item) => {
          if (item.categoryId !== category.id) return []
          const itemNode = nodeById.get(item.id)
          return [
            {
              id: item.id,
              position: item.position,
              size: {
                width: itemNode?.measured?.width ?? itemNode?.width ?? 220,
                height: itemNode?.measured?.height ?? itemNode?.height ?? 112,
              },
            },
          ]
        })
        const itemPositions = resolveVerticalOverlaps(itemBoxes, 16)
        let width = category.size.width
        let height = category.size.height
        for (const itemBox of itemBoxes) {
          const itemPosition = itemPositions[itemBox.id] ?? itemBox.position
          width = Math.max(
            width,
            itemPosition.x + itemBox.size.width + 18 - category.position.x,
          )
          height = Math.max(
            height,
            itemPosition.y + itemBox.size.height + 18 - category.position.y,
          )
        }
        return {
          id: category.id,
          position: category.position,
          size: { width, height },
          itemPositions,
        }
      })
      const positions = resolveVerticalOverlaps(boxes)
      const updates = Object.fromEntries(
        boxes.flatMap((box) => {
          const category = board.categoriesById[box.id]
          const position = positions[box.id]
          if (!category || !position) return []
          const changed =
            position.x !== category.position.x ||
            position.y !== category.position.y ||
            box.size.width > category.size.width + 0.5 ||
            box.size.height > category.size.height + 0.5 ||
            Object.entries(box.itemPositions).some(([itemId, itemPosition]) => {
              const current = board.itemsById[itemId]?.position
              return (
                current &&
                (current.x !== itemPosition.x || current.y !== itemPosition.y)
              )
            })
          return changed
            ? [
                [
                  box.id,
                  { position, size: box.size, itemPositions: box.itemPositions },
                ] as const,
              ]
            : []
        }),
      )
      if (Object.keys(updates).length === 0) return
      layoutCommitRef.current = true
      void actions.stabilizeInventoryLayout(kind, updates, revision).then((result) => {
        layoutCommitRef.current = false
        showError(result)
      })
    })
    return () => {
      if (layoutFrameRef.current !== null) {
        window.cancelAnimationFrame(layoutFrameRef.current)
        layoutFrameRef.current = null
      }
    }
  }, [
    actions,
    board.categoriesById,
    board.itemsById,
    kind,
    nodes,
    readOnly,
    revision,
    showError,
  ])

  const onNodesChange = useCallback(
    (changes: NodeChange<WorkshopFlowNode>[]) => onNodesChangeBase(changes),
    [onNodesChangeBase],
  )

  const selectedNodes = useMemo(() => nodes.filter((node) => node.selected), [nodes])

  const getTargetCategory = useCallback(
    (position: Point): string | null => {
      const centre = { x: position.x + 110, y: position.y + 39 }
      const categories = Object.values(board.categoriesById).reverse()
      return (
        categories.find(
          (category) =>
            centre.x >= category.position.x &&
            centre.x <= category.position.x + category.size.width &&
            centre.y >= category.position.y &&
            centre.y <= category.position.y + category.size.height,
        )?.id ?? null
      )
    },
    [board.categoriesById],
  )

  const handleNodeDragStop: OnNodeDrag<WorkshopFlowNode> = useCallback(
    (_, draggedNode) => {
      if (readOnly) return
      if (draggedNode.type === 'category') {
        void actions
          .updateInventoryCategory(kind, draggedNode.id, {
            position: draggedNode.position,
          })
          .then((result) => {
            if (!showError(result)) setNodes(buildNodes())
          })
        return
      }

      const movedNodes = nodes.filter(
        (node) =>
          node.type === 'inventory-card' &&
          (node.id === draggedNode.id || node.selected),
      )
      const positions = Object.fromEntries(
        movedNodes.map((node) => [node.id, node.position]),
      )
      const targetCategoryId = getTargetCategory(draggedNode.position)
      void actions
        .moveInventoryItemsToCategory(kind, positions, targetCategoryId)
        .then((result) => {
          if (!showError(result)) setNodes(buildNodes())
        })
    },
    [
      actions,
      buildNodes,
      getTargetCategory,
      kind,
      nodes,
      readOnly,
      setNodes,
      showError,
    ],
  )

  const handleSelectionChange = useCallback(
    ({ nodes: nextSelection }: OnSelectionChangeParams<WorkshopFlowNode>) => {
      setSelectedItemIds(
        nextSelection
          .filter((node) => node.type === 'inventory-card')
          .map((node) => node.id),
      )
    },
    [],
  )

  const handleMoveEnd: OnMoveEnd = useCallback(
    (_, viewport) => {
      void actions.setInventoryViewport(kind, viewport).then(showError)
    },
    [actions, kind, showError],
  )

  const openAddAtCentre = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect) return
    const itemCount = Object.keys(board.itemsById).length
    const slot = itemCount % 6
    const row = Math.floor(itemCount / 6)
    const offsets = [
      { x: 0, y: 0 },
      { x: 258, y: 0 },
      { x: -258, y: 0 },
      { x: 0, y: 126 },
      { x: 258, y: 126 },
      { x: -258, y: 126 },
    ]
    const offset = offsets[slot]
    setPendingAdd({
      position: screenToFlowPosition({
        x: rect.left + rect.width * 0.5 - 110 + offset.x,
        y: rect.top + rect.height * 0.44 + offset.y + row * 252,
      }),
    })
  }, [board.itemsById, screenToFlowPosition])

  const groupSelected = useCallback(() => {
    const itemNodes = selectedNodes.filter(
      (node): node is InventoryCardFlowNode => node.type === 'inventory-card',
    )
    if (itemNodes.length < 2) return
    const minX = Math.min(...itemNodes.map((node) => node.position.x)) - 38
    const minY = Math.min(...itemNodes.map((node) => node.position.y)) - 68
    const maxX = Math.max(...itemNodes.map((node) => node.position.x + 220)) + 38
    const maxY = Math.max(...itemNodes.map((node) => node.position.y + 88)) + 38
    void actions
      .groupInventoryItems(
        kind,
        itemNodes.map((node) => node.id),
        'New category',
        { x: minX, y: minY },
        { width: Math.max(320, maxX - minX), height: Math.max(220, maxY - minY) },
      )
      .then((result) => {
        showError(result)
      })
  }, [actions, kind, selectedNodes, showError])

  const createCategoryAtCentre = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect) return
    const count = Object.keys(board.categoriesById).length
    const position = screenToFlowPosition({
      x: rect.left + rect.width * 0.5 - 160 + (count % 3) * 28,
      y: rect.top + rect.height * 0.48 + Math.floor(count / 3) * 28,
    })
    void actions
      .createInventoryCategory({ kind, title: 'New category', position })
      .then(showError)
  }, [actions, board.categoriesById, kind, screenToFlowPosition, showError])

  const nudgeSelected = useCallback(
    (delta: Point) => {
      const itemNodes = selectedNodes.filter(
        (node): node is InventoryCardFlowNode => node.type === 'inventory-card',
      )
      if (!itemNodes.length) return
      const positions = Object.fromEntries(
        itemNodes.map((node) => [
          node.id,
          { x: node.position.x + delta.x, y: node.position.y + delta.y },
        ]),
      )
      void actions.moveInventoryItems(kind, positions).then(showError)
    },
    [actions, kind, selectedNodes, showError],
  )

  const pickerItem = categoryPickerItemId
    ? board.itemsById[categoryPickerItemId]
    : undefined

  return (
    <div
      ref={wrapperRef}
      className="workspace-main"
      style={kindStyle(kind)}
      onKeyDown={(event) => {
        if (readOnly || isInteractiveTarget(event.target)) return
        if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault()
          const categoryIds = selectedNodes
            .filter((node) => node.type === 'category')
            .map((node) => node.id)
          deleteItems(selectedItemIds)
          categoryIds.forEach(deleteCategory)
        }
        if (!event.shiftKey) return
        const amount = event.metaKey || event.ctrlKey ? 32 : 8
        const delta =
          event.key === 'ArrowLeft'
            ? { x: -amount, y: 0 }
            : event.key === 'ArrowRight'
              ? { x: amount, y: 0 }
              : event.key === 'ArrowUp'
                ? { x: 0, y: -amount }
                : event.key === 'ArrowDown'
                  ? { x: 0, y: amount }
                  : null
        if (delta) {
          event.preventDefault()
          nudgeSelected(delta)
        }
      }}
    >
      <div className="canvas-title-block">
        <h1>{kindConfig[kind].inventoryTitle}</h1>
      </div>

      {readOnly ? (
        <div className="locked-view-badge">
          <LockKeyhole size={15} aria-hidden="true" />
          Inventory v1 · read only
        </div>
      ) : null}

      <ReactFlow<WorkshopFlowNode>
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        defaultViewport={board.viewport}
        minZoom={0.25}
        maxZoom={1.8}
        fitView={false}
        panOnScroll
        panOnDrag={activeTool === 'pan'}
        selectionOnDrag={activeTool === 'select' && !readOnly}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode="Shift"
        deleteKeyCode={null}
        nodesDraggable={!readOnly}
        nodesConnectable={false}
        elementsSelectable
        elevateNodesOnSelect
        onNodesChange={onNodesChange}
        onNodeDragStop={handleNodeDragStop}
        onSelectionChange={handleSelectionChange}
        onMoveEnd={handleMoveEnd}
        onPaneClick={(event) => {
          if (readOnly || event.detail !== 2) return
          setPendingAdd({
            position: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
          })
        }}
        proOptions={{ hideAttribution: true }}
        aria-label={`${kindConfig[kind].inventoryTitle}${readOnly ? ', read only' : ''}`}
      />

      {!readOnly && Object.keys(board.itemsById).length === 0 ? (
        <EmptyState kind={kind} onAdd={openAddAtCentre} />
      ) : null}

      {readOnly ? (
        <div className="canvas-toolbar" role="toolbar" aria-label="Canvas controls">
          <button
            type="button"
            className="tool-button"
            data-active="true"
            aria-label="Select"
          >
            <MousePointer2 size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="tool-button"
            aria-label="Fit board to view"
            onClick={() =>
              void fitView({ padding: 0.22, duration: reducedMotion ? 0 : 220 })
            }
          >
            <Scan size={20} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <CanvasToolbar
          phase="inventory"
          activeTool={activeTool}
          canGroup={selectedItemIds.length >= 2}
          onToolChange={setActiveTool}
          onAdd={openAddAtCentre}
          onCreateCategory={createCategoryAtCentre}
          onGroup={groupSelected}
          onFit={() =>
            void fitView({ padding: 0.22, duration: reducedMotion ? 0 : 220 })
          }
        />
      )}

      {pendingAdd ? (
        <AddItemDialog
          kind={kind}
          onCancel={() => setPendingAdd(null)}
          onCreate={(title, note) =>
            actions
              .createInventoryItem({ kind, title, note, position: pendingAdd.position })
              .then((result) => {
                const created = showError(result)
                if (created) setPendingAdd(null)
                return created
              })
          }
        />
      ) : null}

      {pickerItem ? (
        <CategoryPickerDialog
          itemTitle={pickerItem.title}
          currentCategoryId={pickerItem.categoryId}
          categories={Object.values(board.categoriesById).map((category) => ({
            id: category.id,
            title: category.title,
          }))}
          onCancel={() => setCategoryPickerItemId(null)}
          onChoose={(categoryId) => {
            const command = categoryId
              ? actions.assignItemsToCategory(kind, [pickerItem.id], categoryId)
              : actions.removeItemsFromCategory(kind, [pickerItem.id])
            void command.then((result) => {
              if (showError(result)) setCategoryPickerItemId(null)
            })
          }}
        />
      ) : null}
    </div>
  )
}

export function InventoryWorkspace(props: InventoryWorkspaceProps) {
  return (
    <ReactFlowProvider>
      <InventoryWorkspaceInner {...props} />
    </ReactFlowProvider>
  )
}
