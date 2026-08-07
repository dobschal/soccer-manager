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
 * (`CONFIG.field` in `stadiumCanvas.js`); its fence sits at the **west** end of
 * the plot and the car park fills the strip east of it. On the two road-facing
 * sides (west and south) the plot boundary runs right along the sidewalk's kerb,
 * so the fence lands on the kerb there and the car park's driveway joins the
 * road directly.
 */
const TRAINING = Object.freeze({
  pitch: {width: 50, depth: 30},
  fence: {margin: 5, height: 2.4, postSpacing: 4.5, gateWidth: 5, postColor: 0x4a4a4a, meshColor: 0x8fa0a8},
  // Floodlight masts per level: level 1 is a pair of short, weak lamps, level 2
  // adds a second pair and more light, level 3 gets proper tall masts.
  masts: {
    1: {height: 7, intensity: 150, distance: 80, lamps: 1, pairs: 1},
    2: {height: 11, intensity: 240, distance: 100, lamps: 2, pairs: 2},
    3: {height: 17, intensity: 540, distance: 130, lamps: 3, pairs: 2}
  },
  // Masts stand in the corners of the fenced area, diagonally out from the
  // pitch corners. A pair is the two corners at one end, so level 1's single
  // pair lights the pitch from one end only.
  mastPairs: [
    {z: -17.5, x: 27.5},
    {z: 17.5, x: 27.5}
  ],
  // How far out from the pitch centre each mast aims, as a fraction of its own
  // corner position: 0 would put every beam on the centre circle, 1 would aim
  // past the pitch corner into the fence. Anything around 0.6 lands the hotspot
  // between the centre and the corner, so the corners get lit too.
  aimFactor: 0.62,
  // Level 2+ training kit scattered over the pitch.
  equipment: {balls: 16, cones: 18, poles: 8},
  // Two dugout benches on the south touchline, one on either side of the gate.
  // They are the stadium's substitute benches (`_createBenches` in
  // stadiumCanvas.js): a grey base carrying a row of light-grey seats. Level 1
  // has none, level 2 leaves them open and level 3 puts a glazed shelter with
  // dark struts around them.
  bench: {
    xs: [-10, 17],
    z: 17,
    seatCount: 8,
    seatWidth: 0.5,
    seatDepth: 1,
    baseHeight: 0.5,
    baseDepth: 1,
    baseColor: 0x808080,
    seatColor: 0xcccccc,
    // Level 3 shelter: a flat roof on corner posts, glazed at the back and both
    // sides, every pane framed by struts.
    shelter: {
      height: 2.4,
      margin: 0.6, // how far it reaches past the bench on each side
      frameColor: 0x3a3f45,
      strutColor: 0x2a2e33,
      glassColor: 0xa8ccd8,
      glassOpacity: 0.22
    }
  },
  // Car park east of the fence, reached by a driveway off the south road. Level
  // 1 has none, level 2 gets one row of bays along the aisle, level 3 a second
  // row on its other side. `strip` is reserved in the plot at every level, so
  // the plot (and with it the sidewalk and the roads) never moves on an upgrade.
  parking: {
    strip: 18,
    aisle: 6,
    bay: {depth: 5, width: 2.5, count: 10},
    rows: {1: 0, 2: 1, 3: 2},
    // z band the bays occupy; the aisle runs on south past them to the kerb.
    band: {north: -6, south: 19},
    driveway: {width: 6},
    asphaltColor: 0x3a3a3c,
    markingColor: 0xf2f2f2
  }
})

const PLOT_X = TRAINING.pitch.width + 2 * TRAINING.fence.margin + TRAINING.parking.strip
const PLOT_Z = TRAINING.pitch.depth + 2 * TRAINING.fence.margin

/**
 * Layout of the fitness studio inside its plot (local coordinates, origin = plot
 * centre). The hall stands at the **west** end of the plot and its car park
 * fills the strip east of it, mirroring the training ground across the road: a
 * modern glass box with a flat roof, one big lit room behind the facade, the
 * entrance on the road-facing south side and a neon "Gym" over it.
 *
 * The plot's road-facing sides are the east one (the road that separates the
 * studio from the training ground) and the south one (the road behind the
 * stadium's north stand); the entrance path and the car park's driveway both
 * cross the sidewalk on the south side.
 */
const FITNESS = Object.freeze({
  building: {
    // The hall itself grows with the studio. Its plot is always sized for level
    // 3, so roads, sidewalk and car park never move on an upgrade, and its south
    // facade stays put — the hall grows northwards, away from the street.
    sizes: {
      1: {width: 18, depth: 12, height: 5.5},
      2: {width: 22, depth: 14, height: 6.2},
      3: {width: 26, depth: 16, height: 7}
    },
    margin: 5, // gap to the plot edge on the building's three free sides
    base: 0.3, // top of the plinth the hall stands on
    floorY: 0.36, // the room's floor — everything inside sits on it
    plinthColor: 0x55595e,
    floorColor: 0xa9a49b,
    frameColor: 0x3a3f45,
    strutColor: 0x2a2e33,
    glassColor: 0xa8ccd8,
    glassOpacity: 0.16,
    roofColor: 0x4a4f55,
    parapet: 0.7,
    // The facade's struts: a mullion every ~2.2 m plus two horizontal courses.
    mullionSpacing: 2.2,
    courses: 2
  },
  // The entrance in the middle of the south facade: a glazed double door under a
  // cantilevered canopy, with a paved path to the sidewalk.
  entrance: {
    width: 6,
    height: 3,
    canopyDepth: 2.4,
    pathWidth: 4,
    pathColor: 0x9a9a9a,
    doorColor: 0x1b1e22,
    handleColor: 0xc9ced4,
    lightColor: 0xfff2cc
  },
  // The neon lettering above the entrance, drawn as glowing tubes from the
  // stroke definitions in `GLYPHS`. It fills the facade band between the canopy
  // and the roof, so it shrinks with the hall, and it shines brighter per level.
  sign: {
    text: 'Gym',
    gapAboveCanopy: 0.14,
    gapBelowRoof: 0.05,
    padding: 0.2, // clearance the lettering keeps inside its band
    panelPadding: 0.8, // dark band left and right of the lettering, in cap heights
    tubeRatio: 0.05, // tube radius as a share of the cap height
    color: 0x5ad1f0,
    panelColor: 0x23272c,
    lightRange: 26,
    lightIntensity: {1: 6, 2: 12, 3: 20}
  },
  // Ceiling fixtures inside the room: a grid of emissive panels, each with a
  // point light under it. More and brighter fixtures per level — the room is
  // meant to be the brightest thing on the plot after the floodlights.
  lighting: {
    1: {cols: 2, rows: 1, intensity: 46, range: 24},
    2: {cols: 2, rows: 2, intensity: 66, range: 28},
    3: {cols: 3, rows: 2, intensity: 92, range: 32},
    color: 0xeaf2ff,
    panel: {width: 3.2, depth: 0.8}
  },
  // Solar modules on the flat roof, tilted south towards the low evening sun.
  // A bigger studio powers itself with a bigger array.
  solar: {
    1: {cols: 3, rows: 1},
    2: {cols: 3, rows: 2},
    3: {cols: 5, rows: 2},
    panel: {width: 2.4, depth: 1.4, tilt: 25, gapX: 0.4, gapZ: 1.2, lift: 0.5},
    color: 0x16233f,
    frameColor: 0x8f959c,
    legColor: 0x6b7076
  },
  // What stands in the room per level. Every kind is there from level 1 so the
  // room always reads as a gym; an upgrade fills it up.
  equipment: {
    1: {treadmills: 2, mats: 2, benches: 1, dumbbells: 6, plateStacks: 2},
    2: {treadmills: 4, mats: 4, benches: 2, dumbbells: 10, plateStacks: 3},
    3: {treadmills: 6, mats: 6, benches: 3, dumbbells: 14, plateStacks: 5}
  },
  // Car park east of the hall, built exactly like the training ground's: a drive
  // aisle off the south road with marked bays beside it. Level 1 already has a
  // small row (a gym without parking would look abandoned), level 2 lengthens
  // it, level 3 adds a second row on the aisle's other side.
  parking: {
    // Aisle plus a bay row on either side, and half a metre of apron on each
    // side so the level-3 asphalt stops exactly on the kerb.
    strip: 17,
    aisle: 6,
    bay: {depth: 5, width: 2.5},
    rows: {1: 1, 2: 1, 3: 2},
    bays: {1: 4, 2: 6, 3: 6},
    band: {north: -9},
    driveway: {width: 6},
    asphaltColor: 0x3a3a3c,
    markingColor: 0xf2f2f2,
    // Lamp masts in the gap between the hall and the lot, aimed at the bays.
    masts: {1: 0, 2: 1, 3: 2},
    mastPositions: [{x: 9, z: -6}, {x: 9, z: 6}],
    mast: {height: 8, intensity: 180, distance: 60, lamps: 2}
  }
})

