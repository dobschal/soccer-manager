import { describe, expect, it, vi } from 'vitest'
import { CONFIG, StadiumCanvas, daylightPhaseFor, skyColor } from '../../partials/stadiumCanvas.js'

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
        this.userData = {}
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
    Scene: class { add = vi.fn() },
    Color: class { r = 0.1; g = 0.1; b = 0.2 },
    Fog: class {},
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
    PCFSoftShadowMap: 1,
    // Just enough for the sky dome `_setupScene` builds.
    SphereGeometry: class {
      attributes = { position: { count: 0 } }
      setAttribute = vi.fn()
    },
    BufferAttribute: class {},
    MeshBasicMaterial: class {},
    Mesh: class {},
    Vector3: class {},
    BackSide: 1
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
 * The sunset sky gradient. `skyColor` is pure, so it is checked directly on
 * plain rgb triples; `_createSky` only has to hang the result on a dome.
 */
describe('skyColor', () => {
  const PALETTE = {
    zenith: [0.1, 0.08, 0.2],
    horizonWarm: [0.6, 0.32, 0.2],
    horizonCool: [0.16, 0.14, 0.31],
    bandExponent: 0.55,
    sunFocus: 1.5
  }
  // The sun sits in the west (-x), like CONFIG.sun.
  const SUN = { x: -1, z: 0 }
  const at = (x, y, z) => {
    const length = Math.hypot(x, y, z)
    return skyColor({ x: x / length, y: y / length, z: z / length }, SUN, PALETTE)
  }

  it('paints the zenith in the dusk colour, straight overhead', () => {
    expect(at(0, 1, 0)).toEqual(PALETTE.zenith)
  })

  it('warms the horizon towards the sun and cools it away from it', () => {
    const west = at(-1, 0.02, 0) // into the sunset
    const east = at(1, 0.02, 0) // opposite it
    expect(west[0]).toBeGreaterThan(east[0]) // more red
    expect(west[2]).toBeLessThan(east[2]) // less blue
    expect(west[0]).toBeGreaterThan(west[2]) // and warm overall
  })

  it('fades the warm band out as the direction climbs', () => {
    const redAt = y => at(-1, y, 0)[0]
    expect(redAt(0.05)).toBeGreaterThan(redAt(0.4))
    expect(redAt(0.4)).toBeGreaterThan(redAt(0.9))
  })

  it('never leaves the palette range, in any direction', () => {
    // Every result is a blend of the three stops, so it has to stay between the
    // darkest and the brightest channel among them.
    const stops = [PALETTE.zenith, PALETTE.horizonWarm, PALETTE.horizonCool].flat()
    const low = Math.min(...stops)
    const high = Math.max(...stops)
    for (const y of [-1, -0.3, 0, 0.3, 1]) {
      for (const angle of [0, 1, 2, 3, 4, 5]) {
        for (const channel of at(Math.cos(angle), y, Math.sin(angle))) {
          expect(channel).toBeGreaterThanOrEqual(low)
          expect(channel).toBeLessThanOrEqual(high)
        }
      }
    }
  })

  it('keeps the scene background and the fog inside the sky palette', () => {
    // The background only shows if the dome ever fails, so it has to match its
    // darkest part; the fog is the haze the horizon dissolves into.
    expect(CONFIG.colors.sceneBackground).toBe(CONFIG.sky.zenith)
    const blue = hex => hex & 0xff
    const red = hex => (hex >> 16) & 0xff
    expect(red(CONFIG.colors.fog)).toBeGreaterThan(red(CONFIG.sky.horizonCool))
    expect(blue(CONFIG.colors.fog)).toBeLessThan(blue(CONFIG.sky.horizonCool))
  })
})

/**
 * Coplanar decals on ground that runs out to the horizon (the roads' centre
 * markings) need a depth bias, not just a height offset.
 */
describe('StadiumCanvas depth precision', () => {
  it('keeps the near plane far enough out for the distant roads', () => {
    // At near 0.1 the depth buffer could not separate the markings from the
    // asphalt out at the far end of the roads, and they flickered.
    expect(CONFIG.camera.near).toBeGreaterThanOrEqual(1)
    // …but never so far that it clips what the camera can actually get close to.
    for (const view of Object.values(CONFIG.views)) {
      expect(CONFIG.camera.near).toBeLessThan(view.minDistance)
    }
    // Everything on the ground plane stays inside the frustum, from any angle.
    expect(CONFIG.camera.far).toBeGreaterThan(2 * new StadiumCanvas({}, {})._groundHalf())
  })

  it('biases the road markings towards the camera', () => {
    const created = []
    const canvas = new StadiumCanvas({}, {})
    canvas._THREE = new Proxy({}, {
      get: (_, prop) => {
        if (prop === 'Quaternion') {
          return class { setFromEuler () { return this } }
        }
        return class {
          constructor (...args) {
            this.type = prop
            this.args = args
            this.position = { set: () => {} }
            this.rotation = {}
            this.instanceMatrix = {}
            created.push(this)
          }

          set () { return this }
          compose () {}
          setMatrixAt () {}
        }
      }
    })
    canvas._buildRoads({ add: () => {} })

    const marking = created.find(o =>
      o.type === 'MeshBasicMaterial' && o.args[0]?.color === CONFIG.road.markingColor)
    expect(marking.args[0].polygonOffset).toBe(true)
    // Negative pulls the dashes towards the camera, in depth-buffer units, so
    // the correction holds at any distance.
    expect(marking.args[0].polygonOffsetFactor).toBeLessThan(0)
    expect(marking.args[0].polygonOffsetUnits).toBeLessThan(0)
  })
})

