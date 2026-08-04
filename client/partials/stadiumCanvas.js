import { UIElement } from '../lib/UIElement.js'

/**
 * Central layout & scene configuration for the 3D stadium.
 *
 * Everything that positions objects relative to the pitch lives here so new
 * decoration/detail can be aligned to a single source of truth instead of
 * scattered magic numbers. Purely local detail constants (goal post radius,
 * flag size, …) stay grouped at the top of their respective builder methods.
 *
 * @type {Readonly<Object>}
 */
const CONFIG = Object.freeze({
  field: { width: 50, depth: 30 },
  standGap: 2,
  groundSize: 250,
  // Stand seating tiers. Large stands split into a lower and an upper tier with
  // a cantilevered overhang between them.
  stand: {
    twoTierThreshold: 10000, // seats at/above which a stand gets an upper tier
    lowerTierFraction: 2 / 3, // share of rows (≈ seats) in the lower tier
    lowerRowHeight: 0.5, // vertical rise per row, lower tier
    upperRowHeight: 0.7, // steeper rise per row, upper tier
    overhangClearance: 3, // vertical gap: lower-tier top → upper deck underside
    overhangCoverFraction: 0.4 // how far the deck cantilevers over the lower tier
  },
  // Floodlight towers sit at the four outer corners, offset from the centre.
  floodlightOffset: { x: 33, z: 23 },
  // Roads around the stadium: a grid of four roads (behind each stand) that
  // cross at four intersections and continue outward to `vanishDistance`,
  // fading into the distance. Dashed white centre markings on each road.
  road: {
    width: 7,
    // Extra clearance kept beyond the deepest stand; the grid is square, so it
    // always uses the deepest stand on any side. `minDistance` keeps it clear
    // of the floodlight towers for very small stadiums.
    margin: 10,
    minDistance: 42,
    // How far the roads run past the intersections (well beyond the 250-wide
    // ground plane) so they vanish into the dark background.
    vanishDistance: 200,
    color: 0x2c2c2e,
    markingColor: 0xffffff,
    dashLength: 3,
    dashGap: 3,
    markingWidth: 0.35
  },
  // Decorative trees planted on the ground around the stadium. Placed on a
  // fixed jittered grid (deterministic, so the layout never flickers) and
  // kept clear of the stadium footprint and the roads.
  trees: {
    areaHalf: 118, // trees stay within this half-extent (ground is 250 wide)
    spacing: 14, // grid cell size
    jitter: 5, // max per-axis random offset within a cell
    roadClearance: 4, // keep this far from the road edges
    minScale: 0.7,
    maxScale: 1.7,
    coneChance: 0.5, // share of cone-shaped (vs. round) foliage
    trunkColor: 0x6b4a2f,
    greens: [0x2e6b2e, 0x357a35, 0x40923f, 0x4fa74f, 0x2f5d33, 0x5bb35b, 0x3c7d3c]
  },
  camera: { fov: 45, near: 0.1, far: 1000, position: [80, 100, 80] },
  controls: {
    dampingFactor: 0.05,
    maxPolarAngle: Math.PI / 2.2,
    minDistance: 50,
    maxDistance: 150
  },
  colors: {
    sceneBackground: 0x0a0a1a,
    ground: 0x3d5c3d,
    ambientLight: 0x404060,
    moonLight: 0x6688cc
  },
  // Canvas height is derived from width, capped so it never gets too tall.
  maxCanvasHeight: 600,
  canvasAspectFactor: 0.9,
  // Radians added to _animationTime per frame.
  animationSpeed: 0.05
})

/**
 * Reusable stadium 3D canvas component
 */