const HALL = FITNESS.building.sizes
const GYM_PLOT_X = HALL[3].width + 2 * FITNESS.building.margin + FITNESS.parking.strip
const GYM_PLOT_Z = HALL[3].depth + 2 * FITNESS.building.margin
const GYM_BUILDING_X = -GYM_PLOT_X / 2 + FITNESS.building.margin + HALL[3].width / 2
const GYM_PARKING_X = GYM_PLOT_X / 2 - FITNESS.parking.strip / 2
// The south facade sits here on every level, so the entrance, its path and the
// plinth in front of it never move when the hall grows.
const GYM_SOUTH_FACE = HALL[3].depth / 2
// Top of the entrance canopy — the sign band starts just above it.
const GYM_CANOPY_Y = FITNESS.building.base + FITNESS.entrance.height + 0.5
const GYM_CANOPY_TOP = GYM_CANOPY_Y + 0.11

/**
 * Stroke outlines for the three letters of the neon sign, in em units: x runs
 * from the glyph's left edge, y from its baseline, and 1 is the cap height.
 * `bar` is a straight tube `[x1, y1, x2, y2]`, `arc` a bent one (`from` and
 * `sweep` in degrees, counter-clockwise from the positive x axis).
 * @type {Readonly<Object<string, {advance: number, strokes: Array<Object>}>>}
 */
const GLYPHS = Object.freeze({
  // A C-shaped bowl with a wide opening on the right, and inside that opening
  // the spur: a short stem up from the lower terminal carrying the crossbar,
  // which stops in the middle of the counter. Without the wide aperture and the
  // stem it reads as a lowercase "e", not a G.
  G: {
    advance: 0.95,
    strokes: [
      {arc: {cx: 0.42, cy: 0.5, r: 0.42, from: 40, sweep: 280}},
      {bar: [0.74, 0.23, 0.74, 0.45]},
      {bar: [0.74, 0.45, 0.44, 0.45]}
    ]
  },
  // Two diagonals meeting just under the x-height, the right one running on
  // into the descender.
  y: {
    advance: 0.82,
    strokes: [
      {bar: [0.08, 0.62, 0.39, 0.03]},
      {bar: [0.72, 0.62, 0.24, -0.28]}
    ]
  },
  // Three stems joined by two shoulders.
  m: {
    advance: 1.05,
    strokes: [
      {bar: [0.08, 0, 0.08, 0.55]},
      {bar: [0.48, 0, 0.48, 0.55]},
      {bar: [0.88, 0, 0.88, 0.55]},
      {arc: {cx: 0.28, cy: 0.55, r: 0.2, from: 0, sweep: 180}},
      {arc: {cx: 0.68, cy: 0.55, r: 0.2, from: 0, sweep: 180}}
    ]
  }
})

/**
 * Plot size and quadrant per building type. The quadrant signs are relative to
 * the intersection: `{x: 1, z: -1}` is the free corner further out (north-east
 * of the crossing), `{x: -1, z: -1}` the strip north of the stadium and
 * `{x: 1, z: 1}` the strip east of it. The fourth quadrant is the stadium.
 *
 * The training area's plot is its fenced pitch plus the car park strip beside
 * it, so both road-facing sides land exactly on the plot boundary. The fitness
 * studio's works the same way: hall plus car park strip, in the quadrant west of
 * the training ground — the two face each other across the road.
 * @type {Readonly<Object<string, {size: {x: number, z: number}, quadrant: {x: number, z: number}}>>}
 */
