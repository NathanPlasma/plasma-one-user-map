import {
  Combine,
  FolderPlus,
  Hand,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Scan,
} from 'lucide-react'

type CanvasToolbarProps =
  | {
      phase: 'inventory'
      activeTool: 'select' | 'pan'
      canGroup: boolean
      onToolChange: (tool: 'select' | 'pan') => void
      onAdd: () => void
      onCreateCategory: () => void
      onGroup: () => void
      onFit: () => void
    }
  | {
      phase: 'assembly'
      activeTool: 'select' | 'pan'
      shelfOpen: boolean
      onToolChange: (tool: 'select' | 'pan') => void
      onShelfToggle: () => void
      onFit: () => void
    }

export function CanvasToolbar(props: CanvasToolbarProps) {
  return (
    <div
      className="canvas-toolbar"
      role="toolbar"
      aria-label="Canvas controls"
      data-shelf-open={props.phase === 'assembly' ? props.shelfOpen : undefined}
    >
      <button
        type="button"
        className="tool-button"
        data-active={props.activeTool === 'select' || undefined}
        aria-pressed={props.activeTool === 'select'}
        aria-label="Select"
        onClick={() => props.onToolChange('select')}
      >
        <MousePointer2 size={20} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="tool-button"
        data-active={props.activeTool === 'pan' || undefined}
        aria-pressed={props.activeTool === 'pan'}
        aria-label="Pan"
        onClick={() => props.onToolChange('pan')}
      >
        <Hand size={20} aria-hidden="true" />
      </button>
      <span className="toolbar-divider" aria-hidden="true" />
      {props.phase === 'inventory' ? (
        <>
          <button
            type="button"
            className="tool-button"
            aria-label="Add card"
            onClick={props.onAdd}
          >
            <Plus size={21} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="tool-button"
            aria-label="New category"
            onClick={props.onCreateCategory}
          >
            <FolderPlus size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="tool-button"
            disabled={!props.canGroup}
            aria-label="Group selected cards"
            onClick={props.onGroup}
          >
            <Combine size={20} aria-hidden="true" />
          </button>
        </>
      ) : (
        <button
          type="button"
          className="tool-button"
          aria-label={props.shelfOpen ? 'Collapse source shelf' : 'Open source shelf'}
          aria-pressed={props.shelfOpen}
          onClick={props.onShelfToggle}
        >
          {props.shelfOpen ? (
            <PanelLeftClose size={20} aria-hidden="true" />
          ) : (
            <PanelLeftOpen size={20} aria-hidden="true" />
          )}
        </button>
      )}
      <button
        type="button"
        className="tool-button"
        aria-label="Fit board to view"
        onClick={props.onFit}
      >
        <Scan size={20} aria-hidden="true" />
      </button>
    </div>
  )
}
