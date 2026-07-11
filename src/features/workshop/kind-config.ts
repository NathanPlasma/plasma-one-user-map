import type { CSSProperties } from 'react'

import type { AssemblyStage, InventoryKind } from '../../domain/types'

export const inventoryOrder: InventoryKind[] = [
  'problem',
  'user',
  'region',
  'monetization',
]

export const assemblyOrder: AssemblyStage[] = [
  'seed-users',
  'add-problems',
  'add-regions',
  'add-monetization',
]

export const kindConfig: Record<
  InventoryKind,
  {
    label: string
    plural: string
    inventoryTitle: string
    addLabel: string
    colour: string
    soft: string
    line: string
  }
> = {
  problem: {
    label: 'Problem',
    plural: 'Problems',
    inventoryTitle: 'Problems',
    addLabel: 'Add problem',
    colour: 'var(--problem)',
    soft: 'var(--problem-soft)',
    line: 'var(--problem-line)',
  },
  user: {
    label: 'User',
    plural: 'Users',
    inventoryTitle: 'Users',
    addLabel: 'Add user',
    colour: 'var(--user)',
    soft: 'var(--user-soft)',
    line: 'var(--user-line)',
  },
  region: {
    label: 'Region',
    plural: 'Regions',
    inventoryTitle: 'Regions',
    addLabel: 'Add region',
    colour: 'var(--region)',
    soft: 'var(--region-soft)',
    line: 'var(--region-line)',
  },
  monetization: {
    label: 'Monetization',
    plural: 'Monetization',
    inventoryTitle: 'Monetization',
    addLabel: 'Add monetization',
    colour: 'var(--money)',
    soft: 'var(--money-soft)',
    line: 'var(--money-line)',
  },
}

export const stageConfig: Record<
  AssemblyStage,
  {
    label: string
    sourceKind: InventoryKind | null
    title: string
    description?: string
  }
> = {
  'seed-users': {
    label: 'Seed users',
    sourceKind: 'user',
    title: 'Users',
    description: 'Drag users onto the canvas.',
  },
  'add-problems': {
    label: 'Add problems',
    sourceKind: 'problem',
    title: 'Add problems',
    description: 'Add what each user faces.',
  },
  'add-regions': {
    label: 'Add regions',
    sourceKind: 'region',
    title: 'Add regions',
    description: 'Add where each user lives.',
  },
  'add-monetization': {
    label: 'Add monetization',
    sourceKind: 'monetization',
    title: 'Add monetization',
    description: 'Add how Plasma One can earn.',
  },
  final: {
    label: 'Final',
    sourceKind: null,
    title: 'Archetypes',
  },
}

export function kindStyle(kind: InventoryKind): CSSProperties {
  const config = kindConfig[kind]
  return {
    '--active-colour': config.colour,
    '--active-soft': config.soft,
    '--active-line': config.line,
  } as CSSProperties
}

export function stageColour(stage: AssemblyStage): InventoryKind {
  return stageConfig[stage].sourceKind ?? 'monetization'
}
