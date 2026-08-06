/**
 * Club buildings rendered into the shared 3D scene (see `stadiumCanvas.js`).
 *
 * Everything here lives around the road intersection **north-east** of the
 * stadium: the crossing has four quadrants, one of which is the stadium itself,
 * so the three club buildings each get one of the remaining three.
 *
 * Coordinate conventions match the stadium scene: -z is north, +x is east, y is
 * up, one unit ≈ one metre-ish. Every builder works in the plot's **local**
 * space (origin = plot centre) and is placed by the caller.
 */

/**
 * Layout of the training ground inside its plot (local coordinates, origin =
 * plot centre). The pitch is exactly as big as the stadium pitch
 * (`CONFIG.field` in `stadiumCanvas.js`), and the fence around it **is** the
 * plot boundary — so on the two road-facing sides it runs right along the
 * sidewalk's kerb.
 */
const TRAINING = Object.freeze({
  pitch: {width: 50, depth: 30},
  fence: {margin: 5, height: 2.4, postSpacing: 4.5, gateWidth: 5, postColor: 0x4a4a4a, meshColor: 0x8fa0a8},
  // Floodlight masts per level: level 1 is a pair of short, weak lamps, level 2
  // adds a second pair and more light, level 3 gets proper tall masts.
  masts: {
    1: {height: 7, intensity: 260, distance: 95, lamps: 1, pairs: 1},
    2: {height: 11, intensity: 420, distance: 120, lamps: 2, pairs: 2},
    3: {height: 17, intensity: 950, distance: 160, lamps: 3, pairs: 2}
  },
  // Masts stand in the corners of the fenced area, diagonally out from the
  // pitch corners. A pair is the two corners at one end, so level 1's single
  // pair lights the pitch from one end only.
  mastPairs: [
    {z: -17.5, x: 27.5},
    {z: 17.5, x: 27.5}
  ],
  // Level 2+ training kit scattered over the pitch.
  equipment: {balls: 16, cones: 18, poles: 8},
  // Level 3 coaching shelter, beside the gate on the south touchline.
  shelter: {x: -10, z: 17, width: 7, depth: 2, height: 2.3}
})

/**
 * Plot size and quadrant per building type. The quadrant signs are relative to
 * the intersection: `{x: 1, z: -1}` is the free corner further out (north-east
 * of the crossing), `{x: -1, z: -1}` the strip north of the stadium and
 * `{x: 1, z: 1}` the strip east of it. The fourth quadrant is the stadium.
 *
 * The training area's plot is its fenced area, so the fence lands exactly on
 * the plot boundary.
 * @type {Readonly<Object<string, {size: {x: number, z: number}, quadrant: {x: number, z: number}}>>}
 */
export const BUILDING_PLOTS = Object.freeze({
  training_area: {
    size: {
      x: TRAINING.pitch.width + 2 * TRAINING.fence.margin,
      z: TRAINING.pitch.depth + 2 * TRAINING.fence.margin
    },
    quadrant: {x: 1, z: -1}
  },
  fitness_studio: {size: {x: 40, z: 30}, quadrant: {x: -1, z: -1}},
  youth_academy: {size: {x: 30, z: 40}, quadrant: {x: 1, z: 1}}
})

const COLORS = Object.freeze({
  grass: 0x2e8b2e,
  grassStripe: 0x35a535,
  line: 0xffffff,
  lampGlow: 0xfff2cc
})

/**
 * Plots for the buildings a team actually owns, placed around the intersection.
 * Pure geometry — safe to call without Three.js.
 * @param {Array<{type: string, level: number}>} buildings
 * @param {{x: number, z: number}} intersection world position of the crossing
 * @param {number} clearance gap from each road's centre line to the plot edge —
 *   half a road plus the sidewalk, so a plot's boundary lands on the kerb.
 * @returns {Array<{type: string, level: number, cx: number, cz: number, halfX: number, halfZ: number, qx: number, qz: number}>}
 */