export const BUILDING_PLOTS = Object.freeze({
  training_area: {
    size: {x: PLOT_X, z: PLOT_Z},
    quadrant: {x: 1, z: -1}
  },
  fitness_studio: {
    size: {x: GYM_PLOT_X, z: GYM_PLOT_Z},
    quadrant: {x: -1, z: -1}
  },
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
 *   taller masts and clearly more light, two open dugout benches at the
 *   touchline and a car park with one row of bays.
 * - **Level 3** – full-height masts lighting the pitch like a match, the
 *   benches roofed and glazed, and a second row of parking bays.
 *
 * @param {Object} THREE the Three.js module
 * @param {Object} scene object with `.add()`
 * @param {{level: number, rand: () => number, x: number, z: number, sidewalkWidth?: number}} options
 *   `sidewalkWidth` is how far the driveway has to reach past the plot boundary
 *   to cross the sidewalk and meet the road.
 * @returns {{group: Object, gate: {x: number, z: number, width: number}, openings: Array<{x: number, z: number, width: number}>}}
 *   the built group, its fence gate and every opening in the plot's road-facing
 *   sides (gate and driveway) in local coordinates — the caller keeps the
 *   sidewalk's street lamps clear of them.
 */
export function buildTrainingArea (THREE, scene, {level, rand, x, z, sidewalkWidth = 3}) {
  const lvl = Math.max(1, Math.min(3, level || 1))
  const group = new THREE.Group()
  const {pitch, fence, parking} = TRAINING

  // The fenced ground sits at the west end of the plot, the car park fills the
  // strip east of it — so everything fenced is built in a sub-group shifted west
  // by half the strip.
  const ground = new THREE.Group()
  ground.position.set(-parking.strip / 2, 0, 0)
  group.add(ground)

  addPitch(THREE, ground, {
    width: pitch.width,
    depth: pitch.depth,
    centerZ: 0,
    stripes: true,
    circle: true
  })
  addGoal(THREE, ground, {x: -pitch.width / 2, z: 0, scale: 1, facing: 1})
  addGoal(THREE, ground, {x: pitch.width / 2, z: 0, scale: 1, facing: -1})
  addFence(THREE, ground, {
    halfWidth: pitch.width / 2 + fence.margin,
    halfDepth: pitch.depth / 2 + fence.margin,
    centerZ: 0
  })
  addFloodlights(THREE, ground, lvl)

  if (lvl >= 2) {
    addEquipment(THREE, ground, rand)
    addBenches(THREE, ground, lvl)
  }

  const southEdge = PLOT_Z / 2
  const driveway = addParking(THREE, group, {
    spec: parking,
    rows: parking.rows[lvl],
    bayCount: parking.bay.count,
    centerX: PLOT_X / 2 - parking.strip / 2,
    southEdge,
    sidewalkWidth
  })

  group.position.set(x, 0, z)
  scene.add(group)

  const gate = {x: -parking.strip / 2, z: southEdge, width: fence.gateWidth}

  return {group, gate, openings: [gate, driveway].filter(Boolean)}
}

/**
 * A football pitch: striped grass with white markings, built to match the
 * stadium pitch (`_createField` in stadiumCanvas.js).
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{width: number, depth: number, centerZ: number, stripes?: boolean, circle?: boolean}} config
 */
function addPitch (THREE, parent, {width, depth, centerZ, stripes, circle}) {
  if (stripes) {
    // Alternating stripes tile the whole pitch — deliberately *not* a full-size
    // plane with the lighter stripes laid on top: two coplanar surfaces a
    // hundredth of a unit apart z-fight across this scene's depth range and the
    // pitch shimmers as the camera orbits (same fix as `_createField`).
    const stripeCount = 8
    const stripeWidth = depth / stripeCount
    const stripeGeo = new THREE.PlaneGeometry(width, stripeWidth)
    const stripeMats = [
      new THREE.MeshLambertMaterial({color: COLORS.grass}),
      new THREE.MeshLambertMaterial({color: COLORS.grassStripe})
    ]
    for (let i = 0; i < stripeCount; i++) {
      const stripe = new THREE.Mesh(stripeGeo, stripeMats[i % 2])
      stripe.rotation.x = -Math.PI / 2
      stripe.position.set(0, 0.02, centerZ - depth / 2 + stripeWidth / 2 + i * stripeWidth)
      stripe.receiveShadow = true
      parent.add(stripe)
    }
  } else {
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshLambertMaterial({color: COLORS.grass})
    )
    grass.rotation.x = -Math.PI / 2
    grass.position.set(0, 0.02, centerZ)
    grass.receiveShadow = true
    parent.add(grass)
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
    // Just above the lines: the halfway line runs straight through the circle,
    // and at the same height the two would z-fight where they cross.
    ring.position.set(0, y + 0.01, centerZ)
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

  for (const pair of TRAINING.mastPairs.slice(0, spec.pairs)) {
    for (const side of [-1, 1]) {
      const x = side * pair.x
      const z = pair.z
      // Each mast lights its own quarter of the pitch instead of all of them
      // aiming at the centre — that piled every beam onto the centre circle and
      // left the corners dark. The aim point sits on the line from the pitch
      // centre out to the mast, `aimFactor` of the way there.
      addMast(THREE, parent, {
        x,
        z,
        aim: {x: x * TRAINING.aimFactor, z: z * TRAINING.aimFactor},
        spec
      })
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
 * The dugout benches at the south touchline, facing the pitch. Same build as the
 * stadium's substitute benches (`_createBenches` in stadiumCanvas.js): a grey
 * base carrying a row of light-grey seats, both benches' seats in one instanced
 * mesh. From level 3 each bench also gets a glazed shelter around it.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {number} level
 */
function addBenches (THREE, parent, level) {
  const B = TRAINING.bench
  const length = B.seatCount * B.seatWidth
  const baseMat = new THREE.MeshLambertMaterial({color: B.baseColor})
  const baseGeo = new THREE.BoxGeometry(length + 0.4, B.baseHeight, B.baseDepth)
  // The base front must sit flush with the seat front, not stick out past it:
  // the seat pan reaches seatDepth * 0.25 in front of the seat's own z.
  const baseZ = B.z - B.seatDepth * 0.25 + B.baseDepth / 2

  const seatPositions = []
  for (const x of B.xs) {
    const base = new THREE.Mesh(baseGeo, baseMat)
    base.position.set(x, B.baseHeight / 2, baseZ)
    base.castShadow = true
    base.receiveShadow = true
    parent.add(base)

    for (let i = 0; i < B.seatCount; i++) {
      seatPositions.push({
        x: x - length / 2 + B.seatWidth / 2 + i * B.seatWidth,
        y: B.baseHeight, // top of the base; the seat sits on it
        z: B.z
      })
    }

    if (level >= 3) addBenchShelter(THREE, parent, {x, length, baseZ})
  }

  const seats = new THREE.InstancedMesh(
    seatGeometry(THREE, B.seatWidth, B.seatDepth),
    new THREE.MeshLambertMaterial({color: B.seatColor, side: THREE.DoubleSide}),
    seatPositions.length
  )
  const matrix = new THREE.Matrix4()
  seatPositions.forEach((p, i) => {
    matrix.setPosition(p.x, p.y, p.z)
    seats.setMatrixAt(i, matrix)
  })
  seats.instanceMatrix.needsUpdate = true
  parent.add(seats)
}

/**
 * A stadium seat: a pan with a slightly reclined backrest, built as a two-quad
 * buffer geometry. Mirrors `_createSeatGeometry` in stadiumCanvas.js so the
 * training-ground dugouts use exactly the same seats as the stands.
 * @param {Object} THREE
 * @param {number} width
 * @param {number} depth
 * @returns {Object}
 */
function seatGeometry (THREE, width, depth) {
  const sw = width * 0.4 // half seat width
  const sd = depth * 0.25 // half seat depth
  const panY = 0.22
  const backHeight = 0.5
  const recline = 0.12

  const vertices = new Float32Array([
    -sw, panY, -sd,
    sw, panY, -sd,
    sw, panY, sd,
    -sw, panY, sd,
    -sw, panY, sd,
    sw, panY, sd,
    sw, panY + backHeight, sd + recline,
    -sw, panY + backHeight, sd + recline
  ])

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
  geo.computeVertexNormals()
  return geo
}

/**
 * Level 3 shelter around a dugout bench: a flat roof on four corner posts, with
 * glass panes closing the back and both sides. Every pane is framed by dark
 * struts (a bottom and top rail plus mullions) so the glass reads as glazing
 * rather than as a tinted wall.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{x: number, length: number, baseZ: number}} config
 */
function addBenchShelter (THREE, parent, {x, length, baseZ}) {
  const B = TRAINING.bench
  const S = B.shelter
  const width = length + 2 * S.margin
  const front = B.z - B.seatDepth * 0.25 - S.margin
  const back = baseZ + B.baseDepth / 2 + S.margin
  const depth = back - front
  const centerZ = (front + back) / 2

  const frameMat = new THREE.MeshLambertMaterial({color: S.frameColor})
  const strutMat = new THREE.MeshLambertMaterial({color: S.strutColor})
  const glassMat = new THREE.MeshLambertMaterial({
    color: S.glassColor,
    transparent: true,
    opacity: S.glassOpacity,
    side: THREE.DoubleSide
  })

  const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.16, depth + 0.4), frameMat)
  roof.position.set(x, S.height, centerZ)
  roof.castShadow = true
  parent.add(roof)

  const postGeo = new THREE.BoxGeometry(0.14, S.height, 0.14)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, frameMat)
      post.position.set(x + sx * width / 2, S.height / 2, centerZ + sz * depth / 2)
      post.castShadow = true
      parent.add(post)
    }
  }

  // Back pane spans the full width, the two side panes the full depth.
  addGlassPane(THREE, parent, {
    glassMat,
    strutMat,
    width,
    height: S.height,
    x,
    y: S.height / 2,
    z: back,
    axis: 'x'
  })
  for (const sx of [-1, 1]) {
    addGlassPane(THREE, parent, {
      glassMat,
      strutMat,
      width: depth,
      height: S.height,
      x: x + sx * width / 2,
      y: S.height / 2,
      z: centerZ,
      axis: 'z'
    })
  }
}

