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
