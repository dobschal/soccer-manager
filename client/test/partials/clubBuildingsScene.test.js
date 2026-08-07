import { describe, expect, it } from 'vitest'
import {
  BUILDING_PLOTS,
  buildFitnessStudio,
  buildTrainingArea,
  clubBuildingPlots
} from '../../partials/clubBuildingsScene.js'

/**
 * A stand-in for the `three` module: every accessed export becomes a class that
 * records its constructor arguments and answers the handful of methods the
 * builders call on it. Mirrors the stub used in `stadiumCanvas.test.js`.
 * @returns {Object}
 */
const stubThree = () => {
  const created = []
  const stubClass = (type) => class {
    constructor (...args) {
      this.type = type
      this.args = args
      this.children = []
      this.position = {
        x: 0,
        y: 0,
        z: 0,
        set (x, y, z) { this.x = x; this.y = y; this.z = z },
        add: () => {}
      }
      this.rotation = { x: 0, y: 0, z: 0 }
      this.target = {
        position: { x: 0, y: 0, z: 0, set (x, y, z) { this.x = x; this.y = y; this.z = z } }
      }
      this.attributes = {}
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
    setAttribute (name, value) { this.attributes[name] = value }
    setIndex () {}
    computeVertexNormals () {}
    setFromPoints () { return this }
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

const INTERSECTION = { x: 50, z: -50 }
const CLEARANCE = 6.5 // half a road (3.5) plus the sidewalk (3)
const plotsFor = (buildings, at = INTERSECTION) => clubBuildingPlots(buildings, at, CLEARANCE)

describe('clubBuildingPlots', () => {
  it('gives every owned building a plot around the intersection', () => {
    const plots = plotsFor([
      { type: 'training_area', level: 1 },
      { type: 'fitness_studio', level: 2 },
      { type: 'youth_academy', level: 3 }
    ])
    expect(plots.map(p => p.type).sort())
      .toEqual(['fitness_studio', 'training_area', 'youth_academy'])
  })

  it('skips unknown types and buildings the team does not have yet', () => {
    expect(plotsFor([
      { type: 'spaceport', level: 3 },
      { type: 'training_area', level: 0 }
    ])).toEqual([])
    expect(plotsFor(undefined)).toEqual([])
  })

  it('lands every plot boundary exactly on the sidewalk kerb', () => {
    // Half a road plus the sidewalk — so the training ground's fence, which is
    // its plot boundary, runs right along the kerb on both road-facing sides.
    const plots = plotsFor(Object.keys(BUILDING_PLOTS).map(type => ({ type, level: 1 })))
    for (const p of plots) {
      expect(Math.abs(p.cx - INTERSECTION.x) - p.halfX).toBeCloseTo(CLEARANCE)
      expect(Math.abs(p.cz - INTERSECTION.z) - p.halfZ).toBeCloseTo(CLEARANCE)
    }
  })

  it('never puts a plot in the stadium quadrant (-x / +z of the crossing)', () => {
    for (const def of Object.values(BUILDING_PLOTS)) {
      expect(`${def.quadrant.x},${def.quadrant.z}`).not.toBe('-1,1')
    }
  })

  it('gives each building its own quadrant', () => {
    const quadrants = Object.values(BUILDING_PLOTS).map(d => `${d.quadrant.x},${d.quadrant.z}`)
    expect(new Set(quadrants).size).toBe(quadrants.length)
  })

  it('clamps the level to the buildable 1-3 range', () => {
    const [plot] = plotsFor([{ type: 'training_area', level: 9 }])
    expect(plot.level).toBe(3)
  })

  it('moves with the intersection (a bigger stadium pushes the roads out)', () => {
    const near = plotsFor([{ type: 'training_area', level: 1 }], { x: 45, z: -45 })[0]
    const far = plotsFor([{ type: 'training_area', level: 1 }], { x: 80, z: -80 })[0]
    expect(far.cx - near.cx).toBe(35)
    expect(far.cz - near.cz).toBe(-35)
  })
})

/**
 * The training ground is built straight into a Three.js scene, so these tests
 * run the builder against the stub library and count what comes out. Each level
 * has to add strictly more than the one below it.
 */
describe('buildTrainingArea', () => {
  const build = (level) => {
    const THREE = stubThree()
    const scene = { add: () => {} }
    let seed = 1
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    const result = buildTrainingArea(THREE, scene, { level, rand, x: 100, z: -100 })
    return { THREE, result }
  }

  const countOf = (THREE, type) => THREE.created.filter(o => o.type === type).length

  it('builds a fenced pitch with goals and lights at level 1', () => {
    const { THREE, result } = build(1)
    expect(result.group).toBeDefined()
    // grass plane, fence posts, goal posts, masts…
    expect(countOf(THREE, 'Mesh')).toBeGreaterThan(10)
    expect(countOf(THREE, 'SpotLight')).toBe(2) // one weak pair of masts
  })

  it('tiles the pitch with mown stripes instead of stacking them on one plane', () => {
    // Two coplanar surfaces a hundredth of a unit apart z-fight at this scene's
    // depth range and make the pitch shimmer while the camera orbits. The stripes
    // must therefore sit side by side at one height, covering the pitch exactly
    // once — no full-size grass plane underneath them.
    const { THREE } = build(1)
    const grass = THREE.created.filter(o =>
      o.type === 'Mesh' && o.args[0]?.type === 'PlaneGeometry' &&
      [0x2e8b2e, 0x35a535].includes(o.args[1]?.args[0]?.color))
    expect(grass).toHaveLength(8)
    expect(new Set(grass.map(g => g.position.y)).size).toBe(1)
    // Both greens are in use, and the stripes tile the full 30-unit pitch depth.
    expect(new Set(grass.map(g => g.args[1].args[0].color)).size).toBe(2)
    const depths = grass.map(g => g.args[0].args[1])
    expect(depths.reduce((sum, d) => sum + d, 0)).toBeCloseTo(30)
    expect(new Set(grass.map(g => g.position.z)).size).toBe(8)
  })

  it('adds a second, brighter pair of masts and training kit at level 2', () => {
    const level1 = build(1)
    const level2 = build(2)
    expect(countOf(level2.THREE, 'SpotLight')).toBe(4)
    // balls + cones + the dugout seats come in as instanced meshes; level 1 has
    // none of them
    expect(countOf(level1.THREE, 'InstancedMesh')).toBe(0)
    expect(countOf(level2.THREE, 'InstancedMesh')).toBe(3)
  })

  const boxesOf = (THREE, height, depth) => THREE.created.filter(o =>
    o.type === 'Mesh' && o.args[0]?.type === 'BoxGeometry' &&
    o.args[0].args[1] === height && o.args[0].args[2] === depth)
  // The bench base is the only 0.5-high, 1-deep box in the scene.
  const benchesOf = (THREE) => boxesOf(THREE, 0.5, 1)
  const glassOf = (THREE) => THREE.created.filter(o =>
    o.type === 'Mesh' && o.args[1]?.args[0]?.opacity === 0.22)
  const seatsOf = (THREE) => THREE.created.filter(o =>
    o.type === 'InstancedMesh' && o.args[0]?.type === 'BufferGeometry')

  it('has no dugout benches at level 1', () => {
    const { THREE } = build(1)
    expect(benchesOf(THREE)).toHaveLength(0)
    expect(seatsOf(THREE)).toHaveLength(0)
  })

  it('puts two open benches with stadium seats at the touchline at level 2', () => {
    const { THREE } = build(2)
    const xs = benchesOf(THREE).map(b => b.position.x).sort((a, b) => a - b)
    expect(xs).toHaveLength(2)
    expect(xs[0]).toBeLessThan(0) // left of the gate
    expect(xs[1]).toBeGreaterThan(0) // further right along the touchline
    // Both benches' seats share one instanced mesh.
    expect(seatsOf(THREE)).toHaveLength(1)
    expect(seatsOf(THREE)[0].args[2]).toBe(16)
    // Open: no roof over them and no glazing.
    expect(glassOf(THREE)).toHaveLength(0)
  })

  it('roofs and glazes the same two benches at level 3', () => {
    const level2 = build(2)
    const level3 = build(3)
    expect(benchesOf(level3.THREE).map(b => b.position.x))
      .toEqual(benchesOf(level2.THREE).map(b => b.position.x))

    // A roof slab per bench…
    const roofs = level3.THREE.created.filter(o =>
      o.type === 'Mesh' && o.args[0]?.type === 'BoxGeometry' && o.args[0].args[1] === 0.16)
    expect(roofs).toHaveLength(2)
    // …and a back plus two side panes per bench, each framed by struts.
    expect(glassOf(level3.THREE)).toHaveLength(6)
    const struts = level3.THREE.created.filter(o =>
      o.type === 'Mesh' && o.args[1]?.args[0]?.color === 0x2a2e33)
    expect(struts.length).toBeGreaterThan(6)
  })

  it('has no buildings on the training ground yet (they come later)', () => {
    // Only the open-air pitch, its fence, masts and kit — nothing walled in.
    for (const level of [1, 2, 3]) {
      const { THREE } = build(level)
      expect(countOf(THREE, 'PointLight')).toBe(0)
    }
  })

  it('keeps the fence flush with the plot boundary', () => {
    // The fence is the plot edge, so on the road-facing sides it lands on the
    // kerb — nothing may stick out past it.
    const def = BUILDING_PLOTS.training_area
    const { result } = build(3)
    expect(result.gate.z).toBe(def.size.z / 2)
  })

  it('gets brighter with every level', () => {
    const brightness = [1, 2, 3].map(level => {
      const { THREE } = build(level)
      return THREE.created
        .filter(o => o.type === 'SpotLight')
        .reduce((sum, light) => sum + light.args[1], 0)
    })
    expect(brightness[1]).toBeGreaterThan(brightness[0])
    expect(brightness[2]).toBeGreaterThan(brightness[1])
  })

  it('aims each mast at its own quarter of the pitch, not all at the centre', () => {
    // All four aiming at the centre piled every beam onto the centre circle and
    // left the corners dark.
    const { THREE } = build(3)
    const masts = THREE.created.filter(o => o.type === 'SpotLight')
    expect(masts).toHaveLength(4)
    for (const { position, target } of masts) {
      const aim = target.position
      expect(aim.y).toBe(0)
      // Same quadrant as its own mast, pulled in from the corner…
      expect(Math.sign(aim.x)).toBe(Math.sign(position.x))
      expect(Math.sign(aim.z)).toBe(Math.sign(position.z))
      expect(Math.abs(aim.x)).toBeLessThan(Math.abs(position.x))
      expect(Math.abs(aim.z)).toBeLessThan(Math.abs(position.z))
      // …but clearly off the centre circle and still on the 50 x 30 pitch.
      expect(Math.abs(aim.x)).toBeGreaterThan(5)
      expect(Math.abs(aim.x)).toBeLessThan(25)
      expect(Math.abs(aim.z)).toBeLessThan(15)
    }
    // Four distinct hotspots, one per quarter.
    expect(new Set(masts.map(m => `${m.target.position.x},${m.target.position.z}`)).size).toBe(4)
  })

  it('reports a gate on the road-facing side of the pitch', () => {
    const { result } = build(1)
    // The fenced pitch sits west of the plot centre (the car park takes the
    // strip east of it), so its gate does too.
    expect(result.gate.x).toBeLessThan(0)
    expect(result.gate.z).toBeGreaterThan(0) // toward the road / stadium side
    expect(result.openings).toEqual([result.gate]) // no driveway at level 1
  })

  const asphaltOf = (THREE) => THREE.created.filter(o =>
    o.type === 'Mesh' && o.args[1]?.args[0]?.color === 0x3a3a3c)
  const bayMarkingsOf = (THREE) => THREE.created.filter(o =>
    o.type === 'LineSegments' && o.args[1]?.args[0]?.color === 0xf2f2f2)

  it('has no car park at level 1', () => {
    const { THREE } = build(1)
    expect(asphaltOf(THREE)).toHaveLength(0)
    expect(bayMarkingsOf(THREE)).toHaveLength(0)
  })

  it('parks one row of bays beside the pitch at level 2, two at level 3', () => {
    const lineCount = (THREE) => {
      const [markings] = bayMarkingsOf(THREE)
      // 3 floats per point, 2 points per line
      return markings.args[0].attributes.position.args[0].length / 6
    }
    const level2 = build(2)
    const level3 = build(3)
    expect(bayMarkingsOf(level2.THREE)).toHaveLength(1)
    expect(lineCount(level3.THREE)).toBe(2 * lineCount(level2.THREE))
  })

  it('joins the car park to the road with a driveway across the sidewalk', () => {
    const def = BUILDING_PLOTS.training_area
    const { THREE, result } = build(2)
    const driveway = result.openings.find(o => o !== result.gate)
    expect(driveway.x).toBeGreaterThan(0) // the strip east of the fenced pitch
    expect(driveway.z).toBe(def.size.z / 2) // on the kerb, like the gate

    // Lot surface plus the driveway apron; the apron reaches past the plot
    // boundary so it covers the sidewalk up to the road.
    const [lot, apron] = asphaltOf(THREE).sort((a, b) => a.position.z - b.position.z)
    expect(lot.position.x + lot.args[0].args[0] / 2).toBeLessThan(def.size.x / 2)
    expect(apron.position.z).toBeGreaterThan(def.size.z / 2)
  })

  it('falls back to level 1 for a missing or out-of-range level', () => {
    for (const level of [undefined, 0, 99]) {
      expect(() => build(level)).not.toThrow()
    }
  })
})

/**
 * The fitness studio is a glass hall with a lit room, a neon sign over its
 * entrance and a car park beside it. Like the training ground it is built
 * straight into the scene, so these tests run the builder against the stub and
 * check that every level shows strictly more than the one below it.
 */
describe('buildFitnessStudio', () => {
  const build = (level) => {
    const THREE = stubThree()
    const scene = { add: () => {} }
    let seed = 7
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    const result = buildFitnessStudio(THREE, scene, { level, rand, x: -100, z: -100 })
    return { THREE, result }
  }

  const countOf = (THREE, type) => THREE.created.filter(o => o.type === type).length
  // Every mesh built from a box of exactly these dimensions — each piece of
  // equipment has one part nothing else in the scene shares.
  const boxesOf = (THREE, w, h, d) => THREE.created.filter(o =>
    o.type === 'Mesh' && o.args[0]?.type === 'BoxGeometry' &&
    o.args[0].args[0] === w && o.args[0].args[1] === h && o.args[0].args[2] === d)
  const treadmillsOf = (THREE) => boxesOf(THREE, 1, 0.25, 2) // the deck
  const matsOf = (THREE) => boxesOf(THREE, 2.6, 0.1, 1.7)
  const benchesOf = (THREE) => boxesOf(THREE, 1.7, 0.18, 0.5) // the pad
  const platesOf = (THREE) => THREE.created.filter(o =>
    o.type === 'Mesh' && o.args[0]?.type === 'CylinderGeometry')
  const dumbbellBarsOf = (THREE) => THREE.created.find(o =>
    o.type === 'InstancedMesh' && o.args[0]?.args?.[2] === 0.22)
  const glassOf = (THREE) => THREE.created.filter(o =>
    o.type === 'Mesh' && o.args[1]?.args[0]?.opacity === 0.16)
  const neonOf = (THREE) => THREE.created.filter(o =>
    o.type === 'Mesh' && o.args[1]?.args[0]?.color === 0x5ad1f0)
  const solarOf = (THREE) => THREE.created.filter(o =>
    o.type === 'Mesh' && o.args[1]?.args[0]?.color === 0x16233f)
  // The hall's four corner columns are the only 0.36-square boxes; they sit on
  // its corners, so they give the room's half-extents and its wall height.
  const hallOf = (THREE) => {
    const columns = THREE.created.filter(o =>
      o.type === 'Mesh' && o.args[0]?.type === 'BoxGeometry' &&
      o.args[0].args[0] === 0.36 && o.args[0].args[2] === 0.36)
    expect(columns).toHaveLength(4)
    return {
      hw: Math.max(...columns.map(c => Math.abs(c.position.x))),
      hd: Math.max(...columns.map(c => Math.abs(c.position.z))),
      height: columns[0].args[0].args[1]
    }
  }

  it('glazes all four sides of the hall and struts every pane', () => {
    const { THREE } = build(1)
    // North, east, west, the two south panes flanking the entrance and the
    // transom above it.
    expect(glassOf(THREE)).toHaveLength(6)
    const struts = THREE.created.filter(o =>
      o.type === 'Mesh' && o.args[1]?.args[0]?.color === 0x2a2e33)
    expect(struts.length).toBeGreaterThan(glassOf(THREE).length * 3)
  })

  it('caps the hall with a flat roof and a parapet all the way round', () => {
    const { THREE } = build(1)
    const hall = hallOf(THREE)
    const roof = THREE.created.find(o =>
      o.type === 'Mesh' && o.args[0]?.type === 'BoxGeometry' && o.args[0].args[1] === 0.28)
    expect(roof).toBeDefined()
    expect(roof.position.y).toBeGreaterThan(hall.height)
    // Two parapet walls along x, two along z.
    const parapet = THREE.created.filter(o =>
      o.type === 'Mesh' && o.args[0]?.type === 'BoxGeometry' && o.args[0].args[1] === 0.7)
    expect(parapet).toHaveLength(4)
  })

  it('puts the entrance on the road-facing south side, under a lit canopy', () => {
    const { THREE, result } = build(1)
    expect(result.entrance.z).toBe(BUILDING_PLOTS.fitness_studio.size.z / 2)
    // Two door leaves in the opening…
    const leaves = THREE.created.filter(o =>
      o.type === 'Mesh' && o.args[1]?.args[0]?.opacity === 0.35)
    expect(leaves).toHaveLength(2)
    // …a canopy sticking out past the facade, and a light under it.
    const canopy = THREE.created.find(o =>
      o.type === 'Mesh' && o.args[0]?.type === 'BoxGeometry' && o.args[0].args[2] === 2.4)
    expect(canopy.position.z).toBeGreaterThan(hallOf(THREE).hd)
  })

  it('spells "Gym" in neon tubes above the entrance', () => {
    for (const level of [1, 2, 3]) {
      const { THREE } = build(level)
      const hall = hallOf(THREE)
      // Seven straight strokes (the G's stem and crossbar, both of the y, three
      // m stems)…
      const bars = neonOf(THREE).filter(o => o.args[0].type === 'BoxGeometry')
      expect(bars).toHaveLength(7)
      // …and three bent ones (the G's bowl and the m's two shoulders).
      const arcs = neonOf(THREE).filter(o => o.args[0].type === 'TorusGeometry')
      expect(arcs).toHaveLength(3)
      // The whole sign hangs on the south facade, above the canopy over the
      // door and below the roof.
      for (const tube of neonOf(THREE)) {
        expect(tube.position.y).toBeGreaterThan(3.9)
        expect(tube.position.y).toBeLessThan(hall.height)
        expect(tube.position.z).toBeGreaterThan(hall.hd)
      }
    }
  })

  it('scales the lettering down with the hall', () => {
    // The sign fills the facade band between canopy and roof, so a lower hall
    // gets smaller letters — the G's bowl is the easiest one to measure.
    const bowls = [1, 2, 3].map(level => {
      const { THREE } = build(level)
      const [arc] = neonOf(THREE).filter(o => o.args[0].type === 'TorusGeometry')
      return arc.args[0].args[0] // torus radius
    })
    expect(bowls[1]).toBeGreaterThan(bowls[0])
    expect(bowls[2]).toBeGreaterThan(bowls[1])
  })

  it('makes the sign glow brighter with every level', () => {
    const brightness = [1, 2, 3].map(level => {
      const { THREE } = build(level)
      const light = THREE.created.find(o =>
        o.type === 'PointLight' && o.args[0] === 0x5ad1f0)
      return light.args[1]
    })
    expect(brightness[1]).toBeGreaterThan(brightness[0])
    expect(brightness[2]).toBeGreaterThan(brightness[1])
  })

  it('lights the room from the ceiling, with more and stronger fixtures per level', () => {
    const fixtures = [1, 2, 3].map(level => {
      const { THREE } = build(level)
      const lights = THREE.created.filter(o =>
        o.type === 'PointLight' && o.args[0] === 0xeaf2ff)
      return { count: lights.length, total: lights.reduce((sum, l) => sum + l.args[1], 0) }
    })
    expect(fixtures.map(f => f.count)).toEqual([2, 4, 6])
    expect(fixtures[1].total).toBeGreaterThan(fixtures[0].total)
    expect(fixtures[2].total).toBeGreaterThan(fixtures[1].total)
    // Each fixture is a visible panel under the roof, not just a bare light.
    const { THREE } = build(3)
    const panels = THREE.created.filter(o =>
      o.type === 'Mesh' && o.args[0]?.type === 'BoxGeometry' && o.args[0].args[0] === 3.2)
    expect(panels).toHaveLength(6)
  })

  it('fills the room with mats, treadmills, weights, dumbbells and benches', () => {
    for (const level of [1, 2, 3]) {
      const { THREE } = build(level)
      expect(treadmillsOf(THREE).length).toBeGreaterThan(0)
      expect(matsOf(THREE).length).toBeGreaterThan(0)
      expect(benchesOf(THREE).length).toBeGreaterThan(0)
      expect(platesOf(THREE).length).toBeGreaterThan(0)
      expect(dumbbellBarsOf(THREE)).toBeDefined()
    }
  })

  it('adds more equipment with every level', () => {
    const kit = [1, 2, 3].map(level => {
      const { THREE } = build(level)
      return {
        treadmills: treadmillsOf(THREE).length,
        mats: matsOf(THREE).length,
        benches: benchesOf(THREE).length,
        dumbbells: dumbbellBarsOf(THREE).args[2]
      }
    })
    for (const key of ['treadmills', 'mats', 'benches', 'dumbbells']) {
      expect(kit[1][key]).toBeGreaterThan(kit[0][key])
      expect(kit[2][key]).toBeGreaterThan(kit[1][key])
    }
  })

  it('keeps every piece of equipment inside the hall, on every level', () => {
    for (const level of [1, 2, 3]) {
      const { THREE } = build(level)
      const hall = hallOf(THREE)
      // The hall is built in its own group, so these are hall-local coordinates.
      // 1.4 keeps the biggest item (a treadmill is 2 deep) off the glass.
      for (const item of [...treadmillsOf(THREE), ...matsOf(THREE), ...benchesOf(THREE)]) {
        expect(Math.abs(item.position.x)).toBeLessThan(hall.hw - 1.4)
        expect(Math.abs(item.position.z)).toBeLessThan(hall.hd - 1.4)
      }
    }
    // …and the hall itself fits inside its plot at full size.
    const { size } = BUILDING_PLOTS.fitness_studio
    const { THREE } = build(3)
    expect(size.x).toBeGreaterThan(2 * hallOf(THREE).hw)
    expect(size.z).toBeGreaterThan(2 * hallOf(THREE).hd)
  })

  it('builds a smaller hall on the lower levels', () => {
    const halls = [1, 2, 3].map(level => hallOf(build(level).THREE))
    for (const key of ['hw', 'hd', 'height']) {
      expect(halls[1][key]).toBeGreaterThan(halls[0][key])
      expect(halls[2][key]).toBeGreaterThan(halls[1][key])
    }
  })

  it('keeps the entrance in place while the hall grows northwards', () => {
    // Plot, sidewalk and roads must not move on an upgrade, so the south facade
    // — and with it the door and the path to the kerb — stays put.
    const paths = [1, 2, 3].map(level => build(level).result.openings[0])
    for (const path of paths) {
      expect(path.x).toBe(paths[0].x)
      expect(path.z).toBe(paths[0].z)
    }
  })

  it('tilts solar panels on the roof and adds more per level', () => {
    const arrays = [1, 2, 3].map(level => {
      const { THREE } = build(level)
      const hall = hallOf(THREE)
      return { panels: solarOf(THREE), hall }
    })
    expect(arrays.map(a => a.panels.length)).toEqual([3, 6, 10])
    // Every module sits on the roof, well inside the parapet. They are built in
    // a tilted group, so their own position is that group's local origin.
    for (const { panels } of arrays) {
      for (const panel of panels) {
        expect(panel.position.x).toBe(0)
        expect(panel.position.y).toBe(0)
        expect(panel.position.z).toBe(0)
      }
    }
  })

  it('faces the solar modules south, above the roof slab', () => {
    const { THREE } = build(3)
    const modules = THREE.created.filter(o => o.type === 'Group' && o.rotation.x > 0)
    expect(modules).toHaveLength(10)
    for (const module of modules) {
      // A positive tilt about x turns the panel's face towards +z (south).
      expect(module.rotation.x).toBeGreaterThan(0)
      expect(module.rotation.x).toBeLessThan(Math.PI / 4)
      expect(module.position.y).toBeGreaterThan(hallOf(THREE).height)
    }
  })

  const bayMarkingsOf = (THREE) => THREE.created.filter(o =>
    o.type === 'LineSegments' && o.args[1]?.args[0]?.color === 0xf2f2f2)
  const bayLines = (THREE) => {
    const [markings] = bayMarkingsOf(THREE)
    // 3 floats per point, 2 points per line
    return markings.args[0].attributes.position.args[0].length / 6
  }

  it('parks beside the hall from level 1 on and grows the lot per level', () => {
    const lines = [1, 2, 3].map(level => bayLines(build(level).THREE))
    expect(lines[1]).toBeGreaterThan(lines[0])
    expect(lines[2]).toBe(2 * lines[1]) // a second row on the aisle's other side
  })

  it('joins the car park and the entrance to the road across the sidewalk', () => {
    const { result } = build(1)
    const southEdge = BUILDING_PLOTS.fitness_studio.size.z / 2
    expect(result.openings).toHaveLength(2)
    for (const opening of result.openings) {
      expect(opening.z).toBe(southEdge) // on the kerb, so lamps stay clear
      expect(opening.width).toBeGreaterThan(0)
    }
    const [path, driveway] = result.openings
    expect(path.x).toBe(result.entrance.x)
    expect(driveway.x).toBeGreaterThan(path.x) // the lot is east of the hall
  })

  it('lights the car park with a mast from level 2, a second one at level 3', () => {
    expect([1, 2, 3].map(level => countOf(build(level).THREE, 'SpotLight')))
      .toEqual([0, 1, 2])
  })

  it('stands west of the training ground, on the other side of the road', () => {
    const gym = BUILDING_PLOTS.fitness_studio
    const training = BUILDING_PLOTS.training_area
    expect(gym.quadrant.x).toBe(-1)
    expect(training.quadrant.x).toBe(1)
    expect(gym.quadrant.z).toBe(training.quadrant.z) // same side of the crossing
  })

  it('falls back to level 1 for a missing or out-of-range level', () => {
    for (const level of [undefined, 0, 99]) {
      expect(() => build(level)).not.toThrow()
    }
  })
})
