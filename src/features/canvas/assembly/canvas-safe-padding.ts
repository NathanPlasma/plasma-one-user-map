const CANVAS_EDGE_GAP = 24
const OVERLAY_GAP = 16

type RectEdges = Pick<DOMRectReadOnly, 'top' | 'right' | 'bottom' | 'left'>

export type CanvasSafePadding = {
  top: `${number}px`
  right: `${number}px`
  bottom: `${number}px`
  left: `${number}px`
}

type CanvasSafeArea = {
  root: RectEdges
  title?: RectEdges | null
  shelf?: RectEdges | null
  toolbar?: RectEdges | null
}

function pixels(value: number): `${number}px` {
  return `${Math.ceil(Math.max(CANVAS_EDGE_GAP, value))}px`
}

export function calculateCanvasSafePadding({
  root,
  title,
  shelf,
  toolbar,
}: CanvasSafeArea): CanvasSafePadding {
  return {
    top: pixels(title ? title.bottom - root.top + OVERLAY_GAP : CANVAS_EDGE_GAP),
    right: pixels(CANVAS_EDGE_GAP),
    bottom: pixels(toolbar ? root.bottom - toolbar.top + OVERLAY_GAP : CANVAS_EDGE_GAP),
    left: pixels(shelf ? shelf.right - root.left + OVERLAY_GAP : CANVAS_EDGE_GAP),
  }
}

function rectFor(root: HTMLElement, selector: string): DOMRect | null {
  return root.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null
}

function settledShelfRect(root: HTMLElement, rootRect: DOMRect): RectEdges | null {
  const shelf = root.querySelector<HTMLElement>(".source-shelf[data-open='true']")
  if (!shelf) return null
  const current = shelf.getBoundingClientRect()
  return {
    top: current.top,
    right: rootRect.left + shelf.offsetLeft + shelf.offsetWidth,
    bottom: current.bottom,
    left: rootRect.left + shelf.offsetLeft,
  }
}

export function measureCanvasSafePadding(root: HTMLElement | null): CanvasSafePadding {
  if (!root) {
    return calculateCanvasSafePadding({
      root: { top: 0, right: 0, bottom: 0, left: 0 },
    })
  }

  const rootRect = root.getBoundingClientRect()
  return calculateCanvasSafePadding({
    root: rootRect,
    title: rectFor(root, '.canvas-title-block'),
    shelf: settledShelfRect(root, rootRect),
    toolbar: rectFor(root, '.canvas-toolbar'),
  })
}
