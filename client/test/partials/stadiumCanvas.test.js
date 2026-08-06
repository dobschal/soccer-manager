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

/**
 * A corner stand must look like it belongs to the stands it sits between: a
 * corner holding a quarter of a side stand's seats has to come out the same size
 * as that side stand — same depth (measured along the neighbour's own axis) and
 * the same top height. Its rows sit on the 45° diagonal, so the comparison goes
 * through `_cornerSeamDepth`.
 */
describe('StadiumCanvas corner-to-side-stand scale', () => {
  const canvas = new StadiumCanvas({}, {})
  // east/west depth is sized against half the north/south width
  const SIDE_DEPTH_WIDTH = 28

  const sideStand = (seats) => {
    const rows = canvas._standRowCount(seats, SIDE_DEPTH_WIDTH)
    return { rows, depth: canvas._standDepth(seats, SIDE_DEPTH_WIDTH), top: canvas._standTopY(rows) }
  }
  const cornerStand = (seats) => {
    const rows = canvas._cornerRowCount(seats)
    return { rows, depth: canvas._cornerSeamDepth(rows), top: canvas._cornerTierLayout(rows).overallTop }
  }

  // 3.500 in a corner next to a 14.000 side stand is the case that looked wrong:
  // the corner came out clearly smaller than its neighbours.
  const SIDE_SEATS = [200, 400, 2_000, 4_000, 8_000, 12_000, 14_000, 15_000]

  it('matches the side stand in depth at a quarter of its seats', () => {
    for (const seats of SIDE_SEATS) {
      const side = sideStand(seats)
      const corner = cornerStand(seats / 4)
      // within 10 % — both row counts are rounded to whole rows
      expect(Math.abs(corner.depth - side.depth) / side.depth).toBeLessThan(0.1)
    }
  })

  it('matches the side stand in height at a quarter of its seats', () => {
    for (const seats of SIDE_SEATS) {
      const side = sideStand(seats)
      const corner = cornerStand(seats / 4)
      expect(Math.abs(corner.top - side.top) / side.top).toBeLessThan(0.1)
    }
  })

  it('splits into two tiers alongside its neighbours, not before or after', () => {
    for (const seats of SIDE_SEATS) {
      const sideTwoTier = canvas._standTierRows(sideStand(seats).rows).twoTier
      const cornerTwoTier = canvas._cornerTierLayout(cornerStand(seats / 4).rows).twoTier
      expect(cornerTwoTier).toBe(sideTwoTier)
    }
  })

  it('never truncates a corner inside the buildable range (max 4,000 seats)', () => {
    // The row cap is a backstop only; hitting it would silently shrink the
    // biggest corners — which is what made a 3,500-seat corner look too small.
    expect(canvas._cornerRowCount(3_500)).toBeLessThan(50)
    expect(canvas._cornerRowCount(4_000)).toBeLessThan(50)
  })

  it('grows monotonically with seat count and keeps unbuilt corners at zero', () => {
    expect(canvas._cornerRowCount(0)).toBe(0)
    expect(canvas._cornerRowCount(undefined)).toBe(0)
    const rows = [50, 250, 1_000, 2_000, 3_500, 4_000].map(s => canvas._cornerRowCount(s))
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]).toBeGreaterThan(rows[i - 1])
    }
  })
})

