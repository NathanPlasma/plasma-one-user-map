import { useLayoutEffect, useRef, type RefObject } from 'react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

type DialogFocusOptions = {
  initialFocusRef?: RefObject<HTMLElement | null>
}

function isFocusable(element: HTMLElement) {
  if (!element.matches(focusableSelector)) return false
  if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false
  if (element.getAttribute('aria-disabled') === 'true') return false

  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function getFocusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    isFocusable,
  )
}

export function useDialogFocus<T extends HTMLElement>({
  initialFocusRef,
}: DialogFocusOptions = {}) {
  const dialogRef = useRef<T>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const activeElement = document.activeElement
    openerRef.current =
      activeElement instanceof HTMLElement &&
      activeElement !== document.body &&
      !dialog.contains(activeElement)
        ? activeElement
        : null

    const intendedTarget = initialFocusRef?.current
    const initialTarget =
      intendedTarget && isFocusable(intendedTarget)
        ? intendedTarget
        : (getFocusableElements(dialog)[0] ?? dialog)

    if (!dialog.contains(document.activeElement)) initialTarget.focus()

    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented) return

      const focusableElements = getFocusableElements(dialog)
      if (focusableElements.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusableElements[0]
      const last = focusableElements.at(-1)
      const current = document.activeElement

      if (event.shiftKey && (current === first || !dialog.contains(current))) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && (current === last || !dialog.contains(current))) {
        event.preventDefault()
        first?.focus()
      }
    }

    dialog.addEventListener('keydown', trapTab)

    return () => {
      dialog.removeEventListener('keydown', trapTab)

      const opener = openerRef.current
      if (opener?.isConnected) opener.focus()
    }
  }, [initialFocusRef])

  return dialogRef
}
