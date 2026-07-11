import { LockKeyhole } from 'lucide-react'

import type { AssemblyStage, InventoryKind } from '../domain/types'
import {
  assemblyOrder,
  inventoryOrder,
  kindConfig,
  kindStyle,
  stageColour,
  stageConfig,
} from '../features/workshop/kind-config'

type JourneyRailProps = {
  phase: 'inventory' | 'assembly'
  activeInventory: InventoryKind
  inspectedInventory?: InventoryKind | null
  activeStage: AssemblyStage
  checkpointVersion?: number
  canBuildBeyondSeed?: boolean
  reviewing?: boolean
  onInventoryChange: (kind: InventoryKind) => void
  onStageChange: (stage: AssemblyStage) => void
}

export function JourneyRail({
  phase,
  activeInventory,
  inspectedInventory,
  activeStage,
  checkpointVersion,
  canBuildBeyondSeed = false,
  reviewing = false,
  onInventoryChange,
  onStageChange,
}: JourneyRailProps) {
  return (
    <nav className="journey-rail" aria-label="Workshop journey">
      <div className="rail-group" aria-label="Inventories">
        <div className="rail-group-label">Inventories</div>
        <div className="rail-options">
          {inventoryOrder.map((kind) => (
            <button
              key={kind}
              type="button"
              className="rail-button"
              style={kindStyle(kind)}
              data-active={
                (phase === 'inventory' && activeInventory === kind) ||
                (phase === 'assembly' && inspectedInventory === kind) ||
                undefined
              }
              aria-current={
                (phase === 'inventory' && activeInventory === kind) ||
                (phase === 'assembly' && inspectedInventory === kind)
                  ? 'step'
                  : undefined
              }
              aria-label={`${kindConfig[kind].plural}${phase === 'assembly' ? ', read only' : ''}`}
              onClick={() => onInventoryChange(kind)}
            >
              {kindConfig[kind].plural}
            </button>
          ))}
        </div>
      </div>

      <div className="rail-boundary">
        <span className="rail-boundary-badge">
          <LockKeyhole size={15} strokeWidth={2.1} aria-hidden="true" />
        </span>
        <span className="sr-only">
          {checkpointVersion
            ? `Inventory v${checkpointVersion}, read only`
            : 'Lock boundary'}
        </span>
      </div>

      <div className="rail-group" aria-label="Build archetypes">
        <div className="rail-group-label">Build archetypes</div>
        <div className="rail-options">
          {assemblyOrder.map((stage) => {
            const colourKind = stageColour(stage)
            return (
              <button
                key={stage}
                type="button"
                className="rail-button"
                style={kindStyle(colourKind)}
                disabled={
                  phase === 'inventory' ||
                  (stage !== 'seed-users' && !canBuildBeyondSeed)
                }
                data-active={
                  (phase === 'assembly' &&
                    !inspectedInventory &&
                    !reviewing &&
                    activeStage === stage) ||
                  undefined
                }
                aria-current={
                  phase === 'assembly' &&
                  !inspectedInventory &&
                  !reviewing &&
                  activeStage === stage
                    ? 'step'
                    : undefined
                }
                onClick={() => onStageChange(stage)}
              >
                {stageConfig[stage].label}
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