/**
 * One glazed panel: a thin transparent slab plus the struts framing it — a rail
 * top and bottom, optional horizontal courses in between and a mullion every
 * `spacing` metres.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{glassMat: Object, strutMat: Object, width: number, height: number, x: number, y: number, z: number, axis: 'x'|'z', spacing?: number, courses?: number}} config
 *   `axis` is the direction the pane spans; it is thin on the other one.
 */
function addGlassPane (THREE, parent, {glassMat, strutMat, width, height, x, y, z, axis, spacing = 1.2, courses = 0}) {
  const alongX = axis === 'x'
  const box = (w, h, d) => new THREE.BoxGeometry(alongX ? w : d, h, alongX ? d : w)
  // Offsets run along the pane, so one helper places both orientations.
  const put = (mesh, offset, py) => {
    mesh.position.set(x + (alongX ? offset : 0), py, z + (alongX ? 0 : offset))
    parent.add(mesh)
  }

  put(new THREE.Mesh(box(width, height, 0.06), glassMat), 0, y)

  const strut = 0.09
  for (const py of [y - height / 2 + strut / 2, y + height / 2 - strut / 2]) {
    put(new THREE.Mesh(box(width, strut, 0.1), strutMat), 0, py)
  }
  for (let c = 1; c <= courses; c++) {
    put(new THREE.Mesh(box(width, strut, 0.1), strutMat), 0, y - height / 2 + (c / (courses + 1)) * height)
  }
  const mullions = Math.max(1, Math.round(width / spacing))
  for (let i = 0; i <= mullions; i++) {
    const offset = -width / 2 + (i / mullions) * width
    put(new THREE.Mesh(box(strut, height, 0.1), strutMat), offset, y)
  }
}

/**
 * The car park in a plot's parking strip: an asphalt apron with a drive aisle
 * running north from the road and one or two rows of marked bays beside it. The
 * driveway reaches past the plot boundary so it crosses the sidewalk and meets
 * the road. Shared by the training ground and the fitness studio — they differ
 * only in the strip's size, which side of the aisle gets the first row and how
 * many bays a level has.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{spec: Object, rows: number, bayCount: number, centerX: number, southEdge: number, sidewalkWidth: number, firstSide?: number}} config
 *   `firstSide` is the side of the aisle a single row sits on (1 = east).
 * @returns {{x: number, z: number, width: number}|null} the driveway opening in
 *   the plot's south side, or `null` when this level has no car park yet.
 */
function addParking (THREE, parent, {spec, rows, bayCount, centerX, southEdge, sidewalkWidth, firstSide = 1}) {
  const P = spec
  if (!(rows >= 1)) return null

  // The single row sits on `firstSide` of the aisle, the second one opposite.
  const sides = rows >= 2 ? [firstSide, -firstSide] : [firstSide]
  const edge = side => centerX + side * (P.aisle / 2 + (sides.includes(side) ? P.bay.depth : 0))
  const outerEast = edge(1)
  const outerWest = edge(-1)
  const north = P.band.north - 0.5

  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(outerEast - outerWest + 1, southEdge - north),
    new THREE.MeshLambertMaterial({color: P.asphaltColor})
  )
  asphalt.rotation.x = -Math.PI / 2
  asphalt.position.set((outerEast + outerWest) / 2, 0.04, (southEdge + north) / 2)
  asphalt.receiveShadow = true
  parent.add(asphalt)

  // Bay markings: one line between neighbouring bays plus the row's outer edge.
  const y = 0.055
  const positions = []
  for (const side of sides) {
    const inner = centerX + side * P.aisle / 2
    const outer = inner + side * P.bay.depth
    for (let i = 0; i <= bayCount; i++) {
      const bz = P.band.north + i * P.bay.width
      positions.push(inner, y, bz, outer, y, bz)
    }
    positions.push(outer, y, P.band.north, outer, y, P.band.north + bayCount * P.bay.width)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  // Biased towards the camera in depth-buffer units, for the same reason the
  // road's centre markings are (`_buildRoads` in stadiumCanvas.js): the gap to
  // the asphalt underneath is far below what the depth buffer can resolve.
  parent.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: P.markingColor,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4
  })))

  // The driveway crossing the sidewalk, laid on top of it.
  const drive = new THREE.Mesh(
    new THREE.PlaneGeometry(P.driveway.width, sidewalkWidth),
    new THREE.MeshLambertMaterial({color: P.asphaltColor})
  )
  drive.rotation.x = -Math.PI / 2
  drive.position.set(centerX, 0.045, southEdge + sidewalkWidth / 2)
  parent.add(drive)

  return {x: centerX, z: southEdge, width: P.driveway.width}
}

