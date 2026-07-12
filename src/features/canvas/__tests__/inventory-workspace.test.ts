import { expect, it, vi } from 'vitest'

import { categoryHeaderNodeId } from '../../../domain/entity-ids'
import type { InventoryBoard } from '../../../domain/types'
import { alignCategoryDragNodes } from '../view-models'
import type { CategoryData, InventoryCardData, WorkshopFlowNode } from '../view-models'

const categoryData: CategoryData = {
  categoryId: 'category-1',
  kind: 'problem',
  title: 'Access',
  itemCount: 1,
  readOnly: false,
  onRename: vi.fn(),
  onDelete: vi.fn(),
  onResize: vi.fn(),
}

function cardData(itemId: string, title: string): InventoryCardData {
  return {
    itemId,
    kind: 'problem',
    title,
    note: '',
    readOnly: false,
    onUpdate: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onMoveToCategory: vi.fn(),
  }
}

const board: InventoryBoard = {
  kind: 'problem',
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedIds: [],
  categoriesById: {
    'category-1': {
      id: 'category-1',
      kind: 'problem',
      title: 'Access',
      position: { x: 10, y: 20 },
      size: { width: 320, height: 240 },
    },
  },
  itemsById: {
    contained: {
      id: 'contained',
      kind: 'problem',
      title: 'Contained',
      note: '',
      categoryId: 'category-1',
      position: { x: 30, y: 90 },
    },
    loose: {
      id: 'loose',
      kind: 'problem',
      title: 'Loose',
      note: '',
      categoryId: null,
      position: { x: 400, y: 500 },
    },
  },
}

it('keeps only a dragged category body, header and contained cards aligned', () => {
  const nodes: WorkshopFlowNode[] = [
    {
      id: 'category-1',
      type: 'category',
      position: { x: 10, y: 20 },
      data: categoryData,
    },
    {
      id: categoryHeaderNodeId('category-1'),
      type: 'category-header',
      position: { x: 10, y: 20 },
      data: categoryData,
    },
    {
      id: 'contained',
      type: 'inventory-card',
      position: { x: 30, y: 90 },
      data: cardData('contained', 'Contained'),
    },
    {
      id: 'loose',
      type: 'inventory-card',
      position: { x: 400, y: 500 },
      data: cardData('loose', 'Loose'),
    },
  ]

  const aligned = alignCategoryDragNodes(
    nodes,
    board,
    'category-1',
    categoryHeaderNodeId('category-1'),
    { x: 110, y: 220 },
  )

  expect(aligned.map(({ id, position }) => ({ id, position }))).toEqual([
    { id: 'category-1', position: { x: 110, y: 220 } },
    { id: categoryHeaderNodeId('category-1'), position: { x: 110, y: 220 } },
    { id: 'contained', position: { x: 130, y: 290 } },
    { id: 'loose', position: { x: 400, y: 500 } },
  ])
  expect(aligned[3]).toBe(nodes[3])
})

it('leaves view nodes untouched for a missing category', () => {
  const nodes: WorkshopFlowNode[] = []

  expect(
    alignCategoryDragNodes(nodes, board, 'missing', categoryHeaderNodeId('missing'), {
      x: 100,
      y: 100,
    }),
  ).toBe(nodes)
})
