import { describe, expect, it } from 'vitest'

import { resolveVerticalOverlaps, type LayoutBox } from '../resolve-overlaps'

const box = (
  id: string,
  x: number,
  y: number,
  width = 408,
  height = 220,
): LayoutBox => ({ id, position: { x, y }, size: { width, height } })

describe('resolveVerticalOverlaps', () => {
  it('keeps the grown island anchored and pushes only the row below', () => {
    const positions = resolveVerticalOverlaps([
      box('top-left', 340, 120, 408, 430),
      box('top-right', 790, 120, 408, 220),
      box('bottom-left', 340, 500, 408, 220),
    ])

    expect(positions).toEqual({
      'top-left': { x: 340, y: 120 },
      'top-right': { x: 790, y: 120 },
      'bottom-left': { x: 340, y: 582 },
    })
  })

  it('cascades displacement through multiple rows without moving columns', () => {
    const positions = resolveVerticalOverlaps([
      box('first', 0, 0, 320, 300),
      box('second', 0, 240, 320, 220),
      box('third', 0, 460, 320, 180),
      box('side', 380, 0, 320, 500),
    ])

    expect(positions).toEqual({
      first: { x: 0, y: 0 },
      side: { x: 380, y: 0 },
      second: { x: 0, y: 332 },
      third: { x: 0, y: 584 },
    })
  })

  it('is stable when the layout already has enough space', () => {
    const input = [box('first', 0, 0), box('second', 0, 252)]
    const once = resolveVerticalOverlaps(input)
    const twice = resolveVerticalOverlaps(
      input.map((item) => ({ ...item, position: once[item.id] ?? item.position })),
    )

    expect(twice).toEqual(once)
  })
})
