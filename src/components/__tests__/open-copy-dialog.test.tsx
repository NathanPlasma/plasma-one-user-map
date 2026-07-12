import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import type { WorkspaceCopyPreview } from '../../persistence/workspace-copy'
import { OpenCopyDialog } from '../OpenCopyDialog'

const preview: WorkspaceCopyPreview = {
  title: 'Imported workshop',
  exportedAt: '2026-07-12T12:30:00.000Z',
  phase: 'assembly',
  inventories: {
    problem: { items: 30, categories: 8, uncategorized: 2 },
    user: { items: 14, categories: 0, uncategorized: 14 },
    region: { items: 12, categories: 0, uncategorized: 12 },
    monetization: { items: 10, categories: 0, uncategorized: 10 },
  },
  archetypes: 8,
  localCopies: 64,
}

describe('OpenCopyDialog', () => {
  it('previews derived counts and focuses the safe action', () => {
    render(
      <OpenCopyDialog
        fileName="workshop.json"
        preview={preview}
        opening={false}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(screen.getByText('Imported workshop')).toBeVisible()
    expect(screen.getByText('30 Problems')).toBeVisible()
    expect(screen.getByText('8 archetypes')).toBeVisible()
    expect(screen.getByText('64 local copies')).toBeVisible()
  })

  it('guards confirmation against repeated activation', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <OpenCopyDialog
        fileName="workshop.json"
        preview={preview}
        opening={false}
        onCancel={() => undefined}
        onConfirm={onConfirm}
      />,
    )

    await user.dblClick(screen.getByRole('button', { name: 'Open copy' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