export function clubBuildingPlots (buildings, intersection, clearance) {
  return (buildings || [])
    .filter(b => BUILDING_PLOTS[b?.type] && (b.level || 0) >= 1)
    .map(b => {
      const {size, quadrant} = BUILDING_PLOTS[b.type]
      const halfX = size.x / 2
      const halfZ = size.z / 2
      return {
        type: b.type,
        level: Math.max(1, Math.min(3, b.level)),
        halfX,
        halfZ,
        qx: quadrant.x,
        qz: quadrant.z,
        cx: intersection.x + quadrant.x * (clearance + halfX),
        cz: intersection.z + quadrant.z * (clearance + halfZ)
      }
    })
}

/**
 * Build the training ground of a given level.
 *
 * - **Level 1** – a fenced pitch with a pair of short, weak floodlights.
 * - **Level 2** – balls, slalom poles and cones on the pitch, a second pair of
 *   taller masts and clearly more light.
 * - **Level 3** – full-height masts lighting the pitch like a match, plus a
 *   covered coaching shelter at the touchline.
 *
 * @param {Object} THREE the Three.js module
 * @param {Object} scene object with `.add()`
 * @param {{level: number, rand: () => number, x: number, z: number}} options
 * @returns {{group: Object, gate: {x: number, z: number, width: number}}} the
 *   built group and its fence gate in local coordinates (the caller keeps the
 *   sidewalk's street lamps clear of it).
 */
export function buildTrainingArea (THREE, scene, {level, rand, x, z}) {
  const lvl = Math.max(1, Math.min(3, level || 1))
  const group = new THREE.Group()
  const {pitch, fence} = TRAINING

  addPitch(THREE, group, {
    width: pitch.width,
    depth: pitch.depth,
    centerZ: 0,
    stripes: true,
    circle: true
  })
  addGoal(THREE, group, {x: -pitch.width / 2, z: 0, scale: 1, facing: 1})
  addGoal(THREE, group, {x: pitch.width / 2, z: 0, scale: 1, facing: -1})
  addFence(THREE, group, {
    halfWidth: pitch.width / 2 + fence.margin,
    halfDepth: pitch.depth / 2 + fence.margin,
    centerZ: 0
  })
  addFloodlights(THREE, group, lvl)

  if (lvl >= 2) addEquipment(THREE, group, rand)
  if (lvl >= 3) addShelter(THREE, group)

  group.position.set(x, 0, z)
  scene.add(group)

  return {
    group,
    gate: {
      x: 0,
      z: TRAINING.pitch.depth / 2 + TRAINING.fence.margin,
      width: TRAINING.fence.gateWidth
    }
  }
}

/**
 * A football pitch: striped grass with white markings, built to match the
 * stadium pitch (`_createField` in stadiumCanvas.js).
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{width: number, depth: number, centerZ: number, stripes?: boolean, circle?: boolean}} config
 */
function addPitch (THREE, parent, {width, depth, centerZ, stripes, circle}) {
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshLambertMaterial({color: COLORS.grass})
  )
  grass.rotation.x = -Math.PI / 2
  grass.position.set(0, 0.02, centerZ)
  grass.receiveShadow = true
  parent.add(grass)

  if (stripes) {
    const stripeCount = 8
    const stripeWidth = depth / stripeCount
    const stripeMat = new THREE.MeshLambertMaterial({color: COLORS.grassStripe})
    const stripeGeo = new THREE.PlaneGeometry(width, stripeWidth)
    for (let i = 0; i < stripeCount; i += 2) {
      const stripe = new THREE.Mesh(stripeGeo, stripeMat)
      stripe.rotation.x = -Math.PI / 2
      stripe.position.set(0, 0.03, centerZ - depth / 2 + stripeWidth / 2 + i * stripeWidth)
      stripe.receiveShadow = true
      parent.add(stripe)
    }
  }

  const lineMat = new THREE.LineBasicMaterial({color: COLORS.line})
  const y = 0.05
  const hw = width / 2
  const hd = depth / 2
  const outline = [
    new THREE.Vector3(-hw, y, centerZ - hd),
    new THREE.Vector3(hw, y, centerZ - hd),
    new THREE.Vector3(hw, y, centerZ + hd),
    new THREE.Vector3(-hw, y, centerZ + hd),
    new THREE.Vector3(-hw, y, centerZ - hd)
  ]
  parent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(outline), lineMat))
  parent.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, y, centerZ - hd),
      new THREE.Vector3(0, y, centerZ + hd)
    ]),
    lineMat
  ))

  if (circle) {
    const radius = depth / 6 // same ratio as the stadium's centre circle
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.1, radius, 28),
      new THREE.MeshBasicMaterial({color: COLORS.line, side: THREE.DoubleSide})
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(0, y, centerZ)
    parent.add(ring)
  }
}

