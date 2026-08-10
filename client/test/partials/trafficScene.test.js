import { describe, expect, it } from 'vitest'
import { buildTraffic } from '../../partials/trafficScene.js'

/**
 * Same stand-in for the `three` module as in `clubBuildingsScene.test.js`: every
 * accessed export becomes a class recording its constructor arguments. The
 * instance matrices the updater writes are recorded per instanced mesh, so the
 * tests can follow where the cars actually are.
 * @returns {Object}
 */
const stubThree = () => {
  const created = []
  const stubClass = (type) => class {
    constructor (...args) {
      this.type = type
      this.args = args
      this.matrices = []
      this.colors = []
      this.instanceMatrix = {}
      this.instanceColor = null
      // Matrix4.compose(pos, quat, scale) — remember the last composed position.
      this.composed = null
      created.push(this)
    }

    set (...args) { this.value = args; return this }
    setFromEuler (euler) { this.euler = euler; return this }
    compose (pos, _quat, _scale) { this.composed = { x: pos.x, y: pos.y, z: pos.z }; return this }
    setMatrixAt (i, matrix) { this.matrices[i] = { ...matrix.composed } }
    setColorAt (i, color) { this.colors[i] = color.value?.[0] }
    rotateX () { return this }
  }

  const classes = {}
  return new Proxy({ created }, {
    get (target, prop) {
      if (prop in target) return target[prop]
      if (typeof prop !== 'string') return undefined
      if (prop === 'Vector3') {
        return class {
          constructor (x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z }
          set (x, y, z) { this.x = x; this.y = y; this.z = z; return this }
        }
      }
      classes[prop] = classes[prop] ?? stubClass(prop)
      return classes[prop]
    }
  })
}

const DISTANCE = 60
const ROAD_WIDTH = 7

const build = (options = {}) => {
  const THREE = stubThree()
  const scene = { children: [], add (o) { this.children.push(o) } }
  let seed = 7
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const traffic = buildTraffic(THREE, scene, {
    distance: DISTANCE, roadWidth: ROAD_WIDTH, rand, ...options
  })
  return { THREE, scene, traffic }
}

describe('buildTraffic', () => {
  it('adds one instanced mesh per car part, not one per car', () => {
    const { scene } = build()
    // body, cabin, headlights, taillights, light pool
    expect(scene.children).toHaveLength(5)
    for (const mesh of scene.children) expect(mesh.type).toBe('InstancedMesh')
  })

  it('spawns the requested number of cars, two lights on each side', () => {
    const { scene, traffic } = build({ count: 12 })
    expect(traffic.cars).toHaveLength(12)
    const counts = scene.children.map(m => m.args[2]).sort((a, b) => a - b)
    expect(counts).toEqual([12, 12, 12, 24, 24])
  })

  it('returns null when there is nothing to animate', () => {
    expect(build({ count: 0 }).traffic).toBeNull()
  })

  it('keeps every car in its own lane, right of its road centre line', () => {
    const { traffic } = build()
    for (const car of traffic.cars) {
      expect(Math.abs(car.line)).toBe(DISTANCE)
      // Lane offset must fit next to the centre line without hanging off the road.
      expect(car.lane).toBeLessThanOrEqual(ROAD_WIDTH / 2)
    }
    // Both roads of each orientation and both directions are in use.
    expect(new Set(traffic.cars.map(c => `${c.axis}${c.line}`)).size).toBe(4)
    expect(new Set(traffic.cars.map(c => c.dir)).size).toBe(2)
  })

  it('drives cars along their road, on the correct side of it', () => {
    const { scene, traffic } = build()
    const bodies = scene.children[0]
    const before = traffic.cars.map((_, i) => ({ ...bodies.matrices[i] }))
    traffic.update(4)
    traffic.cars.forEach((car, i) => {
      const now = bodies.matrices[i]
      if (car.axis === 'x') {
        // Moved along x, right-hand traffic puts it on the +z side going +x.
        expect(now.x).not.toBe(before[i].x)
        expect(now.z).toBeCloseTo(car.line + car.dir * car.lane)
      } else {
        expect(now.z).not.toBe(before[i].z)
        expect(now.x).toBeCloseTo(car.line - car.dir * car.lane)
      }
    })
  })

  it('wraps cars back into the visible window instead of driving off forever', () => {
    const { scene, traffic } = build()
    const bodies = scene.children[0]
    const reach = DISTANCE + 130 // TRAFFIC.reach
    for (const time of [0, 50, 500, 5000]) {
      traffic.update(time)
      for (const m of bodies.matrices) {
        expect(Math.abs(m.x)).toBeLessThanOrEqual(reach + 0.001)
        expect(Math.abs(m.z)).toBeLessThanOrEqual(reach + 0.001)
      }
    }
  })

  it('puts the headlights in front of the car and the tail lights behind it', () => {
    const { scene, traffic } = build({ count: 4 })
    const [bodies, , heads, tails] = scene.children
    traffic.update(1)
    traffic.cars.forEach((car, i) => {
      const body = bodies.matrices[i]
      // Forward direction of the car in the xz plane.
      const fx = car.sin
      const fz = car.cos
      const ahead = (m) => (m.x - body.x) * fx + (m.z - body.z) * fz
      for (const side of [0, 1]) {
        expect(ahead(heads.matrices[2 * i + side])).toBeGreaterThan(0)
        expect(ahead(tails.matrices[2 * i + side])).toBeLessThan(0)
      }
      // Both headlights sit at the same height, above the tarmac.
      expect(heads.matrices[2 * i].y).toBeGreaterThan(0)
      expect(heads.matrices[2 * i].y).toBe(heads.matrices[2 * i + 1].y)
    })
  })

  it('lays the headlight pool flat on the road ahead of the car', () => {
    const { scene, traffic } = build({ count: 4 })
    const [bodies, , , , pools] = scene.children
    traffic.update(2)
    traffic.cars.forEach((car, i) => {
      const body = bodies.matrices[i]
      const pool = pools.matrices[i]
      expect(pool.y).toBeLessThan(0.2) // on the tarmac, not floating
      expect((pool.x - body.x) * car.sin + (pool.z - body.z) * car.cos).toBeGreaterThan(0)
    })
  })

  it('gives the cars different colours from one shared material', () => {
    const { scene, traffic } = build()
    const bodies = scene.children[0]
    expect(bodies.colors.filter(c => c !== undefined)).toHaveLength(traffic.cars.length)
    expect(new Set(bodies.colors).size).toBeGreaterThan(1)
  })

  it('stays deterministic: same seed, same traffic', () => {
    const layout = () => build().traffic.cars.map(c => `${c.axis}${c.line}${c.dir}${c.speed}`)
    expect(layout()).toEqual(layout())
  })
})
