import { describe, expect, it } from 'vitest'
import {
  BUILDING_PLOTS,
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
    setAttribute () {}
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

  it('adds a second, brighter pair of masts and training kit at level 2', () => {
    const level1 = build(1)
    const level2 = build(2)
    expect(countOf(level2.THREE, 'SpotLight')).toBe(4)
    // balls + cones come in as instanced meshes; level 1 has none
    expect(countOf(level1.THREE, 'InstancedMesh')).toBe(0)
    expect(countOf(level2.THREE, 'InstancedMesh')).toBe(2)
  })

  it('adds the coaching shelter at level 3', () => {
    const level2 = build(2)
    const level3 = build(3)
    expect(countOf(level3.THREE, 'Mesh')).toBeGreaterThan(countOf(level2.THREE, 'Mesh'))
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

  it('reports a gate on the road-facing side of the pitch', () => {
    const { result } = build(1)
    expect(result.gate.x).toBe(0)
    expect(result.gate.z).toBeGreaterThan(0) // toward the road / stadium side
  })

  it('falls back to level 1 for a missing or out-of-range level', () => {
    for (const level of [undefined, 0, 99]) {
      expect(() => build(level)).not.toThrow()
    }
  })
})