/**
 * A goal at one end of a pitch: two posts, a crossbar and a line-grid net that
 * hangs away from the pitch.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{x: number, z: number, scale: number, facing: number}} config `facing`
 *   points from the goal toward the pitch centre (-1 or 1 along x).
 */
function addGoal (THREE, parent, {x, z, scale, facing}) {
  // Same proportions as the stadium goals (`_createGoal` in stadiumCanvas.js).
  const postRadius = 0.15 * scale
  const goalWidth = 4 * scale
  const goalHeight = 1.5 * scale
  const netDepth = 1.3 * scale
  const mat = new THREE.MeshLambertMaterial({color: COLORS.line})

  const postGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalHeight, 8)
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, mat)
    post.position.set(x, goalHeight / 2, z + side * goalWidth / 2)
    post.castShadow = true
    parent.add(post)
  }

  const crossbar = new THREE.Mesh(
    new THREE.CylinderGeometry(postRadius, postRadius, goalWidth, 8), mat
  )
  crossbar.rotation.x = Math.PI / 2
  crossbar.position.set(x, goalHeight, z)
  crossbar.castShadow = true
  parent.add(crossbar)

  // Net: the back edge sits `netDepth` away from the pitch, at ~half height.
  const back = x - facing * netDepth
  const backHeight = goalHeight * 0.45
  const zL = z - goalWidth / 2
  const zR = z + goalWidth / 2
  const ft = zz => [x, goalHeight, zz]
  const fb = zz => [x, 0, zz]
  const bt = zz => [back, backHeight, zz]
  const bb = zz => [back, 0, zz]

  const positions = []
  const cell = 0.3 * scale
  netPanel(positions, ft(zL), ft(zR), bt(zR), bt(zL), cell) // roof
  netPanel(positions, bt(zL), bt(zR), bb(zR), bb(zL), cell) // back
  netPanel(positions, fb(zL), bb(zL), bt(zL), ft(zL), cell) // side
  netPanel(positions, fb(zR), bb(zR), bt(zR), ft(zR), cell) // side

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  parent.add(new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({color: COLORS.line, transparent: true, opacity: 0.4})
  ))
}

/**
 * Append a net-like line grid spanning a flat quad. Corners in loop order.
 * @param {number[]} positions flat [x,y,z,…] sink for LineSegments
 * @param {number[]} a
 * @param {number[]} b
 * @param {number[]} c
 * @param {number[]} d
 * @param {number} cell target cell size
 */
function netPanel (positions, a, b, c, d, cell) {
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
  const lerp = (p, q, tt) => [p[0] + (q[0] - p[0]) * tt, p[1] + (q[1] - p[1]) * tt, p[2] + (q[2] - p[2]) * tt]
  const nu = Math.max(1, Math.round(dist(a, b) / cell))
  const nv = Math.max(1, Math.round(dist(a, d) / cell))
  for (let i = 0; i <= nu; i++) {
    const tt = i / nu
    positions.push(...lerp(a, b, tt), ...lerp(d, c, tt))
  }
  for (let j = 0; j <= nv; j++) {
    const s = j / nv
    positions.push(...lerp(a, d, s), ...lerp(b, c, s))
  }
}

/**
 * The perimeter fence: steel posts carrying a top rail and a wire mesh, with a
 * gate opening in the middle of the south side (toward the road).
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{halfWidth: number, halfDepth: number, centerZ: number}} config
 */
