import { useDroppable } from '@dnd-kit/core'
import { useCallback, type CSSProperties, type ReactNode } from 'react'

type AssemblyCanvasSurfaceProps = {
  onNode: (node: HTMLDivElement | null) => void
  layoutAnimating: boolean
  layoutMode: 'freeform' | 'tidy'
  style: CSSProperties
  children: ReactNode
}

export function AssemblyCanvasSurface({
  onNode,
  layoutAnimating,
  layoutMode,
  style,
  children,
}: AssemblyCanvasSurfaceProps) {
  const { setNodeRef } = useDroppable({ id: 'assembly-canvas' })
  const attachNode = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node)
      onNode(node)
    },
    [onNode, setNodeRef],
  )

  return (
    <div
      ref={attachNode}
      className="workspace-main"
      data-layout-animating={layoutAnimating || undefined}
      data-layout-mode={layoutMode}
      style={style}
    >
      {children}
    </div>
  )
}
