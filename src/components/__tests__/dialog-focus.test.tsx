import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import { AddItemDialog } from '../AddItemDialog'
import { CategoryPickerDialog } from '../CategoryPickerDialog'
import { DestinationDialog } from '../DestinationDialog'
import { LockDialog, type LockCounts } from '../LockDialog'
import { NewBoardDialog } from '../NewBoardDialog'
import { VariantDialog } from '../VariantDialog'

const noop = () => undefined
const succeedAsync = async () => true

const completeCounts: LockCounts = {
  problem: { items: 1, categories: 1, uncategorized: 0 },
  user: { items: 1, categories: 1, uncategorized: 0 },
  region: { items: 1, categories: 1, uncategorized: 0 },
  monetization: { items: 1, categories: 1, uncategorized: 0 },
}

describe('dialog focus intent', () => {
  it('focuses the title when adding an inventory item', () => {
    render(<AddItemDialog kind="problem" onCancel={noop} onCreate={succeedAsync} />)

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus()
  })

  it('focuses Cancel in category and destination pickers', () => {
    const { unmount } = render(
      <CategoryPickerDialog
        itemTitle="Slow transfers"
        categories={[]}
        currentCategoryId={null}
        onCancel={noop}
        onChoose={noop}
      />,
    )

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    unmount()

    render(
      <DestinationDialog
        title="Add to archetype"
        destinations={[]}
        onCancel={noop}
        onChoose={noop}
      />,
    )

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('focuses the safe action in destructive dialogs', () => {
    const { unmount } = render(
      <LockDialog
        counts={completeCounts}
        saving={false}
        onCancel={noop}
        onConfirm={noop}
      />,
    )

    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
    unmount()

    render(<NewBoardDialog clearing={false} onCancel={noop} onConfirm={noop} />)

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('focuses the name when creating a user variant', () => {
    render(
      <VariantDialog
        userTitle="Nomadic earner"
        onCancel={noop}
        onCreate={succeedAsync}
      />,
    )

    expect(screen.getByRole('textbox', { name: 'Variant name' })).toHaveFocus()
  })
})

describe('dialog keyboard containment', () => {
  it('submits an inventory item only once for repeated activation', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn(async () => true)
    render(<AddItemDialog kind="problem" onCancel={noop} onCreate={onCreate} />)

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Problem')
    await user.dblClick(screen.getByRole('button', { name: 'Add problem' }))

    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('submits an inventory item once for Ctrl+Enter', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn(async () => true)
    render(<AddItemDialog kind="problem" onCancel={noop} onCreate={onCreate} />)

    const title = screen.getByRole('textbox', { name: 'Title' })
    await user.type(title, 'Problem')
    await user.keyboard('{Control>}{Enter}{/Control}')

    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('keeps variant submission on the form instead of Cancel', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onCreate = vi.fn(async () => true)
    render(
      <VariantDialog
        userTitle="Nomadic earner"
        onCancel={onCancel}
        onCreate={onCreate}
      />,
    )

    await user.type(
      screen.getByRole('textbox', { name: 'Variant name' }),
      'Frequent traveller',
    )
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    cancel.focus()
    await user.keyboard('{Enter}')

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('wraps Tab and Shift+Tab inside a dialog', async () => {
    const user = userEvent.setup()
    render(
      <LockDialog
        counts={completeCounts}
        saving={false}
        onCancel={noop}
        onConfirm={noop}
      />,
    )

    const first = screen.getByRole('button', { name: 'Keep editing' })
    const last = screen.getByRole('button', { name: 'Lock and build' })

    await user.tab({ shift: true })
    expect(last).toHaveFocus()

    await user.tab()
    expect(first).toHaveFocus()
  })

  it('leaves Escape policy with the dialog component', () => {
    const onCancel = vi.fn()
    const { rerender } = render(
      <LockDialog
        counts={completeCounts}
        saving={false}
        onCancel={onCancel}
        onConfirm={noop}
      />,
    )

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)

    rerender(
      <LockDialog
        counts={completeCounts}
        saving
        onCancel={onCancel}
        onConfirm={noop}
      />,
    )
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not reset focus when saving disables the dialog actions', () => {
    const { rerender } = render(
      <LockDialog
        counts={completeCounts}
        saving={false}
        onCancel={noop}
        onConfirm={noop}
      />,
    )

    const confirm = screen.getByRole('button', { name: 'Lock and build' })
    confirm.focus()

    rerender(
      <LockDialog counts={completeCounts} saving onCancel={noop} onConfirm={noop} />,
    )

    expect(confirm).toHaveFocus()
  })
})
