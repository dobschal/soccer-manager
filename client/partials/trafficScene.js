/**
 * Traffic on the roads around the stadium (see `stadiumCanvas.js`).
 *
 * The roads are a square grid: two running along x at z = ±distance and two
 * running along z at x = ±distance. Cars drive right-hand traffic, so a car's
 * lane is simply an offset to the right of its road's centre line.
 *
 * Everything is instanced — body, cabin, head- and tail-lights and the light
 * pool on the tarmac are one `InstancedMesh` each, so the whole traffic costs
 * five draw calls no matter how many cars there are. Per frame only the instance
 * matrices are rewritten; there are no per-car lights (every real light would
 * cost another render pass), the headlights are emissive lenses plus a
 * translucent pool of light on the road.
 */

const TRAFFIC = Object.freeze({
  count: 20,
  // Cars only drive in a window reaching this far past the two crossings; the
  // fog swallows the roads long before their far ends anyway.
  reach: 130,
  // Units of animation time per frame is fixed (`CONFIG.animationSpeed`), so
  // these are world units per time unit, not per second.
  speed: {min: 3.4, max: 6.2},
  car: {
    length: 4.2,
    width: 1.8,
    height: 0.7,
    clearance: 0.25, // underbody height above the tarmac
    cabin: {height: 0.5, lengthFactor: 0.45, widthFactor: 0.86, offset: -0.35}
  },
  // Distance of a lane's centre from the road's centre line.
  lane: 1.75,
  headlight: {radius: 0.16, color: 0xfff4d0, inset: 0.34, y: 0.55},
  taillight: {radius: 0.13, color: 0xff3b25},
  // The cone of light on the tarmac in front of a car: a translucent quad, wider
  // at its far end than the car itself.
  pool: {length: 11, width: 3.4, color: 0xffeeb8, opacity: 0.12, y: 0.05},
  bodyColors: [0xd8dbe0, 0x2b3a55, 0x8f1d1d, 0x1f6b4a, 0x2a2a2e, 0xb9c0c7, 0xc9a227],
  cabinColor: 0x14161a
})

/**
 * Spawn the cars and return the per-frame updater that drives them.
 *
 * @param {Object} THREE the Three.js module
 * @param {Object} scene object with `.add()`
 * @param {{distance: number, roadWidth: number, rand: () => number, count?: number}} options
 *   `distance` is the half-extent of the road grid (`_roadDistance()`), `rand` a
 *   seeded generator so the traffic layout stays identical across renders.
 * @returns {{cars: Array<Object>, update: (time: number) => void}|null} `null`
 *   when there is nothing to animate.
 */
