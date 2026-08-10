/**
 * Turning the raw pixels of a WebGL render target into an `<img>`-ready data URL.
 *
 * Three.js only applies the sRGB transfer function when it draws to the screen —
 * rendering into a render target always writes **linear** values (see
 * `outputColorSpace` in the renderer). Pixels read back from such a target
 * therefore have to be encoded here, or the still comes out noticeably darker and
 * harder in the midtones than the very same view on the canvas.
 */

/**
 * Lookup table from a linear 8-bit channel value to its sRGB-encoded one.
 *
 * The pixels come back as bytes, so 256 entries cover every possible value —
 * cheaper (and identical in result) to a `Math.pow` per channel per pixel.
 * @returns {Uint8Array} 256 entries
 */
export function srgbLookupTable () {
  if (!LOOKUP) {
    LOOKUP = new Uint8Array(256)
    for (let i = 0; i < 256; i++) {
      const linear = i / 255
      const encoded = linear <= 0.0031308
        ? linear * 12.92
        : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055
      LOOKUP[i] = Math.round(Math.min(1, Math.max(0, encoded)) * 255)
    }
  }
  return LOOKUP
}

/** @type {Uint8Array|null} built on first use and kept for the session */
let LOOKUP = null

/**
 * A data URL of the pixels read out of a render target.
 *
 * Besides the colour space two things have to be put right: WebGL hands back its
 * rows bottom-up, and the alpha channel is dropped — the still is opaque (the sky
 * dome fills every pixel) and a JPEG is a fraction of the size of the equivalent
 * PNG, which matters for something that ends up inline in an `src` attribute.
 * @param {Uint8Array} pixels RGBA bytes, `width * height * 4` long, bottom row first
 * @param {number} width
 * @param {number} height
 * @param {{type?: string, quality?: number}} [options]
 * @returns {string|null} the data URL, or `null` without a 2D canvas context
 */
export function stillDataUrl (pixels, width, height, {type = 'image/jpeg', quality = 0.85} = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null

  const image = context.createImageData(width, height)
  const srgb = srgbLookupTable()
  const stride = width * 4
  for (let row = 0; row < height; row++) {
    // Bottom-up to top-down.
    const from = (height - 1 - row) * stride
    const to = row * stride
    for (let i = 0; i < stride; i += 4) {
      image.data[to + i] = srgb[pixels[from + i]]
      image.data[to + i + 1] = srgb[pixels[from + i + 1]]
      image.data[to + i + 2] = srgb[pixels[from + i + 2]]
      image.data[to + i + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  return canvas.toDataURL(type, quality)
}
