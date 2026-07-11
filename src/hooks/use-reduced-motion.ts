import { useEffect, useState } from 'react'

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

function readsReducedMotionPreference() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia(reducedMotionQuery).matches
}

export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(readsReducedMotionPreference)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return

    const mediaQuery = window.matchMedia(reducedMotionQuery)
    const updatePreference = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches)
    }

    setReducedMotion(mediaQuery.matches)
    mediaQuery.addEventListener('change', updatePreference)

    return () => mediaQuery.removeEventListener('change', updatePreference)
  }, [])

  return reducedMotion
}