function addFence (THREE, parent, {halfWidth, halfDepth, centerZ}) {
  const F = TRAINING.fence
  const north = centerZ - halfDepth
  const south = centerZ + halfDepth
  const gate = F.gateWidth / 2

  const segments = [
    {from: [-halfWidth, north], to: [halfWidth, north]},
    {from: [-halfWidth, north], to: [-halfWidth, south]},
    {from: [halfWidth, north], to: [halfWidth, south]},
    {from: [-halfWidth, south], to: [-gate, south]},
    {from: [gate, south], to: [halfWidth, south]}
  ]

  const postMat = new THREE.MeshLambertMaterial({color: F.postColor})
  const postGeo = new THREE.CylinderGeometry(0.1, 0.1, F.height, 6)
  const railMat = new THREE.MeshLambertMaterial({color: F.postColor})
  const meshPositions = []

  for (const {from, to} of segments) {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1])
    const steps = Math.max(1, Math.round(length / F.postSpacing))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const post = new THREE.Mesh(postGeo, postMat)
      post.position.set(
        from[0] + (to[0] - from[0]) * t,
        F.height / 2,
        from[1] + (to[1] - from[1]) * t
      )
      post.castShadow = true
      parent.add(post)
    }

    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(
        Math.abs(to[0] - from[0]) + 0.12,
        0.1,
        Math.abs(to[1] - from[1]) + 0.12
      ),
      railMat
    )
    rail.position.set((from[0] + to[0]) / 2, F.height, (from[1] + to[1]) / 2)
    parent.add(rail)

    // Wire mesh: verticals along the segment plus a few horizontal courses.
    const verticals = Math.max(2, Math.round(length / 0.6))
    for (let i = 0; i <= verticals; i++) {
      const t = i / verticals
      const px = from[0] + (to[0] - from[0]) * t
      const pz = from[1] + (to[1] - from[1]) * t
      meshPositions.push(px, 0.05, pz, px, F.height, pz)
    }
    for (let h = 1; h <= 5; h++) {
      const y = (h / 6) * F.height
      meshPositions.push(from[0], y, from[1], to[0], y, to[1])
    }
  }

  const meshGeo = new THREE.BufferGeometry()
  meshGeo.setAttribute('position', new THREE.Float32BufferAttribute(meshPositions, 3))
  parent.add(new THREE.LineSegments(
    meshGeo,
    new THREE.LineBasicMaterial({color: F.meshColor, transparent: true, opacity: 0.3})
  ))
}

/**
 * Floodlight masts around the pitch. Level 1 gets a single weak pair, level 2 a
 * brighter second pair, level 3 tall masts with a proper lamp bank.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {number} level
 */
function addFloodlights (THREE, parent, level) {
  const spec = TRAINING.masts[level]
  const aim = {x: 0, z: 0} // the pitch centre

  for (const pair of TRAINING.mastPairs.slice(0, spec.pairs)) {
    for (const side of [-1, 1]) {
      addMast(THREE, parent, {x: side * pair.x, z: pair.z, aim, spec})
    }
  }
}

/**
 * A single training-ground floodlight: a tapered pole, a lamp bank aimed at a
 * target (glowing lenses so it reads as switched on) and a spotlight.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{x: number, z: number, aim: {x: number, z: number}, spec: Object}} config
 */
function addMast (THREE, parent, {x, z, aim, spec}) {
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.26, spec.height, 6),
    new THREE.MeshLambertMaterial({color: 0x9aa0a6})
  )
  pole.position.set(x, spec.height / 2, z)
  pole.castShadow = true
  parent.add(pole)

  const bankWidth = 0.8 * spec.lamps + 0.4
  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(bankWidth, 0.6, 0.5),
    new THREE.MeshLambertMaterial({color: 0x555555})
  )
  housing.position.set(x, spec.height + 0.3, z)
  housing.lookAt(aim.x, 0, aim.z)
  parent.add(housing)

  // Glowing lenses on the aimed side, so a mast reads as switched on even from
  // far away (they are emissive only — the actual light is the spotlight below).
  const toAim = Math.hypot(aim.x - x, aim.z - z) || 1
  const nx = (aim.x - x) / toAim
  const nz = (aim.z - z) / toAim
  const lensGeo = new THREE.SphereGeometry(0.26, 8, 6)
  const lensMat = new THREE.MeshBasicMaterial({color: COLORS.lampGlow})
  for (let i = 0; i < spec.lamps; i++) {
    const offset = (i - (spec.lamps - 1) / 2) * 0.8
    const lens = new THREE.Mesh(lensGeo, lensMat)
    // Offsets run across the aim direction, so the bank always faces the target.
    lens.position.set(x - nz * offset + nx * 0.32, spec.height + 0.3, z + nx * offset + nz * 0.32)
    parent.add(lens)
  }

  // No shadow casting here: the pitch already gets its shadows from the
  // stadium's masts, and every extra shadow-casting light costs a full pass.
  const light = new THREE.SpotLight(0xfff5e6, spec.intensity, spec.distance, Math.PI / 4, 0.6, 1.4)
  light.position.set(x, spec.height, z)
  light.target.position.set(aim.x, 0, aim.z)
  parent.add(light)
  parent.add(light.target)
}

