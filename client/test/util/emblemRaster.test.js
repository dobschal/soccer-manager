import { afterEach, describe, expect, it, vi } from 'vitest'
import { inlineEmblemAssets, loadEmblemImage, svgDataUrl } from '../../util/emblemRaster.js'

/**
 * The emblem goes onto the youth academy's facade through a 2D canvas, which
 * means it has to survive being loaded as an `<img>`: no external references and
 * nothing that would taint the canvas.
 */
describe('emblemRaster', () => {
  const ICON = './assets/emblem-icons/ball.svg'
  const svgWith = (href) => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">` +
    `<image href="${href}" x="60" y="60"/></svg>`

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('percent-encodes the markup so non-Latin club names survive', () => {
    const url = svgDataUrl('<svg>Škoda Ünïon</svg>')
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    expect(decodeURIComponent(url.split(',')[1])).toBe('<svg>Škoda Ünïon</svg>')
  })

  it('inlines a referenced icon file, because an img-loaded SVG cannot fetch it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '<svg>icon</svg>' })
    vi.stubGlobal('fetch', fetchMock)

    const result = await inlineEmblemAssets(svgWith(ICON))
    expect(fetchMock).toHaveBeenCalledWith(ICON)
    expect(result).not.toContain(ICON)
    expect(result).toContain('href="data:image/svg+xml;charset=utf-8,')
    expect(decodeURIComponent(result)).toContain('<svg>icon</svg>')
  })

  it('caches an icon across emblems instead of refetching it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '<svg>cached</svg>' })
    vi.stubGlobal('fetch', fetchMock)
    const icon = './assets/emblem-icons/cached-once.svg'

    await inlineEmblemAssets(svgWith(icon))
    await inlineEmblemAssets(svgWith(icon))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the emblem when an icon cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const svg = svgWith('./assets/emblem-icons/missing.svg')
    // Unchanged markup: the icon layer stays empty, the rest still renders.
    expect(await inlineEmblemAssets(svg)).toBe(svg)
  })

  it('leaves markup without references untouched and never fetches', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'
    expect(await inlineEmblemAssets(svg)).toBe(svg)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('resolves with the loaded image', async () => {
    const images = []
    vi.stubGlobal('Image', class {
      constructor () { images.push(this) }
      get src () { return this._src }
      set src (value) {
        this._src = value
        setTimeout(() => this.onload(), 0)
      }
      
    })

    const image = await loadEmblemImage('<svg xmlns="http://www.w3.org/2000/svg"/>')
    expect(image).toBe(images[0])
    expect(image.src.startsWith('data:image/svg+xml')).toBe(true)
  })

  it('rejects when the SVG cannot be rasterised', async () => {
    vi.stubGlobal('Image', class {
      set src (value) { setTimeout(() => this.onerror(new Error('bad svg')), 0) }
    })

    await expect(loadEmblemImage('<not-svg>')).rejects.toThrow(/could not be rasterised/)
  })
})
