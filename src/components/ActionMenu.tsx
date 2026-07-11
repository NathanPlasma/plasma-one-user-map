import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

export type ActionMenuItem = {
  label: string
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

type ActionMenuProps = {
  anchor: { x: number; y: number }
  label: string
  items: ActionMenuItem[]
  onClose: () => void
}

export function ActionMenu({ anchor, label, items, onClose }: ActionMenuProps) {
  const labelId = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const selectedItemRef = useRef(false)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = menuRef.current?.querySelector<HTMLButtonElement>(
      'button:not(:disabled)',
    )
    first?.focus()

    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onCloseRef.current()
    }
    window.addEventListener('pointerdown', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      if (!selectedItemRef.current) returnFocus?.focus({ preventScroll: true })
    }
  }, [])

  const estimatedHeight = items.length * 40 + 14
  const left = Math.max(8, Math.min(anchor.x, window.innerWidth - 228))
  const top = Math.max(8, Math.min(anchor.y, window.innerHeight - estimatedHeight - 8))

  return createPortal(
    <div
      ref={menuRef}
      className="action-menu"
      role="menu"
      aria-labelledby={labelId}
      style={{ left, top }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            'button:not(:disabled)',
          ),
        )
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const delta = event.key === 'ArrowDown' ? 1 : -1
        buttons[(current + delta + buttons.length) % buttons.length]?.focus()
      }}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          data-danger={item.danger || undefined}
          disabled={item.disabled}
          onClick={() => {
            selectedItemRef.current = true
            item.onSelect()
            onClose()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}