/**
 * Build the fitness studio of a given level.
 *
 * A modern hall with a strutted glass facade and a flat roof stands at the west
 * end of the plot, its entrance on the road-facing south side under a canopy
 * with a big neon "Gym" above it. Behind the glass lies one large lit room with
 * treadmills, mats, weight benches, dumbbells and stacked plates. The strip east
 * of the hall is the car park.
 *
 * - **Level 1** – the hall with a basic kit (two treadmills, two mats, one
 *   bench), two ceiling fixtures and a short row of parking bays.
 * - **Level 2** – twice the kit, a second row of ceiling fixtures, a brighter
 *   sign, more bays and a lamp mast over the car park.
 * - **Level 3** – a packed room under six fixtures, the brightest sign, a second
 *   row of bays and a second mast.
 *
 * @param {Object} THREE the Three.js module
 * @param {Object} scene object with `.add()`
 * @param {{level: number, rand: () => number, x: number, z: number, sidewalkWidth?: number}} options
 *   `sidewalkWidth` is how far the entrance path and the driveway have to reach
 *   past the plot boundary to cross the sidewalk and meet the road.
 * @returns {{group: Object, entrance: {x: number, z: number, width: number}, openings: Array<{x: number, z: number, width: number}>}}
 *   the built group, its entrance and every opening in the plot's road-facing
 *   sides (entrance path and driveway) in local coordinates — the caller keeps
 *   the sidewalk's street lamps clear of them.
 */
export function buildFitnessStudio (THREE, scene, {level, rand, x, z, sidewalkWidth = 3}) {
  const lvl = Math.max(1, Math.min(3, level || 1))
  const group = new THREE.Group()
  const {entrance, parking} = FITNESS
  const size = HALL[lvl]

  // The hall is built around its own centre and shifted into the plot's west
  // end, far enough north that its south facade lands on GYM_SOUTH_FACE at every
  // level; the car park fills the strip east of it.
  const hall = new THREE.Group()
  hall.position.set(GYM_BUILDING_X, 0, GYM_SOUTH_FACE - size.depth / 2)
  group.add(hall)

  addStudioShell(THREE, hall, size)
  addGymSign(THREE, hall, {size, level: lvl})
  addSolarPanels(THREE, hall, {size, level: lvl})
  addStudioLighting(THREE, hall, {size, level: lvl})
  addGymEquipment(THREE, hall, {size, level: lvl, rand})

  const southEdge = GYM_PLOT_Z / 2
  const path = addEntrancePath(THREE, group, {southEdge, sidewalkWidth})
  const driveway = addParking(THREE, group, {
    spec: parking,
    rows: parking.rows[lvl],
    bayCount: parking.bays[lvl],
    centerX: GYM_PARKING_X,
    southEdge,
    sidewalkWidth,
    firstSide: -1 // the first row goes next to the hall
  })
  addParkingLights(THREE, group, lvl)

  group.position.set(x, 0, z)
  scene.add(group)

  return {
    group,
    entrance: {x: GYM_BUILDING_X, z: southEdge, width: entrance.width},
    openings: [path, driveway].filter(Boolean)
  }
}

/**
 * The hall itself: a concrete plinth carrying a glass box with a flat roof and
 * a parapet, glazed on all four sides with strutted panes. The south facade is
 * split around the entrance — two side panes, a transom above the doors, and a
 * glazed double door under a cantilevered canopy.
 * @param {Object} THREE
 * @param {Object} parent the hall's group, centred on the building
 * @param {{width: number, depth: number, height: number}} size this level's hall
 */
function addStudioShell (THREE, parent, size) {
  const B = FITNESS.building
  const E = FITNESS.entrance
  const hw = size.width / 2
  const hd = size.depth / 2
  const top = B.base + size.height

  const frameMat = new THREE.MeshLambertMaterial({color: B.frameColor})
  const strutMat = new THREE.MeshLambertMaterial({color: B.strutColor})
  const glassMat = new THREE.MeshLambertMaterial({
    color: B.glassColor,
    transparent: true,
    opacity: B.glassOpacity,
    side: THREE.DoubleSide
  })
  const pane = config => addGlassPane(THREE, parent, {
    glassMat,
    strutMat,
    spacing: B.mullionSpacing,
    courses: B.courses,
    ...config
  })

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(size.width + 1.2, B.base, size.depth + 1.2),
    new THREE.MeshLambertMaterial({color: B.plinthColor})
  )
  plinth.position.set(0, B.base / 2, 0)
  plinth.receiveShadow = true
  parent.add(plinth)

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(size.width, 0.12, size.depth),
    new THREE.MeshLambertMaterial({color: B.floorColor})
  )
  floor.position.set(0, B.floorY - 0.06, 0)
  floor.receiveShadow = true
  parent.add(floor)

  // Three closed sides plus the split south facade.
  pane({width: size.width, height: size.height, x: 0, y: B.base + size.height / 2, z: -hd, axis: 'x'})
  for (const sx of [-1, 1]) {
    pane({width: size.depth, height: size.height, x: sx * hw, y: B.base + size.height / 2, z: 0, axis: 'z'})
  }
  const sideWidth = (size.width - E.width) / 2
  for (const sx of [-1, 1]) {
    pane({
      width: sideWidth,
      height: size.height,
      x: sx * (E.width + sideWidth) / 2,
      y: B.base + size.height / 2,
      z: hd,
      axis: 'x'
    })
  }
  pane({
    width: E.width,
    height: size.height - E.height,
    x: 0,
    y: B.base + E.height + (size.height - E.height) / 2,
    z: hd,
    axis: 'x'
  })

  // Corner columns and the two framing the entrance.
  const columnGeo = new THREE.BoxGeometry(0.36, size.height, 0.36)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const column = new THREE.Mesh(columnGeo, frameMat)
      column.position.set(sx * hw, B.base + size.height / 2, sz * hd)
      column.castShadow = true
      parent.add(column)
    }
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.16, E.height, 0.16), frameMat)
    jamb.position.set(sx * E.width / 2, B.base + E.height / 2, hd)
    parent.add(jamb)
  }

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(size.width + 1, 0.28, size.depth + 1),
    new THREE.MeshLambertMaterial({color: B.roofColor})
  )
  roof.position.set(0, top + 0.14, 0)
  roof.castShadow = true
  parent.add(roof)

  const parapetY = top + 0.28 + B.parapet / 2
  for (const sz of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(size.width + 1, B.parapet, 0.18), frameMat)
    wall.position.set(0, parapetY, sz * (hd + 0.41))
    parent.add(wall)
  }
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.18, B.parapet, size.depth + 1), frameMat)
    wall.position.set(sx * (hw + 0.41), parapetY, 0)
    parent.add(wall)
  }

  addEntranceDoors(THREE, parent, {frameMat, hd})
}

