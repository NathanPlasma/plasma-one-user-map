import { Plus } from 'lucide-react'

import type { InventoryKind } from '../domain/types'
import { kindConfig, kindStyle } from '../features/workshop/kind-config'

type EmptyStateProps = {
  kind: InventoryKind
  onAdd: () => void
}

export function EmptyState({ kind, onAdd }: EmptyStateProps) {
  const config = kindConfig[kind]
  return (
    <div className="empty-state" style={kindStyle(kind)}>
      <span className="empty-state-swatch paper-grain" aria-hidden="true" />
      <button type="button" className="button" onClick={onAdd}>
        <Plus size={18} aria-hidden="true" />
        {config.addLabel}
      </button>
    </div>
  )
}