/**
 * The scene's fill lighting: ambient, a cool moon from above and a warm low
 * evening sun from the west.
 */
describe('StadiumCanvas._setupLights', () => {
  const DUSK = CONFIG.daylight.phases.dusk

  const setupLights = (options = {}) => {
    const added = []
    // Pinned to dusk: the phase otherwise follows the clock the tests run on.
    const canvas = new StadiumCanvas({}, {}, 'c', { daylight: 'dusk', ...options })
    canvas._scene = { add: (o) => added.push(o) }
    canvas._THREE = {
      AmbientLight: class {
        constructor (color, intensity) { Object.assign(this, { kind: 'ambient', color, intensity }) }
      },
      DirectionalLight: class {
        constructor (color, intensity) {
          Object.assign(this, { kind: 'directional', color, intensity })
          this.position = { set: (x, y, z) => { this.at = { x, y, z } } }
          this.target = { position: { set: (x, y, z) => { this.aimedAt = { x, y, z } } } }
          this.shadow = { mapSize: {}, camera: {} }
        }
      }
    }
    canvas._setupLights()
    return { added, canvas }
  }
  const lightsOf = (options) => setupLights(options).added
  const sunOf = (options) => lightsOf(options).find(l => l.kind === 'directional' && l.color !== CONFIG.colors.moonLight)

  it('lights the scene with the phase\'s sun on top of the moon fill', () => {
    const sun = sunOf()
    expect(sun).toBeDefined()
    expect(sun.color).toBe(DUSK.sun.color)
    expect(sun.intensity).toBe(DUSK.sun.intensity)
  })

  it('hangs the dusk sun low in the west, not overhead like the moon', () => {
    const lights = lightsOf()
    const sun = lights.find(l => l.color === DUSK.sun.color)
    const moon = lights.find(l => l.color === CONFIG.colors.moonLight)
    // The stadium view orbits the origin, so on it the sun's position is also the
    // direction it comes from: far out west (-x), only just above the horizon.
    expect(sun.at.x).toBeLessThan(0)
    expect(sun.at.y).toBeGreaterThan(0)
    const elevation = Math.atan2(sun.at.y, Math.hypot(sun.at.x, sun.at.z)) * 180 / Math.PI
    expect(elevation).toBeGreaterThan(5)
    expect(elevation).toBeLessThan(25)
    // The moon stays the steep one.
    expect(Math.atan2(moon.at.y, Math.hypot(moon.at.x, moon.at.z)))
      .toBeGreaterThan(Math.atan2(sun.at.y, Math.hypot(sun.at.x, sun.at.z)))
  })

  it('keeps the warm sun weak enough not to outshine the floodlights', () => {
    const lights = lightsOf()
    const sun = lights.find(l => l.color === DUSK.sun.color)
    // A warm colour (more red than blue) and a fill-level intensity.
    expect((DUSK.sun.color >> 16) & 0xff).toBeGreaterThan(DUSK.sun.color & 0xff)
    expect(sun.intensity).toBeLessThanOrEqual(2)
    expect(lights.filter(l => l.kind === 'ambient')).toHaveLength(1)
  })

  it('takes the fill intensities from the phase, bright enough to read by', () => {
    const lights = lightsOf()
    const ambient = lights.find(l => l.kind === 'ambient')
    const moon = lights.find(l => l.color === CONFIG.colors.moonLight)
    expect(ambient.intensity).toBe(DUSK.fill.ambient)
    expect(moon.intensity).toBe(DUSK.fill.moon)
    // The fill has to lift the shadowed sides and the far corners out of black
    // without washing the floodlights out.
    expect(DUSK.fill.ambient).toBeGreaterThan(0.6)
    expect(DUSK.fill.ambient).toBeLessThan(1.5)
  })

  it('casts the long shadows of the low sun, and only from the sun', () => {
    const lights = lightsOf()
    const sun = lights.find(l => l.color === DUSK.sun.color)
    const moon = lights.find(l => l.color === CONFIG.colors.moonLight)
    expect(sun.castShadow).toBe(true)
    expect(sun.shadow.mapSize.width).toBe(CONFIG.sun.shadow.mapSize)
    expect(sun.shadow.mapSize.height).toBe(CONFIG.sun.shadow.mapSize)
    // One extra pass is the whole budget: the moon stays shadowless.
    expect(moon.castShadow).toBeFalsy()
  })

  it('sizes the sun shadow camera around the focus, deep enough for its shadows', () => {
    const sun = sunOf()
    const {radius} = CONFIG.sun.shadow
    const camera = sun.shadow.camera
    expect([camera.left, camera.bottom]).toEqual([-radius, -radius])
    expect([camera.right, camera.top]).toEqual([radius, radius])
    // The light sits far out; its depth range has to bracket that distance so
    // neither the casters nor their long shadows fall outside the frustum.
    const distance = Math.hypot(...DUSK.sun.position)
    expect(camera.near).toBeGreaterThan(0)
    expect(camera.near).toBeLessThan(distance)
    expect(camera.far).toBeGreaterThan(distance)
  })

  it('aims the sun at whatever the camera orbits, keeping its direction', () => {
    const {canvas} = setupLights({focus: 'buildings'})
    const sun = sunOf({focus: 'buildings'})
    const focus = canvas._focusPoint()
    expect(focus.x).toBeGreaterThan(0) // the crossing north-east of the stadium
    expect(sun.aimedAt).toEqual({x: focus.x, y: 0, z: focus.z})
    // Same light direction as on the stadium view — only the shadowed area moved.
    expect(sun.at.x - focus.x).toBe(DUSK.sun.position[0])
    expect(sun.at.z - focus.z).toBe(DUSK.sun.position[2])
    expect(sun.at.y).toBe(DUSK.sun.position[1])
  })

  it('lights each phase from its own side, and only the day without floodlights', () => {
    const {phases} = CONFIG.daylight
    // Dusk in the west, dawn in the east — that is what makes them tell apart.
    expect(phases.dusk.sun.position[0]).toBeLessThan(0)
    expect(phases.dawn.sun.position[0]).toBeGreaterThan(0)
    // Day is the bright one, night the dark one, and only by day are the
    // floodlights out.
    expect(phases.day.sun.intensity).toBeGreaterThan(phases.dusk.sun.intensity)
    expect(phases.night.sun.intensity).toBeLessThan(phases.dusk.sun.intensity)
    expect(phases.day.floodlights).toBe(false)
    for (const name of ['dawn', 'dusk', 'night']) {
      expect(phases[name].floodlights).toBe(true)
    }
    // Every phase brings a full palette, so nothing falls back mid-switch.
    for (const name of CONFIG.daylight.order) {
      const phase = phases[name]
      expect(Object.keys(phase.sky)).toEqual(['zenith', 'horizonWarm', 'horizonCool'])
      expect(typeof phase.fog).toBe('number')
      expect(typeof phase.background).toBe('number')
      expect(phase.fill.ambient).toBeGreaterThan(0)
    }
  })

  it('takes the sun straight from the picked phase when it changes', () => {
    const {canvas} = setupLights()
    canvas._phase = 'day'
    expect(canvas._palette()).toBe(CONFIG.daylight.phases.day)
    // The sun is repositioned for the new phase without rebuilding anything.
    canvas._aimSun()
    expect(canvas._sunLight.at.x).toBe(CONFIG.daylight.phases.day.sun.position[0])
  })
})