/**
 * The glazed double door in the south facade, its header, the two handles and
 * the canopy over it with a lit strip underneath.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{frameMat: Object, hd: number}} config `hd` is the hall's half depth —
 *   the south facade's z.
 */
function addEntranceDoors (THREE, parent, {frameMat, hd}) {
  const B = FITNESS.building
  const E = FITNESS.entrance
  const leafWidth = E.width / 2 - 0.15

  const doorMat = new THREE.MeshLambertMaterial({
    color: 0x9fd6e8,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide
  })
  const leafGeo = new THREE.BoxGeometry(leafWidth, E.height - 0.2, 0.1)
  const handleGeo = new THREE.BoxGeometry(0.07, 1, 0.07)
  const handleMat = new THREE.MeshLambertMaterial({color: E.handleColor})
  const doorFrameMat = new THREE.MeshLambertMaterial({color: E.doorColor})

  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(leafGeo, doorMat)
    leaf.position.set(side * E.width / 4, B.base + (E.height - 0.2) / 2, hd)
    parent.add(leaf)

    const stile = new THREE.Mesh(new THREE.BoxGeometry(0.1, E.height - 0.2, 0.12), doorFrameMat)
    stile.position.set(side * 0.06, B.base + (E.height - 0.2) / 2, hd)
    parent.add(stile)

    const handle = new THREE.Mesh(handleGeo, handleMat)
    handle.position.set(side * 0.34, B.base + 1.3, hd + 0.1)
    parent.add(handle)
  }

  const header = new THREE.Mesh(new THREE.BoxGeometry(E.width + 0.4, 0.18, 0.24), frameMat)
  header.position.set(0, B.base + E.height, hd)
  parent.add(header)

  const canopyY = GYM_CANOPY_Y
  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(E.width + 3, 0.22, E.canopyDepth),
    frameMat
  )
  canopy.position.set(0, canopyY, hd + E.canopyDepth / 2 - 0.15)
  canopy.castShadow = true
  parent.add(canopy)

  // A lit strip under the canopy, plus the light it actually throws.
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(E.width, 0.06, 0.5),
    new THREE.MeshBasicMaterial({color: E.lightColor})
  )
  strip.position.set(0, canopyY - 0.14, hd + 0.9)
  parent.add(strip)

  const light = new THREE.PointLight(E.lightColor, 14, 16, 2)
  light.position.set(0, canopyY - 0.3, hd + 1)
  parent.add(light)
}

/**
 * The neon "Gym" above the entrance: a dark backing panel on the facade carrying
 * glowing tubes bent into the letters of `GLYPHS`, with a point light in front
 * so the sign colours the canopy and the pavement. The lettering is scaled to
 * fill the facade band between the canopy and the roof, so a smaller hall gets a
 * smaller sign; the light burns brighter per level.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{size: {depth: number, height: number}, level: number}} config
 */
function addGymSign (THREE, parent, {size, level}) {
  const S = FITNESS.sign
  const z = size.depth / 2 + 0.35
  const bottom = GYM_CANOPY_TOP + S.gapAboveCanopy
  const top = FITNESS.building.base + size.height - S.gapBelowRoof
  const midY = (bottom + top) / 2

  // The lettering is a cap height plus the y's descender (0.28 em) tall, and
  // keeps `padding` clear of the band's edges.
  const capHeight = (top - bottom - 2 * S.padding) / 1.28
  const baselineY = bottom + S.padding + 0.28 * capHeight
  const glyphs = [...S.text].map(ch => GLYPHS[ch]).filter(Boolean)
  const width = glyphs.reduce((sum, glyph) => sum + glyph.advance, 0) * capHeight

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(width + S.panelPadding * capHeight, top - bottom, 0.25),
    new THREE.MeshLambertMaterial({color: S.panelColor})
  )
  panel.position.set(0, midY, z - 0.2)
  parent.add(panel)

  const tubeMat = new THREE.MeshBasicMaterial({color: S.color})
  let cursor = -width / 2
  for (const glyph of glyphs) {
    addNeonGlyph(THREE, parent, {glyph, x: cursor, y: baselineY, z, capHeight, mat: tubeMat})
    cursor += glyph.advance * capHeight
  }

  const light = new THREE.PointLight(S.color, S.lightIntensity[level], S.lightRange, 2)
  light.position.set(0, midY, z + 1.5)
  parent.add(light)
}

/**
 * One letter of the neon sign: every stroke as a tube — straight ones as thin
 * boxes rotated into place, bent ones as arcs of a torus (which already lies in
 * the facade's xy plane).
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{glyph: {strokes: Array<Object>}, x: number, y: number, z: number, capHeight: number, mat: Object}} config
 *   `x` is the glyph's left edge, `y` its baseline.
 */
function addNeonGlyph (THREE, parent, {glyph, x, y, z, capHeight, mat}) {
  const S = FITNESS.sign
  const em = (ex, ey) => [x + ex * capHeight, y + ey * capHeight]
  const radius = S.tubeRatio * capHeight
  const thickness = 2 * radius

  for (const stroke of glyph.strokes) {
    if (stroke.bar) {
      const [ax, ay] = em(stroke.bar[0], stroke.bar[1])
      const [bx, by] = em(stroke.bar[2], stroke.bar[3])
      const length = Math.hypot(bx - ax, by - ay)
      const tube = new THREE.Mesh(
        new THREE.BoxGeometry(length + thickness, thickness, thickness), mat
      )
      tube.position.set((ax + bx) / 2, (ay + by) / 2, z)
      tube.rotation.z = Math.atan2(by - ay, bx - ax)
      parent.add(tube)
      continue
    }

    const {cx, cy, r, from, sweep} = stroke.arc
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(
        r * capHeight,
        radius,
        6,
        Math.max(8, Math.round(sweep / 10)),
        sweep * Math.PI / 180
      ),
      mat
    )
    const [px, py] = em(cx, cy)
    arc.position.set(px, py, z)
    arc.rotation.z = from * Math.PI / 180
    parent.add(arc)
  }
}