export function buildTraffic (THREE, scene, {distance, roadWidth, rand, count = TRAFFIC.count}) {
  const T = TRAFFIC
  if (count < 1) return null

  const lane = Math.min(T.lane, roadWidth / 2 - T.car.width / 2)
  const span = 2 * (distance + T.reach)
  const cars = []

  for (let i = 0; i < count; i++) {
    // Spread the cars evenly over the four roads, then randomise direction,
    // speed and starting point within their lane.
    const axis = i % 2 === 0 ? 'x' : 'z'
    const line = (i % 4 < 2 ? -1 : 1) * distance
    const dir = rand() < 0.5 ? -1 : 1
    // Heading of the car in the xz plane; the body geometry points at +z.
    const heading = axis === 'x' ? dir * Math.PI / 2 : (dir > 0 ? 0 : Math.PI)
    cars.push({
      axis,
      line,
      dir,
      lane,
      heading,
      cos: Math.cos(heading),
      sin: Math.sin(heading),
      speed: T.speed.min + rand() * (T.speed.max - T.speed.min),
      // Offsetting the two axes against each other keeps cars from meeting in
      // the crossings too often (there are no traffic lights).
      start: -span / 2 + rand() * span + (axis === 'x' ? 0 : span / 3),
      color: T.bodyColors[Math.floor(rand() * T.bodyColors.length) % T.bodyColors.length]
    })
  }

  const C = T.car
  const cabinLength = C.length * C.cabin.lengthFactor
  const bodyY = C.clearance + C.height / 2
  const cabinY = C.clearance + C.height + C.cabin.height / 2

  // White base colour so the per-instance colour shows unmodified. Nothing here
  // casts shadows: no light shines down on the roads (the street lamps are
  // emissive only), so a car shadow would come out of nowhere and cost a pass.
  const bodies = new THREE.InstancedMesh(
    new THREE.BoxGeometry(C.width, C.height, C.length),
    new THREE.MeshLambertMaterial({color: 0xffffff}),
    count
  )
  const cabins = new THREE.InstancedMesh(
    new THREE.BoxGeometry(C.width * C.cabin.widthFactor, C.cabin.height, cabinLength),
    new THREE.MeshLambertMaterial({color: T.cabinColor}),
    count
  )
  const heads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(T.headlight.radius, 8, 6),
    new THREE.MeshBasicMaterial({color: T.headlight.color}),
    2 * count
  )
  const tails = new THREE.InstancedMesh(
    new THREE.SphereGeometry(T.taillight.radius, 6, 5),
    new THREE.MeshBasicMaterial({color: T.taillight.color}),
    2 * count
  )
  // Baked flat into the xz plane, so a pool instance carries the same plain
  // heading rotation as the car it belongs to.
  const poolGeo = new THREE.PlaneGeometry(T.pool.width, T.pool.length)
  poolGeo.rotateX(-Math.PI / 2)
  const pools = new THREE.InstancedMesh(
    poolGeo,
    new THREE.MeshBasicMaterial({
      color: T.pool.color,
      transparent: true,
      opacity: T.pool.opacity,
      depthWrite: false
    }),
    count
  )

  const color = new THREE.Color()
  cars.forEach((car, i) => bodies.setColorAt(i, color.set(car.color)))
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true

  for (const mesh of [bodies, cabins, heads, tails, pools]) scene.add(mesh)

  const matrix = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const unitScale = new THREE.Vector3(1, 1, 1)
  // A car's heading never changes, so every instance of it can reuse one
  // quaternion for the whole animation.
  for (const car of cars) {
    car.quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, car.heading, 0))
  }

  /**
   * Place one instance at a car-local offset, rotated into the car's heading.
   * @param {Object} mesh
   * @param {number} index
   * @param {Object} car
   * @param {number} px world x of the car
   * @param {number} pz world z of the car
   * @param {number[]} offset local [x, y, z]; +z is the car's forward direction
   */
  const place = (mesh, index, car, px, pz, [ox, oy, oz]) => {
    pos.set(px + ox * car.cos + oz * car.sin, oy, pz - ox * car.sin + oz * car.cos)
    matrix.compose(pos, car.quat, unitScale)
    mesh.setMatrixAt(index, matrix)
  }

  const update = (time) => {
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i]
      // Position along the road, wrapped into the visible window.
      const travelled = car.start + car.dir * car.speed * time
      const p = ((travelled + span / 2) % span + span) % span - span / 2
      const px = car.axis === 'x' ? p : car.line - car.dir * car.lane
      const pz = car.axis === 'x' ? car.line + car.dir * car.lane : p

      place(bodies, i, car, px, pz, [0, bodyY, 0])
      place(cabins, i, car, px, pz, [0, cabinY, C.cabin.offset])

      for (const side of [-1, 1]) {
        const index = 2 * i + (side < 0 ? 0 : 1)
        place(heads, index, car, px, pz, [
          side * C.width * T.headlight.inset, T.headlight.y, C.length / 2
        ])
        place(tails, index, car, px, pz, [
          side * C.width * 0.3, T.headlight.y + 0.05, -C.length / 2
        ])
      }

      // The light the headlights throw onto the tarmac ahead of the car.
      place(pools, i, car, px, pz, [0, T.pool.y, C.length / 2 + T.pool.length / 2])
    }

    for (const mesh of [bodies, cabins, heads, tails, pools]) mesh.instanceMatrix.needsUpdate = true
  }

  update(0)

  return {cars, update}
}
