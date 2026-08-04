import { describe, expect, it, vi } from 'vitest'
import { StadiumCanvas } from '../../partials/stadiumCanvas.js'

/**
 * These tests target the pure stand-sizing math (`_standRowCount`), which drives
 * how big each stand looks. They don't touch Three.js / WebGL — the method only
 * depends on its arguments.
 */
describe('StadiumCanvas._standRowCount', () => {
  const canvas = new StadiumCanvas({}, {})

  // north/south stands are as wide as the field (+6), east/west as deep (+6).
  const NS_WIDTH = 56
  const EW_WIDTH = 36

  it('grows monotonically with seat count', () => {
    const sizes = [1000, 5000, 10000, 15000, 20000, 30000]
    const rows = sizes.map(s => canvas._standRowCount(s, NS_WIDTH))
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]).toBeGreaterThan(rows[i - 1])
    }
  })

  it('makes a 30k stand clearly larger than a 15k stand (regression)', () => {
    // The old divider-based formula saturated here: 15k and 30k came out nearly
    // the same size (~19% apart). A doubling of seats must be clearly visible.
    const rows15k = canvas._standRowCount(15000, NS_WIDTH)
    const rows30k = canvas._standRowCount(30000, NS_WIDTH)
    expect(rows30k / rows15k).toBeGreaterThan(1.3)
  })

  it('never returns fewer than the 3-row minimum', () => {
    expect(canvas._standRowCount(0, NS_WIDTH)).toBe(3)
    expect(canvas._standRowCount(1, NS_WIDTH)).toBeGreaterThanOrEqual(3)
    expect(canvas._standRowCount(100, NS_WIDTH)).toBeGreaterThanOrEqual(3)
  })

  it('makes a narrower stand deeper for the same seat count', () => {
    // A narrower stand fits fewer seats per row, so it needs more rows.
    const wide = canvas._standRowCount(15000, NS_WIDTH)
    const narrow = canvas._standRowCount(15000, EW_WIDTH)
    expect(narrow).toBeGreaterThan(wide)
  })

  it('keeps even a mega-stand at a sane depth', () => {
    // Guard against the linear-growth failure mode (hundreds of rows deep).
    expect(canvas._standRowCount(30000, NS_WIDTH)).toBeLessThan(100)
  })

  it('sizes a side stand at half-width equal to a full-width end stand with double the seats', () => {
    // East/west depth is computed against half the north/south width, so an E/W
    // stand with N seats is the same size as an N/S stand with 2N seats.
    const sideDepthWidth = NS_WIDTH / 2
    expect(canvas._standRowCount(2500, sideDepthWidth)).toBe(canvas._standRowCount(5000, NS_WIDTH))
    expect(canvas._standRowCount(5000, sideDepthWidth)).toBe(canvas._standRowCount(10000, NS_WIDTH))
  })
})

describe('StadiumCanvas._standTierRows', () => {
  const canvas = new StadiumCanvas({}, {})

  it('stays single-tier below the row threshold', () => {
    const result = canvas._standTierRows(33)
    expect(result.twoTier).toBe(false)
    expect(result.lowerRows).toBe(33)
    expect(result.upperRows).toBe(0)
  })

  it('becomes two-tier at the row threshold (34 rows)', () => {
    expect(canvas._standTierRows(34).twoTier).toBe(true)
  })

  it('puts ~2/3 of the rows in the lower tier and ~1/3 in the upper', () => {
    const { lowerRows, upperRows } = canvas._standTierRows(60)
    expect(lowerRows).toBe(40)
    expect(upperRows).toBe(20)
  })

  it('always accounts for every row across both tiers', () => {
    for (const rows of [34, 42, 59, 73]) {
      const { lowerRows, upperRows } = canvas._standTierRows(rows)
      expect(lowerRows + upperRows).toBe(rows)
      expect(lowerRows).toBeGreaterThan(upperRows)
    }
  })
})

describe('StadiumCanvas corner stands', () => {
  const withCorners = size => new StadiumCanvas({
    corner_ne_stand_size: size,
    corner_nw_stand_size: size,
    corner_se_stand_size: size,
    corner_sw_stand_size: size
  }, {})

  it('produces one corner layout entry per corner', () => {
    const corners = withCorners(3000)._cornerLayout()
    expect(corners).toHaveLength(4)
    const signs = corners.map(c => `${c.sx},${c.sz}`).sort()
    expect(signs).toEqual(['-1,-1', '-1,1', '1,-1', '1,1'])
    expect(corners.map(c => c.pos).sort()).toEqual(['ne', 'nw', 'se', 'sw'])
  })

  it('faces each corner stand back toward the field centre', () => {
    for (const c of withCorners(3000)._cornerLayout()) {
      // local -z (the stand front) rotated about Y by c.rotation
      const frontX = -Math.sin(c.rotation)
      const frontZ = -Math.cos(c.rotation)
      // ...should point opposite the corner's outward sign (i.e. inward)
      expect(Math.sign(Math.round(frontX))).toBe(-c.sx)
      expect(Math.sign(Math.round(frontZ))).toBe(-c.sz)
    }
  })

  it('gives an unbuilt corner (size 0) zero depth', () => {
    for (const c of new StadiumCanvas({}, {})._cornerLayout()) {
      expect(c.depth).toBe(0)
    }
  })

  it('makes a bigger fan for a bigger corner-stand size', () => {
    expect(withCorners(20000)._cornerLayout()[0].depth)
      .toBeGreaterThan(withCorners(2000)._cornerLayout()[0].depth)
  })

  it('reflects the stored roof flag', () => {
    const canvas = new StadiumCanvas({ corner_ne_stand_size: 3000, corner_ne_stand_roof: 1 }, {})
    const ne = canvas._cornerLayout().find(c => c.pos === 'ne')
    expect(ne.roof).toBe(true)
  })

  it('pushes the floodlight masts further out for bigger corner stands', () => {
    const dist = c => Math.hypot(c.x, c.z)
    const small = dist(withCorners(2000)._floodlightPositions()[0])
    const big = dist(withCorners(20000)._floodlightPositions()[0])
    expect(big).toBeGreaterThan(small)
  })

  it('tags each floodlight position with its corner', () => {
    const positions = new StadiumCanvas({}, {})._floodlightPositions()
    expect(positions.map(p => p.pos).sort()).toEqual(['ne', 'nw', 'se', 'sw'])
  })
})