/**
 * The ceiling fixtures that light the room: a grid of always-lit panels under
 * the roof, each with a point light below it. Both the grid and the light grow
 * with the level, so a bigger studio glows visibly brighter through the glass.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{size: {width: number, depth: number, height: number}, level: number}} config
 */
function addStudioLighting (THREE, parent, {size, level}) {
  const B = FITNESS.building
  const L = FITNESS.lighting
  const spec = L[level]
  const y = B.base + size.height - 0.3

  const panelGeo = new THREE.BoxGeometry(L.panel.width, 0.12, L.panel.depth)
  const panelMat = new THREE.MeshBasicMaterial({color: L.color})
  // The grid spans the room minus a margin, so the fixtures scale with the hall.
  const span = Math.max(L.panel.width, size.width - 8)

  for (let col = 0; col < spec.cols; col++) {
    const px = spec.cols === 1 ? 0 : -span / 2 + (col / (spec.cols - 1)) * span
    for (let row = 0; row < spec.rows; row++) {
      const pz = spec.rows === 1 ? 0 : -size.depth / 4 + row * size.depth / 2

      const panel = new THREE.Mesh(panelGeo, panelMat)
      panel.position.set(px, y, pz)
      parent.add(panel)

      const light = new THREE.PointLight(L.color, spec.intensity, spec.range, 2)
      light.position.set(px, y - 0.5, pz)
      parent.add(light)
    }
  }
}

/**
 * Everything standing in the room, laid out in fixed zones so an upgrade fills
 * the floor up instead of rearranging it: treadmills along the north glass,
 * mats in the west half, weight benches in the east half, a dumbbell rack at the
 * east wall and stacks of plates in the middle. Every position is measured from
 * a wall, so the same zones work in the smaller halls of levels 1 and 2.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{size: {width: number, depth: number}, level: number, rand: () => number}} config
 */
function addGymEquipment (THREE, parent, {size, level, rand}) {
  const spec = FITNESS.equipment[level]
  const y = FITNESS.building.floorY
  const hw = size.width / 2
  const hd = size.depth / 2

  for (let i = 0; i < spec.treadmills; i++) {
    addTreadmill(THREE, parent, {x: -hw + 1.5 + i * 3, z: -hd + 2.4, y})
  }

  const matMats = [0x2f6fb5, 0xb5372f, 0x2f8f6a].map(
    color => new THREE.MeshLambertMaterial({color})
  )
  const matGeo = new THREE.BoxGeometry(2.6, 0.1, 1.7)
  for (let i = 0; i < spec.mats; i++) {
    const mat = new THREE.Mesh(matGeo, matMats[i % matMats.length])
    mat.position.set(-hw + 1.5 + (i % 3) * 3.3, y + 0.05, hd - 4.6 + Math.floor(i / 3) * 2.8)
    mat.receiveShadow = true
    parent.add(mat)
  }

  // Benches fill in westwards from the east wall.
  for (let i = 0; i < spec.benches; i++) {
    addWeightBench(THREE, parent, {x: hw - 2.4 - i * 3.5, z: hd - 3.4, y})
  }

  addDumbbellRack(THREE, parent, {x: hw - 1.7, z: -1.5, y, count: spec.dumbbells})

  // Loose plates in the middle of the floor, each stack a little different.
  const plateGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 12)
  const plateMat = new THREE.MeshLambertMaterial({color: 0x25282c})
  for (let i = 0; i < spec.plateStacks; i++) {
    const height = 2 + Math.floor(rand() * 3)
    for (let p = 0; p < height; p++) {
      const plate = new THREE.Mesh(plateGeo, plateMat)
      plate.position.set(hw - 8.5 + i * 1.5, y + 0.045 + p * 0.09, 0.6)
      plate.castShadow = true
      parent.add(plate)
    }
  }
}

/**
 * The solar array on the flat roof: modules tilted south so they catch the low
 * evening sun, each on a short front and a tall back leg. The array grows with
 * the level — one row of three, two rows of three, two rows of five.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{size: {width: number, depth: number, height: number}, level: number}} config
 */
function addSolarPanels (THREE, parent, {size, level}) {
  const S = FITNESS.solar
  const P = S.panel
  const spec = S[level]
  const roofTop = FITNESS.building.base + size.height + 0.28
  const tilt = P.tilt * Math.PI / 180
  // What a tilted module takes up on the roof, and how far its edges rise/fall.
  const footprint = P.depth * Math.cos(tilt)
  const rise = P.depth * Math.sin(tilt) / 2

  const panelGeo = new THREE.BoxGeometry(P.width, 0.06, P.depth)
  const frameGeo = new THREE.BoxGeometry(P.width + 0.12, 0.05, P.depth + 0.12)
  const panelMat = new THREE.MeshLambertMaterial({color: S.color})
  const frameMat = new THREE.MeshLambertMaterial({color: S.frameColor})
  const legMat = new THREE.MeshLambertMaterial({color: S.legColor})
  const frontLegGeo = new THREE.BoxGeometry(0.08, P.lift - rise, 0.08)
  const backLegGeo = new THREE.BoxGeometry(0.08, P.lift + rise, 0.08)

  const spanX = spec.cols * P.width + (spec.cols - 1) * P.gapX
  const spanZ = spec.rows * footprint + (spec.rows - 1) * P.gapZ

  for (let col = 0; col < spec.cols; col++) {
    const px = -spanX / 2 + P.width / 2 + col * (P.width + P.gapX)
    for (let row = 0; row < spec.rows; row++) {
      const pz = -spanZ / 2 + footprint / 2 + row * (footprint + P.gapZ)

      // Tilting the module around x turns its face towards +z, i.e. south.
      const module = new THREE.Group()
      module.position.set(px, roofTop + P.lift, pz)
      module.rotation.x = tilt
      const frame = new THREE.Mesh(frameGeo, frameMat)
      frame.position.set(0, -0.04, 0)
      module.add(frame)
      const panel = new THREE.Mesh(panelGeo, panelMat)
      panel.castShadow = true
      module.add(panel)
      parent.add(module)

      // The legs stay upright, so they live outside the tilted group.
      const front = new THREE.Mesh(frontLegGeo, legMat)
      front.position.set(px, roofTop + (P.lift - rise) / 2, pz + footprint / 2)
      parent.add(front)
      const back = new THREE.Mesh(backLegGeo, legMat)
      back.position.set(px, roofTop + (P.lift + rise) / 2, pz - footprint / 2)
      parent.add(back)
    }
  }
}