/**
 * Which of the four phases the player's own clock lands in, and how the slider
 * under the canvas moves between them.
 */
describe('daylightPhaseFor', () => {
  const at = (hour) => daylightPhaseFor(new Date(2026, 0, 15, hour, 30))

  it('picks the phase whose hours contain the local time', () => {
    expect(at(6)).toBe('dawn')
    expect(at(12)).toBe('day')
    expect(at(19)).toBe('dusk')
    expect(at(23)).toBe('night')
  })

  it('carries night across midnight', () => {
    expect(at(0)).toBe('night')
    expect(at(3)).toBe('night')
    expect(at(4)).toBe('night')
    expect(at(5)).toBe('dawn')
  })

  it('covers every hour of the day exactly once', () => {
    const seen = Array.from({length: 24}, (_, hour) => at(hour))
    expect(seen.every(phase => CONFIG.daylight.order.includes(phase))).toBe(true)
    expect(new Set(seen).size).toBe(4)
  })

  it('defaults to the current time and can be overridden by the caller', () => {
    expect(CONFIG.daylight.order).toContain(daylightPhaseFor())
    expect(new StadiumCanvas({}, {}, 'c', {daylight: 'night'})._phase).toBe('night')
    // An unknown name falls back to the clock rather than breaking the scene.
    expect(CONFIG.daylight.order)
      .toContain(new StadiumCanvas({}, {}, 'c', {daylight: 'teatime'})._phase)
  })

  it('offers the slider one step per phase, in the order of a day', () => {
    expect(CONFIG.daylight.order).toEqual(['dawn', 'day', 'dusk', 'night'])
    const canvas = new StadiumCanvas({}, {}, 'c', {daylight: 'day', daylightControl: true})
    const html = canvas._renderDaylightControl()
    expect(html).toContain('type="range"')
    expect(html).toContain('max="3"')
    expect(html).toContain('value="1"') // 'day' is the second step
  })

  it('renders the slider only where it is asked for', () => {
    const withControl = new StadiumCanvas({}, {}, 'c', {daylightControl: true})
    const without = new StadiumCanvas({}, {}, 'c', {})
    expect(withControl.template).toContain('stadium-daylight__slider')
    expect(without.template).not.toContain('stadium-daylight__slider')
  })

  it('switches phase without touching the scene it has not built yet', () => {
    const canvas = new StadiumCanvas({}, {}, 'c', {daylight: 'day'})
    expect(() => canvas._setPhase('night')).not.toThrow()
    expect(canvas._phase).toBe('night')
    // An unknown phase is ignored instead of blanking the scene.
    canvas._setPhase('teatime')
    expect(canvas._phase).toBe('night')
  })
})