/**
 * Level 2+ training kit lying on the pitch: balls, a slalom line of poles and a
 * scatter of marker cones. Positions come from the caller's seeded generator so
 * they stay identical across renders.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {() => number} rand
 */
function addEquipment (THREE, parent, rand) {
  const {pitch, equipment} = TRAINING
  const hw = pitch.width / 2 - 1.5
  const hd = pitch.depth / 2 - 1.5
  const matrix = new THREE.Matrix4()

  const balls = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.3, 8, 6),
    new THREE.MeshLambertMaterial({color: 0xf2f2f2}),
    equipment.balls
  )
  for (let i = 0; i < equipment.balls; i++) {
    matrix.setPosition(
      (rand() * 2 - 1) * hw,
      0.3,
      (rand() * 2 - 1) * hd
    )
    balls.setMatrixAt(i, matrix)
  }
  balls.instanceMatrix.needsUpdate = true
  balls.castShadow = true
  parent.add(balls)

  const cones = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.35, 0.55, 8),
    new THREE.MeshLambertMaterial({color: 0xff7a1a}),
    equipment.cones
  )
  for (let i = 0; i < equipment.cones; i++) {
    // Half the cones form a neat drill grid, the rest lie about.
    const drill = i < equipment.cones / 2
    const px = drill ? -hw + 1 + i * 1.6 : (rand() * 2 - 1) * hw
    const pz = drill ? hd - 2 : (rand() * 2 - 1) * hd
    matrix.setPosition(px, 0.28, pz)
    cones.setMatrixAt(i, matrix)
  }
  cones.instanceMatrix.needsUpdate = true
  cones.castShadow = true
  parent.add(cones)

  // Slalom poles: a straight line across the pitch, alternating red and white.
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6)
  const poleMats = [
    new THREE.MeshLambertMaterial({color: 0xd93025}),
    new THREE.MeshLambertMaterial({color: 0xf5f5f5})
  ]
  for (let i = 0; i < equipment.poles; i++) {
    const pole = new THREE.Mesh(poleGeo, poleMats[i % 2])
    pole.position.set(-9 + i * 2.4, 0.9, -hd + 2)
    pole.castShadow = true
    parent.add(pole)
  }
}

/**
 * Level 3 coaching shelter at the touchline: a small roofed dugout with a bench.
 * @param {Object} THREE
 * @param {Object} parent
 */
function addShelter (THREE, parent) {
  const S = TRAINING.shelter
  const mat = new THREE.MeshLambertMaterial({color: 0x4a4f55})

  const back = new THREE.Mesh(new THREE.BoxGeometry(S.width, S.height, 0.2), mat)
  back.position.set(S.x, S.height / 2, S.z + S.depth / 2)
  back.castShadow = true
  parent.add(back)

  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, S.height, S.depth), mat)
    wall.position.set(S.x + side * S.width / 2, S.height / 2, S.z)
    wall.castShadow = true
    parent.add(wall)
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(S.width + 0.4, 0.2, S.depth + 0.4), mat)
  roof.position.set(S.x, S.height, S.z)
  roof.castShadow = true
  parent.add(roof)

  const bench = new THREE.Mesh(
    new THREE.BoxGeometry(S.width - 1, 0.5, 0.6),
    new THREE.MeshLambertMaterial({color: 0xb9bec4})
  )
  bench.position.set(S.x, 0.4, S.z + S.depth / 2 - 0.6)
  parent.add(bench)
}