/**
 * One treadmill: a deck with a dark belt, two uprights carrying a handle bar and
 * a console with a lit display, facing the north glass.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{x: number, z: number, y: number}} config
 */
function addTreadmill (THREE, parent, {x, z, y}) {
  const frameMat = new THREE.MeshLambertMaterial({color: 0x55595f})
  const darkMat = new THREE.MeshLambertMaterial({color: 0x1c1f22})

  const deck = new THREE.Mesh(new THREE.BoxGeometry(1, 0.25, 2), frameMat)
  deck.position.set(x, y + 0.125, z)
  deck.castShadow = true
  parent.add(deck)

  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 1.7), darkMat)
  belt.position.set(x, y + 0.28, z + 0.05)
  parent.add(belt)

  for (const side of [-1, 1]) {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.1, 0.09), frameMat)
    upright.position.set(x + side * 0.42, y + 0.8, z - 0.9)
    parent.add(upright)

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.55), darkMat)
    grip.position.set(x + side * 0.42, y + 1.05, z - 0.6)
    parent.add(grip)
  }

  const console = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.12), frameMat)
  console.position.set(x, y + 1.4, z - 0.9)
  parent.add(console)

  const display = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.28, 0.04),
    new THREE.MeshBasicMaterial({color: 0x7fe3ff})
  )
  display.position.set(x, y + 1.42, z - 0.83)
  parent.add(display)
}

/**
 * A weight bench: a padded bench on two legs with a rack at its head carrying a
 * loaded barbell.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{x: number, z: number, y: number}} config
 */
function addWeightBench (THREE, parent, {x, z, y}) {
  const frameMat = new THREE.MeshLambertMaterial({color: 0x33373c})
  const padMat = new THREE.MeshLambertMaterial({color: 0x8a2b2b})
  const steelMat = new THREE.MeshLambertMaterial({color: 0xb9bec4})
  const plateMat = new THREE.MeshLambertMaterial({color: 0x1e2124})

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.4), frameMat)
    leg.position.set(x + side * 0.65, y + 0.225, z)
    parent.add(leg)
  }

  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 0.5), padMat)
  pad.position.set(x, y + 0.54, z)
  pad.castShadow = true
  parent.add(pad)

  // The rack at the bench's head, with the bar resting in it.
  for (const side of [-1, 1]) {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), frameMat)
    upright.position.set(x - 1.05, y + 0.55, z + side * 0.4)
    parent.add(upright)
  }

  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1.9), steelMat)
  bar.position.set(x - 1.05, y + 1.15, z)
  parent.add(bar)

  const plateGeo = new THREE.BoxGeometry(0.46, 0.46, 0.1)
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const plate = new THREE.Mesh(plateGeo, plateMat)
      plate.position.set(x - 1.05, y + 1.15, z + side * (0.62 + i * 0.12))
      parent.add(plate)
    }
  }
}

/**
 * The dumbbell rack at the east wall: a two-tier stand with pairs of dumbbells
 * on it. The rack grows with the number of dumbbells the level has.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{x: number, z: number, y: number, count: number}} config
 */
function addDumbbellRack (THREE, parent, {x, z, y, count}) {
  const perTier = Math.ceil(count / 2)
  const pitch = 0.62
  const length = perTier * pitch + 0.4
  const frameMat = new THREE.MeshLambertMaterial({color: 0x33373c})

  for (const tier of [0, 1]) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, length), frameMat)
    shelf.position.set(x, y + 0.45 + tier * 0.45, z)
    shelf.castShadow = true
    parent.add(shelf)
  }
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.12), frameMat)
    post.position.set(x, y + 0.475, z + side * (length / 2 - 0.06))
    parent.add(post)
  }

  // Two instanced meshes carry every dumbbell: the bars and their end weights.
  const bars = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.06, 0.06, 0.22),
    new THREE.MeshLambertMaterial({color: 0xb9bec4}),
    count
  )
  const heads = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.26, 0.26, 0.2),
    new THREE.MeshLambertMaterial({color: 0x2b2f34}),
    2 * count
  )
  const matrix = new THREE.Matrix4()

  for (let i = 0; i < count; i++) {
    const tier = i < perTier ? 0 : 1
    const slot = i % perTier
    const dz = z - length / 2 + 0.4 + slot * pitch
    const dy = y + 0.63 + tier * 0.45
    matrix.setPosition(x, dy, dz)
    bars.setMatrixAt(i, matrix)
    for (const side of [-1, 1]) {
      matrix.setPosition(x, dy, dz + side * 0.2)
      heads.setMatrixAt(2 * i + (side < 0 ? 0 : 1), matrix)
    }
  }
  bars.instanceMatrix.needsUpdate = true
  heads.instanceMatrix.needsUpdate = true
  parent.add(bars)
  parent.add(heads)
}

/**
 * The paved path from the entrance across the plot's south edge and the sidewalk
 * to the road.
 * @param {Object} THREE
 * @param {Object} parent the plot's group
 * @param {{southEdge: number, sidewalkWidth: number}} config
 * @returns {{x: number, z: number, width: number}} the opening it leaves in the
 *   plot's south side.
 */
function addEntrancePath (THREE, parent, {southEdge, sidewalkWidth}) {
  const E = FITNESS.entrance
  const front = GYM_SOUTH_FACE + 0.6 // clear of the plinth
  const length = southEdge - front + sidewalkWidth

  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(E.pathWidth, length),
    new THREE.MeshLambertMaterial({color: E.pathColor})
  )
  path.rotation.x = -Math.PI / 2
  path.position.set(GYM_BUILDING_X, 0.045, front + length / 2)
  parent.add(path)

  return {x: GYM_BUILDING_X, z: southEdge, width: E.pathWidth}
}

/**
 * Lamp masts between the hall and the car park, aimed at the bays. Level 1 makes
 * do with the street lamps on the sidewalk; level 2 gets one mast, level 3 two.
 * @param {Object} THREE
 * @param {Object} parent the plot's group
 * @param {number} level
 */
function addParkingLights (THREE, parent, level) {
  const P = FITNESS.parking
  const aim = {x: GYM_PARKING_X, z: (P.band.north + GYM_PLOT_Z / 2) / 2}

  for (const pos of P.mastPositions.slice(0, P.masts[level])) {
    addMast(THREE, parent, {x: pos.x, z: pos.z, aim, spec: P.mast})
  }
}
