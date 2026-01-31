import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { el } from '../lib/html.js'
import { toast } from '../partials/toast.js'
import { euroFormat } from '../lib/currency.js'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export class StadiumPage extends UIElement {
  stadium = {}
  team = {}
  _flags = []
  _animationTime = 0
  
  // Three.js resources for cleanup
  _scene = null
  _renderer = null
  _camera = null
  _controls = null
  _animationFrameId = null
  _resizeObserver = null

  /**
   * @returns {Object}
   */
  get events () {
    return {
      '#price-form': {
        submit: this._onPriceFormSubmit.bind(this),
        change: (event) => {
          const input = event.target.closest('[data-price-input]')
          if (input) {
            const name = input.dataset.priceInput
            this.stadium[name + '_stand_price'] = Number(input.value)
          }
        }
      },
      '#stadium-form': {
        submit: this._onStadiumFormSubmit.bind(this),
        change: async (event) => {
          const sizeInput = event.target.closest('[data-size-input]')
          const roofInput = event.target.closest('[data-roof-input]')

          if (sizeInput) {
            const name = sizeInput.dataset.sizeInput
            this.stadium[name + '_stand_size'] = Number(sizeInput.value)
            await this._updatePrice()
          } else if (roofInput) {
            const name = roofInput.dataset.roofInput
            this.stadium[name + '_stand_roof'] = roofInput.checked ? 1 : 0
            await this._updatePrice()
          }
        }
      }
    }
  }

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div>
        <h2>Your Stadium</h2>
        <p>Here is your beautiful stadium with ${this._calculateStadiumSize()} seats:</p>
        <div class="stadium-wrapper mb-4">
          <canvas id="stadium-canvas"></canvas>
        </div>
        <h3>Ticket Prices</h3>
        <p>Adjust the prices of your stadium tickets.</p>
        <form class="pb-4 mb-4" id="price-form">
          ${this._renderPriceForm()}
        </form>
        <h3>Expand Stadium</h3>
        <p>Add more seats to your stadium to get more fans excited.</p>
        <form class="pb-4 mb-4" id="stadium-form">
          ${this._renderExpandForm()}
        </form>
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const [stadiumResponse, teamResponse] = await Promise.all([
      server.getStadium(),
      server.getMyTeam()
    ])
    this.stadium = stadiumResponse.stadium
    this.team = teamResponse.team
    console.log('Stadium: ', this.stadium)
  }


  /**
   * @param {Event} event
   * @returns {Promise<void>}
   */
  async _onPriceFormSubmit (event) {
    event.preventDefault()
    try {
      await server.updatePrices(this.stadium)
      toast('Prices updated')
    } catch (e) {
      toast(e.message ?? 'Something went wrong', 'error')
    }
  }

  /**
   * @param {Event} event
   * @returns {Promise<void>}
   */
  async _onStadiumFormSubmit (event) {
    event.preventDefault()
    try {
      await server.buildStadium(this.stadium)
      toast('You got a new stadium', 'success')
    } catch (e) {
      toast(e.message ?? 'Something went wrong', 'error')
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async _updatePrice () {
    try {
      const { totalPrice } = await server.calculateStadiumPrice(this.stadium)
      const priceEl = el(`${this._elementQuery} #total-price`)
      if (priceEl) {
        priceEl.innerText = euroFormat.format(totalPrice)
      }
    } catch (e) {
      toast(e.message ?? 'Something went wrong', 'error')
    }
  }

  /**
   * @returns {string}
   */
  _renderPriceForm () {
    const formGroups = ['north', 'south', 'east', 'west'].map(name => `
      <div class="col-6 col-sm-3 mb-2">
        <div class="form-group">
          <label>
            Price for tickets on ${name} stand
          </label>
          <div class="input-group">
            <input data-price-input="${name}"
                   class="form-control"
                   type="number"
                   value="${this.stadium[name + '_stand_price']}">
            <div class="input-group-append">
              <span class="input-group-text">,00 €</span>
            </div>
          </div>
        </div>
      </div>
    `).join('')

    return `
      <div class="row">
        ${formGroups}
      </div>
      <button type="submit" class="btn btn-primary">Save Prices</button>
    `
  }

  /**
   * @returns {string}
   */
  _renderExpandForm () {
    const formGroups = ['north', 'south', 'east', 'west'].map(name => `
      <div class="col-6 col-sm-3 mb-4">
        <div class="form-group">
          <label>Seats on ${name} stand</label>
          <input data-size-input="${name}" class="form-control" type="number" value="${this.stadium[name + '_stand_size']}">
          <small class="form-text text-muted">Change the amount of seats here to expand your stadium.</small>
        </div>
        <div class="form-check">
          <label class="form-check-label">
            <input class="form-check-input"
                   data-roof-input="${name}"
                   type="checkbox"
                   ${this.stadium[name + '_stand_roof'] ? 'checked' : ''}>
                Roof on ${name} stand?
          </label>
        </div>
      </div>
    `).join('')

    return `
      <div class="row">
        ${formGroups}
      </div>
      <p>
        Total Price for construction: <span id="total-price">0 €</span>
      </p>
      <button type="submit" class="btn btn-primary">Expand Stadium</button>
    `
  }

  /**
   * @returns {number}
   */
  _calculateStadiumSize () {
    return ['north', 'south', 'east', 'west'].reduce(
      (total, name) => total + (this.stadium[name + '_stand_size'] || 0),
      0
    )
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
    // Cancel animation loop
    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId)
      this._animationFrameId = null
    }

    // Disconnect resize observer
    if (this._resizeObserver) {
      this._resizeObserver.disconnect()
      this._resizeObserver = null
    }

    // Dispose controls
    if (this._controls) {
      this._controls.dispose()
      this._controls = null
    }

    // Traverse scene and dispose all geometries, materials, and textures
    if (this._scene) {
      this._scene.traverse((object) => {
        if (object.geometry) {
          object.geometry.dispose()
        }
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach(material => {
            // Dispose textures associated with the material
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
            
            // Dispose the material itself
            material.dispose()
          })
        }
      })
      
      // Clear the scene
      this._scene = null
    }

    // Dispose renderer
    if (this._renderer) {
      this._renderer.dispose()
      this._renderer = null
    }

    // Clear remaining references
    this._camera = null
    this._flags = []
    this._animationTime = 0
  }

  /**
   * Initialize Three.js scene
   */
  _initThreeJS () {
    const canvas = el(`${this._elementQuery} #stadium-canvas`)
    if (!canvas) return

    const container = canvas.parentElement
    const width = container.clientWidth
    const height = Math.min(400, width * 0.6)

    // Scene - night sky
    this._scene = new THREE.Scene()
    this._scene.background = new THREE.Color(0x0a0a1a) // Dark night sky

    // Camera (isometric-like perspective)
    this._camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    this._camera.position.set(80, 100, 80)
    this._camera.lookAt(0, 0, 0)

    // Renderer
    this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this._renderer.setSize(width, height)
    this._renderer.setPixelRatio(window.devicePixelRatio)
    this._renderer.shadowMap.enabled = true
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // Orbit controls for rotation
    this._controls = new OrbitControls(this._camera, this._renderer.domElement)
    this._controls.enableDamping = true
    this._controls.dampingFactor = 0.05
    this._controls.maxPolarAngle = Math.PI / 2.2
    this._controls.minDistance = 50
    this._controls.maxDistance = 150

    // Lighting - dimmed for night atmosphere
    const ambientLight = new THREE.AmbientLight(0x404060, 0.5)
    this._scene.add(ambientLight)

    // Soft moonlight from above
    const moonLight = new THREE.DirectionalLight(0x6688cc, 0.5)
    moonLight.position.set(30, 100, 30)
    this._scene.add(moonLight)

    // Build stadium
    this._buildStadium(this._scene)

    // Only first tower casts shadows for performance
    this._createFloodlightTower(this._scene, -33, -23)
    this._createFloodlightTower(this._scene, 33, -23)
    this._createFloodlightTower(this._scene, -33, 23)
    this._createFloodlightTower(this._scene, 33, 23)

    // Animation loop
    const animate = () => {
      this._animationFrameId = requestAnimationFrame(animate)
      this._controls.update()

      // Animate flags
      this._animationTime += 0.05
      this._flags.forEach(flag => {
        const positionAttr = flag.geometry.getAttribute('position')
        const originalPositions = flag.userData.originalPositions

        for (let i = 0; i < positionAttr.count; i++) {
          const x = originalPositions[i * 3]
          const y = originalPositions[i * 3 + 1]
          const z = originalPositions[i * 3 + 2]

          // Wave effect based on distance from pole (x position)
          const waveAmount = x * 0.3
          const wave = Math.sin(this._animationTime * 3 + x * 2) * waveAmount

          positionAttr.setZ(i, z + wave)
          positionAttr.setY(i, y + Math.sin(this._animationTime * 2 + x * 3) * waveAmount * 0.3)
        }
        positionAttr.needsUpdate = true
      })

      this._renderer.render(this._scene, this._camera)
    }
    animate()

    // Handle resize
    this._resizeObserver = new ResizeObserver(() => {
      const newWidth = container.clientWidth
      const newHeight = Math.min(400, newWidth * 0.6)
      this._camera.aspect = newWidth / newHeight
      this._camera.updateProjectionMatrix()
      this._renderer.setSize(newWidth, newHeight)
    })
    this._resizeObserver.observe(container)
  }

  /**
   * Build the stadium 3D model
   * @param {THREE.Scene} scene
   */
  _buildStadium (scene) {
    const fieldWidth = 50  // X axis (goal to goal)
    const fieldDepth = 30  // Z axis (sideline to sideline)
    const standGap = 2     // Gap between field and stands

    // Get seat counts
    const northSeats = this.stadium.north_stand_size || 0
    const southSeats = this.stadium.south_stand_size || 0
    const eastSeats = this.stadium.east_stand_size || 0
    const westSeats = this.stadium.west_stand_size || 0

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(250, 250)
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x3d5c3d })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.1
    ground.receiveShadow = true
    scene.add(ground)

    // Get team color (default to red if not set)
    const teamColor = this.team.color || '#FF0000'

    // Field (green grass)
    this._createField(scene, fieldWidth, fieldDepth, teamColor)

    // North stand (back, -Z) - faces towards +Z (towards field)
    this._createStand(scene, {
      width: fieldWidth + 6,
      seats: northSeats,
      x: 0,
      z: -fieldDepth / 2 - standGap,
      rotation: Math.PI,  // rotated to face the field
      hasRoof: this.stadium.north_stand_roof
    })

    // South stand (front, +Z) - faces towards -Z (towards field)
    this._createStand(scene, {
      width: fieldWidth + 6,
      seats: southSeats,
      x: 0,
      z: fieldDepth / 2 + standGap,
      rotation: 0,  // faces the field
      hasRoof: this.stadium.south_stand_roof
    })

    // West stand (left, -X) - faces towards +X (towards field)
    this._createStand(scene, {
      width: fieldDepth + 6,
      seats: westSeats,
      x: -fieldWidth / 2 - standGap,
      z: 0,
      rotation: -Math.PI / 2,  // rotated to face the field
      hasRoof: this.stadium.west_stand_roof
    })

    // East stand (right, +X) - faces towards -X (towards field)
    this._createStand(scene, {
      width: fieldDepth + 6,
      seats: eastSeats,
      x: fieldWidth / 2 + standGap,
      z: 0,
      rotation: Math.PI / 2,  // rotated to face the field
      hasRoof: this.stadium.east_stand_roof
    })
  }

  /**
   * Create the football field
   * @param {THREE.Scene} scene
   * @param {number} width
   * @param {number} depth
   * @param {string} teamColor
   */
  _createField (scene, width, depth, teamColor) {
    // Main grass
    const fieldGeo = new THREE.PlaneGeometry(width, depth)
    const fieldMat = new THREE.MeshLambertMaterial({ color: 0x2e8b2e })
    const field = new THREE.Mesh(fieldGeo, fieldMat)
    field.rotation.x = -Math.PI / 2
    field.position.y = 0.01
    field.receiveShadow = true
    scene.add(field)

    // Grass stripes
    const stripeCount = 8
    const stripeWidth = depth / stripeCount
    for (let i = 0; i < stripeCount; i += 2) {
      const stripeGeo = new THREE.PlaneGeometry(width, stripeWidth)
      const stripeMat = new THREE.MeshLambertMaterial({ color: 0x35a535 })
      const stripe = new THREE.Mesh(stripeGeo, stripeMat)
      stripe.rotation.x = -Math.PI / 2
      stripe.position.y = 0.02
      stripe.position.z = -depth / 2 + stripeWidth / 2 + i * stripeWidth
      stripe.receiveShadow = true
      scene.add(stripe)
    }

    // Field lines
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff })

    // Outline
    const outlinePoints = [
      new THREE.Vector3(-width / 2, 0.03, -depth / 2),
      new THREE.Vector3(width / 2, 0.03, -depth / 2),
      new THREE.Vector3(width / 2, 0.03, depth / 2),
      new THREE.Vector3(-width / 2, 0.03, depth / 2),
      new THREE.Vector3(-width / 2, 0.03, -depth / 2)
    ]
    const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePoints)
    scene.add(new THREE.Line(outlineGeo, lineMaterial))

    // Center line
    const centerLinePoints = [
      new THREE.Vector3(0, 0.03, -depth / 2),
      new THREE.Vector3(0, 0.03, depth / 2)
    ]
    const centerLineGeo = new THREE.BufferGeometry().setFromPoints(centerLinePoints)
    scene.add(new THREE.Line(centerLineGeo, lineMaterial))

    // Center circle
    const circleGeo = new THREE.RingGeometry(4.9, 5, 32)
    const circleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    const circle = new THREE.Mesh(circleGeo, circleMat)
    circle.rotation.x = -Math.PI / 2
    circle.position.y = 0.03
    scene.add(circle)

    // Goals
    this._createGoal(scene, -width / 2, 0)
    this._createGoal(scene, width / 2)

    // Corner flags
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
   * Create a corner flag with pole
   * @param {THREE.Scene} scene
   * @param {number} x
   * @param {number} z
   * @param {string} color
   */
  _createFlag (scene, x, z, color) {
    const poleHeight = 2.5
    const flagWidth = 1.5
    const flagHeight = 1.0

    // Flag pole
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, poleHeight, 8)
    const poleMat = new THREE.MeshLambertMaterial({ color: 0xffffff })
    const pole = new THREE.Mesh(poleGeo, poleMat)
    pole.position.set(x, poleHeight / 2, z)
    scene.add(pole)

    // Flag (plane with segments for wave animation)
    const flagGeo = new THREE.PlaneGeometry(flagWidth, flagHeight, 10, 5)
    const flagMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color),
      side: THREE.DoubleSide
    })
    const flag = new THREE.Mesh(flagGeo, flagMat)

    // Position flag at top of pole
    flag.position.set(x + flagWidth / 2, poleHeight - flagHeight / 2, z)

    // Store original positions for animation
    const positionAttr = flagGeo.getAttribute('position')
    const originalPositions = new Float32Array(positionAttr.array.length)
    originalPositions.set(positionAttr.array)
    flag.userData.originalPositions = originalPositions

    scene.add(flag)
    this._flags.push(flag)
  }

  /**
   * Create a floodlight tower
   * @param {THREE.Scene} scene
   * @param {number} x
   * @param {number} z
   */
  _createFloodlightTower (scene, x, z) {
    const towerHeight = 45
    const towerWidth = 1.5

    // Tower structure - light gray metal
    const towerMat = new THREE.MeshLambertMaterial({ color: 0xcccccc })

    // Main vertical pole
    const poleSections = 4
    for (let i = 0; i < poleSections; i++) {
      const sectionHeight = towerHeight / poleSections
      const sectionWidth = towerWidth * (1 - i * 0.15)  // Slightly narrower at top

      const poleGeo = new THREE.BoxGeometry(sectionWidth, sectionHeight, sectionWidth)
      const pole = new THREE.Mesh(poleGeo, towerMat)
      pole.position.set(x, sectionHeight / 2 + i * sectionHeight, z)
      scene.add(pole)
    }

    // Platform at top
    const platformGeo = new THREE.BoxGeometry(1, 1, 1)
    const platform = new THREE.Mesh(platformGeo, towerMat)
    platform.castShadow = false
    platform.position.set(x, towerHeight, z)
    scene.add(platform)

    // Spotlight housing (6 visual fixtures in 2 rows of 3)
    const spotlightMat = new THREE.MeshLambertMaterial({ color: 0x222222 })
    const spotlightLensMat = new THREE.MeshBasicMaterial({ color: 0xffffcc })  // Glowing lens

    // Calculate direction to field center
    const dirToCenter = new THREE.Vector3(-x, -towerHeight + 5, -z).normalize()

    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        // Spotlight housing
        const housingGeo = new THREE.BoxGeometry(1, 0.8, 1.2)
        const housing = new THREE.Mesh(housingGeo, spotlightMat)

        const offsetX = (col - 1) * 1.4
        const offsetY = towerHeight + 1 + row * 1.4
        const offsetZ = 0

        // Position relative to tower
        housing.position.set(x + offsetX, offsetY, z + offsetZ)

        // Rotate housing to point towards field
        housing.lookAt(0, 0, 0)
        scene.add(housing)

        // Glowing lens on front of housing
        const lensGeo = new THREE.CircleGeometry(0.35, 16)
        const lens = new THREE.Mesh(lensGeo, spotlightLensMat)
        lens.position.set(x + offsetX, offsetY, z + offsetZ)
        lens.lookAt(0, 0, 0)
        // Move lens slightly forward
        lens.position.add(dirToCenter.clone().multiplyScalar(0.65))
        scene.add(lens)
      }
    }

    // TODO: Flutlichtmasten sollten kleiner sein, für kleine Stadien

    // TODO: kleine Tribünen-Größen sind falsch --> 1000 sieht aus wie 100

    // Single main spotlight per tower (not one per fixture)
    // Using wider angle and PointLight for better coverage
    // moonLight.position.set(30, 100, 30)
    const mainLight = new THREE.SpotLight(0xfff5e6, 350, 150, Math.PI / 3, 0.6, 1.5)
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
   * Create a goal
   * @param {THREE.Scene} scene
   * @param {number} x
   */
  _createGoal (scene, x) {
    const goalMat = new THREE.MeshLambertMaterial({ color: 0xffffff })
    const postRadius = 0.15
    const goalWidth = 4
    const goalHeight = 1.5

    // Posts
    const postGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalHeight, 8)
    const leftPost = new THREE.Mesh(postGeo, goalMat)
    leftPost.position.set(x, goalHeight / 2, -goalWidth / 2)
    scene.add(leftPost)

    const rightPost = new THREE.Mesh(postGeo, goalMat)
    rightPost.position.set(x, goalHeight / 2, goalWidth / 2)
    scene.add(rightPost)

    // Crossbar
    const crossbarGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalWidth, 8)
    const crossbar = new THREE.Mesh(crossbarGeo, goalMat)
    crossbar.rotation.x = Math.PI / 2
    crossbar.position.set(x, goalHeight, 0)
    scene.add(crossbar)
  }

  /**
   * Create a stand/tribune with ascending rows
   * @param {THREE.Scene} scene
   * @param {Object} config
   */
  _createStand (scene, config) {
    const { width, seats, x, z, rotation, hasRoof } = config
    const group = new THREE.Group()

    // Calculate number of rows based on actual seat count
    // Each seat takes ~0.5m width, so seats per row = width / 0.5
    const seatWidth = 0.5
    const seatsPerRow = Math.floor(width / seatWidth)
    const numRows = Math.max(3, Math.ceil(seats / seatsPerRow) / 5)

    const rowDepth = 1.0   // depth per row (meters)
    const rowHeight = 0.5  // height increase per row (meters)
    const actualDepth = numRows * rowDepth
    const actualHeight = numRows * rowHeight

    // Concrete base/foundation under the stand
    const baseGeo = new THREE.BoxGeometry(width + 2, 0.5, actualDepth + 1)
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x505050 })
    const base = new THREE.Mesh(baseGeo, baseMat)
    base.position.y = 0.25
    base.position.z = actualDepth / 2
    base.castShadow = true
    base.receiveShadow = true
    group.add(base)

    // Create ascending rows (like stairs)
    for (let row = 0; row < numRows; row++) {
      const rowY = 0.5 + row * rowHeight
      const rowZ = row * rowDepth

      // Step/platform for this row
      const stepGeo = new THREE.BoxGeometry(width, rowHeight, rowDepth)
      const stepMat = new THREE.MeshLambertMaterial({ color: 0x909090 })
      const step = new THREE.Mesh(stepGeo, stepMat)
      step.position.y = rowY + rowHeight / 2
      step.position.z = rowZ + rowDepth / 2
      step.castShadow = true
      step.receiveShadow = true
      group.add(step)

      // Seats on this row - use seatWidth for consistent calculation
      for (let s = 0; s < seatsPerRow; s++) {
        // Random crowd colors
        const colorChoice = Math.random()
        let seatColor
        if (colorChoice < 0.35) seatColor = 0xe74c3c       // red
        else if (colorChoice < 0.70) seatColor = 0x3498db  // blue
        else if (colorChoice < 0.85) seatColor = 0xf39c12  // orange
        else if (colorChoice < 0.95) seatColor = 0x27ae60  // green
        else seatColor = 0xf1c40f                          // yellow

        const seatGeo = new THREE.BoxGeometry(seatWidth * 0.8, 0.4, rowDepth * 0.6)
        const seatMat = new THREE.MeshLambertMaterial({ color: seatColor })
        const seat = new THREE.Mesh(seatGeo, seatMat)
        seat.position.x = -width / 2 + seatWidth / 2 + s * seatWidth
        seat.position.y = rowY + rowHeight + 0.2
        seat.position.z = rowZ + rowDepth * 0.35
        group.add(seat)
      }
    }

    // Back wall (behind the top row)
    const backWallHeight = actualHeight + 2
    const backWallGeo = new THREE.BoxGeometry(width + 2, backWallHeight, 0.5)
    const backWallMat = new THREE.MeshLambertMaterial({ color: 0x606060 })
    const backWall = new THREE.Mesh(backWallGeo, backWallMat)
    backWall.position.y = backWallHeight / 2
    backWall.position.z = actualDepth + 0.25
    backWall.castShadow = true
    group.add(backWall)

    // Side walls (trapezoidal shape to match ascending rows)
    const extrudeSettings = { depth: 0.5, bevelEnabled: false }

    // Right wall shape - slope rises from front (0) to back (actualDepth)
    const rightWallShape = new THREE.Shape()
    rightWallShape.moveTo(0, 0)                          // front bottom
    rightWallShape.lineTo(actualDepth, 0)                // back bottom
    rightWallShape.lineTo(actualDepth, actualHeight + 2) // back top
    rightWallShape.lineTo(0, 1.5)                        // front top
    rightWallShape.closePath()

    // Right wall
    const rightWallGeo = new THREE.ExtrudeGeometry(rightWallShape, extrudeSettings)
    const rightWall = new THREE.Mesh(rightWallGeo, backWallMat)
    rightWall.rotation.y = Math.PI * 1.5
    rightWall.position.set(width / 2 + 1, 0, 0)
    group.add(rightWall)

    // Left wall - create using BufferGeometry for precise control
    const leftWallVertices = new Float32Array([
      // Front face (trapezoid facing +X, towards the stand)
      0, 0, 0,                        // 0: front bottom outer
      0, 0, 0.5,                      // 1: front bottom inner
      0, 1.5, 0,                      // 2: front top outer
      0, 1.5, 0.5,                    // 3: front top inner
      actualDepth, 0, 0,              // 4: back bottom outer
      actualDepth, 0, 0.5,            // 5: back bottom inner
      actualDepth, actualHeight + 2, 0,    // 6: back top outer
      actualDepth, actualHeight + 2, 0.5   // 7: back top inner
    ])

    const leftWallIndices = [
      // Outer face (facing away from stand, -Z)
      0, 4, 2,  2, 4, 6,
      // Inner face (facing stand, +Z)
      1, 3, 5,  3, 7, 5,
      // Top face (sloped)
      2, 6, 3,  3, 6, 7,
      // Bottom face
      0, 1, 4,  1, 5, 4,
      // Front face (near field)
      0, 2, 1,  1, 2, 3,
      // Back face (away from field)
      4, 5, 6,  5, 7, 6
    ]

    const leftWallGeo = new THREE.BufferGeometry()
    leftWallGeo.setAttribute('position', new THREE.BufferAttribute(leftWallVertices, 3))
    leftWallGeo.setIndex(leftWallIndices)
    leftWallGeo.computeVertexNormals()

    const leftWall = new THREE.Mesh(leftWallGeo, backWallMat)
    leftWall.rotation.y = Math.PI * 1.5
    leftWall.position.set(-width / 2 - 1, 0, 0)
    group.add(leftWall)

    // Roof if enabled
    if (hasRoof) {
      const roofY = actualHeight + 3
      const pillarZ = actualDepth - 1
      const pillarTopY = roofY + 4  // Pillars extend above roof
      const pillarHeight = pillarTopY + 0.5  // Total height from ground

      // Angled roof canopy
      const roofGeo = new THREE.BoxGeometry(width + 4, 0.3, actualDepth + 3)
      const roofMat = new THREE.MeshLambertMaterial({ color: 0xe6e6e6, transparent: true, opacity: 0.8 })
      const roof = new THREE.Mesh(roofGeo, roofMat)
      roof.position.y = roofY
      roof.position.z = actualDepth / 2
      roof.rotation.x = -0.05
      roof.castShadow = true
      group.add(roof)

      // Roof support pillars - tall enough to go through the roof
      const supportGeo = new THREE.CylinderGeometry(0.4, 0.4, pillarHeight, 8)
      const supportMat = new THREE.MeshLambertMaterial({ color: 0x444444 })

      // Pillar positions (x coordinates)
      const pillarPositions = [-width / 2 + 3, 0, width / 2 - 3]

      // Cable/rope material
      const cableMat = new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 3 })

      pillarPositions.forEach(pillarX => {
        // Create pillar
        const support = new THREE.Mesh(supportGeo, supportMat)
        support.position.set(pillarX, pillarHeight / 2, pillarZ)
        support.castShadow = true
        group.add(support)

        // Create cable from pillar top to front of roof
        const cablePoints = [
          new THREE.Vector3(pillarX, pillarTopY, pillarZ),
          new THREE.Vector3(pillarX, roofY + 0.2, pillarZ / 1.5)
        ]
        const cableGeo = new THREE.BufferGeometry().setFromPoints(cablePoints)
        const cable = new THREE.Line(cableGeo, cableMat)
        group.add(cable)

        // Add a small sphere at the top of each pillar
        const topCapGeo = new THREE.SphereGeometry(0.5, 8, 8)
        const topCap = new THREE.Mesh(topCapGeo, supportMat)
        topCap.position.set(pillarX, pillarTopY, pillarZ)
        group.add(topCap)
      })
    }

    group.position.set(x, 0, z)
    group.rotation.y = rotation
    scene.add(group)
  }

}

/**
 * @returns {Promise<string>}
 */
export async function renderStadiumPage () {
  return new StadiumPage().toString()
}
