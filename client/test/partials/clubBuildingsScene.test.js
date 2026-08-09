import { describe, expect, it, vi } from 'vitest'
import {
  BUILDING_PLOTS,
  buildFitnessStudio,
  buildTrainingArea,
  buildYouthAcademy,
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
      this.userData = {}
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

/**
 * The youth academy: a multi-storey block with the club crest and a "Youth
 * Academy" sign on its facade, its own half-size pitch with training kit, and a
 * car park. The facade sign is drawn into a 2D canvas, which jsdom does not
 * implement — the tests install a recording stub for it, both to keep the sign in
 * the scene and to check what it says.
 */
describe('buildYouthAcademy', () => {
  const fakeContext = () => {
    const calls = { fillText: [], fillStyle: [], drawImage: [], arcs: 0, fillRect: 0 }
    return {
      calls,
      set fillStyle (value) { calls.fillStyle.push(value) },
      get fillStyle () { return calls.fillStyle[calls.fillStyle.length - 1] },
      textBaseline: '',
      font: '',
      lineWidth: 0,
      strokeStyle: '',
      fillRect () { calls.fillRect++ },
      fillText (text) { calls.fillText.push(text) },
      drawImage (image, x, y, w, h) { calls.drawImage.push({ image, x, y, w, h }) },
      beginPath () {},
      moveTo () {},
      lineTo () {},
      quadraticCurveTo () {},
      closePath () {},
      arc () { calls.arcs++ },
      fill () {},
      stroke () {}
    }
  }

  const build = (level, options = {}) => {
    const THREE = stubThree()
    const scene = { add: () => {} }
    let seed = 11
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    const ctx = options.noCanvas ? null : fakeContext()
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = () => ctx
    try {
      const result = buildYouthAcademy(THREE, scene, {
        level, rand, x: 100, z: 100, teamColor: '#ff0000', ...options
      })
      return { THREE, result, ctx }
    } finally {
      HTMLCanvasElement.prototype.getContext = original
    }
  }

  const countOf = (THREE, type) => THREE.created.filter(o => o.type === type).length
  const boxesOf = (THREE, w, h, d) => THREE.created.filter(o =>
    o.type === 'Mesh' && o.args[0]?.type === 'BoxGeometry' &&
    o.args[0].args[0] === w && o.args[0].args[1] === h && o.args[0].args[2] === d)
  // The shell is the only box as wide and as deep as the whole footprint.
  const shellOf = (THREE) => THREE.created.find(o =>
    o.type === 'Mesh' && o.args[0]?.type === 'BoxGeometry' &&
    o.args[0].args[0] === 24 && o.args[0].args[2] === 14)
  // Window glass is flatly lit and opaque; the terrace railing shares its colour
  // but is transparent, so the two are told apart by that.
  const windowsOf = (THREE) => THREE.created.filter(o =>
    o.type === 'Mesh' && o.args[1]?.args[0]?.color === 0x3f7ad6 &&
    o.args[1].args[0].opacity === undefined)
  const railingOf = (THREE) => THREE.created.filter(o =>
    o.type === 'Mesh' && o.args[1]?.args[0]?.color === 0x3f7ad6 &&
    o.args[1].args[0].opacity === 0.2)
  // The recessed top floor: a facade-coloured box that is not the main shell.
  const penthouseOf = (THREE) => THREE.created.find(o =>
    o.type === 'Mesh' && o.args[0]?.type === 'BoxGeometry' &&
    o.args[1]?.args[0]?.color === 0xd8d5cc && o.args[0].args[0] < 24)
  const solarOf = (THREE) => THREE.created.filter(o =>
    o.type === 'Mesh' && o.args[0]?.type === 'BoxGeometry' &&
    o.args[0].args[0] === 2.4 && o.args[0].args[1] === 0.06)
  const signOf = (THREE) => THREE.created.find(o =>
    o.type === 'Mesh' && o.args[1]?.args[0]?.map)

  it('puts the plot south of the training ground, across the road', () => {
    const training = BUILDING_PLOTS.training_area
    const academy = BUILDING_PLOTS.youth_academy
    expect(academy.quadrant).toEqual({ x: 1, z: 1 })
    expect(training.quadrant).toEqual({ x: 1, z: -1 })
    // Same side of the crossing along x, opposite sides along z — the road runs
    // between them.
    expect(academy.quadrant.x).toBe(training.quadrant.x)
    // Big enough for the pitch (turned crosswise), the building and the car park.
    expect(academy.size.x).toBeGreaterThan(60)
    expect(academy.size.z).toBeGreaterThanOrEqual(40)
  })

  const groupsOf = (result) => {
    const groups = result.group.children.filter(c => c.type === 'Group')
    // Ordered across the plot: the pitch sits behind the building.
    return groups.sort((a, b) => a.position.x - b.position.x)
  }

  it('turns building and pitch a quarter turn, the pitch crosswise behind the block', () => {
    const { result } = build(2)
    const [pitch, building] = groupsOf(result)
    expect(building.rotation.y).toBeCloseTo(Math.PI / 2)
    expect(pitch.rotation.y).toBeCloseTo(Math.PI / 2)
    // The pitch is built long-side along x and then turned, so its long side ends
    // up along the plot's z — crosswise behind the building.
    expect(pitch.position.x).toBeLessThan(building.position.x)
    // The reported entrance is mirrored out of the builder's frame (see the 180°
    // turn), so compare it there: it is on the car park side of the building.
    expect(-result.entrance.x).toBeGreaterThan(building.position.x)
  })

  it('lays a lamp-lined footpath from the entrance to the car park', () => {
    const { THREE, result } = build(1)
    const path = THREE.created.find(o =>
      o.type === 'Mesh' && o.args[1]?.args[0]?.color === 0x9a9a9a)
    expect(path).toBeDefined()
    // It runs along the plot's x axis, between the entrance and the lot…
    const [length, width] = path.args[0].args
    expect(length).toBeGreaterThan(width)
    // …and lines up with the door, which sits off-centre on the facade.
    expect(path.position.z).toBe(-result.entrance.z)

    const lamps = THREE.created.filter(o =>
      o.type === 'Mesh' && o.args[1]?.args[0]?.color === 0xffdd88)
    expect(lamps).toHaveLength(2)
    for (const lamp of lamps) {
      expect(Math.abs(lamp.position.z - path.position.z)).toBeGreaterThan(width / 2)
      expect(lamp.position.y).toBeGreaterThan(3) // on top of its pole
    }
  })

  it('gives the block two storeys and a third only at level 3', () => {
    const heights = [1, 2, 3].map(level => shellOf(build(level).THREE).args[0].args[1])
    expect(heights).toEqual([2 * 3.4, 2 * 3.4, 3 * 3.4])
    // The footprint never changes, so nothing on the plot has to move.
    for (const level of [1, 2, 3]) {
      const shell = shellOf(build(level).THREE)
      expect([shell.args[0].args[0], shell.args[0].args[2]]).toEqual([24, 14])
    }
  })

  it('sets a recessed top floor onto the roof from level 2', () => {
    expect(penthouseOf(build(1).THREE)).toBeUndefined()

    for (const level of [2, 3]) {
      const { THREE } = build(level)
      const shell = shellOf(THREE)
      const top = penthouseOf(THREE)
      expect(top).toBeDefined()
      // Recessed on every side, so a terrace runs around it…
      expect(top.args[0].args[0]).toBeLessThan(shell.args[0].args[0])
      expect(top.args[0].args[2]).toBeLessThan(shell.args[0].args[2])
      // …set further back from the street than from the other sides…
      expect(top.position.z).toBeLessThan(0)
      // …and standing on the main block's roof.
      expect(top.position.y - top.args[0].args[1] / 2)
        .toBeCloseTo(shell.position.y + shell.args[0].args[1] / 2 + 0.26)
    }
  })

  it('rings the roof terrace with a strutted glass balustrade', () => {
    const { THREE } = build(2)
    const railing = railingOf(THREE)
    // One pane per roof edge, the street side split either side of the bay.
    expect(railing).toHaveLength(5)
    expect(new Set(railing.map(r => r.position.y)).size).toBe(1)
    // Nothing crosses the bay: no pane spans the bay's own x range.
    const bay = THREE.created.find(o =>
      o.type === 'Mesh' && o.args[1]?.args[0]?.color === 0x1e4bb8)
    const street = railing.filter(r => r.position.z > 0)
    expect(street).toHaveLength(2)
    for (const pane of street) {
      const half = pane.args[0].args[0] / 2
      const gap = Math.abs(pane.position.x - bay.position.x) - half - bay.args[0].args[0] / 2
      expect(gap).toBeGreaterThanOrEqual(0)
    }
    const shell = shellOf(THREE)
    expect(railing[0].position.y).toBeGreaterThan(shell.position.y + shell.args[0].args[1] / 2)
    // Struts frame every pane (rails top and bottom plus mullions).
    const struts = THREE.created.filter(o =>
      o.type === 'Mesh' && o.args[1]?.args[0]?.color === 0x24303f)
    expect(struts.length).toBeGreaterThan(railing.length * 3)
  })

  it('puts the solar array on the topmost roof and grows it per level', () => {
    const counts = [1, 2, 3].map(level => solarOf(build(level).THREE).length)
    expect(counts).toEqual([2, 4, 8])
    // From level 2 the modules sit on the recessed floor's roof, not the terrace.
    // Their upright legs stand on that roof, so they give its height away.
    const { THREE } = build(2)
    const top = penthouseOf(THREE)
    const legs = THREE.created.filter(o =>
      o.type === 'Mesh' && o.args[0]?.type === 'BoxGeometry' &&
      o.args[0].args[0] === 0.08 && o.args[0].args[2] === 0.08)
    expect(legs.length).toBe(2 * solarOf(THREE).length)
    for (const leg of legs) {
      expect(leg.position.y - leg.args[0].args[1] / 2)
        .toBeGreaterThanOrEqual(top.position.y + top.args[0].args[1] / 2)
    }
  })

  it('gives every storey a blue window band on all four sides', () => {
    // Per storey of the main block: three closed sides plus the street facade in
    // two pieces either side of the entrance bay.
    const perStorey = windowsOf(build(1).THREE).length / 2
    expect(perStorey).toBe(5)
    // The recessed floor's street facade is not split, so it has one band fewer.
    expect(windowsOf(build(2).THREE)).toHaveLength(2 * perStorey + 4)
    expect(windowsOf(build(3).THREE)).toHaveLength(3 * perStorey + 4)
  })

  it('lights the entrance: a glowing lobby behind the door and a lit canopy', () => {
    const { THREE } = build(1)
    const lights = THREE.created.filter(o => o.type === 'PointLight')
    expect(lights).toHaveLength(2) // one inside the lobby, one under the canopy
    // The lobby panel glows and sits behind the glass door, the canopy strip in
    // front of the facade above it.
    const emissive = THREE.created.filter(o =>
      o.type === 'Mesh' && o.args[0]?.type === 'PlaneGeometry' &&
      [0xffeec9, 0xfff2cc].includes(o.args[1]?.args[0]?.color))
    expect(emissive).toHaveLength(2)
    const [lobby, strip] = emissive
    expect(lobby.position.z).toBeLessThan(strip.position.z)
    expect(strip.position.y).toBeGreaterThan(lobby.position.y)
  })

  it('stands the blue entrance bay proud of the facade, full height', () => {
    const { THREE } = build(1)
    const shell = shellOf(THREE)
    const bay = THREE.created.find(o =>
      o.type === 'Mesh' && o.args[1]?.args[0]?.color === 0x1e4bb8)
    expect(bay).toBeDefined()
    // Taller than the block it fronts, and in front of its street facade.
    expect(bay.args[0].args[1]).toBeGreaterThan(shell.args[0].args[1])
    expect(bay.position.z).toBeGreaterThan(shell.args[0].args[2] / 2)
    // The sign hangs on it, high above the door.
    const sign = signOf(THREE)
    expect(sign.position.x).toBe(bay.position.x)
    expect(sign.position.y).toBeGreaterThan(shell.args[0].args[1] / 2)
  })

  it('writes the club crest and "YOUTH ACADEMY" onto the facade', () => {
    const { THREE, ctx } = build(2)
    expect(ctx.calls.fillText).toEqual(['YOUTH', 'ACADEMY'])
    // The crest is drawn in the team's colour, with a ball on it.
    expect(ctx.calls.fillStyle).toContain('#ff0000')
    expect(ctx.calls.arcs).toBeGreaterThan(1)
    // …and ends up on a textured panel in the scene.
    expect(signOf(THREE)).toBeDefined()
  })

  it('paints the club\'s own emblem onto the facade once it has rasterised', async () => {
    vi.stubGlobal('Image', class {
      get src () { return this._src }
      set src (value) {
        this._src = value
        setTimeout(() => this.onload(), 0)
      }
      
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '<svg/>' }))

    const { THREE, ctx } = build(2, {
      emblemSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"/>'
    })
    const sign = signOf(THREE)
    // The generic crest carries the sign until the emblem is there…
    expect(ctx.calls.drawImage).toHaveLength(0)
    expect(sign.args[1].args[0].map.needsUpdate).toBeFalsy()

    await vi.waitFor(() => expect(ctx.calls.drawImage).toHaveLength(1))
    // …then the emblem is drawn as a square and the texture flagged for upload.
    const drawn = ctx.calls.drawImage[0]
    expect(drawn.w).toBe(drawn.h)
    expect(sign.args[1].args[0].map.needsUpdate).toBe(true)
    vi.unstubAllGlobals()
  })

  it('keeps the generic crest when the emblem cannot be rasterised', async () => {
    vi.stubGlobal('Image', class {
      set src (value) { setTimeout(() => this.onerror(new Error('bad svg')), 0) }
    })
    const { ctx } = build(1, { emblemSvg: '<broken' })
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(ctx.calls.drawImage).toHaveLength(0)
    expect(ctx.calls.arcs).toBeGreaterThan(1) // the drawn-by-hand crest and its ball
    vi.unstubAllGlobals()
  })

  it('falls back to the accent colour for a team without one', () => {
    const { ctx } = build(1, { teamColor: undefined })
    expect(ctx.calls.fillStyle).toContain('#1e4bb8')
  })

  it('builds the rest of the academy even without a 2D canvas', () => {
    const { THREE, result } = build(1, { noCanvas: true })
    expect(signOf(THREE)).toBeUndefined()
    expect(shellOf(THREE)).toBeDefined()
    expect(result.openings).toHaveLength(1)
  })

  it('lays out a fenced half-size pitch with goals bigger than its scale', () => {
    const { THREE } = build(1)
    // Half the stadium pitch (50 x 30): eight stripes summing to 15 deep.
    const grass = THREE.created.filter(o =>
      o.type === 'Mesh' && o.args[0]?.type === 'PlaneGeometry' &&
      [0x2e8b2e, 0x35a535].includes(o.args[1]?.args[0]?.color))
    expect(grass).toHaveLength(8)
    expect(grass.reduce((sum, g) => sum + g.args[0].args[1], 0)).toBeCloseTo(15)
    expect(grass[0].args[0].args[0]).toBe(25)
    // The goals are deliberately larger than the pitch's own half scale: a 0.7
    // goal post is 0.105 across, not the 0.075 that 0.5 would give.
    const goalPosts = THREE.created.filter(o =>
      o.type === 'Mesh' && o.args[0]?.type === 'CylinderGeometry' &&
      o.args[0].args[0] === 0.15 * 0.7)
    expect(goalPosts.length).toBeGreaterThanOrEqual(4)
    // Two masts, each aimed at its own half rather than at the centre.
    const masts = THREE.created.filter(o => o.type === 'SpotLight')
    expect(masts).toHaveLength(2)
    for (const mast of masts) {
      expect(Math.abs(mast.target.position.x)).toBeGreaterThan(0)
      expect(Math.sign(mast.target.position.x)).toBe(Math.sign(mast.position.x))
    }
  })

  it('adds more training kit with every level', () => {
    const kitSize = (level) => {
      const { THREE } = build(level)
      const cones = THREE.created.find(o =>
        o.type === 'InstancedMesh' && o.args[0]?.type === 'ConeGeometry')
      const poles = THREE.created.filter(o =>
        o.type === 'Mesh' && o.args[0]?.type === 'CylinderGeometry' &&
        o.args[0].args[2] === 1.6)
      const hurdleBars = boxesOf(THREE, 1.2, 0.09, 0.09)
      // The dummy body is the only 1.8-high cylinder; the slalom poles are the
      // same yellow but 1.6 high.
      const dummies = THREE.created.filter(o =>
        o.type === 'Mesh' && o.args[0]?.type === 'CylinderGeometry' &&
        o.args[0].args[2] === 1.8)
      return {
        cones: cones.args[2],
        poles: poles.length,
        hurdles: hurdleBars.length,
        dummies: dummies.length
      }
    }
    const [one, two, three] = [1, 2, 3].map(kitSize)
    expect(one.dummies).toBe(0) // level 1 has no free-kick dummies yet
    for (const key of ['cones', 'poles', 'hurdles']) {
      expect(two[key]).toBeGreaterThan(one[key])
      expect(three[key]).toBeGreaterThan(two[key])
    }
    expect(three.dummies).toBeGreaterThan(two.dummies)
  })

  it('parks beside the pitch and grows the lot per level', () => {
    const bays = (level) => {
      const { THREE } = build(level)
      const markings = THREE.created.find(o =>
        o.type === 'LineSegments' && o.args[1]?.args[0]?.color === 0xf2f2f2)
      return markings.args[0].attributes.position.args[0].length / 6
    }
    expect(bays(2)).toBeGreaterThan(bays(1))
    expect(bays(3)).toBeGreaterThan(bays(2))
  })

  it('lights the car park with a mast from level 2, a second one at level 3', () => {
    // Two pitch masts at every level, plus the car park's.
    expect(countOf(build(1).THREE, 'SpotLight')).toBe(2)
    expect(countOf(build(2).THREE, 'SpotLight')).toBe(3)
    expect(countOf(build(3).THREE, 'SpotLight')).toBe(4)
  })

  it('turns the plot around so the driveway faces its road', () => {
    const { result } = build(1)
    const def = BUILDING_PLOTS.youth_academy
    expect(result.group.rotation.y).toBeCloseTo(Math.PI)
    // This plot borders its roads on the -x / -z sides, so the driveway — the only
    // opening in the boundary — sits on the negative z edge, mirrored out of the
    // builder's own frame.
    expect(result.openings).toHaveLength(1)
    const [driveway] = result.openings
    expect(driveway.z).toBe(-def.size.z / 2)
    expect(Math.abs(driveway.x)).toBeLessThan(def.size.x / 2)
    // The entrance faces the car park instead, so it stays inside the plot.
    expect(Math.abs(result.entrance.z)).toBeLessThan(def.size.z / 2)
  })

  it('falls back to level 1 for a missing or out-of-range level', () => {
    for (const level of [undefined, 0, 99]) {
      expect(() => build(level)).not.toThrow()
    }
  })
})