/**
 * The club emblem over every entrance in the stands' back walls, lit by two small
 * dummy lamps. The emblem is drawn into a 2D canvas, which jsdom does not
 * implement — the tests install a recording stub for it.
 */
describe('StadiumCanvas entrance emblems', () => {
  const fakeContext = () => ({
    calls: [],
    fillStyle: '',
    fillRect () { this.calls.push('fillRect') },
    drawImage () { this.calls.push('drawImage') }
  })

  const addEmblem = (standTop, options = {}) => {
    const added = []
    const canvas = new StadiumCanvas(
      { }, options.team ?? { name: 'FC Test', color: '#ff0000' }, 'c', {}
    )
    canvas._THREE = {
      PlaneGeometry: class { constructor (x, y) { Object.assign(this, { x, y }) } },
      BoxGeometry: class { constructor (x, y, z) { Object.assign(this, { x, y, z }) } },
      SphereGeometry: class { constructor (r) { this.r = r } },
      MeshBasicMaterial: class { constructor (c) { Object.assign(this, c) } },
      MeshLambertMaterial: class { constructor (c) { Object.assign(this, c) } },
      CanvasTexture: class { constructor (source) { this.source = source } },
      Mesh: class {
        constructor (geometry, material) {
          Object.assign(this, { geometry, material })
          this.rotation = { x: 0, y: 0, z: 0 }
          this.userData = {}
          this.position = { set: (x, y, z) => { this.at = { x, y, z } } }
        }
      }
    }
    const ctx = options.noCanvas ? null : fakeContext()
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = () => ctx
    try {
      const group = { add: (o) => added.push(o) }
      const plate = canvas._addEntranceEmblem(group, standTop)
      return { canvas, added, plate, ctx }
    } finally {
      HTMLCanvasElement.prototype.getContext = original
    }
  }

  const TALL = 12

  it('hangs a square emblem plate above the entrance, facing outward', () => {
    const { plate } = addEmblem(TALL)
    expect(plate).toBeDefined()
    expect(plate.geometry.x).toBe(plate.geometry.y)
    expect(plate.material.map).toBeDefined()
    // Transparent, so only the emblem shows and no panel behind it.
    expect(plate.material.transparent).toBe(true)
    // Clear of the entrance roof below it…
    const E = CONFIG.entrance
    const bottom = plate.at.y - plate.geometry.y / 2
    expect(bottom).toBeGreaterThanOrEqual(E.height + E.wallThickness)
    // …and clear of the back wall it hangs on. The entrance is placed at that
    // wall's *inner* face and the wall grows outward from there, so a plate that
    // only just clears the origin ends up buried inside it — which is exactly
    // what happened the first time round: only the lamps on their longer arms
    // poked out.
    expect(plate.at.z).toBeLessThan(-CONFIG.stand.backWallThickness)
    expect(plate.rotation.y).toBeCloseTo(Math.PI)
  })

  it('lights it with two small lamps above it, off by day', () => {
    const { added } = addEmblem(TALL)
    const lenses = added.filter(o => o.material?.color === CONFIG.emblemSign.lamp.color)
    expect(lenses).toHaveLength(2)
    const plate = added.find(o => o.material?.map)
    for (const lens of lenses) {
      // Above the plate, reaching out from the wall over it…
      expect(lens.at.y).toBeGreaterThan(plate.at.y + plate.geometry.y / 2)
      expect(lens.at.z).toBeLessThan(plate.at.z)
      expect(lens.at.z).toBeLessThan(-CONFIG.stand.backWallThickness)
      // …and part of the night lighting, so they go out with the floodlights.
      expect(lens.userData.nightOnly).toBe(true)
    }
    // One on each side of the plate's centre.
    expect(Math.sign(lenses[0].at.x)).toBe(-Math.sign(lenses[1].at.x))
  })

  it('shrinks the plate to what the back wall leaves', () => {
    const roomy = addEmblem(TALL).plate.geometry.x
    const tight = addEmblem(6.2).plate.geometry.x
    expect(roomy).toBe(CONFIG.emblemSign.maxSize)
    expect(tight).toBeLessThan(roomy)
    expect(tight).toBeGreaterThanOrEqual(CONFIG.emblemSign.minSize)
  })

  it('leaves a stand too low for a readable one without a sign', () => {
    const { plate, added } = addEmblem(5)
    expect(plate).toBeNull()
    expect(added).toHaveLength(0)
  })

  it('skips the sign rather than failing without a 2D canvas', () => {
    const { plate, added } = addEmblem(TALL, { noCanvas: true })
    expect(plate).toBeNull()
    expect(added).toHaveLength(0)
  })

  it('keeps the sign and the wall it hangs on to one shared thickness', () => {
    // The stand's back wall and the sign's offsets are the same number; a wall
    // that changed thickness on its own would swallow the plate again.
    const { added } = addEmblem(TALL)
    const arms = added.filter(o => o.geometry?.x === 0.07)
    expect(arms).toHaveLength(2)
    for (const arm of arms) {
      // The arm starts at the wall's outer face and reaches out over the plate.
      expect(arm.at.z).toBeCloseTo(-(CONFIG.stand.backWallThickness + CONFIG.emblemSign.lamp.arm / 2))
    }
  })

  it('builds the emblem texture once and shares it across the entrances', () => {
    const { canvas, ctx } = addEmblem(TALL)
    const first = canvas._emblemPlate()
    const second = canvas._emblemPlate()
    // Ten entrances would otherwise mean ten copies of the same crest in video
    // memory.
    expect(first).toBe(second)
    expect(first).toBeDefined()
    // And nothing paints a background behind it.
    expect(ctx.calls).not.toContain('fillRect')
  })
})