describe('StadiumCanvas construction state', () => {
  const underConstruction = (extra = {}) => new StadiumCanvas({
    north_stand_size: 8000,
    north_stand_roof: 1,
    north_construction_end_game_day: 4,
    north_construction_end_season: 2,
    corner_ne_stand_size: 3000,
    corner_ne_stand_roof: 1,
    corner_ne_construction_end_game_day: 4,
    ...extra
  }, {})

  it('marks a stand with a pending construction end as under construction', () => {
    const canvas = underConstruction()
    expect(canvas._isStandUnderConstruction('north')).toBe(true)
    expect(canvas._isStandUnderConstruction('corner_ne')).toBe(true)
    expect(canvas._isStandUnderConstruction('south')).toBe(false)
  })

  it('treats game day 0 as under construction (not as a missing value)', () => {
    const canvas = new StadiumCanvas({ south_construction_end_game_day: 0 }, {})
    expect(canvas._isStandUnderConstruction('south')).toBe(true)
  })

  it('takes the roof off a stand that is being rebuilt', () => {
    const canvas = underConstruction()
    expect(canvas._standHasRoof('north')).toBe(false)
    expect(canvas._standHasRoof('corner_ne')).toBe(false)
  })

  it('keeps the roof on stands that are not being rebuilt', () => {
    const canvas = underConstruction({ east_stand_roof: 1 })
    expect(canvas._standHasRoof('east')).toBe(true)
  })

  it('reports no roof on a corner stand under construction in the layout', () => {
    const ne = underConstruction()._cornerLayout().find(c => c.pos === 'ne')
    expect(ne.roof).toBe(false)
    expect(ne.underConstruction).toBe(true)
  })

  it('brings the corner floodlight mast back while a roofed neighbour is rebuilt', () => {
    const canvas = underConstruction({ east_stand_roof: 1 })
    // Both north and east are roofed, but north's roof is off for the build.
    expect(canvas._cornerHasBothRoofs('ne')).toBe(false)
  })

  it('ignores the construction fields when the caller opts out (expand preview)', () => {
    const canvas = new StadiumCanvas({
      north_stand_roof: 1,
      north_construction_end_game_day: 4,
      corner_ne_stand_size: 3000,
      corner_ne_stand_roof: 1,
      corner_ne_construction_end_game_day: 4
    }, {}, 'c', { showConstruction: false })
    expect(canvas._isStandUnderConstruction('north')).toBe(false)
    expect(canvas._standHasRoof('north')).toBe(true)
    expect(canvas._cornerLayout().find(c => c.pos === 'ne').roof).toBe(true)
  })
})

/**
 * The stands are built straight into a Three.js scene, so these tests run the
 * builders against a stub library and count the instanced meshes that come out:
 * every stand always emits one mesh for its steps, plus one per seat colour.
 * A stand under construction must emit the steps only.
 */
describe('StadiumCanvas stand geometry under construction', () => {
  /**
   * A stand-in for the `three` module: every accessed export becomes a class
   * that records its constructor arguments and answers the handful of methods
   * the builders call on it.
   * @returns {Object}
   */
  const stubThree = () => {
    const created = []
    const stubClass = (type) => class {
      constructor (...args) {
        this.type = type
        this.args = args
        this.children = []
        this.position = { set: () => {}, add: () => {} }
        this.rotation = { x: 0, y: 0, z: 0 }
        this.target = { position: { set: () => {} } }
        this.instanceMatrix = {}
        this.instanceColor = null
        this.shadow = { mapSize: {}, camera: {} }
        created.push(this)
      }

      add (child) { this.children.push(child) }
      set () { return this }
      setMatrixAt () {}
      setColorAt () {}
      setPosition () {}
      compose () {}
      lookAt () {}
      moveTo () {}
      lineTo () {}
      closePath () {}
      setAttribute () {}
      setIndex () {}
      computeVertexNormals () {}
      setFromPoints () { return this }
      clone () { return this }
      normalize () { return this }
      multiplyScalar () { return this }
    }

    const classes = {}
    return new Proxy({ created }, {
      get (target, prop) {
        if (prop in target) return target[prop]
        if (typeof prop !== 'string') return undefined
        if (prop === 'DoubleSide') return 2
        classes[prop] = classes[prop] ?? stubClass(prop)
        return classes[prop]
      }
    })
  }

  /**
   * @param {Object} config extra `_createStand` config
   * @returns {number} number of InstancedMesh instances created
   */
  const buildStand = (config) => {
    const canvas = new StadiumCanvas({}, {})
    canvas._THREE = stubThree()
    canvas._createStand({ add: () => {} }, {
      position: 'south', width: 56, seats: 12000, x: 0, z: 19, rotation: 0, ...config
    })
    return canvas._THREE.created.filter(o => o.type === 'InstancedMesh').length
  }

  /**
   * @param {Object} config extra `_createCornerStand` config
   * @returns {number} number of InstancedMesh instances created
   */
  const buildCornerStand = (config) => {
    const canvas = new StadiumCanvas({}, {})
    canvas._THREE = stubThree()
    canvas._createCornerStand({ add: () => {} }, {
      x: 30, z: 20, rotation: 0, rows: 20, roof: false, ...config
    })
    return canvas._THREE.created.filter(o => o.type === 'InstancedMesh').length
  }

  it('builds seats on a finished stand', () => {
    // steps + at least one seat-colour mesh
    expect(buildStand({})).toBeGreaterThan(1)
  })

  it('leaves a stand under construction without any seats', () => {
    expect(buildStand({ underConstruction: true })).toBe(1) // steps only
  })

  it('leaves a corner stand under construction without any seats', () => {
    expect(buildCornerStand({})).toBeGreaterThan(1)
    expect(buildCornerStand({ underConstruction: true })).toBe(1)
  })
})

