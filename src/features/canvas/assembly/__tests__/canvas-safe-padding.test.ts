import { describe, expect, it } from 'vitest'

import {
  calculateCanvasSafePadding,
  measureCanvasSafePadding,
} from '../canvas-safe-padding'

describe('calculateCanvasSafePadding', () => {
  it('keeps fitted content clear of live title, shelf and toolbar bounds', () => {
    expect(
      calculateCanvasSafePadding({
        root: { top: 180, right: 1100, bottom: 900, left: 100 },
        title: { top: 204, right: 620, bottom: 252, left: 128 },
        shelf: { top: 196, right: 402, bottom: 884, left: 116 },
        toolbar: { top: 820, right: 620, bottom: 878, left: 418 },
      }),
    ).toEqual({
      top: '88px',
      right: '24px',
      bottom: '96px',
      left: '318px',
    })
  })

  it('falls back to a 24px edge gap when overlays are absent', () => {
    expect(
      calculateCanvasSafePadding({
        root: { top: 0, right: 1024, bottom: 588, left: 0 },
      }),
    ).toEqual({
      top: '24px',
      right: '24px',
      bottom: '24px',
      left: '24px',
    })
  })

  it('uses the shelf settled width while its transform is still animating', () => {
    const root = document.createElement('div')
    const shelf = document.createElement('aside')
    shelf.className = 'source-shelf'
    shelf.dataset.open = 'true'
    root.append(shelf)

    root.getBoundingClientRect = () =>
      ({ top: 100, right: 1100, bottom: 800, left: 100 }) as DOMRect
    shelf.getBoundingClientRect = () =>
      ({ top: 116, right: 250, bottom: 784, left: -36 }) as DOMRect
    Object.defineProperties(shelf, {
      offsetLeft: { value: 16 },
      offsetWidth: { value: 286 },
    })

    expect(measureCanvasSafePadding(root).left).toBe('318px')
  })
})
