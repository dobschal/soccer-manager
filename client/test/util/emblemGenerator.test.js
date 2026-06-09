import { describe, it, expect } from 'vitest'
import {
  EMBLEM_ICONS,
  generateEmblem,
  resolveTint,
  resolveWordsOnBanner,
  splitTeamNameWords
} from '../../util/emblemGenerator.js'

describe('splitTeamNameWords', () => {
  it('returns an empty array for falsy input', () => {
    expect(splitTeamNameWords('')).toEqual([])
    expect(splitTeamNameWords(null)).toEqual([])
    expect(splitTeamNameWords(undefined)).toEqual([])
  })

  it('returns each whitespace-separated word as its own entry', () => {
    expect(splitTeamNameWords('Berlin')).toEqual(['Berlin'])
    expect(splitTeamNameWords('FC Berlin')).toEqual(['FC', 'Berlin'])
    expect(splitTeamNameWords('1. FC Berlin')).toEqual(['1.', 'FC', 'Berlin'])
  })

  it('collapses repeated whitespace', () => {
    expect(splitTeamNameWords('  1.   FC   Berlin  ')).toEqual(['1.', 'FC', 'Berlin'])
  })
})

describe('resolveWordsOnBanner', () => {
  it('defaults to all words visible when nothing is stored', () => {
    expect(resolveWordsOnBanner(['FC', 'Berlin'], {})).toEqual([true, true])
  })

  it('uses the explicit wordsOnBanner array when present', () => {
    const result = resolveWordsOnBanner(['FC', 'Real', 'Berlin'], { wordsOnBanner: [false, true, true] })
    expect(result).toEqual([false, true, true])
  })

  it('extends the wordsOnBanner array with true if it is shorter than the word list', () => {
    const result = resolveWordsOnBanner(['FC', 'Real', 'Berlin'], { wordsOnBanner: [false, true] })
    expect(result).toEqual([false, true, true])
  })

  it('falls back to the legacy prefix flags (last word always on)', () => {
    expect(resolveWordsOnBanner(['FC', 'Berlin'], { prefix1OnBanner: true })).toEqual([true, true])
    expect(resolveWordsOnBanner(['FC', 'Berlin'], { prefix1OnBanner: false })).toEqual([false, true])
    expect(resolveWordsOnBanner(['1.', 'FC', 'Berlin'], { prefix1OnBanner: true, prefix2OnBanner: true })).toEqual([true, true, true])
    expect(resolveWordsOnBanner(['1.', 'FC', 'Berlin'], { prefix1OnBanner: false, prefix2OnBanner: true })).toEqual([false, true, true])
  })
})

describe('generateEmblem banner rendering', () => {
  it('renders every word on the banner by default', () => {
    const svg = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      teamName: '1. FC Berlin',
      size: 200
    })
    expect(svg).toContain('>1. FC BERLIN<')
  })

  it('honours the wordsOnBanner array', () => {
    const svg = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      teamName: '1. FC Berlin',
      wordsOnBanner: [false, true, true],
      size: 200
    })
    expect(svg).toContain('>FC BERLIN<')
    expect(svg).not.toContain('1.')
  })

  it('falls back to legacy prefix flags when wordsOnBanner is missing', () => {
    const svg = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      teamName: '1. FC Berlin',
      prefix1OnBanner: true,
      prefix2OnBanner: false,
      size: 200
    })
    expect(svg).toContain('>1. BERLIN<')
  })

  it('does not render the large prefix-on-emblem text any more', () => {
    const svg = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      teamName: '1. FC Berlin',
      size: 200
    })
    expect(svg).not.toContain('Prefix inside emblem')
  })

  it('drops the banner entirely when every word is hidden', () => {
    const svg = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      teamName: '1. FC Berlin',
      wordsOnBanner: [false, false, false],
      size: 200
    })
    expect(svg).not.toContain('<!-- Banner -->')
    expect(svg).not.toContain('Left ribbon')
    expect(svg).not.toContain('Main banner body')
    expect(svg).not.toMatch(/<text [^>]*>BERLIN<\/text>/)
  })

  it('still renders the banner when at least one word is visible', () => {
    const svg = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      teamName: '1. FC Berlin',
      wordsOnBanner: [false, false, true],
      size: 200
    })
    expect(svg).toContain('<!-- Banner -->')
    expect(svg).toContain('>BERLIN<')
  })
})

