import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { ActionMenu } from '../ActionMenu'

function EditHarness() {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Actions
      </button>
      {editing ? <input autoFocus aria-label="Edit title" /> : null}
      {open ? (
        <ActionMenu
          anchor={{ x: 40, y: 40 }}
          label="Card actions"
          onClose={() => setOpen(false)}
          items={[{ label: 'Edit', onSelect: () => setEditing(true) }]}
        />
      ) : null}
    </>
  )
}

describe('ActionMenu', () => {
  it('does not steal focus from an editor opened by a menu action', async () => {
    const user = userEvent.setup()
    render(<EditHarness />)

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }))

    expect(screen.getByRole('textbox', { name: 'Edit title' })).toHaveFocus()
  })

  it('keeps a tall menu inside the viewport', () => {
    render(
      <ActionMenu
        anchor={{ x: window.innerWidth, y: window.innerHeight }}
        label="Copy actions"
        onClose={() => undefined}
        items={Array.from({ length: 6 }, (_, index) => ({
          label: `Action ${index + 1}`,
          onSelect: () => undefined,
        }))}
      />,
    )

    const menu = screen.getByRole('menu', { name: 'Copy actions' })
    const top = Number.parseFloat(menu.style.top)
    const left = Number.parseFloat(menu.style.left)
    expect(top).toBeGreaterThanOrEqual(8)
    expect(top + 6 * 40 + 14).toBeLessThanOrEqual(window.innerHeight - 8)
    expect(left).toBeGreaterThanOrEqual(8)
    expect(left + 220).toBeLessThanOrEqual(window.innerWidth)
  })
})