describe('StadiumCanvas._cornerHasBothRoofs', () => {
  it('is true only when both adjacent main stands are roofed', () => {
    const canvas = new StadiumCanvas({ north_stand_roof: 1, east_stand_roof: 1 }, {})
    expect(canvas._cornerHasBothRoofs('ne')).toBe(true)
    // other corners share only one (or no) roofed neighbour
    expect(canvas._cornerHasBothRoofs('nw')).toBe(false) // west not roofed
    expect(canvas._cornerHasBothRoofs('se')).toBe(false) // south not roofed
    expect(canvas._cornerHasBothRoofs('sw')).toBe(false)
  })

  it('is false when a corner has no roofed neighbours', () => {
    const canvas = new StadiumCanvas({}, {})
    for (const pos of ['ne', 'nw', 'se', 'sw']) {
      expect(canvas._cornerHasBothRoofs(pos)).toBe(false)
    }
  })
})

describe('StadiumCanvas._mainStands (entrances layout)', () => {
  const canvas = new StadiumCanvas({
    north_stand_size: 8000,
    south_stand_size: 8000,
    east_stand_size: 4000,
    west_stand_size: 4000
  }, {})

  it('gives north/south 3 entrances and east/west 2', () => {
    const byside = Object.fromEntries(canvas._mainStands().map(s => [s.side, s]))
    expect(byside.north.count).toBe(3)
    expect(byside.south.count).toBe(3)
    expect(byside.east.count).toBe(2)
    expect(byside.west.count).toBe(2)
  })

  it("places each stand's back beyond the field-plus-gap edge", () => {
    // north/south base = fieldDepth/2 + gap = 19; east/west base = fieldW/2 + gap = 29.
    const minBase = { north: 19, south: 19, east: 29, west: 29 }
    for (const st of canvas._mainStands()) {
      expect(st.back).toBeGreaterThan(minBase[st.side])
    }
  })
})

/**
 * Camera/controls wiring. `_setupScene` is the only place that configures
 * OrbitControls, so it is exercised with stubs instead of a real WebGL context.
 */
describe('StadiumCanvas camera controls', () => {
  class FakeOrbitControls {
    constructor (camera, domElement) {
      this.camera = camera
      this.domElement = domElement
    }
  }

  const fakeThree = () => ({
    Scene: class {},
    Color: class {},
    PerspectiveCamera: class {
      position = { set: vi.fn() }
      lookAt = vi.fn()
    },
    WebGLRenderer: class {
      shadowMap = {}
      domElement = { style: {} }
      setSize = vi.fn()
      setPixelRatio = vi.fn()
    },
    PCFSoftShadowMap: 1
  })

  const setupWith = (options) => {
    const canvas = new StadiumCanvas({}, {}, 'test-canvas', options)
    canvas._THREE = fakeThree()
    canvas._OrbitControls = FakeOrbitControls
    canvas._setupScene({}, { clientWidth: 800 })
    return canvas._controls
  }

  it('is interactive and static by default', () => {
    const controls = setupWith(undefined)
    expect(controls.enabled).toBe(true)
    expect(controls.autoRotate).toBe(false)
  })

  it('locks user input and slowly orbits the camera when asked to', () => {
    const controls = setupWith({ interactive: false, autoRotate: true })
    expect(controls.enabled).toBe(false)
    expect(controls.autoRotate).toBe(true)
    // Slow orbit: clearly below the OrbitControls default of 2.0 deg/s
    expect(controls.autoRotateSpeed).toBeGreaterThan(0)
    expect(controls.autoRotateSpeed).toBeLessThan(2)
  })

  it('blocks touch gestures while interactive so OrbitControls can pan/zoom', () => {
    const controls = setupWith(undefined)
    expect(controls.domElement.style.touchAction).toBe('none')
  })

  it('allows vertical page scrolling on the canvas when controls are off', () => {
    const controls = setupWith({ interactive: false })
    expect(controls.domElement.style.touchAction).toBe('pan-y')
  })
})
