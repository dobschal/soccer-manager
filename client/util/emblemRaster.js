/**
 * Turn a club emblem (the SVG string from `renderEmblem`) into an image that can
 * be drawn onto a 2D canvas — which is how it gets onto the youth academy's
 * facade in the 3D scene (`clubBuildingsScene.js`).
 *
 * Two things make this less obvious than `img.src = svg`:
 *
 * 1. **No external references.** An SVG loaded through an `<img>` may not fetch
 *    anything, so the emblem's `<image href="./assets/emblem-icons/x.svg">` layer
 *    would silently stay empty. Those files are therefore fetched here and
 *    substituted as `data:` URLs, which count as inline data and do render.
 * 2. **The canvas must stay untainted.** WebGL refuses to upload a tainted
 *    canvas as a texture. A `data:` URL is same-origin, so rasterising the
 *    inlined SVG keeps the canvas clean — another reason not to leave the icon
 *    as a plain file reference.
 */

/** Relative `href="…svg"` references in the emblem markup. */
const EXTERNAL_REF = /href="(\.\/[^"]+\.svg)"/g

/** url → data URL, so repeated emblems don't refetch the same icon. */
const inlineCache = new Map()

/**
 * @param {string} svg
 * @returns {string} a data URL for the markup. Percent-encoded rather than
 *   base64 so team names outside Latin-1 survive.
 */
export function svgDataUrl (svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * Replace every relative file reference in the markup with an inlined `data:`
 * URL. A reference that cannot be fetched is left as it is — the emblem then
 * renders without that layer instead of not at all.
 * @param {string} svg
 * @returns {Promise<string>}
 */
export async function inlineEmblemAssets (svg) {
  const urls = [...new Set([...svg.matchAll(EXTERNAL_REF)].map(m => m[1]))]
  let result = svg

  for (const url of urls) {
    if (!inlineCache.has(url)) {
      try {
        const response = await fetch(url)
        if (!response.ok) continue
        inlineCache.set(url, svgDataUrl(await response.text()))
      } catch {
        continue
      }
    }
    result = result.split(`href="${url}"`).join(`href="${inlineCache.get(url)}"`)
  }

  return result
}

/**
 * Load an emblem SVG as an image, ready for `drawImage`.
 * @param {string} svg markup from `renderEmblem`
 * @returns {Promise<HTMLImageElement>} rejects when the markup cannot be
 *   rasterised (an old browser, or malformed SVG)
 */
export async function loadEmblemImage (svg) {
  const inlined = await inlineEmblemAssets(svg)

  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Emblem SVG could not be rasterised'))
    image.src = svgDataUrl(inlined)
  })
}

/**
 * A square canvas texture of the club emblem alone, for mounting on a wall in the
 * 3D scene (the stands' entrances, the clubhouse's glass facade).
 *
 * The canvas is left **transparent** around the emblem — the emblem's own shape
 * is what should be seen, not a plate behind it — so the material it goes on has
 * to be `transparent: true`.
 *
 * The emblem has to be rasterised first, so the texture starts out empty and is
 * painted as soon as the image is there; the render loop picks that up on its next
 * frame. Returns `null` where a 2D canvas is unavailable (jsdom in tests, ancient
 * browsers) so the caller can simply skip the sign.
 *
 * @param {Object} THREE the Three.js module
 * @param {{emblemSvg: string, size?: number, padding?: number}} config `padding`
 *   is the share of the canvas left clear around the emblem.
 * @returns {Object|null} a CanvasTexture
 */
export function emblemTexture (THREE, {emblemSvg, size = 256, padding = 0.04}) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext?.('2d')
  if (!ctx) return null

  const texture = new THREE.CanvasTexture(canvas)
  if (!emblemSvg) return texture

  const inset = size * padding
  loadEmblemImage(emblemSvg).then(image => {
    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(image, inset, inset, size - 2 * inset, size - 2 * inset)
    texture.needsUpdate = true
  }).catch(() => {
    // Nothing drawn: an empty transparent texture shows no sign at all, which is
    // better than a blank rectangle on the wall.
  })

  return texture
}
