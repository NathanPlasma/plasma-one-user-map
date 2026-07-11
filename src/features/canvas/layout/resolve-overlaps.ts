import type { Point, Size } from '../../../domain/types'

export type LayoutBox = {
  id: string
  position: Point
  size: Size
}

function overlapsHorizontally(a: LayoutBox, b: LayoutBox, gap: number): boolean {
  return (
    a.position.x < b.position.x + b.size.width + gap &&
    a.position.x + a.size.width + gap > b.position.x
  )
}

function overlapsVertically(a: LayoutBox, b: LayoutBox, gap: number): boolean {
  return (
    a.position.y < b.position.y + b.size.height + gap &&
    a.position.y + a.size.height + gap > b.position.y
  )
}

export function resolveVerticalOverlaps(
  boxes: readonly LayoutBox[],
  gap = 32,
): Record<string, Point> {
  const ordered = boxes
    .map((box, index) => ({ ...box, index }))
    .sort(
      (a, b) =>
        a.position.y - b.position.y || a.position.x - b.position.x || a.index - b.index,
    )
  const placed: LayoutBox[] = []
  const positions: Record<string, Point> = {}

  for (const box of ordered) {
    const candidate: LayoutBox = {
      id: box.id,
      position: { ...box.position },
      size: box.size,
    }

    for (let pass = 0; pass <= placed.length; pass += 1) {
      let nextY = candidate.position.y
      for (const previous of placed) {
        if (
          overlapsHorizontally(candidate, previous, gap) &&
          overlapsVertically(candidate, previous, gap)
        ) {
          nextY = Math.max(nextY, previous.position.y + previous.size.height + gap)
        }
      }
      if (nextY === candidate.position.y) break
      candidate.position = { ...candidate.position, y: nextY }
    }

    placed.push(candidate)
    positions[candidate.id] = candidate.position
  }

  return positions
}