export class StadiumCanvas extends UIElement {
  /**
   * @param {StadiumType} stadium
   * @param {TeamType} team
   * @param {string} [canvasId]
   */
  constructor (stadium, team, canvasId = 'stadium-canvas') {
    super()
    this.stadium = stadium
    this.team = team
    this.canvasId = canvasId
  }
  /**
   * @returns {string}
   */
  get template () {
    return `
      <div class="stadium-wrapper">
        <canvas id="${this.canvasId}"></canvas>
      </div>
    `
  }
  /**
   * Called after component is mounted - initializes Three.js scene
   */
  onMounted () {
    this._initThreeJS()
  }
  /**
   * Called when component is unmounted - cleanup Three.js resources
   */
  onDestroy () {
    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId)
      this._animationFrameId = null
    }

    if (this._resizeObserver) {
      this._resizeObserver.disconnect()
      this._resizeObserver = null
    }

    if (this._controls) {
      this._controls.dispose()
      this._controls = null
    }

    if (this._scene) {
      this._scene.traverse((object) => {
        if (object.geometry) {
          object.geometry.dispose()
        }
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach(material => {
            if (material.map) material.map.dispose()
            if (material.lightMap) material.lightMap.dispose()
            if (material.bumpMap) material.bumpMap.dispose()
            if (material.normalMap) material.normalMap.dispose()
            if (material.specularMap) material.specularMap.dispose()
            if (material.envMap) material.envMap.dispose()
            if (material.alphaMap) material.alphaMap.dispose()
            if (material.aoMap) material.aoMap.dispose()
            if (material.displacementMap) material.displacementMap.dispose()
            if (material.emissiveMap) material.emissiveMap.dispose()
            if (material.gradientMap) material.gradientMap.dispose()
            if (material.metalnessMap) material.metalnessMap.dispose()
            if (material.roughnessMap) material.roughnessMap.dispose()
            material.dispose()
          })
        }
      })
      this._scene = null
    }

    if (this._renderer) {
      this._renderer.dispose()
      this._renderer = null
    }

    this._camera = null
    this._updaters = []
    this._animationTime = 0
  }
  // --- component state ---
  _animationTime = 0

  // Per-frame update callbacks: (time: number) => void.

  // Register animated objects here instead of editing the render loop.
  _updaters = []

  // Three.js resources for cleanup
  _scene = null

  _renderer = null
  _camera = null
  _controls = null
  _animationFrameId = null
  _resizeObserver = null

  /**
   * @returns {number}
   */
  calculateTotalSeats () {
    return ['north', 'south', 'east', 'west'].reduce(
      (total, name) => total + (this.stadium[name + '_stand_size'] || 0),
      0
    )
  }

  /**
   * Register a per-frame update callback. The callback receives the current
   * animation time (in radians) and is invoked once per rendered frame.
   * @param {(time: number) => void} fn
   */
  _addUpdater (fn) {
    this._updaters.push(fn)
  }

  /**
   * Compute the canvas dimensions from its container width.
   * @param {HTMLElement} container
   * @returns {{ width: number, height: number }}
   */
  _canvasSize (container) {
    const width = container.clientWidth
    const height = Math.min(CONFIG.maxCanvasHeight, width * CONFIG.canvasAspectFactor)
    return { width, height }
  }

  /**
   * Initialize Three.js scene: bootstrap the library, build the scene graph
   * and start the render loop. The individual concerns are delegated to the
   * `_setup*` / `_build*` helpers below.
   */
  async _initThreeJS () {
    const [THREE, { OrbitControls }] = await Promise.all([
      import('three'),
      import('three/addons/controls/OrbitControls.js')
    ])
    this._THREE = THREE
    this._OrbitControls = OrbitControls

    const canvas = document.querySelector(`${this._elementQuery} #${this.canvasId}`)
    if (!canvas) return

    const container = canvas.parentElement

    this._setupScene(canvas, container)
    this._setupLights()

    this._buildStadium(this._scene)
    this._buildFloodlights(this._scene)
    this._buildRoads(this._scene)
    this._buildTrees(this._scene)

    this._startRenderLoop()
    this._observeResize(container)
  }

  /**
   * Create the scene, camera, renderer and orbit controls.
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} container
   */
  _setupScene (canvas, container) {
    const THREE = this._THREE
    const { width, height } = this._canvasSize(container)

    this._scene = new THREE.Scene()
    this._scene.background = new THREE.Color(CONFIG.colors.sceneBackground)

    this._camera = new THREE.PerspectiveCamera(
      CONFIG.camera.fov, width / height, CONFIG.camera.near, CONFIG.camera.far
    )
    this._camera.position.set(...CONFIG.camera.position)
    this._camera.lookAt(0, 0, 0)

    this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this._renderer.setSize(width, height)
    this._renderer.setPixelRatio(window.devicePixelRatio)
    this._renderer.shadowMap.enabled = true
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this._controls = new this._OrbitControls(this._camera, this._renderer.domElement)
    this._controls.enableDamping = true
    this._controls.dampingFactor = CONFIG.controls.dampingFactor
    this._controls.maxPolarAngle = CONFIG.controls.maxPolarAngle
    this._controls.minDistance = CONFIG.controls.minDistance
    this._controls.maxDistance = CONFIG.controls.maxDistance
  }

  /**
   * Add the ambient / directional "moonlight" fill lighting. Floodlight
   * spotlights are added per-tower in `_createFloodlightTower`.
   */
  _setupLights () {
    const THREE = this._THREE

    const ambientLight = new THREE.AmbientLight(CONFIG.colors.ambientLight, 0.5)
    this._scene.add(ambientLight)

    const moonLight = new THREE.DirectionalLight(CONFIG.colors.moonLight, 0.5)
    moonLight.position.set(30, 100, 30)
    this._scene.add(moonLight)
  }

  /**
   * Start the requestAnimationFrame render loop. Every registered updater is
   * invoked once per frame with the current animation time.
   */
  _startRenderLoop () {
    const animate = () => {
      if (!this._controls || !this._renderer) return
      this._animationFrameId = requestAnimationFrame(animate)
      this._controls.update()

      this._animationTime += CONFIG.animationSpeed
      this._updaters.forEach(update => update(this._animationTime))

      this._renderer.render(this._scene, this._camera)
    }
    animate()
  }

  /**
   * Keep camera aspect and renderer size in sync with the container width.
   * @param {HTMLElement} container
   */
  _observeResize (container) {
    this._resizeObserver = new ResizeObserver(() => {
      if (!this._camera || !this._renderer) return
      const { width, height } = this._canvasSize(container)
      this._camera.aspect = width / height
      this._camera.updateProjectionMatrix()
      this._renderer.setSize(width, height)
    })
    this._resizeObserver.observe(container)
  }

  /**
   * @param {THREE.Scene} scene
   */
  _buildStadium (scene) {
    const fieldWidth = CONFIG.field.width
    const fieldDepth = CONFIG.field.depth
    const standGap = CONFIG.standGap

    const northSeats = this.stadium.north_stand_size || 0
    const southSeats = this.stadium.south_stand_size || 0
    const eastSeats = this.stadium.east_stand_size || 0
    const westSeats = this.stadium.west_stand_size || 0

    const groundGeo = new this._THREE.PlaneGeometry(CONFIG.groundSize, CONFIG.groundSize)
    const groundMat = new this._THREE.MeshLambertMaterial({ color: CONFIG.colors.ground })
    const ground = new this._THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.1
    ground.receiveShadow = true
    scene.add(ground)

    const teamColor = this.team.color || '#FF0000'

    this._createField(scene, fieldWidth, fieldDepth, teamColor)

    this._createStand(scene, {
      position: 'north',
      width: fieldWidth + 6,
      seats: northSeats,
      x: 0,
      z: -fieldDepth / 2 - standGap,
      rotation: Math.PI,
      hasRoof: this.stadium.north_stand_roof
    })

    this._createStand(scene, {
      position: 'south',
      width: fieldWidth + 6,
      seats: southSeats,
      x: 0,
      z: fieldDepth / 2 + standGap,
      rotation: 0,
      hasRoof: this.stadium.south_stand_roof
    })

    this._createStand(scene, {
      position: 'west',
      width: fieldDepth + 6,
      seats: westSeats,
      x: -fieldWidth / 2 - standGap,
      z: 0,
      rotation: -Math.PI / 2,
      hasRoof: this.stadium.west_stand_roof
    })

    this._createStand(scene, {
      position: 'east',
      width: fieldDepth + 6,
      seats: eastSeats,
      x: fieldWidth / 2 + standGap,
      z: 0,
      rotation: Math.PI / 2,
      hasRoof: this.stadium.east_stand_roof
    })
  }

  /**
   * Place the four floodlight towers at the outer corners.
   * @param {THREE.Scene} scene
   */
  _buildFloodlights (scene) {
    const { x, z } = CONFIG.floodlightOffset
    this._createFloodlightTower(scene, -x, -z)
    this._createFloodlightTower(scene, x, -z)
    this._createFloodlightTower(scene, -x, z)
    this._createFloodlightTower(scene, x, z)
  }

  /**
   * Number of seating rows for a stand. Drives both the stand depth and the
   * ring-road distance, so it lives in one place.
   *
   * The raw row count (seats spread over the fixed stand width) is compressed
   * with a square-root curve: it keeps growing visibly across the whole seat
   * range while a mega-stand still stays a sane depth. A wider stand fits more
   * seats per row, so for the same seat count it ends up shallower — which is
   * physically what you'd expect.
   *
   * (An earlier divider-based formula saturated in the upper range, so a 15k
   * and a 30k stand came out nearly the same size.)
   * @param {number} seats
   * @param {number} width
   * @returns {number}
   */
  _standRowCount (seats, width) {
    const seatWidth = 0.5
    const seatsPerRow = Math.floor(width / seatWidth)
    const rawRows = Math.ceil(seats / seatsPerRow)
    return Math.max(3, Math.round(3.6 * Math.sqrt(rawRows)))
  }

  /**
   * Half-extent of the square road grid: a fixed margin beyond the deepest of
   * the four stands, clamped to a minimum so it always clears the floodlight
   * towers. Shared by the roads and the tree placement.
   * @returns {number}
   */
  _roadDistance () {
    const { margin, minDistance } = CONFIG.road
    const fieldW = CONFIG.field.width
    const fieldD = CONFIG.field.depth
    const gap = CONFIG.standGap

    // Outer extent of each stand (row depth is 1 unit/row; +2 covers back
    // wall & roof). The square grid uses the deepest of the four.
    const stands = [
      { seats: this.stadium.north_stand_size || 0, width: fieldW + 6, base: fieldD / 2 + gap },
      { seats: this.stadium.south_stand_size || 0, width: fieldW + 6, base: fieldD / 2 + gap },
      { seats: this.stadium.west_stand_size || 0, width: fieldD + 6, base: fieldW / 2 + gap },
      { seats: this.stadium.east_stand_size || 0, width: fieldD + 6, base: fieldW / 2 + gap }
    ]
    const deepest = Math.max(
      ...stands.map(s => s.base + this._standRowCount(s.seats, s.width) + 2)
    )
    return Math.max(minDistance, deepest + margin)
  }

  /**
   * A deterministic pseudo-random generator (mulberry32) seeded with a fixed
   * value. Produces the same sequence on every render so decorative layouts
   * (e.g. trees) look random but never flicker between frames/reloads.
   * @param {number} seed
   * @returns {() => number} function returning a float in [0, 1)
   */
  _seededRandom (seed) {
    let s = seed >>> 0
    return () => {
      s = (s + 0x6d2b79f5) | 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  /**
   * Plant decorative trees around the stadium. Candidate positions come from a
   * jittered grid (deterministic → looks random, stays stable) covering the
   * ground plane, minus the stadium footprint and the road grid. Each tree is a
   * brown cylinder trunk topped by a green sphere or cone, with varied size and
   * green tone. Rendered via InstancedMesh (3 draw calls total).
   * @param {THREE.Scene} scene
   */
  _buildTrees (scene) {
    const THREE = this._THREE
    const {
      areaHalf, spacing, jitter, roadClearance,
      minScale, maxScale, coneChance, trunkColor, greens
    } = CONFIG.trees

    const distance = this._roadDistance()
    const roadEdge = CONFIG.road.width / 2 + roadClearance
    const rand = this._seededRandom(0x9e3779b9)

    // Base (scale 1) tree dimensions.
    const trunkHeight = 3
    const sphereRadius = 2.4
    const coneRadius = 2.6
    const coneHeight = 5.5
    const sphereCenterY = trunkHeight + sphereRadius * 0.6
    const coneCenterY = trunkHeight + coneHeight / 2

    // Reject a candidate that would sit on the stadium footprint (inside the
    // road grid) or on/near any road.
    const isBlocked = (x, z) =>
      (Math.abs(x) < distance && Math.abs(z) < distance) ||
      Math.abs(Math.abs(x) - distance) < roadEdge ||
      Math.abs(Math.abs(z) - distance) < roadEdge

    const trees = []
    const steps = Math.floor(areaHalf / spacing)
    for (let gx = -steps; gx <= steps; gx++) {
      for (let gz = -steps; gz <= steps; gz++) {
        const x = gx * spacing + (rand() - 0.5) * 2 * jitter
        const z = gz * spacing + (rand() - 0.5) * 2 * jitter
        if (Math.abs(x) > areaHalf || Math.abs(z) > areaHalf) continue
        if (isBlocked(x, z)) continue
        trees.push({
          x,
          z,
          scale: minScale + rand() * (maxScale - minScale),
          isCone: rand() < coneChance,
          green: greens[Math.floor(rand() * greens.length)]
        })
      }
    }

    const sphereTrees = trees.filter(t => !t.isCone)
    const coneTrees = trees.filter(t => t.isCone)

    const trunkMat = new THREE.MeshLambertMaterial({ color: trunkColor })
    // Foliage colour comes from per-instance colours; base material is white
    // so the instance colour shows unmodified.
    const foliageMat = new THREE.MeshLambertMaterial({ color: 0xffffff })

    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.3, 0.45, trunkHeight, 6), trunkMat, trees.length
    )
    const sphereFoliage = new THREE.InstancedMesh(
      new THREE.SphereGeometry(sphereRadius, 8, 6), foliageMat, sphereTrees.length
    )
    const coneFoliage = new THREE.InstancedMesh(
      new THREE.ConeGeometry(coneRadius, coneHeight, 7), foliageMat, coneTrees.length
    )

    const matrix = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    const scaleVec = new THREE.Vector3()
    const pos = new THREE.Vector3()
    const color = new THREE.Color()

    const setInstance = (mesh, i, x, z, y, scale, green) => {
      scaleVec.set(scale, scale, scale)
      pos.set(x, y * scale, z)
      matrix.compose(pos, quat, scaleVec)
      mesh.setMatrixAt(i, matrix)
      if (green !== undefined) mesh.setColorAt(i, color.set(green))
    }

    trees.forEach((t, i) => setInstance(trunks, i, t.x, t.z, trunkHeight / 2, t.scale))
    sphereTrees.forEach((t, i) => setInstance(sphereFoliage, i, t.x, t.z, sphereCenterY, t.scale, t.green))
    coneTrees.forEach((t, i) => setInstance(coneFoliage, i, t.x, t.z, coneCenterY, t.scale, t.green))

    for (const mesh of [trunks, sphereFoliage, coneFoliage]) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)
    }
  }

  /**
   * Build the roads around the stadium as a grid (#-shape): the two north/south
   * roads run continuously, the two west/east roads cross them at four
   * intersections, and every road continues outward past its corner all the way
   * to `vanishDistance` — far beyond the ground plane — so it fades into the
   * distance. Dashed white centre markings run the full length and skip the
   * intersections. The grid sits a fixed margin beyond the deepest stand so it
   * always clears the stadium regardless of its size.
   * @param {THREE.Scene} scene
   */
  _buildRoads (scene) {
    const THREE = this._THREE
    const {
      width: rw, vanishDistance: far, color,
      markingColor, dashLength, dashGap, markingWidth
    } = CONFIG.road

    const distance = this._roadDistance()

    const roadY = 0
    const markingY = 0.02
    const roadMat = new THREE.MeshLambertMaterial({ color })
    const markingMat = new THREE.MeshBasicMaterial({ color: markingColor })

    // A flat tile lying on the ground (rotated from the XY into the XZ plane).
    // Geometries are shared across tiles of the same shape.
    const addTile = (geo, mat, x, z, y) => {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set(x, y, z)
      mesh.receiveShadow = true
      scene.add(mesh)
    }

    // North/south roads run continuously through the crossings...
    const hRoadGeo = new THREE.PlaneGeometry(2 * far, rw)
    addTile(hRoadGeo, roadMat, 0, -distance, roadY) // north
    addTile(hRoadGeo, roadMat, 0, distance, roadY) // south

    // ...west/east roads yield at the crossings (split into a middle piece plus
    // two outward pieces) so nothing overlaps.
    const vMiddleGeo = new THREE.PlaneGeometry(rw, 2 * distance - rw)
    const vOuterLen = far - distance - rw / 2
    const vOuterGeo = new THREE.PlaneGeometry(rw, vOuterLen)
    const vOuterCenter = distance + rw / 2 + vOuterLen / 2
    for (const vx of [-distance, distance]) {
      addTile(vMiddleGeo, roadMat, vx, 0, roadY) // between the two crossings
      addTile(vOuterGeo, roadMat, vx, -vOuterCenter, roadY) // outward toward -z
      addTile(vOuterGeo, roadMat, vx, vOuterCenter, roadY) // outward toward +z
    }

    // Dashed centre markings, running the full length and skipping the
    // crossings (just like real road markings).
    const dashGeoX = new THREE.PlaneGeometry(dashLength, markingWidth)
    const dashGeoZ = new THREE.PlaneGeometry(markingWidth, dashLength)
    const period = dashLength + dashGap
    const dashCount = Math.floor((2 * far) / period)
    const dashSpan = dashCount * period - dashGap
    const dashStart = -dashSpan / 2 + dashLength / 2
    const nearCrossing = p =>
      Math.abs(p - distance) < rw / 2 + dashLength / 2 ||
      Math.abs(p + distance) < rw / 2 + dashLength / 2

    for (let i = 0; i < dashCount; i++) {
      const p = dashStart + i * period
      if (nearCrossing(p)) continue
      addTile(dashGeoX, markingMat, p, -distance, markingY) // north
      addTile(dashGeoX, markingMat, p, distance, markingY) // south
      addTile(dashGeoZ, markingMat, -distance, p, markingY) // west
      addTile(dashGeoZ, markingMat, distance, p, markingY) // east
    }
  }

  /**
   * @param {THREE.Scene} scene
   * @param {number} width
   * @param {number} depth
   * @param {string} teamColor
   */
  _createField (scene, width, depth, teamColor) {
    const fieldGeo = new this._THREE.PlaneGeometry(width, depth)
    const fieldMat = new this._THREE.MeshLambertMaterial({ color: 0x2e8b2e })
    const field = new this._THREE.Mesh(fieldGeo, fieldMat)
    field.rotation.x = -Math.PI / 2
    field.position.y = 0.01
    field.receiveShadow = true
    scene.add(field)

    const stripeCount = 8
    const stripeWidth = depth / stripeCount
    for (let i = 0; i < stripeCount; i += 2) {
      const stripeGeo = new this._THREE.PlaneGeometry(width, stripeWidth)
      const stripeMat = new this._THREE.MeshLambertMaterial({ color: 0x35a535 })
      const stripe = new this._THREE.Mesh(stripeGeo, stripeMat)
      stripe.rotation.x = -Math.PI / 2
      stripe.position.y = 0.02
      stripe.position.z = -depth / 2 + stripeWidth / 2 + i * stripeWidth
      stripe.receiveShadow = true
      scene.add(stripe)
    }

    const lineMaterial = new this._THREE.LineBasicMaterial({ color: 0xffffff })

    const outlinePoints = [
      new this._THREE.Vector3(-width / 2, 0.03, -depth / 2),
      new this._THREE.Vector3(width / 2, 0.03, -depth / 2),
      new this._THREE.Vector3(width / 2, 0.03, depth / 2),
      new this._THREE.Vector3(-width / 2, 0.03, depth / 2),
      new this._THREE.Vector3(-width / 2, 0.03, -depth / 2)
    ]
    const outlineGeo = new this._THREE.BufferGeometry().setFromPoints(outlinePoints)
    scene.add(new this._THREE.Line(outlineGeo, lineMaterial))

    const centerLinePoints = [
      new this._THREE.Vector3(0, 0.03, -depth / 2),
      new this._THREE.Vector3(0, 0.03, depth / 2)
    ]
    const centerLineGeo = new this._THREE.BufferGeometry().setFromPoints(centerLinePoints)
    scene.add(new this._THREE.Line(centerLineGeo, lineMaterial))

    const circleGeo = new this._THREE.RingGeometry(4.9, 5, 32)
    const circleMat = new this._THREE.MeshBasicMaterial({ color: 0xffffff, side: this._THREE.DoubleSide })
    const circle = new this._THREE.Mesh(circleGeo, circleMat)
    circle.rotation.x = -Math.PI / 2
    circle.position.y = 0.03
    scene.add(circle)

    this._createGoal(scene, -width / 2)
    this._createGoal(scene, width / 2)

    const cornerPositions = [
      { x: -width / 2, z: -depth / 2 },
      { x: width / 2, z: -depth / 2 },
      { x: -width / 2, z: depth / 2 },
      { x: width / 2, z: depth / 2 }
    ]

    cornerPositions.forEach(pos => {
      this._createFlag(scene, pos.x, pos.z, teamColor)
    })
  }

  /**
   * @param {THREE.Scene} scene
   * @param {number} x
   * @param {number} z
   * @param {string} color
   */
  _createFlag (scene, x, z, color) {
    const poleHeight = 2.5
    const flagWidth = 1.5
    const flagHeight = 1.0

    const poleGeo = new this._THREE.CylinderGeometry(0.05, 0.05, poleHeight, 8)
    const poleMat = new this._THREE.MeshLambertMaterial({ color: 0xffffff })
    const pole = new this._THREE.Mesh(poleGeo, poleMat)
    pole.position.set(x, poleHeight / 2, z)
    scene.add(pole)

    const flagGeo = new this._THREE.PlaneGeometry(flagWidth, flagHeight, 10, 5)
    const flagMat = new this._THREE.MeshLambertMaterial({
      color: new this._THREE.Color(color),
      side: this._THREE.DoubleSide
    })
    const flag = new this._THREE.Mesh(flagGeo, flagMat)

    flag.position.set(x + flagWidth / 2, poleHeight - flagHeight / 2, z)

    const positionAttr = flagGeo.getAttribute('position')
    const originalPositions = new Float32Array(positionAttr.array.length)
    originalPositions.set(positionAttr.array)
    flag.userData.originalPositions = originalPositions

    scene.add(flag)
    this._addUpdater(time => this._animateFlag(flag, time))
  }

  /**
   * Wave a corner flag by displacing its vertices along a sine wave.
   * @param {THREE.Mesh} flag
   * @param {number} time
   */
  _animateFlag (flag, time) {
    const positionAttr = flag.geometry.getAttribute('position')
    const originalPositions = flag.userData.originalPositions

    for (let i = 0; i < positionAttr.count; i++) {
      const x = originalPositions[i * 3]
      const y = originalPositions[i * 3 + 1]
      const z = originalPositions[i * 3 + 2]

      const waveAmount = x * 0.3
      const wave = Math.sin(time * 3 + x * 2) * waveAmount

      positionAttr.setZ(i, z + wave)
      positionAttr.setY(i, y + Math.sin(time * 2 + x * 3) * waveAmount * 0.3)
    }
    positionAttr.needsUpdate = true
  }

  /**
   * @param {THREE.Scene} scene
   * @param {number} x
   * @param {number} z
   */
  _createFloodlightTower (scene, x, z) {
    const towerHeight = 45
    const towerWidth = 1.5

    const towerMat = new this._THREE.MeshLambertMaterial({ color: 0xcccccc })

    const poleSections = 4
    for (let i = 0; i < poleSections; i++) {
      const sectionHeight = towerHeight / poleSections
      const sectionWidth = towerWidth * (1 - i * 0.15)

      const poleGeo = new this._THREE.BoxGeometry(sectionWidth, sectionHeight, sectionWidth)
      const pole = new this._THREE.Mesh(poleGeo, towerMat)
      pole.position.set(x, sectionHeight / 2 + i * sectionHeight, z)
      scene.add(pole)
    }

    const platformGeo = new this._THREE.BoxGeometry(1, 1, 1)
    const platform = new this._THREE.Mesh(platformGeo, towerMat)
    platform.castShadow = false
    platform.position.set(x, towerHeight, z)
    scene.add(platform)

    const spotlightMat = new this._THREE.MeshLambertMaterial({ color: 0x222222 })
    const spotlightLensMat = new this._THREE.MeshBasicMaterial({ color: 0xffffcc })

    const dirToCenter = new this._THREE.Vector3(-x, -towerHeight + 5, -z).normalize()

    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const housingGeo = new this._THREE.BoxGeometry(1, 0.8, 1.2)
        const housing = new this._THREE.Mesh(housingGeo, spotlightMat)

        const offsetX = (col - 1) * 1.4
        const offsetY = towerHeight + 1 + row * 1.4

        housing.position.set(x + offsetX, offsetY, z)
        housing.lookAt(0, 0, 0)
        scene.add(housing)

        const lensGeo = new this._THREE.CircleGeometry(0.35, 16)
        const lens = new this._THREE.Mesh(lensGeo, spotlightLensMat)
        lens.position.set(x + offsetX, offsetY, z)
        lens.lookAt(0, 0, 0)
        lens.position.add(dirToCenter.clone().multiplyScalar(0.65))
        scene.add(lens)
      }
    }

    const mainLight = new this._THREE.SpotLight(0xfff5e6, 350, 150, Math.PI / 3, 0.6, 1.5)
    mainLight.position.set(x, towerHeight + 1, z)
    mainLight.target.position.set(0, 0, 0)

    mainLight.castShadow = true
    mainLight.shadow.mapSize.width = 1024
    mainLight.shadow.mapSize.height = 1024
    mainLight.shadow.camera.near = 10
    mainLight.shadow.camera.far = 150

    scene.add(mainLight)
    scene.add(mainLight.target)
  }

  /**
   * @param {THREE.Scene} scene
   * @param {number} x
   */
  _createGoal (scene, x) {
    const goalMat = new this._THREE.MeshLambertMaterial({ color: 0xffffff })
    const postRadius = 0.15
    const goalWidth = 4
    const goalHeight = 1.5

    const postGeo = new this._THREE.CylinderGeometry(postRadius, postRadius, goalHeight, 8)
    const leftPost = new this._THREE.Mesh(postGeo, goalMat)
    leftPost.position.set(x, goalHeight / 2, -goalWidth / 2)
    scene.add(leftPost)

    const rightPost = new this._THREE.Mesh(postGeo, goalMat)
    rightPost.position.set(x, goalHeight / 2, goalWidth / 2)
    scene.add(rightPost)

    const crossbarGeo = new this._THREE.CylinderGeometry(postRadius, postRadius, goalWidth, 8)
    const crossbar = new this._THREE.Mesh(crossbarGeo, goalMat)
    crossbar.rotation.x = Math.PI / 2
    crossbar.position.set(x, goalHeight, 0)
    scene.add(crossbar)
  }

  /**
   * Geometry for a single stadium seat: two flat surfaces — a horizontal seat
   * pan and a slightly reclined vertical backrest at the back edge. Built as one
   * merged buffer geometry so a whole colour group still renders as a single
   * InstancedMesh. Origin sits on the step surface, front facing -z (the field).
   * @param {number} seatWidth
   * @param {number} rowDepth
   * @returns {THREE.BufferGeometry}
   */
  _createSeatGeometry (seatWidth, rowDepth) {
    const sw = seatWidth * 0.4 // half seat width
    const sd = rowDepth * 0.25 // half seat depth
    const panY = 0.22 // seat pan height above the step
    const backHeight = 0.5
    const recline = 0.12 // how far the backrest top leans back (+z)

    const vertices = new Float32Array([
      // seat pan (horizontal)
      -sw, panY, -sd,
      sw, panY, -sd,
      sw, panY, sd,
      -sw, panY, sd,
      // backrest (vertical, at the back edge, leaning back at the top)
      -sw, panY, sd,
      sw, panY, sd,
      sw, panY + backHeight, sd + recline,
      -sw, panY + backHeight, sd + recline
    ])

    const indices = [
      0, 1, 2, 0, 2, 3, // pan
      4, 5, 6, 4, 6, 7 // backrest
    ]

    const geo = new this._THREE.BufferGeometry()
    geo.setAttribute('position', new this._THREE.BufferAttribute(vertices, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }

  /**
   * Add a mirrored pair of trapezoidal side walls (thin slabs) enclosing one
   * seating tier. The 2D profile runs bottom-flat, up the back, then down the
   * sloped top to the (lower) front — matching the tier's rake.
   * @param {THREE.Group} group
   * @param {THREE.Material} mat
   * @param {Object} opts
   * @param {number} opts.width stand width (walls sit just outside it)
   * @param {number} opts.depth tier depth along z
   * @param {number} opts.baseZ z of the tier's front edge
   * @param {number} opts.frontY absolute top height at the front
   * @param {number} opts.backY absolute top height at the back
   * @param {number} opts.baseY absolute bottom height of the wall
   */
  _addSideWalls (group, mat, { width, depth, baseZ, frontY, backY, baseY }) {
    const shape = new this._THREE.Shape()
    shape.moveTo(0, baseY)
    shape.lineTo(depth, baseY)
    shape.lineTo(depth, backY)
    shape.lineTo(0, frontY)
    shape.closePath()

    const geo = new this._THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false })
    for (const sign of [1, -1]) {
      const wall = new this._THREE.Mesh(geo, mat)
      wall.rotation.y = Math.PI * 1.5
      wall.position.set(sign * (width / 2 + 1), 0, baseZ)
      wall.castShadow = true
      group.add(wall)
    }
  }

  /**
   * Split a stand's rows into a lower and (for large stands) an upper tier.
   * Below the two-tier threshold the whole stand is one tier; at or above it,
   * the lower tier gets ~2/3 of the rows (≈ seats, since rows are equally wide)
   * and the upper tier the rest.
   * @param {number} seats
   * @param {number} numRows total row count
   * @returns {{ twoTier: boolean, lowerRows: number, upperRows: number }}
   */
  _standTierRows (seats, numRows) {
    const { twoTierThreshold, lowerTierFraction } = CONFIG.stand
    if (seats < twoTierThreshold) {
      return { twoTier: false, lowerRows: numRows, upperRows: 0 }
    }
    const lowerRows = Math.round(numRows * lowerTierFraction)
    return { twoTier: true, lowerRows, upperRows: numRows - lowerRows }
  }

  /**
   * @param {THREE.Scene} scene
   * @param {Object} config
   */
  _createStand (scene, config) {
    const { width, seats, x, z, rotation, hasRoof } = config
    const { lowerRowHeight, upperRowHeight, overhangClearance, overhangCoverFraction } = CONFIG.stand

    const group = new this._THREE.Group()

    const seatWidth = 0.5
    const seatsPerRow = Math.floor(width / seatWidth)
    const numRows = this._standRowCount(seats, width)
    const rowDepth = 1.0

    // Large stands split into two tiers: the lower ~2/3 of the rows sit under a
    // cantilevered overhang, the upper ~1/3 (steeper) sit above it.
    const { twoTier, lowerRows, upperRows } = this._standTierRows(seats, numRows)

    const lowerDepth = lowerRows * rowDepth
    const lowerTopY = 0.5 + lowerRows * lowerRowHeight // top of the lower tier
    const deckY = lowerTopY + overhangClearance // upper-tier floor / overhang top
    const upperDepth = upperRows * rowDepth
    const upperTopY = deckY + upperRows * upperRowHeight

    // The overhang deck cantilevers forward over the rear of the lower tier, and
    // the upper tier sits on it: its front edge is the deck lip, so the whole
    // upper tier is pulled toward the field rather than stacked behind.
    const overhang = twoTier ? lowerDepth * overhangCoverFraction : 0
    const upperFrontZ = lowerDepth - overhang

    const totalDepth = twoTier ? Math.max(lowerDepth, upperFrontZ + upperDepth) : lowerDepth
    const envTop = twoTier ? upperTopY : lowerTopY // envelope top height

    // baseY 0.5 = top of the foundation slab (row 0 sits on it).
    const tiers = [{ rows: lowerRows, rowHeight: lowerRowHeight, baseY: 0.5, baseZ: 0 }]
    if (twoTier) {
      tiers.push({ rows: upperRows, rowHeight: upperRowHeight, baseY: deckY, baseZ: upperFrontZ })
    }

    // --- foundation slab ---
    const baseMat = new this._THREE.MeshLambertMaterial({ color: 0x505050 })
    const base = new this._THREE.Mesh(
      new this._THREE.BoxGeometry(width + 2, 0.5, totalDepth + 1), baseMat
    )
    base.position.y = 0.25
    base.position.z = totalDepth / 2
    base.castShadow = true
    base.receiveShadow = true
    group.add(base)

    // --- steps + seats (both tiers) ---
    // One instanced mesh holds every step; a per-instance y-scale gives the
    // upper tier its steeper rise from a single base geometry.
    const stepMat = new this._THREE.MeshLambertMaterial({ color: 0x909090 })
    const stepInstancedMesh = new this._THREE.InstancedMesh(
      new this._THREE.BoxGeometry(width, lowerRowHeight, rowDepth), stepMat, numRows
    )
    stepInstancedMesh.castShadow = true
    stepInstancedMesh.receiveShadow = true

    const seatColors = [
      { color: 0xe74c3c, threshold: 0.35 },
      { color: 0x3498db, threshold: 0.70 },
      { color: 0xf39c12, threshold: 0.85 },
      { color: 0x27ae60, threshold: 0.95 },
      { color: 0xf1c40f, threshold: 1.0 }
    ]
    const seatsByColor = new Map()
    seatColors.forEach(c => seatsByColor.set(c.color, []))

    const stepMatrix = new this._THREE.Matrix4()
    const stepQuat = new this._THREE.Quaternion()
    const stepScale = new this._THREE.Vector3()
    const stepPos = new this._THREE.Vector3()

    let stepIndex = 0
    for (const tier of tiers) {
      const yScale = tier.rowHeight / lowerRowHeight
      for (let row = 0; row < tier.rows; row++) {
        const rowBottomY = tier.baseY + row * tier.rowHeight
        const rowZ = tier.baseZ + row * rowDepth

        stepPos.set(0, rowBottomY + tier.rowHeight / 2, rowZ + rowDepth / 2)
        stepScale.set(1, yScale, 1)
        stepMatrix.compose(stepPos, stepQuat, stepScale)
        stepInstancedMesh.setMatrixAt(stepIndex++, stepMatrix)

        const seatY = rowBottomY + tier.rowHeight // step surface
        const seatZ = rowZ + rowDepth * 0.35
        for (let s = 0; s < seatsPerRow; s++) {
          const colorChoice = Math.random()
          let seatColor = seatColors[seatColors.length - 1].color
          for (const { color, threshold } of seatColors) {
            if (colorChoice < threshold) {
              seatColor = color
              break
            }
          }
          seatsByColor.get(seatColor).push({
            x: -width / 2 + seatWidth / 2 + s * seatWidth,
            y: seatY,
            z: seatZ
          })
        }
      }
    }
    stepInstancedMesh.instanceMatrix.needsUpdate = true
    group.add(stepInstancedMesh)

    const seatGeo = this._createSeatGeometry(seatWidth, rowDepth)
    const seatMatrix = new this._THREE.Matrix4()

    for (const [color, positions] of seatsByColor) {
      if (positions.length === 0) continue

      const seatMat = new this._THREE.MeshLambertMaterial({ color, side: this._THREE.DoubleSide })
      const instancedSeats = new this._THREE.InstancedMesh(seatGeo, seatMat, positions.length)

      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i]
        seatMatrix.setPosition(pos.x, pos.y, pos.z)
        instancedSeats.setMatrixAt(i, seatMatrix)
      }
      instancedSeats.instanceMatrix.needsUpdate = true
      group.add(instancedSeats)
    }

    const backWallMat = new this._THREE.MeshLambertMaterial({ color: 0x606060 })

    // --- overhang: rear wall of the lower tier + cantilevered deck ---
    if (twoTier) {
      const wallHeight = deckY - lowerTopY
      const wall = new this._THREE.Mesh(
        new this._THREE.BoxGeometry(width, wallHeight, 0.5), backWallMat
      )
      wall.position.set(0, lowerTopY + wallHeight / 2, lowerDepth)
      wall.castShadow = true
      wall.receiveShadow = true
      group.add(wall)

      const deckMat = new this._THREE.MeshLambertMaterial({ color: 0x777777 })
      const deck = new this._THREE.Mesh(
        new this._THREE.BoxGeometry(width, 0.4, overhang), deckMat
      )
      // Top surface flush with the upper-tier floor; hangs forward from the
      // rear wall over the rear rows of the lower tier (up to the deck lip).
      deck.position.set(0, deckY - 0.2, lowerDepth - overhang / 2)
      deck.castShadow = true
      deck.receiveShadow = true
      group.add(deck)
    }

    // --- back wall (full height, at the very rear) ---
    const backWallHeight = envTop + 2
    const backWall = new this._THREE.Mesh(
      new this._THREE.BoxGeometry(width + 2, backWallHeight, 0.5), backWallMat
    )
    backWall.position.y = backWallHeight / 2
    backWall.position.z = totalDepth + 0.25
    backWall.castShadow = true
    group.add(backWall)

    // --- side walls (one pair per tier, so the overhang void stays open) ---
    this._addSideWalls(group, backWallMat, {
      width,
      depth: lowerDepth,
      baseZ: 0,
      baseY: 0,
      frontY: 1.5,
      backY: twoTier ? deckY : lowerTopY + 1.5
    })
    if (twoTier) {
      this._addSideWalls(group, backWallMat, {
        width,
        depth: upperDepth,
        baseZ: upperFrontZ,
        baseY: deckY,
        frontY: deckY + 1.5,
        backY: upperTopY + 1.5
      })
    }

    if (hasRoof) {
      const roofY = envTop + 3
      const pillarZ = totalDepth - 1
      const pillarTopY = roofY + 4
      const pillarHeight = pillarTopY + 0.5

      const roofGeo = new this._THREE.BoxGeometry(width + 4, 0.3, totalDepth + 3)
      const roofMat = new this._THREE.MeshLambertMaterial({
        color: 0xe6e6e6,
        transparent: true,
        opacity: 0.8
      })
      const roof = new this._THREE.Mesh(roofGeo, roofMat)
      roof.position.y = roofY
      roof.position.z = totalDepth / 2
      roof.rotation.x = -0.05
      roof.castShadow = true
      group.add(roof)

      const supportGeo = new this._THREE.CylinderGeometry(0.4, 0.4, pillarHeight, 8)
      const supportMat = new this._THREE.MeshLambertMaterial({ color: 0x444444 })

      const pillarPositions = [-width / 2 + 3, 0, width / 2 - 3]

      const cableMat = new this._THREE.LineBasicMaterial({ color: 0x333333, linewidth: 3 })

      pillarPositions.forEach(pillarX => {
        const support = new this._THREE.Mesh(supportGeo, supportMat)
        support.position.set(pillarX, pillarHeight / 2, pillarZ)
        support.castShadow = true
        group.add(support)

        const cablePoints = [
          new this._THREE.Vector3(pillarX, pillarTopY, pillarZ),
          new this._THREE.Vector3(pillarX, roofY + 0.2, pillarZ / 1.5)
        ]
        const cableGeo = new this._THREE.BufferGeometry().setFromPoints(cablePoints)
        const cable = new this._THREE.Line(cableGeo, cableMat)
        group.add(cable)

        const topCapGeo = new this._THREE.SphereGeometry(0.5, 8, 8)
        const topCap = new this._THREE.Mesh(topCapGeo, supportMat)
        topCap.position.set(pillarX, pillarTopY, pillarZ)
        group.add(topCap)
      })
    }

    group.position.set(x, 0, z)
    group.rotation.y = rotation
    scene.add(group)
  }
}