/**
 * When a WebGL context can't be created (hardware acceleration off, headless
 * GPU, ancient browser), Three.js throws from the WebGLRenderer constructor.
 * That must not break the page — the canvas is swapped for a short note instead.
 */
describe('StadiumCanvas WebGL fallback', () => {
  it('replaces the canvas with a note element', () => {
    const wrapper = document.createElement('div')
    const canvas = document.createElement('canvas')
    wrapper.appendChild(canvas)

    new StadiumCanvas({}, {})._showWebGLFallback(canvas)

    expect(wrapper.querySelector('canvas')).toBeNull()
    const fallback = wrapper.querySelector('.stadium-webgl-fallback')
    expect(fallback).not.toBeNull()
    expect(fallback.textContent.trim().length).toBeGreaterThan(0)
  })

  it('is a no-op for a detached canvas (nothing to replace)', () => {
    const canvas = document.createElement('canvas')
    expect(() => new StadiumCanvas({}, {})._showWebGLFallback(canvas)).not.toThrow()
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

/**
 * The same scene serves the stadium page and the buildings page; only the point
 * the camera orbits (and the club buildings around it) differ.
 */
describe('StadiumCanvas club buildings', () => {
  const BUILDINGS = [
    { type: 'training_area', level: 2 },
    { type: 'fitness_studio', level: 1 },
    { type: 'youth_academy', level: 1 }
  ]
  const canvasWith = (options) => new StadiumCanvas(
    { north_stand_size: 8000, south_stand_size: 8000 }, {}, 'c', options
  )

  it('orbits the pitch centre by default', () => {
    expect(canvasWith({})._focusPoint()).toEqual({ x: 0, z: 0 })
  })

  it('orbits the north-east road intersection on the buildings view', () => {
    const canvas = canvasWith({ focus: 'buildings' })
    const distance = canvas._roadDistance()
    expect(canvas._focusPoint()).toEqual({ x: distance, z: -distance })
  })

  it('pulls the camera closer in on the buildings view', () => {
    expect(canvasWith({ focus: 'buildings' })._view().minDistance)
      .toBeLessThan(canvasWith({})._view().minDistance)
  })

  it('places the plots outside the road grid, in the north-east quadrant', () => {
    const canvas = canvasWith({ buildings: BUILDINGS })
    const distance = canvas._roadDistance()
    expect(canvas._buildingPlots()).toHaveLength(3)
    for (const plot of canvas._buildingPlots()) {
      // Never on the stadium footprint (which fills the road grid).
      expect(Math.abs(plot.cx) < distance && Math.abs(plot.cz) < distance).toBe(false)
      expect(plot.cx).toBeGreaterThan(0)
      expect(plot.cz).toBeLessThan(0)
    }
  })

  it('has no plots when the team owns no buildings', () => {
    expect(canvasWith({})._buildingPlots()).toEqual([])
  })

  it('grows the ground plane so no plot hangs over the edge', () => {
    const bigStadium = new StadiumCanvas(
      { north_stand_size: 30000, south_stand_size: 30000, east_stand_size: 15000, west_stand_size: 15000 },
      {}, 'c', { buildings: BUILDINGS }
    )
    const half = bigStadium._groundHalf()
    for (const plot of bigStadium._buildingPlots()) {
      expect(Math.abs(plot.cx) + plot.halfX).toBeLessThan(half)
      expect(Math.abs(plot.cz) + plot.halfZ).toBeLessThan(half)
    }
  })

  it('keeps the default ground size for a stadium without buildings', () => {
    expect(canvasWith({})._groundHalf()).toBe(125)
  })
})