/**
 * Street lamps: the glowing core switches off with the rest of the night
 * lighting, so everything else about the lamp has to stay visible — otherwise the
 * pole ends in mid-air by day.
 */
describe('StadiumCanvas._createStreetLamp', () => {
  const lamp = () => {
    const added = []
    const canvas = new StadiumCanvas({}, {}, 'c', {})
    canvas._THREE = {
      DoubleSide: 2,
      CylinderGeometry: class { constructor (top, bottom, height) { Object.assign(this, { top, bottom, height }) } },
      SphereGeometry: class { constructor (radius) { this.radius = radius } },
      MeshBasicMaterial: class { constructor (c) { Object.assign(this, c) } },
      MeshLambertMaterial: class { constructor (c) { Object.assign(this, c) } },
      Mesh: class {
        constructor (geometry, material) {
          Object.assign(this, { geometry, material })
          this.userData = {}
          this.position = { set: (x, y, z) => { this.at = { x, y, z } } }
        }
      }
    }
    canvas._createStreetLamp({ add: (o) => added.push(o) }, 10, -20)
    return added
  }

  it('tops the pole with a glass globe that is there round the clock', () => {
    const added = lamp()
    const L = CONFIG.streetLamp
    const globe = added.find(o =>
      o.geometry?.radius === L.globeRadius && o.material.color === L.globeColor)
    expect(globe).toBeDefined()
    // Translucent, so the core inside still shines through at night…
    expect(globe.material.transparent).toBe(true)
    // …but never switched off, unlike the core.
    expect(globe.userData.nightOnly).toBeUndefined()
    // Sitting on top of the pole, not floating above or sunk into it.
    expect(globe.at.y).toBeGreaterThan(L.height)
    expect(globe.at.y - L.globeRadius).toBeLessThanOrEqual(L.height + 0.15)
  })

  it('puts the glowing core inside the globe and only switches that off', () => {
    const added = lamp()
    const L = CONFIG.streetLamp
    const core = added.find(o => o.material.color === L.lightColor)
    const globe = added.find(o => o.material.color === L.globeColor)
    expect(core.userData.nightOnly).toBe(true)
    expect(core.geometry.radius).toBeLessThan(L.globeRadius)
    expect(core.at).toEqual(globe.at)
  })

  it('keeps pole, collar and globe on one axis', () => {
    for (const part of lamp()) {
      expect(part.at.x).toBe(10)
      expect(part.at.z).toBe(-20)
    }
  })
})

