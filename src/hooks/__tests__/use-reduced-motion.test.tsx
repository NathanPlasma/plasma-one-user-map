import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'

import { useReducedMotion } from '../use-reduced-motion'

const defaultMatchMedia = window.matchMedia

function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  let matches = initialMatches

  const mediaQuery = {
    get matches() {
      return matches
    },
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      listeners.add(listener)
    },
    removeEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      listeners.delete(listener)
    },
    dispatchEvent: () => false,
  } as unknown as MediaQueryList

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => mediaQuery,
  })

  return {
    listeners,
    setMatches(nextMatches: boolean) {
      matches = nextMatches
      const event = { matches, media: mediaQuery.media } as MediaQueryListEvent
      listeners.forEach((listener) => listener(event))
    },
  }
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: defaultMatchMedia,
  })
})

describe('useReducedMotion', () => {
  it.each([false, true])('reads an initial preference of %s', (initialMatches) => {
    const media = installMatchMedia(initialMatches)
    const { result, unmount } = renderHook(() => useReducedMotion(), {
      wrapper: StrictMode,
    })

    expect(result.current).toBe(initialMatches)
    expect(media.listeners.size).toBe(1)

    unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('responds to changes without leaking its Strict Mode subscription', () => {
    const media = installMatchMedia(false)
    const { result, unmount } = renderHook(() => useReducedMotion(), {
      wrapper: StrictMode,
    })

    act(() => media.setMatches(true))
    expect(result.current).toBe(true)
    expect(media.listeners.size).toBe(1)

    act(() => media.setMatches(false))
    expect(result.current).toBe(false)

    unmount()
    expect(media.listeners.size).toBe(0)
  })
})