describe('resolveTint', () => {
  it('returns white for unknown / nullish roles', () => {
    expect(resolveTint(null, '#aabbcc', '#112233')).toBe('#ffffff')
    expect(resolveTint('white', '#aabbcc', '#112233')).toBe('#ffffff')
    expect(resolveTint('something-else', '#aabbcc', '#112233')).toBe('#ffffff')
  })

  it('maps color1 / color2 to the respective hex values', () => {
    expect(resolveTint('color1', '#aabbcc', '#112233')).toBe('#aabbcc')
    expect(resolveTint('color2', '#aabbcc', '#112233')).toBe('#112233')
  })

  it('falls back to color1 when color2 is missing', () => {
    expect(resolveTint('color2', '#aabbcc', undefined)).toBe('#aabbcc')
  })

  it('returns brighter / darker variants for the Light / Dark roles', () => {
    const c1 = '#808080'
    // adjustBrightness uses ±2.55 * percent; ±20% ≈ ±51.
    const light = resolveTint('color1Light', c1, '#000000')
    const dark = resolveTint('color1Dark', c1, '#000000')
    expect(parseInt(light.slice(1), 16)).toBeGreaterThan(parseInt(c1.slice(1), 16))
    expect(parseInt(dark.slice(1), 16)).toBeLessThan(parseInt(c1.slice(1), 16))
  })

  it('uses color2 for the color2 variants', () => {
    const c2 = '#808080'
    expect(resolveTint('color2', '#000000', c2)).toBe('#808080')
    expect(resolveTint('color2Light', '#000000', c2)).not.toBe('#808080')
    expect(resolveTint('color2Dark', '#000000', c2)).not.toBe('#808080')
  })
})

describe('generateEmblem strokeColor + icon', () => {
  it('defaults the shape outline to white when no strokeColor is given', () => {
    const svg = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      color2: '#2c87e1',
      teamName: 'Test',
      size: 200
    })
    // The first stroke="..." in the SVG belongs to the shape border.
    const firstStroke = svg.match(/stroke="([^"]+)"/)
    expect(firstStroke).not.toBeNull()
    expect(firstStroke[1]).toBe('#ffffff')
  })

  it('uses color1 / color2 for the shape outline when requested', () => {
    const svg1 = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      color2: '#2c87e1',
      strokeColor: 'color1',
      teamName: 'Test',
      size: 200
    })
    expect(svg1.match(/stroke="([^"]+)"/)[1]).toBe('#ea3636')

    const svg2 = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      color2: '#2c87e1',
      strokeColor: 'color2',
      teamName: 'Test',
      size: 200
    })
    expect(svg2.match(/stroke="([^"]+)"/)[1]).toBe('#2c87e1')
  })

  it('keeps the banner outline white regardless of strokeColor', () => {
    const svg = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      color2: '#2c87e1',
      strokeColor: 'color1',
      teamName: 'Test',
      size: 200
    })
    // The banner ribbons / body emit strokes too; with strokeColor=color1
    // only the very first one (the shape) should pick up the color.
    const strokes = [...svg.matchAll(/stroke="([^"]+)"/g)].map(m => m[1])
    expect(strokes[0]).toBe('#ea3636')
    // All remaining strokes are the banner pieces and stay white.
    expect(strokes.slice(1).every(s => s === '#ffffff')).toBe(true)
  })

  it('omits the icon layer when no icon is selected', () => {
    const svg = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      teamName: 'Test',
      size: 200
    })
    expect(svg).not.toContain('<image href="./assets/emblem-icons/')
    expect(svg).not.toContain('<feColorMatrix')
  })

  it('renders an image + tint filter when an icon is selected', () => {
    const icon = EMBLEM_ICONS[0]
    const svg = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      color2: '#2c87e1',
      icon,
      iconColor: 'color2',
      teamName: 'Test',
      size: 200
    })
    expect(svg).toContain(`<image href="./assets/emblem-icons/${icon}.svg"`)
    expect(svg).toContain('<feColorMatrix')
    // color2 = #2c87e1 → r=44/255, g=135/255, b=225/255. Just check the b channel
    // ended up in the matrix's column-3 of the second row → "0 0 0 0 G".
    expect(svg).toMatch(/feColorMatrix type="matrix" values="0 0 0 0 [\d.]+ 0 0 0 0 [\d.]+ 0 0 0 0 [\d.]+ 0 0 0 1 0"/)
  })

  it('ignores an unknown icon filename', () => {
    const svg = generateEmblem({
      shape: 'shield',
      pattern: 'solid',
      color: '#ea3636',
      icon: 'not-a-real-icon',
      iconColor: 'color1',
      teamName: 'Test',
      size: 200
    })
    expect(svg).not.toContain('<image href="./assets/emblem-icons/')
  })
})
