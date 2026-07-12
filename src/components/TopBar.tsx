import {
  Check,
  CloudAlert,
  CopyPlus,
  FilePlus2,
  FolderOpen,
  LoaderCircle,
  Redo2,
  Undo2,
} from 'lucide-react'

type SaveStatus = 'loading' | 'saving' | 'saved' | 'error' | 'conflict'

type TopBarProps = {
  title: string
  saveStatus: SaveStatus
  canUndo: boolean
  canRedo: boolean
  primaryLabel: string
  primaryDisabled?: boolean
  onTitleChange: (title: string) => void
  onUndo: () => void
  onRedo: () => void
  onSaveCopy: () => void
  onOpenCopy: () => void
  onNewBoard: () => void
  onPrimaryAction: () => void
}

const saveLabels: Record<SaveStatus, string> = {
  loading: 'Loading',
  saving: 'Saving',
  saved: 'Saved locally',
  error: 'Save failed',
  conflict: 'Another tab is newer',
}

export function TopBar({
  title,
  saveStatus,
  canUndo,
  canRedo,
  primaryLabel,
  primaryDisabled,
  onTitleChange,
  onUndo,
  onRedo,
  onSaveCopy,
  onOpenCopy,
  onNewBoard,
  onPrimaryAction,
}: TopBarProps) {
  const StatusIcon =
    saveStatus === 'saving' || saveStatus === 'loading'
      ? LoaderCircle
      : saveStatus === 'error' || saveStatus === 'conflict'
        ? CloudAlert
        : Check

  return (
    <header className="topbar">
      <label className="sr-only" htmlFor="board-title">
        Board title
      </label>
      <input
        id="board-title"
        className="board-title"
        value={title}
        maxLength={80}
        aria-label="Board title"
        onChange={(event) => onTitleChange(event.currentTarget.value)}
        onBlur={(event) => {
          if (!event.currentTarget.value.trim()) onTitleChange('Plasma One User Map')
        }}
      />

      <div className="topbar-actions" aria-label="Board actions">
        <span className="save-state" role="status" aria-live="polite">
          <StatusIcon
            size={14}
            className={saveStatus === 'saving' ? 'spin' : undefined}
            aria-hidden="true"
          />
          {saveLabels[saveStatus]}
        </span>
        <button
          type="button"
          className="icon-button"
          disabled={!canUndo}
          aria-label="Undo"
          onClick={onUndo}
        >
          <Undo2 size={18} aria-hidden="true" />
          <span className="button-label-optional">Undo</span>
        </button>
        <button
          type="button"
          className="icon-button"
          disabled={!canRedo}
          aria-label="Redo"
          onClick={onRedo}
        >
          <Redo2 size={18} aria-hidden="true" />
          <span className="button-label-optional">Redo</span>
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Open copy"
          onClick={onOpenCopy}
        >
          <FolderOpen size={17} aria-hidden="true" />
          <span className="button-label-optional">Open copy</span>
        </button>
        <button
          type="button"
          className="icon-button"
          data-hide-compact="true"
          onClick={onSaveCopy}
        >
          <CopyPlus size={17} aria-hidden="true" />
          <span>Save copy</span>
        </button>
        <button
          type="button"
          className="icon-button"
          data-hide-compact="true"
          onClick={onNewBoard}
        >
          <FilePlus2 size={17} aria-hidden="true" />
          <span>New board</span>
        </button>
        <button
          type="button"
          className="button button-primary"
          disabled={primaryDisabled}
          onClick={onPrimaryAction}
        >
          {primaryLabel}
        </button>
      </div>
    </header>
  )
}