/**
 * The lusher lawn under the club's own land: the square under the ring roads and
 * a patch per building plot, all below everything built on top of them.
 */
describe('StadiumCanvas._buildLawn', () => {
  const BUILDINGS = [
    { type: 'training_area', level: 2 },
    { type: 'youth_academy', level: 1 }
  ]

  const buildLawn = (options = {}) => {
    const added = []
    const canvas = new StadiumCanvas({ north_stand_size: 8000 }, {}, 'c', options)
    canvas._THREE = {
      MeshLambertMaterial: class {
        constructor (config) { Object.assign(this, config) }
      },
      PlaneGeometry: class {
        constructor (x, z) { Object.assign(this, { x, z }) }
      },
      Mesh: class {
        constructor (geometry, material) {
          Object.assign(this, { geometry, material })
          this.rotation = { x: 0 }
          this.position = { set: (x, y, z) => { this.at = { x, y, z } } }
        }
      }
    }
    canvas._buildLawn({ add: (o) => added.push(o) })
    return { canvas, added }
  }

  it('greens the whole square under the ring roads', () => {
    const { canvas, added } = buildLawn()
    const [ground] = added
    expect(ground.material.color).toBe(CONFIG.colors.lawn)
    // Reaches the far kerb, so the roads lie on lawn instead of on a seam.
    const reach = canvas._roadDistance() + CONFIG.road.width / 2
    expect(ground.geometry.x).toBe(2 * reach)
    expect(ground.geometry.z).toBe(2 * reach)
    expect(ground.at).toEqual({ x: 0, y: CONFIG.lawn.y, z: 0 })
  })

  it('is greener than the plain ground it lies on, and stays under the roads', () => {
    const channel = (hex, shift) => (hex >> shift) & 0xff
    // More green, and more green *relative* to the other channels.
    expect(channel(CONFIG.colors.lawn, 8)).toBeGreaterThan(channel(CONFIG.colors.ground, 8))
    const share = hex => channel(hex, 8) / (channel(hex, 16) + channel(hex, 0))
    expect(share(CONFIG.colors.lawn)).toBeGreaterThan(share(CONFIG.colors.ground))
    // Above the ground plane (-0.1) but below the roads (0).
    expect(CONFIG.lawn.y).toBeGreaterThan(-0.1)
    expect(CONFIG.lawn.y).toBeLessThan(0)
  })

  it('covers every plot the team owns, out under its sidewalk', () => {
    const { canvas, added } = buildLawn({ buildings: BUILDINGS })
    const plots = canvas._buildingPlots()
    expect(added).toHaveLength(1 + plots.length)

    for (const plot of plots) {
      const patch = added.find(m => m.at.x === plot.cx && m.at.z === plot.cz)
      expect(patch).toBeDefined()
      // Reaches past the plot boundary, so the lawn runs on to the kerb.
      expect(patch.geometry.x).toBeGreaterThan(2 * plot.halfX)
      expect(patch.geometry.z).toBeGreaterThan(2 * plot.halfZ)
      expect(patch.geometry.x - 2 * plot.halfX).toBeGreaterThanOrEqual(2 * CONFIG.sidewalk.width)
    }
  })

  it('lays no plot patches for a team without buildings', () => {
    expect(buildLawn().added).toHaveLength(1)
  })

  it('shares one material across every patch', () => {
    const { added } = buildLawn({ buildings: BUILDINGS })
    expect(new Set(added.map(m => m.material)).size).toBe(1)
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

  /**
   * Every asphalt tile `_buildRoads` lays down, as plain rectangles on the
   * ground: the plane's own size plus where the tile was put.
   * @param {StadiumCanvas} canvas
   * @returns {Array<{width: number, depth: number, x: number, z: number}>}
   */
  const roadTilesOf = (canvas) => {
    const planes = []
    const meshes = []
    canvas._THREE = new Proxy({}, {
      get: (_, prop) => {
        if (prop === 'Quaternion') return class { setFromEuler () { return this } }
        if (prop === 'PlaneGeometry') {
          return class {
            constructor (width, depth) {
              Object.assign(this, { width, depth })
              planes.push(this)
            }
          }
        }
        if (prop === 'Mesh') {
          return class {
            constructor (geometry, material) {
              Object.assign(this, { geometry, material })
              this.rotation = {}
              this.position = { set: (x, y, z) => { this.at = { x, y, z } } }
              meshes.push(this)
            }
          }
        }
        return class {
          constructor (...args) { this.args = args; this.instanceMatrix = {} }
          set () { return this }
          compose () {}
          setMatrixAt () {}
        }
      }
    })
    canvas._buildRoads({ add: () => {} })
    return meshes
      .filter(mesh => mesh.material?.args?.[0]?.color === CONFIG.road.color)
      .map(mesh => ({
        width: mesh.geometry.width,
        depth: mesh.geometry.depth,
        x: mesh.at.x,
        z: mesh.at.z
      }))
  }

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
    expect(canvasWith({})._groundHalf()).toBe(375)
  })

  it('ends the roads exactly at the edge of the ground plane', () => {
    // Neither short of it (a road ending in mid-field) nor past it (asphalt
    // hanging over the grass into the void, which is what it used to do).
    for (const options of [{}, { buildings: BUILDINGS }]) {
      const canvas = canvasWith(options)
      const tiles = roadTilesOf(canvas)
      const half = canvas._groundHalf()
      const distance = canvas._roadDistance()

      // The two continuous roads span the whole plane…
      const through = tiles.filter(t => t.width > t.depth)
      expect(through).toHaveLength(2)
      for (const road of through) expect(road.width).toBeCloseTo(2 * half)

      // …and the outward pieces of the crossing roads reach the same edge.
      const outward = tiles.filter(t => t.depth > t.width && Math.abs(t.z) > distance)
      expect(outward).toHaveLength(4)
      for (const piece of outward) {
        expect(Math.abs(piece.z) + piece.depth / 2).toBeCloseTo(half)
      }
    }
  })

  it('fogs the distance out before the ground plane ends', () => {
    // Anything further than fogFar is fully background colour, so the ground's
    // edge and the last trees are never visible as a hard line.
    expect(CONFIG.colors.fogFar).toBeLessThanOrEqual(canvasWith({})._groundHalf() * 2.1)
    expect(CONFIG.colors.fogFar).toBeGreaterThan(canvasWith({})._groundHalf())
    // …but the stadium itself always stays clear of it.
    expect(CONFIG.colors.fogNear).toBeGreaterThan(CONFIG.views.stadium.maxDistance)
  })
})

