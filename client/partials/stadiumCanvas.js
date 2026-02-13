import { UIElement } from '../lib/UIElement.js'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/**
 * Reusable stadium 3D canvas component
 */
export class StadiumCanvas extends UIElement {
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
    this._flags = []
    this._animationTime = 0
  }

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
   * Initialize Three.js scene
   */
  _initThreeJS () {
    const canvas = document.querySelector(`${this._elementQuery} #${this.canvasId}`)
    if (!canvas) return

    const container = canvas.parentElement
    const width = container.clientWidth
    const height = Math.min(600, width * 0.9)

    this._scene = new THREE.Scene()
    this._scene.background = new THREE.Color(0x0a0a1a)

    this._camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    this._camera.position.set(80, 100, 80)
    this._camera.lookAt(0, 0, 0)

    this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this._renderer.setSize(width, height)
    this._renderer.setPixelRatio(window.devicePixelRatio)
    this._renderer.shadowMap.enabled = true
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this._controls = new OrbitControls(this._camera, this._renderer.domElement)
    this._controls.enableDamping = true
    this._controls.dampingFactor = 0.05
    this._controls.maxPolarAngle = Math.PI / 2.2
    this._controls.minDistance = 50
    this._controls.maxDistance = 150

    const ambientLight = new THREE.AmbientLight(0x404060, 0.5)
    this._scene.add(ambientLight)

    const moonLight = new THREE.DirectionalLight(0x6688cc, 0.5)
    moonLight.position.set(30, 100, 30)
    this._scene.add(moonLight)

    this._buildStadium(this._scene)

    this._createFloodlightTower(this._scene, -33, -23)
    this._createFloodlightTower(this._scene, 33, -23)
    this._createFloodlightTower(this._scene, -33, 23)
    this._createFloodlightTower(this._scene, 33, 23)

    const animate = () => {
      if (!this._controls || !this._renderer) return
      this._animationFrameId = requestAnimationFrame(animate)
      this._controls.update()

      this._animationTime += 0.05
      this._flags.forEach(flag => {
        const positionAttr = flag.geometry.getAttribute('position')
        const originalPositions = flag.userData.originalPositions

        for (let i = 0; i < positionAttr.count; i++) {
          const x = originalPositions[i * 3]
          const y = originalPositions[i * 3 + 1]
          const z = originalPositions[i * 3 + 2]

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

    this._resizeObserver = new ResizeObserver(() => {
      if (!this._camera || !this._renderer) return
      const newWidth = container.clientWidth
      const newHeight = Math.min(600, newWidth * 0.9)
      this._camera.aspect = newWidth / newHeight
      this._camera.updateProjectionMatrix()
      this._renderer.setSize(newWidth, newHeight)
    })
    this._resizeObserver.observe(container)
  }

  /**
   * @param {THREE.Scene} scene
   */
  _buildStadium (scene) {
    const fieldWidth = 50
    const fieldDepth = 30
    const standGap = 2

    const northSeats = this.stadium.north_stand_size || 0
    const southSeats = this.stadium.south_stand_size || 0
    const eastSeats = this.stadium.east_stand_size || 0
    const westSeats = this.stadium.west_stand_size || 0

    const groundGeo = new THREE.PlaneGeometry(250, 250)
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x3d5c3d })
    const ground = new THREE.Mesh(groundGeo, groundMat)
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
   * @param {THREE.Scene} scene
   * @param {number} width
   * @param {number} depth
   * @param {string} teamColor
   */
  _createField (scene, width, depth, teamColor) {
    const fieldGeo = new THREE.PlaneGeometry(width, depth)
    const fieldMat = new THREE.MeshLambertMaterial({ color: 0x2e8b2e })
    const field = new THREE.Mesh(fieldGeo, fieldMat)
    field.rotation.x = -Math.PI / 2
    field.position.y = 0.01
    field.receiveShadow = true
    scene.add(field)

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

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff })

    const outlinePoints = [
      new THREE.Vector3(-width / 2, 0.03, -depth / 2),
      new THREE.Vector3(width / 2, 0.03, -depth / 2),
      new THREE.Vector3(width / 2, 0.03, depth / 2),
      new THREE.Vector3(-width / 2, 0.03, depth / 2),
      new THREE.Vector3(-width / 2, 0.03, -depth / 2)
    ]
    const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePoints)
    scene.add(new THREE.Line(outlineGeo, lineMaterial))

    const centerLinePoints = [
      new THREE.Vector3(0, 0.03, -depth / 2),
      new THREE.Vector3(0, 0.03, depth / 2)
    ]
    const centerLineGeo = new THREE.BufferGeometry().setFromPoints(centerLinePoints)
    scene.add(new THREE.Line(centerLineGeo, lineMaterial))

    const circleGeo = new THREE.RingGeometry(4.9, 5, 32)
    const circleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    const circle = new THREE.Mesh(circleGeo, circleMat)
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

    const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, poleHeight, 8)
    const poleMat = new THREE.MeshLambertMaterial({ color: 0xffffff })
    const pole = new THREE.Mesh(poleGeo, poleMat)
    pole.position.set(x, poleHeight / 2, z)
    scene.add(pole)

    const flagGeo = new THREE.PlaneGeometry(flagWidth, flagHeight, 10, 5)
    const flagMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color),
      side: THREE.DoubleSide
    })
    const flag = new THREE.Mesh(flagGeo, flagMat)

    flag.position.set(x + flagWidth / 2, poleHeight - flagHeight / 2, z)

    const positionAttr = flagGeo.getAttribute('position')
    const originalPositions = new Float32Array(positionAttr.array.length)
    originalPositions.set(positionAttr.array)
    flag.userData.originalPositions = originalPositions

    scene.add(flag)
    this._flags.push(flag)
  }

  /**
   * @param {THREE.Scene} scene
   * @param {number} x
   * @param {number} z
   */
  _createFloodlightTower (scene, x, z) {
    const towerHeight = 45
    const towerWidth = 1.5

    const towerMat = new THREE.MeshLambertMaterial({ color: 0xcccccc })

    const poleSections = 4
    for (let i = 0; i < poleSections; i++) {
      const sectionHeight = towerHeight / poleSections
      const sectionWidth = towerWidth * (1 - i * 0.15)

      const poleGeo = new THREE.BoxGeometry(sectionWidth, sectionHeight, sectionWidth)
      const pole = new THREE.Mesh(poleGeo, towerMat)
      pole.position.set(x, sectionHeight / 2 + i * sectionHeight, z)
      scene.add(pole)
    }

    const platformGeo = new THREE.BoxGeometry(1, 1, 1)
    const platform = new THREE.Mesh(platformGeo, towerMat)
    platform.castShadow = false
    platform.position.set(x, towerHeight, z)
    scene.add(platform)

    const spotlightMat = new THREE.MeshLambertMaterial({ color: 0x222222 })
    const spotlightLensMat = new THREE.MeshBasicMaterial({ color: 0xffffcc })

    const dirToCenter = new THREE.Vector3(-x, -towerHeight + 5, -z).normalize()

    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const housingGeo = new THREE.BoxGeometry(1, 0.8, 1.2)
        const housing = new THREE.Mesh(housingGeo, spotlightMat)

        const offsetX = (col - 1) * 1.4
        const offsetY = towerHeight + 1 + row * 1.4

        housing.position.set(x + offsetX, offsetY, z)
        housing.lookAt(0, 0, 0)
        scene.add(housing)

        const lensGeo = new THREE.CircleGeometry(0.35, 16)
        const lens = new THREE.Mesh(lensGeo, spotlightLensMat)
        lens.position.set(x + offsetX, offsetY, z)
        lens.lookAt(0, 0, 0)
        lens.position.add(dirToCenter.clone().multiplyScalar(0.65))
        scene.add(lens)
      }
    }

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
   * @param {THREE.Scene} scene
   * @param {number} x
   */
  _createGoal (scene, x) {
    const goalMat = new THREE.MeshLambertMaterial({ color: 0xffffff })
    const postRadius = 0.15
    const goalWidth = 4
    const goalHeight = 1.5

    const postGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalHeight, 8)
    const leftPost = new THREE.Mesh(postGeo, goalMat)
    leftPost.position.set(x, goalHeight / 2, -goalWidth / 2)
    scene.add(leftPost)

    const rightPost = new THREE.Mesh(postGeo, goalMat)
    rightPost.position.set(x, goalHeight / 2, goalWidth / 2)
    scene.add(rightPost)

    const crossbarGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalWidth, 8)
    const crossbar = new THREE.Mesh(crossbarGeo, goalMat)
    crossbar.rotation.x = Math.PI / 2
    crossbar.position.set(x, goalHeight, 0)
    scene.add(crossbar)
  }

  /**
   * @param {THREE.Scene} scene
   * @param {Object} config
   */
  _createStand (scene, config) {
    const { width, seats, x, z, rotation, hasRoof, position } = config
    const group = new THREE.Group()

    const seatWidth = 0.5
    const seatsPerRow = Math.floor(width / seatWidth)

    const minSize = 200
    const maxSize = (position === 'east' || position === 'west') ? 15000 : 30000
    const divider = 1 + Math.min(1, (seats - minSize) / (maxSize - minSize)) * 4
    const numRows = Math.max(3, Math.ceil(seats / seatsPerRow) / divider)

    const rowDepth = 1.0
    const rowHeight = 0.5
    const actualDepth = numRows * rowDepth
    const actualHeight = numRows * rowHeight

    const baseGeo = new THREE.BoxGeometry(width + 2, 0.5, actualDepth + 1)
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x505050 })
    const base = new THREE.Mesh(baseGeo, baseMat)
    base.position.y = 0.25
    base.position.z = actualDepth / 2
    base.castShadow = true
    base.receiveShadow = true
    group.add(base)

    const stepGeo = new THREE.BoxGeometry(width, rowHeight, rowDepth)
    const stepMat = new THREE.MeshLambertMaterial({ color: 0x909090 })
    const stepInstancedMesh = new THREE.InstancedMesh(stepGeo, stepMat, numRows)
    stepInstancedMesh.castShadow = true
    stepInstancedMesh.receiveShadow = true

    const stepMatrix = new THREE.Matrix4()
    for (let row = 0; row < numRows; row++) {
      const rowY = 0.5 + row * rowHeight
      const rowZ = row * rowDepth
      stepMatrix.setPosition(0, rowY + rowHeight / 2, rowZ + rowDepth / 2)
      stepInstancedMesh.setMatrixAt(row, stepMatrix)
    }
    stepInstancedMesh.instanceMatrix.needsUpdate = true
    group.add(stepInstancedMesh)

    const seatColors = [
      { color: 0xe74c3c, threshold: 0.35 },
      { color: 0x3498db, threshold: 0.70 },
      { color: 0xf39c12, threshold: 0.85 },
      { color: 0x27ae60, threshold: 0.95 },
      { color: 0xf1c40f, threshold: 1.0 }
    ]

    const seatsByColor = new Map()
    seatColors.forEach(c => seatsByColor.set(c.color, []))

    for (let row = 0; row < numRows; row++) {
      const rowY = 0.5 + row * rowHeight
      const rowZ = row * rowDepth

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
          y: rowY + rowHeight + 0.2,
          z: rowZ + rowDepth * 0.35
        })
      }
    }

    const seatGeo = new THREE.BoxGeometry(seatWidth * 0.8, 0.4, rowDepth * 0.6)
    const seatMatrix = new THREE.Matrix4()

    for (const [color, positions] of seatsByColor) {
      if (positions.length === 0) continue

      const seatMat = new THREE.MeshLambertMaterial({ color })
      const instancedSeats = new THREE.InstancedMesh(seatGeo, seatMat, positions.length)

      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i]
        seatMatrix.setPosition(pos.x, pos.y, pos.z)
        instancedSeats.setMatrixAt(i, seatMatrix)
      }
      instancedSeats.instanceMatrix.needsUpdate = true
      group.add(instancedSeats)
    }

    const backWallHeight = actualHeight + 2
    const backWallGeo = new THREE.BoxGeometry(width + 2, backWallHeight, 0.5)
    const backWallMat = new THREE.MeshLambertMaterial({ color: 0x606060 })
    const backWall = new THREE.Mesh(backWallGeo, backWallMat)
    backWall.position.y = backWallHeight / 2
    backWall.position.z = actualDepth + 0.25
    backWall.castShadow = true
    group.add(backWall)

    const extrudeSettings = { depth: 0.5, bevelEnabled: false }

    const rightWallShape = new THREE.Shape()
    rightWallShape.moveTo(0, 0)
    rightWallShape.lineTo(actualDepth, 0)
    rightWallShape.lineTo(actualDepth, actualHeight + 2)
    rightWallShape.lineTo(0, 1.5)
    rightWallShape.closePath()

    const rightWallGeo = new THREE.ExtrudeGeometry(rightWallShape, extrudeSettings)
    const rightWall = new THREE.Mesh(rightWallGeo, backWallMat)
    rightWall.rotation.y = Math.PI * 1.5
    rightWall.position.set(width / 2 + 1, 0, 0)
    group.add(rightWall)

    const leftWallVertices = new Float32Array([
      0, 0, 0,
      0, 0, 0.5,
      0, 1.5, 0,
      0, 1.5, 0.5,
      actualDepth, 0, 0,
      actualDepth, 0, 0.5,
      actualDepth, actualHeight + 2, 0,
      actualDepth, actualHeight + 2, 0.5
    ])

    const leftWallIndices = [
      0, 4, 2, 2, 4, 6,
      1, 3, 5, 3, 7, 5,
      2, 6, 3, 3, 6, 7,
      0, 1, 4, 1, 5, 4,
      0, 2, 1, 1, 2, 3,
      4, 5, 6, 5, 7, 6
    ]

    const leftWallGeo = new THREE.BufferGeometry()
    leftWallGeo.setAttribute('position', new THREE.BufferAttribute(leftWallVertices, 3))
    leftWallGeo.setIndex(leftWallIndices)
    leftWallGeo.computeVertexNormals()

    const leftWall = new THREE.Mesh(leftWallGeo, backWallMat)
    leftWall.rotation.y = Math.PI * 1.5
    leftWall.position.set(-width / 2 - 1, 0, 0)
    group.add(leftWall)

    if (hasRoof) {
      const roofY = actualHeight + 3
      const pillarZ = actualDepth - 1
      const pillarTopY = roofY + 4
      const pillarHeight = pillarTopY + 0.5

      const roofGeo = new THREE.BoxGeometry(width + 4, 0.3, actualDepth + 3)
      const roofMat = new THREE.MeshLambertMaterial({
        color: 0xe6e6e6,
        transparent: true,
        opacity: 0.8
      })
      const roof = new THREE.Mesh(roofGeo, roofMat)
      roof.position.y = roofY
      roof.position.z = actualDepth / 2
      roof.rotation.x = -0.05
      roof.castShadow = true
      group.add(roof)

      const supportGeo = new THREE.CylinderGeometry(0.4, 0.4, pillarHeight, 8)
      const supportMat = new THREE.MeshLambertMaterial({ color: 0x444444 })

      const pillarPositions = [-width / 2 + 3, 0, width / 2 - 3]

      const cableMat = new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 3 })

      pillarPositions.forEach(pillarX => {
        const support = new THREE.Mesh(supportGeo, supportMat)
        support.position.set(pillarX, pillarHeight / 2, pillarZ)
        support.castShadow = true
        group.add(support)

        const cablePoints = [
          new THREE.Vector3(pillarX, pillarTopY, pillarZ),
          new THREE.Vector3(pillarX, roofY + 0.2, pillarZ / 1.5)
        ]
        const cableGeo = new THREE.BufferGeometry().setFromPoints(cablePoints)
        const cable = new THREE.Line(cableGeo, cableMat)
        group.add(cable)

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
