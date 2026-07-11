import { StrictMode, useRef, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { useDialogFocus } from '../use-dialog-focus'

type TestDialogProps = {
  busy?: boolean
  onClose?: () => void
}

function TestDialog({ busy = false, onClose = () => undefined }: TestDialogProps) {
  const initialFocusRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogFocus<HTMLDivElement>({ initialFocusRef })

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Test dialog"
      aria-busy={busy}
      tabIndex={-1}
    >
      <button ref={initialFocusRef} type="button">
        First action
      </button>
      <button type="button" onClick={onClose}>
        Last action
      </button>
    </div>
  )
}

function ControlledDialog() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      {open ? <TestDialog onClose={() => setOpen(false)} /> : null}
    </>
  )
}

describe('useDialogFocus', () => {
  it('focuses the intended control, traps Tab in both directions, and restores the opener', async () => {
    const user = userEvent.setup()

    render(
      <StrictMode>
        <ControlledDialog />
      </StrictMode>,
    )

    const opener = screen.getByRole('button', { name: 'Open dialog' })
    await user.click(opener)

    const first = screen.getByRole('button', { name: 'First action' })
    const last = screen.getByRole('button', { name: 'Last action' })
    expect(first).toHaveFocus()

    await user.tab({ shift: true })
    expect(last).toHaveFocus()

    await user.tab()
    expect(first).toHaveFocus()

    await user.tab()
    expect(last).toHaveFocus()

    await user.click(last)
    expect(opener).toHaveFocus()
  })

  it('does not refocus the initial control when saving state changes', () => {
    const { rerender } = render(
      <StrictMode>
        <TestDialog />
      </StrictMode>,
    )

    const first = screen.getByRole('button', { name: 'First action' })
    const last = screen.getByRole('button', { name: 'Last action' })
    expect(first).toHaveFocus()

    last.focus()
    rerender(
      <StrictMode>
        <TestDialog busy />
      </StrictMode>,
    )

    expect(last).toHaveFocus()
  })
})
