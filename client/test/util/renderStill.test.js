import { describe, expect, it, vi } from 'vitest'
import { srgbLookupTable, stillDataUrl } from '../../util/renderStill.js'

describe('srgbLookupTable', () => {
  const table = srgbLookupTable()

  it('covers every byte value and maps the ends onto themselves', () => {
    expect(table).toHaveLength(256)
    expect(table[0]).toBe(0)
    expect(table[255]).toBe(255)
  })

  it('never falls back on itself', () => {
    for (let i = 1; i < 256; i++) {
      expect(table[i]).toBeGreaterThanOrEqual(table[i - 1])
    }
  })

  it('lifts the midtones — read as sRGB, a linear buffer looks far too dark', () => {
    // Mid grey in linear light is ~0.73 once encoded; without this step the still
    // would come out much darker and harder than the same view on the canvas.
    expect(table[128]).toBeGreaterThan(180)
    expect(table[128]).toBeLessThan(200)
    expect(table[32]).toBeGreaterThan(2 * 32)
  })

  it('is built once and shared', () => {
    expect(srgbLookupTable()).toBe(table)
  })
})

describe('stillDataUrl', () => {
  /**
   * A recording 2D context, since jsdom has none. `createImageData` hands out a
   * plain byte array, which is what the encoder writes its pixels into.
   * @returns {Object}
   */
  const fakeContext = () => ({
    put: null,
    createImageData: (width, height) => ({ data: new Uint8Array(width * height * 4) }),
    putImageData (image) { this.put = image }
  })

  // jsdom implements neither of the two canvas methods; the global `afterEach`
  // (see test/setup.js) puts both spies back.
  const withCanvas = (context, run) => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/jpeg;base64,STILL')
    return { result: run(), toDataURL }
  }

  // Two rows of two pixels, bottom row first (the way WebGL hands them back).
  const pixels = () => new Uint8Array([
    10, 10, 10, 0, 20, 20, 20, 0, // bottom row
    30, 30, 30, 0, 40, 40, 40, 0 // top row
  ])

  it('encodes the pixels as a JPEG data URL', () => {
    const context = fakeContext()
    const { result, toDataURL } = withCanvas(context, () => stillDataUrl(pixels(), 2, 2))
    expect(result).toBe('data:image/jpeg;base64,STILL')
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85)
    expect(context.put).not.toBeNull()
  })

  it('turns the rows the right way up', () => {
    // WebGL reads bottom-up, a canvas draws top-down — the last row read has to
    // end up first, or the whole still is mirrored vertically.
    const context = fakeContext()
    withCanvas(context, () => stillDataUrl(pixels(), 2, 2))
    const table = srgbLookupTable()
    expect(Array.from(context.put.data.slice(0, 8)))
      .toEqual([table[30], table[30], table[30], 255, table[40], table[40], table[40], 255])
    expect(Array.from(context.put.data.slice(8, 16)))
      .toEqual([table[10], table[10], table[10], 255, table[20], table[20], table[20], 255])
  })

  it('makes the still opaque whatever the render target says', () => {
    const context = fakeContext()
    withCanvas(context, () => stillDataUrl(pixels(), 2, 2))
    for (let i = 3; i < context.put.data.length; i += 4) {
      expect(context.put.data[i]).toBe(255)
    }
  })

  it('honours the requested format', () => {
    const { toDataURL } = withCanvas(fakeContext(), () =>
      stillDataUrl(pixels(), 2, 2, { type: 'image/png', quality: 1 }))
    expect(toDataURL).toHaveBeenCalledWith('image/png', 1)
  })

  it('gives up quietly without a 2D context', () => {
    const { result } = withCanvas(null, () => stillDataUrl(pixels(), 2, 2))
    expect(result).toBeNull()
  })
})