/**
 * The stills the buildings page puts on its cards are cropped out of this very
 * scene: one frame from a camera of its own, through an off-screen render target,
 * read back as a data URL. Three.js and the renderer are stubbed here — the
 * framing itself is covered in `clubBuildingsScene.test.js`.
 */
describe('StadiumCanvas.captureBuilding', () => {
  const BUILDINGS = [
    { type: 'training_area', level: 2 },
    { type: 'youth_academy', level: 1 }
  ]

  const stubbed = () => {
    const state = { renders: [], targets: [], removed: [], built: [] }
    const canvas = new StadiumCanvas(
      { north_stand_size: 8000 }, {}, 'c', { focus: 'buildings', buildings: BUILDINGS }
    )

    canvas._THREE = {
      PerspectiveCamera: class {
        constructor (fov, aspect) {
          Object.assign(this, { fov, aspect })
          this.position = { set: (x, y, z) => { this.at = { x, y, z } } }
        }

        lookAt (x, y, z) { this.looksAt = { x, y, z } }
      },
      WebGLRenderTarget: class {
        constructor (width, height, options) {
          Object.assign(this, { width, height, options, disposed: false })
          state.targets.push(this)
        }

        dispose () { this.disposed = true }
      }
    }
    canvas._scene = {
      add: () => {},
      remove: (object) => state.removed.push(object),
      traverse: () => {}
    }
    canvas._renderer = {
      target: undefined,
      setRenderTarget (target) { this.target = target },
      render: (scene, camera) => state.renders.push({
        camera,
        target: canvas._renderer.target,
        // What the scene looked like while the shutter was open.
        hidden: Object.entries(canvas._buildingGroups)
          .filter(([, group]) => !group.visible).map(([type]) => type)
      }),
      readRenderTargetPixels: (target, x, y, width, height, buffer) => buffer.fill(160)
    }
    canvas._buildingGroups = {
      training_area: { visible: true },
      youth_academy: { visible: true }
    }
    // The builders themselves need the real Three.js; here only the level they are
    // asked for matters.
    canvas._buildClubBuilding = (scene, plot) => {
      state.built.push(plot)
      return { group: { visible: true, traverse: () => {} }, openings: [] }
    }

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (width, height) => ({ data: new Uint8Array(width * height * 4) }),
      putImageData: () => {}
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,STILL')

    return { canvas, state }
  }

  it('renders one frame of the building into a target of the asked-for size', () => {
    const { canvas, state } = stubbed()
    expect(canvas.captureBuilding('training_area', { width: 40, height: 20 }))
      .toBe('data:image/jpeg;base64,STILL')

    expect(state.renders).toHaveLength(1)
    const [target] = state.targets
    expect([target.width, target.height]).toEqual([40, 20])
    // Multisampled, so the still gets the same smooth edges as the canvas…
    expect(target.options.samples).toBe(CONFIG.snapshot.samples)
    // …drawn into that target, and handed back afterwards.
    expect(state.renders[0].target).toBe(target)
    expect(target.disposed).toBe(true)
  })

  it('resolves the multisampling before reading the pixels back', () => {
    // Unbinding the target is what blits it into the buffer the pixels are read
    // from — reading while it is still bound would give an empty still.
    const { canvas } = stubbed()
    canvas.captureBuilding('training_area')
    expect(canvas._renderer.target).toBeNull()
  })

  it('points its own camera at the building, over the plot corner facing the crossing', () => {
    const { canvas, state } = stubbed()
    canvas.captureBuilding('youth_academy', { width: 40, height: 20 })
    const { camera } = state.renders[0]
    const plot = canvas._buildingPlots().find(p => p.type === 'youth_academy')

    expect(camera.fov).toBe(CONFIG.camera.fov)
    expect(camera.aspect).toBe(2)
    expect(Math.sign(camera.at.x - camera.looksAt.x)).toBe(-plot.qx)
    expect(Math.sign(camera.at.z - camera.looksAt.z)).toBe(-plot.qz)
    expect(camera.at.y).toBeGreaterThan(camera.looksAt.y)
  })

  it('photographs the level that stands in the scene without rebuilding it', () => {
    const { canvas, state } = stubbed()
    canvas.captureBuilding('training_area', { level: 2 })
    expect(state.built).toEqual([])
    expect(state.renders[0].hidden).toEqual([])
  })

  it('stands another level in for the shot and takes it down again', () => {
    // This is the upgrade preview: level 3 has to be built, photographed in place
    // of the level 2 the team actually has, and removed again.
    const { canvas, state } = stubbed()
    canvas.captureBuilding('training_area', { level: 3 })

    expect(state.built.map(p => [p.type, p.level])).toEqual([['training_area', 3]])
    expect(state.renders[0].hidden).toEqual(['training_area'])
    // Nothing left behind: the stand-in is gone and the real one is back.
    expect(state.removed).toHaveLength(1)
    expect(canvas._buildingGroups.training_area.visible).toBe(true)
    // …and the other building was never touched.
    expect(canvas._buildingGroups.youth_academy.visible).toBe(true)
  })

  it('clamps a level outside the buildable range', () => {
    const { canvas, state } = stubbed()
    canvas.captureBuilding('youth_academy', { level: 9 })
    expect(state.built.map(p => p.level)).toEqual([3])
  })

  it('stands an unbuilt building up on its plot just for the portrait', () => {
    // The medical practice has to be bought, so a team that has not built it yet
    // still needs a picture of what the money buys.
    const { canvas, state } = stubbed()
    expect(canvas.captureBuilding('medical_practice')).toBe('data:image/jpeg;base64,STILL')

    expect(state.built.map(p => [p.type, p.level])).toEqual([['medical_practice', 1]])
    // Nothing standing in the scene was hidden for it, and the stand-in is gone.
    expect(state.renders[0].hidden).toEqual([])
    expect(state.removed).toHaveLength(1)
  })

  it('has nothing to show without a scene or for an unknown building', () => {
    const { canvas } = stubbed()
    expect(canvas.captureBuilding('spaceport')).toBeNull()

    const bare = new StadiumCanvas({}, {}, 'c', { buildings: BUILDINGS })
    expect(bare.captureBuilding('training_area')).toBeNull()
  })
})

