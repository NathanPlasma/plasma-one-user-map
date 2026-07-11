import { useDroppable } from '@dnd-kit/core'
import { useCallback, type CSSProperties, type ReactNode } from 'react'

type AssemblyCanvasSurfaceProps = {
  onNode: (node: HTMLDivElement | null) => void
  layoutAnimating: boolean
  style: CSSProperties
  children: ReactNode
}

export function AssemblyCanvasSurface({
  onNode,
  layoutAnimating,
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
      style={style}
    >
      {children}
    </div>
  )
}
