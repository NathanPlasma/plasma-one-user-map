import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'

import { ACCESS_SESSION_KEY, AccessGate } from '../AccessGate'

describe('AccessGate', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('keeps workshop content hidden and clears a rejected password', async () => {
    const user = userEvent.setup()
    const verifyPassword = vi.fn(async () => false)

    render(
      <AccessGate verifyPassword={verifyPassword}>
        <p>Workshop content</p>
      </AccessGate>,
    )

    const password = screen.getByLabelText('Password')
    expect(password).toHaveFocus()
    expect(screen.queryByText('Workshop content')).not.toBeInTheDocument()

    await user.type(password, 'wrong password')
    await user.click(screen.getByRole('button', { name: 'Open workshop' }))

    expect(verifyPassword).toHaveBeenCalledWith('wrong password')
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect password.')
    expect(password).toHaveValue('')
    expect(password).toHaveFocus()
    expect(screen.queryByText('Workshop content')).not.toBeInTheDocument()
  })

  it('unlocks for the current tab session and restores that access on remount', async () => {
    const user = userEvent.setup()
    const verifyPassword = vi.fn(async () => true)
    const first = render(
      <AccessGate verifyPassword={verifyPassword}>
        <p>Workshop content</p>
      </AccessGate>,
    )

    await user.type(screen.getByLabelText('Password'), 'accepted password')
    await user.click(screen.getByRole('button', { name: 'Open workshop' }))

    expect(await screen.findByText('Workshop content')).toBeVisible()
    expect(window.sessionStorage.getItem(ACCESS_SESSION_KEY)).toBe('granted')
    first.unmount()

    const unusedVerifier = vi.fn(async () => false)
    render(
      <AccessGate verifyPassword={unusedVerifier}>
        <p>Workshop content</p>
      </AccessGate>,
    )

    expect(screen.getByText('Workshop content')).toBeVisible()
    expect(unusedVerifier).not.toHaveBeenCalled()
  })

  it('allows an in-memory unlock when session storage is unavailable', async () => {
    const user = userEvent.setup()
    const blockedStorage = {
      getItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked')
      }),
    }

    render(
      <AccessGate storage={blockedStorage} verifyPassword={async () => true}>
        <p>Workshop content</p>
      </AccessGate>,
    )

    await user.type(screen.getByLabelText('Password'), 'accepted password')
    await user.click(screen.getByRole('button', { name: 'Open workshop' }))

    expect(await screen.findByText('Workshop content')).toBeVisible()
  })
})