describe('StadiumCanvas.whenReady', () => {
  it('resolves false once the component is destroyed', async () => {
    const canvas = new StadiumCanvas({}, {}, 'c', {})
    canvas.onDestroy()
    await expect(canvas.whenReady()).resolves.toBe(false)
  })

  // A parent page calls `onMounted()` on the canvas the moment the *page*
  // mounts, but a nested UIElement is still a placeholder for another frame.
  // Settling `_ready` on that first, too-early attempt used to leave the
  // buildings page with its painted fallbacks forever (#547).
  it('stays pending when the canvas has not mounted yet, so a later mount can still succeed (#547)', async () => {
    const canvas = new StadiumCanvas({}, {}, 'c', {})
    await canvas._initThreeJS()
    const stillPending = Symbol('pending')
    const outcome = await Promise.race([canvas.whenReady(), Promise.resolve(stillPending)])
    expect(outcome).toBe(stillPending)
  })

  it('leaves a second init attempt possible after the canvas was missing (#547)', async () => {
    const canvas = new StadiumCanvas({}, {}, 'c', {})
    await canvas._initThreeJS()
    // The early bail must not count as "initialised", otherwise the real mount
    // would be swallowed by the double-init guard.
    expect(canvas._threeJSInitialized).toBe(false)
  })

  it('resolves false when a canvas that never mounted is destroyed', async () => {
    const canvas = new StadiumCanvas({}, {}, 'c', {})
    await canvas._initThreeJS()
    canvas.onDestroy()
    await expect(canvas.whenReady()).resolves.toBe(false)
  })
})
