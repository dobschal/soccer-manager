import {UIElement} from '../lib/UIElement.js'
import {el} from '../lib/html.js'
import {t} from '../i18n/index.js'
import {
  buildFitnessStudio,
  buildMedicalPractice,
  buildTrainingArea,
  buildYouthAcademy,
  buildingSnapshotView,
  clubBuildingPlot,
  clubBuildingPlots
} from './clubBuildingsScene.js'
import {buildTraffic} from './trafficScene.js'
import {renderEmblem} from './emblem.js'
import {emblemTexture} from '../util/emblemRaster.js'
import {stillDataUrl} from '../util/renderStill.js'

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
export const CONFIG = Object.freeze({
  field: {width: 50, depth: 30},
  // Gap between the field and every stand. At >= 4 the wide north/south stands
  // just clear the east/west stands at the corners (they overlap below that).
  standGap: 4,
  // The ground plane reaches far past the stadium so the surroundings run all
  // the way out to the horizon. Its edge never shows: distance fog (see
  // `colors.fog*`) blends it into the night sky well before it.
  groundSize: 750,
  // Stand seating tiers. Large stands split into a lower and an upper tier with
  // a cantilevered overhang between them.
  stand: {
    // Rows at/above which a stand gets an upper tier. On the row count (not
    // seats) so it triggers at the same physical depth for any stand width —
    // ~10k seats on a wide end stand, ~5k on a narrow side stand.
    twoTierRowThreshold: 34,
    lowerTierFraction: 2 / 3, // share of rows (≈ seats) in the lower tier
    lowerRowHeight: 0.5, // vertical rise per row, lower tier
    upperRowHeight: 0.7, // steeper rise per row, upper tier
    overhangClearance: 3, // vertical gap: lower-tier top → upper deck underside
    overhangCoverFraction: 0.4, // how far the deck cantilevers over the lower tier
    // The wall closing the back of a stand. It grows *outward* from the point the
    // entrances are placed at, so anything mounted on it (the emblem signs) has
    // to clear this much or it ends up inside the wall.
    backWallThickness: 0.5
  },
  // Players' tunnel cut into the front-centre of the north stand.
  tunnel: {
    width: 3, // clear width of the passage
    height: 2, // clear height (to the ceiling underside)
    protrude: 1, // how far the mouth sticks forward (stays within the field-side gap)
    depth: 2, // reach into the stand — kept shallow so the flat ceiling clears the rising steps
    wallThickness: 0.3,
    wallColor: 0x3a3a3a,
    lightColor: 0xfff2cc,
    lightIntensity: 10,
    lightRange: 12
  },
  // Substitute benches (dugouts) flanking the tunnel in front of the north
  // stand: light-grey seats (same geometry as the stands) on a grey base.
  bench: {
    seatCount: 7, // seats per bench
    gap: 1.2, // gap between the tunnel wall and a bench
    z: -2, // z of the benches (field-side perimeter gap; more negative = toward the field)
    baseHeight: 0.5,
    baseDepth: 1.0,
    baseColor: 0x808080,
    seatColor: 0xcccccc
  },
  // Corner stands filling the four 90° corners between the main stands. A
  // triangular fan: narrow at the front apex (the field corner), each row wider
  // than the one below so it fills the wedge. Depth scales with the neighbours.
  cornerStand: {
    gap: -0.5, // apex offset from the perimeter corner; negative pulls it toward the field
    // Backstop against an absurd fan; sized so it never bites inside the
    // buildable corner range (max 4,000 seats ≈ 43 rows, see `_cornerRowCount`).
    maxRows: 50,
    // Row width = (2r+1) * fanSlope. 1.0 exactly fills a 90° corner (width grows
    // at twice the depth); lower values make a narrower fan. The per-row rise is
    // derived from this so the rake matches the neighbours at the seams.
    fanSlope: 1.0
  },
  // Floodlight towers sit just beyond each corner stand; this is how far past
  // the corner stand's back the mast stands.
  floodlightMargin: 8,
  // Pedestrian surroundings: a sidewalk running just inside the road ring,
  // stadium entrances behind each main stand, and footpaths joining them — all
  // lined with street lamps.
  sidewalk: {width: 3, color: 0x9a9a9a, y: 0.03, lampSpacing: 20},
  footpath: {width: 2.5, color: 0x9a9a9a, y: 0.03, lampSpacing: 10, underStand: 6},
  // A pole with a frosted glass globe on top. The globe is there round the clock
  // — only the glowing core inside it switches off by day, so the pole never ends
  // in mid-air.
  streetLamp: {
    height: 4,
    poleColor: 0x2a2a2a,
    lightColor: 0xffdd88,
    globeColor: 0xd8dde2,
    globeRadius: 0.34,
    globeOpacity: 0.45
  },
  // Entrances behind the main stands (tunnel-like: two walls, a roof, a light).
  // North/south get 3 each, east/west 2 each.
  entrance: {
    width: 5,
    height: 3.5,
    depth: 3,
    wallThickness: 0.3,
    wallColor: 0x3a3a3a,
    lightColor: 0xfff2cc,
    endStandCount: 3, // north / south
    sideStandCount: 2 // east / west
  },
  // The club emblem on the stand's back wall above every entrance, lit by two
  // small lamps on short arms above it. The emblem hangs on a transparent panel
  // (its own outline, no plate) and is self-lit; the lamps are dummies — emissive
  // lenses in little housings. Ten entrances with two real spotlights each would
  // be twenty extra lights for one sign.
  emblemSign: {
    maxSize: 2.4,
    minSize: 1, // below this the stand's back is too low to carry one
    gapAboveEntrance: 0.35,
    gapBelowTop: 0.35,
    textureSize: 256,
    lamp: {
      arm: 0.5, // how far the lamp reaches out from the wall
      housing: 0.26,
      lensRadius: 0.09,
      spread: 0.34, // sideways offset from the plate's centre, in plate widths
      color: 0xfff2cc
    }
  },
  // Roads around the stadium: a grid of four roads (behind each stand) that
  // cross at four intersections and continue outward to the edge of the ground
  // plane, where the trees on the horizon swallow them. Dashed white centre
  // markings on each road.
  road: {
    width: 7,
    // Extra clearance kept beyond the deepest stand; the grid is square, so it
    // always uses the deepest stand on any side. `minDistance` keeps it clear
    // of the floodlight towers for very small stadiums.
    margin: 10,
    minDistance: 42,
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
    areaMargin: 7, // trees keep this far inside the ground plane's edge
    spacing: 14, // grid cell size
    jitter: 5, // max per-axis random offset within a cell
    roadClearance: 4, // keep this far from the road edges
    // Only trees this close to the stadium take part in the shadow passes. The
    // floodlight shadow cameras reach 150 units, so nothing beyond could cast
    // into them anyway — but an InstancedMesh is culled as a whole, so without
    // the split every distant tree would still be re-rendered per shadow map.
    shadowRadius: 200,
    minScale: 0.7,
    maxScale: 1.7,
    coneChance: 0.5, // share of cone-shaped (vs. round) foliage
    trunkColor: 0x6b4a2f,
    greens: [0x2e6b2e, 0x357a35, 0x40923f, 0x4fa74f, 0x2f5d33, 0x5bb35b, 0x3c7d3c]
  },
  // A late evening sun, low in the west and just about to set. It warms every
  // west-facing surface and only grazes the ground, so the scene reads as dusk
  // instead of deep night without ever outshining the floodlights.
  // `position` is where the light comes *from* (it always aims at the origin);
  // its height above the horizon works out at roughly 15°. `intensity` is the
  // knob for how much the whole scene brightens up.
  // Four times of day the scene can be lit in. The scene is built once and then
  // repainted: sun (colour, strength, where it stands), fill lighting, sky dome
  // stops, fog, and whether the floodlights and street lamps burn. `hours` is the
  // half-open range of the local clock the phase covers, used to pick the one
  // that matches the player's own time when the canvas opens.
  //
  // The sun always comes *from* `position` and aims at the camera's focus, so its
  // x sign is what puts dusk in the west and dawn in the east.
  daylight: {
    order: ['dawn', 'day', 'dusk', 'night'],
    phases: {
      dawn: {
        hours: [5, 9],
        sun: {color: 0xffb37a, intensity: 1.1, position: [380, 120, 150]},
        fill: {ambient: 0.85, moon: 0.5},
        sky: {zenith: 0x2b2a5c, horizonWarm: 0xc4714f, horizonCool: 0x35406e},
        fog: 0x4a3a52,
        background: 0x2b2a5c,
        floodlights: true
      },
      day: {
        hours: [9, 18],
        sun: {color: 0xfff4e2, intensity: 2.4, position: [-210, 430, -160]},
        fill: {ambient: 1, moon: 0.2},
        sky: {zenith: 0x2f6fc4, horizonWarm: 0xcfe2f5, horizonCool: 0xa9c8ea},
        fog: 0xb8cfe6,
        background: 0x2f6fc4,
        floodlights: false
      },
      dusk: {
        hours: [18, 22],
        sun: {color: 0xff9a4d, intensity: 1, position: [-380, 110, -140]},
        fill: {ambient: 0.8, moon: 0.65},
        sky: {zenith: 0x171334, horizonWarm: 0x9c5233, horizonCool: 0x2a2350},
        fog: 0x3a2b45,
        background: 0x171334,
        floodlights: true
      },
      night: {
        // Wraps past midnight, so its range is read as "everything else".
        hours: [22, 5],
        sun: {color: 0x6f7cb8, intensity: 0.12, position: [-300, 260, -220]},
        fill: {ambient: 0.5, moon: 0.75},
        sky: {zenith: 0x080a1c, horizonWarm: 0x1b2144, horizonCool: 0x11142e},
        fog: 0x11142c,
        background: 0x080a1c,
        floodlights: true
      }
    }
  },
  sun: {
    color: 0xff9a4d,
    intensity: 1,
    position: [-380, 110, -140],
    // The long shadows the low sun throws. Its shadow camera is orthographic and
    // follows the camera's focus point, so the map's texels are spent on what is
    // actually on screen (`radius` around the focus) instead of on the whole
    // ground plane. Set `castShadow: false` to drop the extra pass entirely.
    castShadow: true,
    shadow: {
      // Half-extent of the shadowed area around the focus point. Generous on
      // purpose: at 15° a 40-unit mast throws a ~150-unit shadow, and a box that
      // only covered the stadium itself would cut those tails off in mid-air.
      // The price is texel density — 2 * 260 / 2048 ≈ 0.25 units per texel.
      radius: 260,
      mapSize: 2048,
      // At ~15° above the horizon the light grazes the pitch and the ground,
      // which is where shadow acne shows first. `normalBias` (in world units,
      // so roughly one shadow texel) is the effective knob at this angle; raise
      // it if stripes of acne appear, lower it if shadows detach from their
      // objects.
      bias: -0.0005,
      normalBias: 0.35
    }
  },
  // The sunset sky, painted as a vertical gradient onto a dome around the whole
  // scene: the warm band the sun leaves behind in the west, the cool sky
  // opposite it, and the deep dusk violet overhead. `radius` sits well outside
  // anything else but inside the camera's far plane.
  sky: {
    zenith: 0x171334,
    horizonWarm: 0x9c5233,
    horizonCool: 0x2a2350,
    radius: 1000,
    // Enough segments that the gradient interpolates smoothly across the faces
    // — the colour changes fastest right at the horizon.
    segments: 48,
    // How tightly the horizon band hugs the ground (lower = tighter) and how
    // narrowly the warm part clings to the sun's azimuth (higher = narrower).
    bandExponent: 0.55,
    sunFocus: 1.5
  },
  // `near` is deliberately far from the usual 0.1: the roads run out to the far
  // edge of the ground plane, and at that range a near plane of 0.1 leaves so
  // little depth precision that the centre markings z-fight with the asphalt
  // they lie on. The camera never gets closer than `controls.minDistance` to
  // its target, so 1 clips nothing.
  camera: {fov: 45, near: 1, far: 2500, position: [80, 100, 80]},
  controls: {
    dampingFactor: 0.05,
    maxPolarAngle: Math.PI / 2.2,
    minDistance: 50,
    maxDistance: 150,
    // Degrees per second when `autoRotate` is on — a slow orbit that takes
    // roughly a minute for a full turn around the stadium.
    autoRotateSpeed: 0.7
  },
  // The same scene serves both the stadium page and the buildings page — only
  // the point the camera orbits differs: the pitch centre vs. the road
  // intersection north-east of the stadium the club buildings sit around.
  views: {
    stadium: {cameraOffset: [80, 100, 80], minDistance: 50, maxDistance: 150},
    // Far enough out that all three plots around the crossing fit in frame.
    buildings: {cameraOffset: [88, 92, 88], minDistance: 40, maxDistance: 240}
  },
  // Fill lighting the whole scene floats on, on top of the sun and the
  // floodlights: `ambient` lifts every surface evenly (it is what keeps the
  // shadowed sides and the far corners readable), `moon` is the soft directional
  // from above. Both are the knobs for "the scene is too dark / too washed out".
  fill: {ambient: 0.8, moon: 0.65},
  colors: {
    // Fallback behind the sky dome, so it matches the dome's darkest part.
    sceneBackground: 0x171334,
    ground: 0x3d5c3d,
    // The kept lawn on the club's own land — a touch greener than the plain
    // ground around it (see `_buildLawn`).
    lawn: 0x4a7d3c,
    ambientLight: 0x404060,
    moonLight: 0x6688cc,
    // Distance fog in a dusk tone between the sky's warm and cool horizon:
    // everything far out (the ground's edge, the last trees, the roads running
    // off) dissolves into the sunset haze instead of ending on a hard line.
    // `fogNear` stays clear of the stadium itself, which the camera never orbits
    // further than ~250 units from.
    fog: 0x3a2b45,
    fogNear: 300,
    fogFar: 640
  },
  // The lusher lawn under the stadium and the club's plots. It lies between the
  // plain ground (-0.1) and everything built on top (roads at 0): 0.04 is far
  // more than the depth buffer needs at this range, and still under the kerbs.
  lawn: {y: -0.06, plotMargin: 3},
  // Canvas height is derived from width, capped so it never gets too tall.
  maxCanvasHeight: 600,
  canvasAspectFactor: 0.9,
  // Stills cropped out of the scene (`captureBuilding`): big enough for a card
  // image on a retina display, `samples` is the render target's multisampling —
  // the still gets the same smooth edges as the canvas.
  snapshot: {width: 720, height: 450, samples: 4},
  // Radians added to _animationTime per frame.
  animationSpeed: 0.05
})

/**
 * The daylight phase a given local time falls into.
 *
 * Pure lookup over `CONFIG.daylight.phases[*].hours`, so the choice can be
 * checked without a scene. A range whose end wraps past midnight (night) is read
 * as "from `start` until `end` the next morning".
 * @param {Date} [date] defaults to now
 * @returns {string} phase name, one of `CONFIG.daylight.order`
 */
export function daylightPhaseFor (date = new Date()) {
  const hour = date.getHours()
  for (const [name, phase] of Object.entries(CONFIG.daylight.phases)) {
    const [from, to] = phase.hours
    const inRange = from < to
      ? hour >= from && hour < to
      : hour >= from || hour < to
    if (inRange) return name
  }
  return 'dusk'
}

/**
 * Colour of the sunset sky in one direction.
 *
 * Two blends: horizontally between the warm band the sun leaves behind and the
 * cool sky opposite it, then from that horizon colour up to the zenith. Pure
 * maths on plain `[r, g, b]` triples, so the gradient can be checked without a
 * WebGL context — the caller supplies the palette already converted into the
 * renderer's working colour space.
 * @param {{x: number, y: number, z: number}} direction unit vector to look along
 * @param {{x: number, z: number}} sunAzimuth the sun's horizontal direction (unit)
 * @param {{zenith: number[], horizonWarm: number[], horizonCool: number[], bandExponent: number, sunFocus: number}} palette
 * @returns {number[]} `[r, g, b]`
 */
export function skyColor (direction, sunAzimuth, palette) {
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

  // Only the horizontal part of the direction decides how close to the sun we
  // are looking; straight up it does not matter, the zenith blend takes over.
  const horizontal = Math.hypot(direction.x, direction.z) || 1
  const towardSun = (
    (direction.x / horizontal) * sunAzimuth.x + (direction.z / horizontal) * sunAzimuth.z + 1
  ) / 2
  const horizon = mix(
    palette.horizonCool, palette.horizonWarm, towardSun ** palette.sunFocus
  )
  const up = Math.min(1, Math.max(0, direction.y) ** palette.bandExponent)
  return mix(horizon, palette.zenith, up)
}

/**
 * The builder per club building type. A type without one gets no geometry (and no
 * sidewalk) rather than breaking the scene.
 * @type {Readonly<Object<string, Function>>}
 */
const BUILDING_BUILDERS = Object.freeze({
  training_area: buildTrainingArea,
  fitness_studio: buildFitnessStudio,
  youth_academy: buildYouthAcademy,
  medical_practice: buildMedicalPractice
})

/**
 * Seed of the random generator each building is scattered with — one per type, so
 * what lies on a training pitch does not shift around because the team happens to
 * own a gym as well.
 * @type {Readonly<Object<string, number>>}
 */
const BUILDING_SEEDS = Object.freeze({
  training_area: 0x5bf03635,
  fitness_studio: 0x2f9a11c7,
  youth_academy: 0x77b1e4d3,
  medical_practice: 0x3ac57f19
})

/**
 * Give one object's GPU resources back: its geometry, its material(s) and every
 * texture hanging off them. Written to be handed straight to `Object3D.traverse`,
 * both for tearing the whole scene down and for dropping a single group again
 * (the temporary build behind `captureBuilding`).
 * @param {Object} object
 */
function disposeObject3D (object) {
  if (object.geometry) object.geometry.dispose()
  if (!object.material) return

  const materials = Array.isArray(object.material) ? object.material : [object.material]
  const maps = [
    'map', 'lightMap', 'bumpMap', 'normalMap', 'specularMap', 'envMap', 'alphaMap',
    'aoMap', 'displacementMap', 'emissiveMap', 'gradientMap', 'metalnessMap', 'roughnessMap'
  ]
  for (const material of materials) {
    for (const name of maps) {
      if (material[name]) material[name].dispose()
    }
    material.dispose()
  }
}

/**
 * Reusable stadium 3D canvas component
 */
export class StadiumCanvas extends UIElement {
  /**
   * @param {StadiumType} stadium
   * @param {TeamType} team
   * @param {string} [canvasId]
   * @param {{interactive?: boolean, autoRotate?: boolean, controlsToggle?: boolean, showConstruction?: boolean, buildings?: Array<{type: string, level: number}>, focus?: 'stadium'|'buildings'}} [options] -
   *   `interactive: false` locks the camera against user input, `autoRotate: true`
   *   slowly orbits it around the stadium, `controlsToggle: true` adds a button
   *   in the canvas corner that switches between the two. The defaults give a
   *   hand-controlled, static camera without a button.
   *   `showConstruction: false` renders every stand as finished — for the expand
   *   preview, which shows a *planned* stadium where the construction fields
   *   carried over from the current stadium row are meaningless.
   *   `buildings` are the team's club buildings; they are rendered around the
   *   road intersection north-east of the stadium. `focus: 'buildings'` points
   *   the camera at that intersection instead of at the pitch.
   */
  constructor (stadium, team, canvasId = 'stadium-canvas', options = {}) {
    super()
    this.stadium = stadium
    this.team = team
    this.canvasId = canvasId
    this.options = options
    this._interactive = options.interactive !== false
    // Whatever it is where the player is right now — the slider only moves it
    // from there.
    this._phase = CONFIG.daylight.phases[options.daylight]
      ? options.daylight
      : daylightPhaseFor()
    // Resolved once the scene stands (or is known never to), so a page can wait
    // for it before asking for stills — see `whenReady`.
    this._ready = new Promise(resolve => { this._markReady = resolve })
  }

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div>
        <div class="stadium-wrapper ${this._interactive ? 'stadium-wrapper-interactive' : ''}">
          <canvas id="${this.canvasId}"></canvas>
          ${this.options.controlsToggle ? this._renderControlsToggle() : ''}
        </div>
        ${this.options.daylightControl ? this._renderDaylightControl() : ''}
      </div>
    `
  }

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '(optional) .stadium-controls-toggle': {
        click: () => this._toggleInteractive()
      },
      '(optional) .stadium-daylight__slider': {
        input: (event) => this._setPhase(CONFIG.daylight.order[Number(event.target.value)])
      }
    }
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
      this._scene.traverse(disposeObject3D)
      this._scene = null
    }

    if (this._renderer) {
      this._renderer.dispose()
      this._renderer = null
    }

    this._camera = null
    this._updaters = []
    this._buildingGroups = {}
    this._animationTime = 0
    this._threeJSInitialized = false
    // Nothing to wait for any more — a page still holding the promise gets its
    // answer instead of hanging on it.
    this._markReady(false)
  }

  /**
   * Whether the 3D scene is up. Resolves `true` once the scene is built and the
   * render loop runs, `false` if it never will — no canvas in the DOM, no WebGL
   * context, or the component was destroyed first. Never rejects, so a caller can
   * simply `if (!await canvas.whenReady()) return`.
   * @returns {Promise<boolean>}
   */
  whenReady () {
    return this._ready
  }

  // --- component state ---
  _animationTime = 0

  /** Whether the user currently steers the camera (vs. auto-rotation). */
  _interactive = true

  /**
   * Guards against a second `_initThreeJS()` run on the same canvas: the page
   * may call `onMounted()` by hand while the mount observer fires as well, and
   * two WebGL contexts on one canvas element break the render loop.
   */
  _threeJSInitialized = false

  // Per-frame update callbacks: (time: number) => void.

  // Register animated objects here instead of editing the render loop.
  _updaters = []

  /**
   * The group each club building was built into, by type — kept so a single
   * building can be hidden and stood in for while `captureBuilding` photographs
   * another level of it.
   * @type {Object<string, Object>}
   */
  _buildingGroups = {}

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
    const names = [
      'north', 'south', 'east', 'west',
      'corner_ne', 'corner_nw', 'corner_se', 'corner_sw'
    ]
    return names.reduce(
      (total, name) => total + (this.stadium[name + '_stand_size'] || 0),
      0
    )
  }

  /**
   * Whether a stand is currently being rebuilt. The stadium row carries
   * `<stand>_construction_end_game_day` for as long as the build runs (the size
   * and roof columns still hold the *old* values until it completes), so a
   * building site can be rendered straight off the stadium data.
   *
   * A stand under construction is shown as a bare shell: steps, walls and
   * foundation only — no seats and no roof (see `_createStand`).
   * @param {string} name stand key, e.g. 'north' or 'corner_ne'
   * @returns {boolean}
   */
  _isStandUnderConstruction (name) {
    if (this.options.showConstruction === false) return false
    return this.stadium[`${name}_construction_end_game_day`] != null
  }

  /**
   * The roof a stand actually shows: the stored flag, minus any stand that is
   * currently being rebuilt (its roof comes off for the duration). Used for the
   * stand itself and for everything derived from the roofs — the roof-mounted
   * floodlights and the corner masts that replace them.
   * @param {string} name stand key, e.g. 'north' or 'corner_ne'
   * @returns {boolean}
   */
  _standHasRoof (name) {
    return !!this.stadium[`${name}_stand_roof`] && !this._isStandUnderConstruction(name)
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
    return {width, height}
  }

  /**
   * Initialize Three.js scene: bootstrap the library, build the scene graph
   * and start the render loop. The individual concerns are delegated to the
   * `_setup*` / `_build*` helpers below.
   */
  async _initThreeJS () {
    if (this._threeJSInitialized) return
    const [THREE, {OrbitControls}] = await Promise.all([
      import('three'),
      import('three/addons/controls/OrbitControls.js')
    ])
    this._THREE = THREE
    this._OrbitControls = OrbitControls

    const canvas = document.querySelector(`${this._elementQuery} #${this.canvasId}`)
    if (!canvas) {
      // Not a failure — just too early. A parent page calls `onMounted()` on us
      // by hand the moment *it* mounts, but as a nested UIElement our own markup
      // is still a placeholder for another frame or two. Our mount observer
      // fires `onMounted()` again once the canvas really is there.
      //
      // Resolving `_ready` here would settle it `false` for good, and the
      // buildings page would keep its painted fallbacks even though the scene
      // comes up seconds later (#547). Leave the promise pending instead;
      // `onDestroy` settles it if the scene never arrives.
      return
    }
    // Re-check after the awaits above: a concurrent call may have won the race
    // while we were loading Three.js.
    if (this._threeJSInitialized) return
    this._threeJSInitialized = true

    const container = canvas.parentElement

    try {
      this._setupScene(canvas, container)
    } catch (error) {
      // Creating the WebGL context can fail outright (hardware acceleration
      // disabled, a sandboxed/headless GPU, an ancient browser). Three.js
      // throws from the WebGLRenderer constructor — swallow it, swap the canvas
      // for a short note and bail so the rest of the page keeps working.
      console.warn('Stadium 3D view unavailable — WebGL context could not be created:', error)
      this._showWebGLFallback(canvas)
      this._markReady(false)
      return
    }
    this._setupLights()

    this._buildStadium(this._scene)
    this._buildLawn(this._scene)
    this._buildFloodlights(this._scene)
    this._buildRoads(this._scene)
    this._buildTraffic(this._scene)
    this._buildSidewalks(this._scene)
    this._buildEntrances(this._scene)
    this._buildClubBuildings(this._scene)
    this._buildTrees(this._scene)
    // Everything is in place — now light it for the time of day.
    this._applyPhase()

    this._startRenderLoop()
    this._observeResize(container)
    this._markReady(true)
  }

  /**
   * Create the scene, camera, renderer and orbit controls.
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} container
   */
  _setupScene (canvas, container) {
    const THREE = this._THREE
    const {width, height} = this._canvasSize(container)
    const view = this._view()
    const focus = this._focusPoint()

    this._scene = new THREE.Scene()
    const palette = this._palette()
    this._scene.background = new THREE.Color(palette.background)
    this._scene.fog = new THREE.Fog(palette.fog, CONFIG.colors.fogNear, CONFIG.colors.fogFar)
    this._createSky(this._scene)

    this._camera = new THREE.PerspectiveCamera(
      CONFIG.camera.fov, width / height, CONFIG.camera.near, CONFIG.camera.far
    )
    this._camera.position.set(
      focus.x + view.cameraOffset[0],
      view.cameraOffset[1],
      focus.z + view.cameraOffset[2]
    )
    this._camera.lookAt(focus.x, 0, focus.z)

    this._renderer = new THREE.WebGLRenderer({canvas, antialias: true})
    this._renderer.setSize(width, height)
    this._renderer.setPixelRatio(window.devicePixelRatio)
    this._renderer.shadowMap.enabled = true
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this._controls = new this._OrbitControls(this._camera, this._renderer.domElement)
    this._controls.enableDamping = true
    this._controls.dampingFactor = CONFIG.controls.dampingFactor
    this._controls.maxPolarAngle = CONFIG.controls.maxPolarAngle
    this._controls.minDistance = view.minDistance
    this._controls.maxDistance = view.maxDistance
    this._controls.autoRotateSpeed = CONFIG.controls.autoRotateSpeed
    // Both the manual orbit and the auto-rotation revolve around this point.
    this._controls.target?.set?.(focus.x, 0, focus.z)
    this._applyInteractiveState()
  }

  /**
   * Camera/controls preset for the requested view ('stadium' by default).
   * @returns {{cameraOffset: number[], minDistance: number, maxDistance: number}}
   */
  _view () {
    return CONFIG.views[this.options.focus] || CONFIG.views.stadium
  }

  /**
   * World position of the road intersection north-east of the stadium (+x / -z).
   * The club buildings are laid out around it.
   * @returns {{x: number, z: number}}
   */
  _intersection () {
    const distance = this._roadDistance()
    return {x: distance, z: -distance}
  }

  /**
   * The point the camera orbits: the pitch centre on the stadium view, the
   * buildings' intersection on the buildings view.
   * @returns {{x: number, z: number}}
   */
  _focusPoint () {
    return this.options.focus === 'buildings' ? this._intersection() : {x: 0, z: 0}
  }

  /**
   * Plots of the club buildings this team owns, around the NE intersection.
   * Each sits half a road plus a sidewalk away from the crossing's centre
   * lines, so its boundary lands exactly on the sidewalk's kerb.
   * @returns {Array<{type: string, level: number, cx: number, cz: number, halfX: number, halfZ: number, qx: number, qz: number}>}
   */
  _buildingPlots () {
    return clubBuildingPlots(
      this.options.buildings,
      this._intersection(),
      this._plotClearance()
    )
  }

  /**
   * Gap from a road's centre line to the plot edge beside it: half a road plus
   * the sidewalk, so a plot's boundary lands on the kerb.
   * @returns {number}
   */
  _plotClearance () {
    return CONFIG.road.width / 2 + CONFIG.sidewalk.width
  }

  /**
   * Half-extent of the ground plane. It normally uses the fixed
   * `CONFIG.groundSize`, but grows when a building plot (which sits outside the
   * road grid, and moves further out the bigger the stadium is) would otherwise
   * hang over the edge into the void.
   * @returns {number}
   */
  _groundHalf () {
    const reach = this._buildingPlots().reduce(
      (max, p) => Math.max(max, Math.abs(p.cx) + p.halfX, Math.abs(p.cz) + p.halfZ),
      0
    )
    return Math.max(CONFIG.groundSize / 2, reach + 25)
  }

  /**
   * Render every club building the team owns onto its plot, each with a
   * lamp-lined sidewalk along the two roads it borders. All three have 3D
   * geometry; a type without a builder simply gets no geometry and no sidewalk.
   * @param {THREE.Scene} scene
   */
  _buildClubBuildings (scene) {
    this._buildingGroups = {}
    for (const plot of this._buildingPlots()) {
      const built = this._buildClubBuilding(scene, plot)
      if (!built) continue
      this._buildingGroups[plot.type] = built.group
      this._addBuildingSidewalks(scene, plot, built.openings)
      // A builder with something moving on its plot (the ambulance's beacon)
      // hands back an updater. Only the buildings that actually stand in the
      // scene get theirs registered — the throwaway builds behind
      // `captureBuilding` must not leak one into the render loop.
      if (built.update) this._addUpdater(built.update)
    }
  }

  /**
   * One club building on its plot, at whichever level the plot says. Everything
   * scattered about (training kit, cones, gym equipment) comes out of a generator
   * seeded per building type, so a building always looks the same no matter which
   * others the team owns — and a rebuild at another level (`captureBuilding`)
   * matches the one standing in the scene.
   * @param {THREE.Scene} scene
   * @param {{type: string, level: number, cx: number, cz: number}} plot
   * @returns {{group: Object, openings: Array<{x: number, z: number, width: number}>}|null}
   *   `null` for a type without a builder
   */
  _buildClubBuilding (scene, plot) {
    const build = BUILDING_BUILDERS[plot.type]
    if (!build) return null
    return build(this._THREE, scene, {
      level: plot.level,
      rand: this._seededRandom(BUILDING_SEEDS[plot.type]),
      x: plot.cx,
      z: plot.cz,
      sidewalkWidth: CONFIG.sidewalk.width,
      // For the academy's facade: the club's own emblem, with the team colour
      // behind it for the generic crest that stands in while it rasterises.
      teamColor: this.team.color,
      emblemSvg: this.team.name ? renderEmblem(this.team, 512) : undefined
    })
  }

  /**
   * A still of one club building, cropped out of this very scene — the image the
   * buildings page puts on that building's card, so the card and the animation
   * above it always show the same club.
   *
   * Anything the scene is not already showing — another level (the preview of
   * what an upgrade would look like) or a building the team has not built at all
   * yet — is built on the spot, photographed and taken down again.
   * @param {string} type building type, e.g. `youth_academy`
   * @param {{level?: number, width?: number, height?: number, view?: {x: number, y: number, z: number, radius: number, elevation: number}}} [options]
   *   `level` defaults to the one the team has, `view` overrides the building's
   *   portrait framing (see `BUILDING_BACKDROP_VIEWS`).
   * @returns {string|null} a JPEG data URL, or `null` when there is no scene, no
   *   such building or no 2D canvas to encode with
   */
  captureBuilding (type, {level, width = CONFIG.snapshot.width, height = CONFIG.snapshot.height, view} = {}) {
    if (!this._renderer || !this._scene) return null
    const wanted = Math.max(1, Math.min(3, level || 1))
    // An unbuilt building has no plot in the scene, but its plot is still where it
    // would go — that is what its portrait on the buildings page shows.
    const plot = this._buildingPlots().find(p => p.type === type) ||
      clubBuildingPlot(type, wanted, this._intersection(), this._plotClearance())
    if (!plot) return null

    const standing = this._buildingGroups[type]
    let preview = null
    if (!standing || wanted !== plot.level) {
      preview = this._buildClubBuilding(this._scene, {...plot, level: wanted})?.group || null
      if (preview) {
        if (standing) standing.visible = false
        // The fresh geometry knows nothing of the time of day yet — its lamps and
        // lenses have to be switched like everything else in the scene.
        this._setNightLightsOn(this._palette().floodlights)
      }
    }

    try {
      return this._renderStill(
        buildingSnapshotView(plot, {aspect: width / height, fov: CONFIG.camera.fov, view}),
        width,
        height
      )
    } finally {
      if (preview) {
        this._scene.remove(preview)
        preview.traverse(disposeObject3D)
        if (standing) standing.visible = true
      }
    }
  }

  /**
   * One frame of the scene from a camera of its own, read back as a data URL.
   * Goes through an off-screen render target rather than the visible canvas, so
   * nothing flickers and the still can have its own size and aspect ratio.
   * @param {{position: {x: number, y: number, z: number}, target: {x: number, y: number, z: number}, fov: number}} view
   * @param {number} width
   * @param {number} height
   * @returns {string|null}
   */
  _renderStill (view, width, height) {
    const THREE = this._THREE
    const camera = new THREE.PerspectiveCamera(
      view.fov, width / height, CONFIG.camera.near, CONFIG.camera.far
    )
    camera.position.set(view.position.x, view.position.y, view.position.z)
    camera.lookAt(view.target.x, view.target.y, view.target.z)

    const target = new THREE.WebGLRenderTarget(width, height, {samples: CONFIG.snapshot.samples})
    const pixels = new Uint8Array(width * height * 4)
    try {
      this._renderer.setRenderTarget(target)
      this._renderer.render(this._scene, camera)
      // Back to the canvas *before* reading: that is what resolves the render
      // target's multisampling into the buffer `readRenderTargetPixels` reads.
      this._renderer.setRenderTarget(null)
      this._renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels)
    } finally {
      target.dispose()
    }
    return stillDataUrl(pixels, width, height)
  }

  /**
   * The kept lawn: a greener patch of ground everywhere the club's own land is —
   * the square inside and under the ring roads (the stadium sits on it) and one
   * patch per building plot, each reaching out under its sidewalk to the kerb.
   * Everything built on top (roads, sidewalks, pitches, car parks) covers it
   * where it should, so this only shows in the gaps between them.
   * @param {THREE.Scene} scene
   */
  _buildLawn (scene) {
    const L = CONFIG.lawn
    const mat = new this._THREE.MeshLambertMaterial({color: CONFIG.colors.lawn})

    // Out to the far kerb of the ring roads, so the roads sit on lawn rather
    // than on a seam.
    const reach = this._roadDistance() + CONFIG.road.width / 2
    this._addPavement(scene, 2 * reach, 2 * reach, 0, 0, mat, L.y)

    for (const plot of this._buildingPlots()) {
      this._addPavement(
        scene,
        2 * (plot.halfX + L.plotMargin),
        2 * (plot.halfZ + L.plotMargin),
        plot.cx,
        plot.cz,
        mat,
        L.y
      )
    }
  }

  /**
   * Cars driving on the road grid, animated from the render loop. Deterministic
   * (seeded), so the traffic looks the same every time the scene is built.
   * @param {THREE.Scene} scene
   */
  _buildTraffic (scene) {
    const traffic = buildTraffic(this._THREE, scene, {
      distance: this._roadDistance(),
      roadWidth: CONFIG.road.width,
      rand: this._seededRandom(0x1d3f5a97)
    })
    if (traffic) this._addUpdater(time => traffic.update(time))
  }

  /**
   * The sidewalk along the two sides of a plot that face a road — an L running
   * around the crossing-facing corner, lined with the same street lamps as the
   * stadium's own sidewalk. The plot boundary (for the training ground: its
   * fence) sits directly on the kerb, so no connecting path is needed.
   * @param {THREE.Scene} scene
   * @param {{cx: number, cz: number, halfX: number, halfZ: number, qx: number, qz: number}} plot
   * @param {Array<{x: number, z: number, width: number}>} [openings] plot-local
   *   openings (gate, driveway) to keep the lamps clear of
   */
  _addBuildingSidewalks (scene, plot, openings = []) {
    const sw = CONFIG.sidewalk.width
    const mat = new this._THREE.MeshLambertMaterial({color: CONFIG.sidewalk.color})
    // Centre lines of the two strips, just outside the plot's road-facing sides.
    const stripX = plot.cx - plot.qx * (plot.halfX + sw / 2)
    const stripZ = plot.cz - plot.qz * (plot.halfZ + sw / 2)
    // A plot pushed out of the crossing's corner (the medical practice, west of
    // the gym) only borders a road on one of the two sides.
    const sides = plot.roadSides || {x: true, z: true}

    // With both strips there, the x-running one is extended by the sidewalk width
    // so the two meet in a filled corner instead of leaving a notch.
    if (sides.z) {
      const extra = sides.x ? sw : 0
      this._addPavement(
        scene, 2 * plot.halfX + extra, sw, plot.cx - plot.qx * extra / 2, stripZ, mat,
        CONFIG.sidewalk.y
      )
    }
    if (sides.x) {
      this._addPavement(scene, sw, 2 * plot.halfZ, stripX, plot.cz, mat, CONFIG.sidewalk.y)
    }

    const placed = []
    const addLamp = (x, z) => {
      // Never in front of the gate or the driveway, and never twice in the
      // shared corner.
      const blocked = openings.some(o =>
        Math.hypot(x - (plot.cx + o.x), z - (plot.cz + o.z)) < o.width)
      if (blocked) return
      if (placed.some(p => Math.hypot(p.x - x, p.z - z) < CONFIG.sidewalk.width * 2)) return
      placed.push({x, z})
      this._createStreetLamp(scene, x, z)
    }

    const spacing = CONFIG.sidewalk.lampSpacing
    if (sides.z) {
      const alongX = Math.max(1, Math.round(2 * plot.halfX / spacing))
      for (let i = 0; i <= alongX; i++) {
        addLamp(plot.cx - plot.halfX + (i / alongX) * 2 * plot.halfX, stripZ)
      }
    }
    if (sides.x) {
      const alongZ = Math.max(1, Math.round(2 * plot.halfZ / spacing))
      for (let i = 0; i <= alongZ; i++) {
        addLamp(stripX, plot.cz - plot.halfZ + (i / alongZ) * 2 * plot.halfZ)
      }
    }
  }

  /**
   * Replace the unusable canvas with a short note when a WebGL context can't be
   * created. Keeps the surrounding page intact instead of letting the thrown
   * renderer error bubble up and break the whole route.
   * @param {HTMLCanvasElement} canvas
   */
  _showWebGLFallback (canvas) {
    if (!canvas || !canvas.parentElement) return
    const fallback = document.createElement('div')
    fallback.className = 'stadium-webgl-fallback'
    fallback.textContent = t('stadium.webglUnavailable')
    canvas.replaceWith(fallback)
  }

  /**
   * Push the current interactive/auto-rotate state onto the controls.
   * `enabled: false` only detaches the pointer/wheel handlers — `update()` keeps
   * applying the auto-rotation, so a locked camera can still orbit on its own.
   *
   * OrbitControls forces `touch-action: none` (inline) on the canvas so its own
   * gestures work; that also blocks page scrolling. When the controls are off we
   * restore `touch-action: pan-y` so a vertical swipe on the canvas scrolls the
   * page again.
   */
  _applyInteractiveState () {
    if (!this._controls) return
    this._controls.enabled = this._interactive
    this._controls.autoRotate = !this._interactive && this.options.autoRotate === true

    const dom = this._controls.domElement
    if (dom && dom.style) dom.style.touchAction = this._interactive ? 'none' : 'pan-y'
  }

  /**
   * The daylight slider under the canvas: four steps from dawn to night, starting
   * on whatever matches the player's own clock.
   * @returns {string}
   */
  _renderDaylightControl () {
    const {order} = CONFIG.daylight
    return `
      <div class="stadium-daylight">
        <label class="stadium-daylight__label" for="${this.canvasId}-daylight">
          <span class="stadium-daylight__caption">${t('stadium.daylight')}</span>
          <span class="stadium-daylight__value">${t('stadium.daylight.' + this._phase)}</span>
        </label>
        <input type="range" class="form-range stadium-daylight__slider"
               id="${this.canvasId}-daylight"
               min="0" max="${order.length - 1}" step="1"
               value="${order.indexOf(this._phase)}"
               aria-label="${t('stadium.daylight')}">
      </div>
    `
  }

  /**
   * Light the scene for a phase: sun, fill, sky, fog and whether the floodlights
   * burn. Everything is repainted in place — rebuilding the stadium for a slider
   * nudge would be absurd — and the label under the slider follows along without
   * re-rendering the component (which would drop the WebGL context).
   * @param {string} phase one of `CONFIG.daylight.order`
   */
  _setPhase (phase) {
    if (!CONFIG.daylight.phases[phase]) return
    this._phase = phase
    this._applyPhase()

    const label = el(`#${this.canvasId}-daylight`)?.closest('.stadium-daylight')
      ?.querySelector('.stadium-daylight__value')
    if (label) label.textContent = t('stadium.daylight.' + phase)
  }

  /**
   * @returns {Object} the current phase's palette
   */
  _palette () {
    return CONFIG.daylight.phases[this._phase] || CONFIG.daylight.phases.dusk
  }

  /**
   * Push the current phase onto the scene. Safe to call before the scene exists.
   */
  _applyPhase () {
    if (!this._scene) return
    const palette = this._palette()

    this._ambientLight.intensity = palette.fill.ambient
    this._moonLight.intensity = palette.fill.moon
    this._sunLight.color.set(palette.sun.color)
    this._sunLight.intensity = palette.sun.intensity
    this._aimSun()

    this._scene.background.set(palette.background)
    this._scene.fog.color.set(palette.fog)
    this._paintSky()
    this._setNightLightsOn(palette.floodlights)
  }

  /**
   * Stand the sun where the phase wants it, relative to what the camera orbits,
   * and re-fit its shadow camera to that distance.
   */
  _aimSun () {
    const [sx, sy, sz] = this._palette().sun.position
    const focus = this._focusPoint()
    this._sunLight.position.set(focus.x + sx, sy, focus.z + sz)
    this._sunLight.target.position.set(focus.x, 0, focus.z)
    if (this._sunLight.castShadow) this._fitSunShadow(Math.hypot(sx, sy, sz))
  }

  /**
   * Floodlights, street lamps and every lamp lens that only makes sense after
   * dark. Switching the spotlights off by day also drops their shadow passes.
   * @param {boolean} on
   */
  _setNightLightsOn (on) {
    this._scene.traverse(object => {
      if (object.type === 'SpotLight' || object.userData?.nightOnly) {
        object.visible = on
      }
    })
  }

  /**
   * @returns {string}
   */
  _renderControlsToggle () {
    const title = this._interactive ? t('stadium.autoRotateCamera') : t('stadium.controlCamera')
    return `
      <button type="button"
              class="stadium-controls-toggle"
              aria-pressed="${this._interactive}"
              aria-label="${title}"
              title="${title}">
        <i class="fa ${this._interactive ? 'fa-repeat' : 'fa-hand-paper-o'}" aria-hidden="true"></i>
      </button>
    `
  }

  /**
   * Hand the camera over to the user (or back to the auto-rotation). Only the
   * button and the wrapper class are touched — re-rendering the element would
   * replace the canvas and with it the live WebGL context.
   */
  _toggleInteractive () {
    this._interactive = !this._interactive
    this._applyInteractiveState()

    const root = el(this._elementQuery)
    if (root) root.classList.toggle('stadium-wrapper-interactive', this._interactive)

    const button = el(`${this._elementQuery} .stadium-controls-toggle`)
    if (!button) return
    const title = this._interactive ? t('stadium.autoRotateCamera') : t('stadium.controlCamera')
    button.setAttribute('aria-pressed', String(this._interactive))
    button.setAttribute('aria-label', title)
    button.setAttribute('title', title)
    const icon = button.querySelector('i')
    if (icon) icon.className = `fa ${this._interactive ? 'fa-repeat' : 'fa-hand-paper-o'}`
  }

  /**
   * The sky: a dome around the whole scene, its vertices coloured by
   * `skyColor()` so it fades from the warm sunset band in the west up into the
   * dusk violet overhead. It is excluded from the fog (it sits far beyond
   * `fogFar`, which would otherwise flatten it into one colour) and writes no
   * depth, so everything else draws in front of it.
   * @param {THREE.Scene} scene
   */
  _createSky (scene) {
    const THREE = this._THREE
    const S = CONFIG.sky

    const geometry = new THREE.SphereGeometry(S.radius, S.segments, S.segments / 2)
    // Kept as fields rather than read back off the mesh: the colours are
    // rewritten on every phase change, and this is the whole state that needs.
    this._skyPositions = geometry.attributes.position
    this._skyColors = new THREE.BufferAttribute(
      new Float32Array(this._skyPositions.count * 3), 3
    )
    geometry.setAttribute('color', this._skyColors)

    this._sky = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false
    }))
    this._sky.frustumCulled = false
    scene.add(this._sky)
    this._paintSky()
  }

  /**
   * Colour the dome's vertices for the current phase. Re-run whenever the phase
   * changes: it is a few thousand vertices, far cheaper than rebuilding the mesh.
   */
  _paintSky () {
    if (!this._skyColors) return
    const THREE = this._THREE
    const palette = this._palette()

    // Hex stops go through THREE.Color so they land in the renderer's working
    // colour space — a raw colour attribute is taken as-is, unlike a material's
    // `color`, and would come out washed out.
    const stop = hex => {
      const c = new THREE.Color(hex)
      return [c.r, c.g, c.b]
    }
    const stops = {
      ...CONFIG.sky,
      zenith: stop(palette.sky.zenith),
      horizonWarm: stop(palette.sky.horizonWarm),
      horizonCool: stop(palette.sky.horizonCool)
    }
    const [sx, , sz] = palette.sun.position
    const sunLength = Math.hypot(sx, sz) || 1
    const sunAzimuth = {x: sx / sunLength, z: sz / sunLength}

    const position = this._skyPositions
    const colors = this._skyColors
    const direction = new THREE.Vector3()
    for (let i = 0; i < position.count; i++) {
      direction.fromBufferAttribute(position, i).normalize()
      const [r, g, b] = skyColor(direction, sunAzimuth, stops)
      colors.setXYZ(i, r, g, b)
    }
    colors.needsUpdate = true
  }

  /**
   * Add the fill lighting: the ambient term, a cool "moonlight" from above and
   * the warm low evening sun from the west. Floodlight spotlights are added
   * per-tower in `_createFloodlightTower`.
   */
  _setupLights () {
    const THREE = this._THREE
    const palette = this._palette()

    this._ambientLight = new THREE.AmbientLight(CONFIG.colors.ambientLight, palette.fill.ambient)
    this._scene.add(this._ambientLight)

    this._moonLight = new THREE.DirectionalLight(CONFIG.colors.moonLight, palette.fill.moon)
    this._moonLight.position.set(30, 100, 30)
    this._scene.add(this._moonLight)

    this._sunLight = new THREE.DirectionalLight(palette.sun.color, palette.sun.intensity)
    if (CONFIG.sun.castShadow) this._setupSunShadow(this._sunLight)
    // The sun aims at whatever the camera orbits, keeping its (limited) shadow
    // area on what is actually in view.
    this._scene.add(this._sunLight.target)
    this._scene.add(this._sunLight)
    this._aimSun()
  }

  /**
   * Let the sun cast shadows. A directional light shadows through an orthographic
   * camera, so its box has to cover both the shadowed area and the long shadows a
   * low sun throws across it.
   * @param {THREE.DirectionalLight} sunLight
   */
  _setupSunShadow (sunLight) {
    const S = CONFIG.sun.shadow

    sunLight.castShadow = true
    sunLight.shadow.mapSize.width = S.mapSize
    sunLight.shadow.mapSize.height = S.mapSize
    sunLight.shadow.camera.left = -S.radius
    sunLight.shadow.camera.right = S.radius
    sunLight.shadow.camera.top = S.radius
    sunLight.shadow.camera.bottom = -S.radius
    sunLight.shadow.bias = S.bias
    sunLight.shadow.normalBias = S.normalBias
    this._fitSunShadow(Math.hypot(...CONFIG.sun.position))
  }

  /**
   * Bracket the shadow camera's depth range around however far out the sun
   * currently stands — each phase puts it somewhere else.
   * @param {number} distance
   */
  _fitSunShadow (distance) {
    const S = CONFIG.sun.shadow
    const camera = this._sunLight.shadow.camera
    camera.near = Math.max(1, distance - S.radius * 2)
    camera.far = distance + S.radius * 2
    camera.updateProjectionMatrix?.()
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
      const {width, height} = this._canvasSize(container)
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

    const groundSize = this._groundHalf() * 2
    const groundGeo = new this._THREE.PlaneGeometry(groundSize, groundSize)
    const groundMat = new this._THREE.MeshLambertMaterial({color: CONFIG.colors.ground})
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
      hasRoof: this._standHasRoof('north'),
      underConstruction: this._isStandUnderConstruction('north'),
      hasTunnel: true // players' entrance in front of the north stand
    })

    this._createStand(scene, {
      position: 'south',
      width: fieldWidth + 6,
      seats: southSeats,
      x: 0,
      z: fieldDepth / 2 + standGap,
      rotation: 0,
      hasRoof: this._standHasRoof('south'),
      underConstruction: this._isStandUnderConstruction('south')
    })

    // East/west stands are physically narrower than north/south, but their depth
    // (row count) is sized against half the north/south width so their size
    // scales as if they were exactly half as wide: an E/W stand with N seats is
    // as big as an N/S stand with 2N (see `depthWidth`).
    const sideDepthWidth = (fieldWidth + 6) / 2

    this._createStand(scene, {
      position: 'west',
      width: fieldDepth + 6,
      depthWidth: sideDepthWidth,
      seats: westSeats,
      x: -fieldWidth / 2 - standGap,
      z: 0,
      rotation: -Math.PI / 2,
      hasRoof: this._standHasRoof('west'),
      underConstruction: this._isStandUnderConstruction('west')
    })

    this._createStand(scene, {
      position: 'east',
      width: fieldDepth + 6,
      depthWidth: sideDepthWidth,
      seats: eastSeats,
      x: fieldWidth / 2 + standGap,
      z: 0,
      rotation: Math.PI / 2,
      hasRoof: this._standHasRoof('east'),
      underConstruction: this._isStandUnderConstruction('east')
    })

    for (const c of this._cornerLayout()) {
      if (c.depth <= 0) continue // no corner stand built here yet
      this._createCornerStand(scene, {
        x: c.x,
        z: c.z,
        rotation: c.rotation,
        rows: c.depth,
        roof: c.roof,
        underConstruction: c.underConstruction
      })
    }
  }

  /**
   * Row count of a corner stand, tied to the side stands so the two always look
   * like they belong to the same stadium: a corner holding **a quarter** of a
   * side stand's seats comes out exactly as big as that side stand.
   *
   * A corner row sits on the 45° diagonal, so its outer edge advances √2 per row
   * along the seam with the neighbouring stand (and rises √2 as steeply). It
   * therefore needs `1/√2` of the neighbour's rows to reach the same depth and
   * the same top height — hence the side-stand row count for four times the
   * seats, scaled by `1/√2`.
   * @param {number} seats
   * @returns {number} 0 for an unbuilt corner
   */
  _cornerRowCount (seats) {
    if (!seats || seats <= 0) return 0
    const sideDepthWidth = (CONFIG.field.width + 6) / 2
    const sideRows = this._standRowCount(seats * 4, sideDepthWidth)
    return Math.min(
      CONFIG.cornerStand.maxRows,
      Math.max(3, Math.round(sideRows * Math.SQRT1_2))
    )
  }

  /**
   * Vertical/depth layout of a corner stand's terracing — the counterpart of
   * `_standTierRows` / `_standDepth` for the diagonal fan.
   *
   * A 45°-rotated fan row advances `(fanSlope + 1)/√2` per row along the seam
   * with the neighbouring stand (it widens as it deepens), so the per-row rise is
   * picked to make the rake at that seam equal the main stands' rake and the
   * terracing line up where they meet. Corners get the same two-tier overhang as
   * the main stands; because their rows are steeper, both the tier threshold and
   * the upper tier's extra steepness are scaled off the main-stand values, so a
   * two-tier corner ends up as tall as the two-tier stands beside it.
   * @param {number} rows total row count
   * @returns {{rowHeight:number,upperTierRowHeight:number,twoTier:boolean,lowerRows:number,upperRows:number,overhang:number,lowerTopY:number,deckY:number,overallTop:number,backDist:number}}
   */
  _cornerTierLayout (rows) {
    const {
      lowerTierFraction, overhangClearance, overhangCoverFraction,
      twoTierRowThreshold, lowerRowHeight, upperRowHeight
    } = CONFIG.stand

    const rowHeight = lowerRowHeight * Math.SQRT1_2 * (CONFIG.cornerStand.fanSlope + 1)
    const upperTierRowHeight = rowHeight * (upperRowHeight / lowerRowHeight)

    const twoTier = rows >= Math.round(twoTierRowThreshold * lowerRowHeight / rowHeight)
    const lowerRows = twoTier ? Math.round(rows * lowerTierFraction) : rows
    const upperRows = rows - lowerRows

    // The upper tier is pulled toward the field (over the lower tier's rear) by
    // the overhang, like the main stands. Its rows keep filling the wedge at
    // their pulled-forward distance from the apex.
    const overhang = twoTier ? lowerRows * overhangCoverFraction : 0
    const lowerTopY = 0.5 + lowerRows * rowHeight // top of the lower tier
    const deckY = lowerTopY + overhangClearance // upper-tier floor / overhang top
    const overallTop = twoTier
      ? deckY + upperRows * upperTierRowHeight
      : 0.5 + rows * rowHeight

    return {
      rowHeight,
      upperTierRowHeight,
      twoTier,
      lowerRows,
      upperRows,
      overhang,
      lowerTopY,
      deckY,
      overallTop,
      // Deepest occupied row measured from the apex.
      backDist: Math.max(lowerRows - 1, twoTier ? rows - 1 - overhang : rows - 1)
    }
  }

  /**
   * Depth a corner stand reaches along a neighbouring stand's own depth axis:
   * the fan's outer edge advances √2 per diagonal row, so this is directly
   * comparable to `_standDepth`.
   * @param {number} rows total row count
   * @returns {number}
   */
  _cornerSeamDepth (rows) {
    return (this._cornerTierLayout(rows).backDist + 1) * Math.SQRT2
  }

  /**
   * Layout of the four corner stands. Each sits diagonally in a corner between
   * two main stands, rotated 45° to face the field. Its depth (row count) comes
   * from the stored `corner_<pos>_stand_size` via `_cornerRowCount`, which keeps
   * it in scale with the side stands. A corner with size 0 yields depth 0
   * (nothing built there). Shared by stand creation, floodlight placement and
   * the road distance.
   * @returns {Array<{pos:string,x:number,z:number,rotation:number,depth:number,roof:boolean,underConstruction:boolean,sx:number,sz:number}>}
   */
  _cornerLayout () {
    const cs = CONFIG.cornerStand
    const px = CONFIG.field.width / 2 + CONFIG.standGap
    const pz = CONFIG.field.depth / 2 + CONFIG.standGap
    const inv = 1 / Math.SQRT2
    const s = this.stadium

    const defs = [
      {pos: 'ne', sx: 1, sz: -1}, // north-east (+x, -z)
      {pos: 'nw', sx: -1, sz: -1}, // north-west (-x, -z)
      {pos: 'se', sx: 1, sz: 1}, // south-east (+x, +z)
      {pos: 'sw', sx: -1, sz: 1} // south-west (-x, +z)
    ]

    return defs.map(({pos, sx, sz}) => {
      const rows = this._cornerRowCount(s[`corner_${pos}_stand_size`])
      return {
        pos,
        x: sx * (px + cs.gap * inv),
        z: sz * (pz + cs.gap * inv),
        rotation: Math.atan2(sx, sz), // local -z (front) points to the field centre
        depth: rows,
        roof: this._standHasRoof(`corner_${pos}`),
        underConstruction: this._isStandUnderConstruction(`corner_${pos}`),
        sx,
        sz
      }
    })
  }

  /**
   * Positions of the four floodlight masts: on the diagonal just beyond each
   * corner stand's back, so a bigger corner stand pushes its mast further out.
   * @returns {Array<{pos:string,x:number,z:number}>}
   */
  _floodlightPositions () {
    const inv = 1 / Math.SQRT2
    const margin = CONFIG.floodlightMargin
    return this._cornerLayout().map(c => {
      const out = c.depth + margin
      return {pos: c.pos, x: c.x + c.sx * out * inv, z: c.z + c.sz * out * inv}
    })
  }

  /**
   * The two main stands meeting at a corner both have a roof — in which case
   * that corner's floodlight mast is dropped and the roofs light the pitch
   * instead (see `_addRoofFloodlights`). A stand under construction has no roof,
   * so the mast comes back for as long as the build runs.
   * @param {string} pos corner id ('ne' | 'nw' | 'se' | 'sw')
   * @returns {boolean}
   */
  _cornerHasBothRoofs (pos) {
    const neighbours = {
      ne: ['north', 'east'],
      nw: ['north', 'west'],
      se: ['south', 'east'],
      sw: ['south', 'west']
    }[pos]
    return neighbours.every(name => this._standHasRoof(name))
  }

  /**
   * Place a floodlight tower at each corner, except where both adjacent main
   * stands have a roof (those roofs carry their own spotlights instead).
   * @param {THREE.Scene} scene
   */
  _buildFloodlights (scene) {
    for (const p of this._floodlightPositions()) {
      if (this._cornerHasBothRoofs(p.pos)) continue
      this._createFloodlightTower(scene, p.x, p.z)
    }
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
    const {margin, minDistance} = CONFIG.road
    const fieldW = CONFIG.field.width
    const fieldD = CONFIG.field.depth
    const gap = CONFIG.standGap

    // Outer extent of each stand (row depth is 1 unit/row; +2 covers back
    // wall & roof). The square grid uses the deepest of the four.
    // `depthWidth` must match the value used in `_createStand` so the road sits
    // behind the actual stand depth (side stands use half the end-stand width).
    const sideDepthWidth = (fieldW + 6) / 2
    const stands = [
      {seats: this.stadium.north_stand_size || 0, depthWidth: fieldW + 6, base: fieldD / 2 + gap},
      {seats: this.stadium.south_stand_size || 0, depthWidth: fieldW + 6, base: fieldD / 2 + gap},
      {seats: this.stadium.west_stand_size || 0, depthWidth: sideDepthWidth, base: fieldW / 2 + gap},
      {seats: this.stadium.east_stand_size || 0, depthWidth: sideDepthWidth, base: fieldW / 2 + gap}
    ]
    const deepest = Math.max(
      ...stands.map(s => s.base + this._standRowCount(s.seats, s.depthWidth) + 2)
    )
    // Roads must also clear the corner stands and their floodlight masts.
    const towerReach = Math.max(
      ...this._floodlightPositions().map(p => Math.max(Math.abs(p.x), Math.abs(p.z)))
    )
    return Math.max(minDistance, deepest + margin, towerReach + 6)
  }

  /**
   * Total depth (row count, rowDepth 1) of a main stand — matches the value used
   * in `_createStand`, so surroundings can sit just behind the stand.
   * @param {number} seats
   * @param {number} depthWidth
   * @returns {number}
   */
  _standDepth (seats, depthWidth) {
    const numRows = this._standRowCount(seats, depthWidth)
    const {twoTier, lowerRows, upperRows} = this._standTierRows(numRows)
    if (!twoTier) return numRows
    const overhang = lowerRows * CONFIG.stand.overhangCoverFraction
    return Math.max(lowerRows, lowerRows - overhang + upperRows)
  }

  /**
   * Layout of the four main stands, with the distance from the field centre to
   * each stand's back and how many entrances it carries. `axis` is the outward
   * axis ('z' for north/south, 'x' for east/west) and `sign` its direction.
   * @returns {Array<{side:string,axis:string,sign:number,width:number,back:number,count:number,rotationY:number}>}
   */
  _mainStands () {
    const fieldW = CONFIG.field.width
    const fieldD = CONFIG.field.depth
    const gap = CONFIG.standGap
    const sideDepthWidth = (fieldW + 6) / 2
    const s = this.stadium
    const {endStandCount, sideStandCount} = CONFIG.entrance

    const defs = [
      {
        side: 'north',
        axis: 'z',
        sign: -1,
        width: fieldW + 6,
        base: fieldD / 2 + gap,
        depthW: fieldW + 6,
        seats: s.north_stand_size || 0,
        count: endStandCount,
        rotationY: 0
      },
      {
        side: 'south',
        axis: 'z',
        sign: 1,
        width: fieldW + 6,
        base: fieldD / 2 + gap,
        depthW: fieldW + 6,
        seats: s.south_stand_size || 0,
        count: endStandCount,
        rotationY: Math.PI
      },
      {
        side: 'west',
        axis: 'x',
        sign: -1,
        width: fieldD + 6,
        base: fieldW / 2 + gap,
        depthW: sideDepthWidth,
        seats: s.west_stand_size || 0,
        count: sideStandCount,
        rotationY: Math.PI / 2
      },
      {
        side: 'east',
        axis: 'x',
        sign: 1,
        width: fieldD + 6,
        base: fieldW / 2 + gap,
        depthW: sideDepthWidth,
        seats: s.east_stand_size || 0,
        count: sideStandCount,
        rotationY: -Math.PI / 2
      }
    ]
    return defs.map(d => ({
      side: d.side,
      axis: d.axis,
      sign: d.sign,
      width: d.width,
      count: d.count,
      rotationY: d.rotationY,
      back: d.base + this._standDepth(d.seats, d.depthW),
      // How high the back wall reaches — the emblem sign above the entrance has
      // to fit under it.
      top: this._standTopY(this._standRowCount(d.seats, d.depthW))
    }))
  }

  /**
   * Add a flat paved strip (sidewalk / footpath) lying on the ground.
   * @param {THREE.Scene} scene
   * @param {number} sizeX
   * @param {number} sizeZ
   * @param {number} x
   * @param {number} z
   * @param {THREE.Material} mat
   * @param {number} y
   */
  _addPavement (scene, sizeX, sizeZ, x, z, mat, y) {
    const mesh = new this._THREE.Mesh(new this._THREE.PlaneGeometry(sizeX, sizeZ), mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, y, z)
    mesh.receiveShadow = true
    scene.add(mesh)
  }

  /**
   * A single street lamp: a pole with a collar carrying a frosted glass globe,
   * and inside the globe the glowing core (emissive only, so many lamps stay
   * cheap — no per-lamp light).
   *
   * Only the core is `nightOnly`. The globe itself always shows, otherwise the
   * pole would just stop in mid-air by day, when the lamps are switched off.
   * @param {THREE.Scene} scene
   * @param {number} x
   * @param {number} z
   */
  _createStreetLamp (scene, x, z) {
    const L = CONFIG.streetLamp
    const poleMat = new this._THREE.MeshLambertMaterial({color: L.poleColor})
    const pole = new this._THREE.Mesh(
      new this._THREE.CylinderGeometry(0.12, 0.16, L.height, 6), poleMat
    )
    pole.position.set(x, L.height / 2, z)
    pole.castShadow = true
    scene.add(pole)

    const collar = new this._THREE.Mesh(
      new this._THREE.CylinderGeometry(0.16, 0.13, 0.14, 8), poleMat
    )
    collar.position.set(x, L.height + 0.07, z)
    scene.add(collar)

    const globeY = L.height + 0.14 + L.globeRadius
    const globe = new this._THREE.Mesh(
      new this._THREE.SphereGeometry(L.globeRadius, 10, 8),
      new this._THREE.MeshLambertMaterial({
        color: L.globeColor,
        transparent: true,
        opacity: L.globeOpacity,
        side: this._THREE.DoubleSide
      })
    )
    globe.position.set(x, globeY, z)
    scene.add(globe)

    const core = new this._THREE.Mesh(
      new this._THREE.SphereGeometry(L.globeRadius * 0.72, 8, 8),
      new this._THREE.MeshBasicMaterial({color: L.lightColor})
    )
    core.position.set(x, globeY, z)
    core.userData.nightOnly = true
    scene.add(core)
  }

  /**
   * A sidewalk ring running just inside the road grid, lined with street lamps.
   * @param {THREE.Scene} scene
   */
  _buildSidewalks (scene) {
    const distance = this._roadDistance()
    const rw = CONFIG.road.width
    const sw = CONFIG.sidewalk.width
    const d = distance - rw / 2 - sw / 2 // sidewalk centreline distance
    const y = CONFIG.sidewalk.y
    const mat = new this._THREE.MeshLambertMaterial({color: CONFIG.sidewalk.color})

    // Square ring: north/south strips run the full width, east/west between them.
    this._addPavement(scene, 2 * d + sw, sw, 0, -d, mat, y)
    this._addPavement(scene, 2 * d + sw, sw, 0, d, mat, y)
    this._addPavement(scene, sw, 2 * d - sw, -d, 0, mat, y)
    this._addPavement(scene, sw, 2 * d - sw, d, 0, mat, y)

    const steps = Math.max(2, Math.round(2 * d / CONFIG.sidewalk.lampSpacing))
    for (let i = 0; i <= steps; i++) {
      const p = -d + (i / steps) * 2 * d
      this._createStreetLamp(scene, p, -d)
      this._createStreetLamp(scene, p, d)
      if (i > 0 && i < steps) {
        this._createStreetLamp(scene, -d, p)
        this._createStreetLamp(scene, d, p)
      }
    }
  }

  /**
   * A tunnel-like stadium entrance (two walls, a roof, a lit panel) opening
   * outward. Built in local space (passage runs from z=0 at the stand back to
   * z=-depth at the outward mouth) then placed and rotated.
   * @param {THREE.Scene} scene
   * @param {number} cx
   * @param {number} cz
   * @param {number} rotationY
   */
  _createEntrance (scene, cx, cz, rotationY, standTop) {
    const E = CONFIG.entrance
    const t = E.wallThickness
    const halfW = E.width / 2
    const midZ = -E.depth / 2
    const group = new this._THREE.Group()
    const wallMat = new this._THREE.MeshLambertMaterial({color: E.wallColor})

    for (const sign of [1, -1]) {
      const wall = new this._THREE.Mesh(
        new this._THREE.BoxGeometry(t, E.height, E.depth), wallMat
      )
      wall.position.set(sign * (halfW + t / 2), E.height / 2, midZ)
      wall.castShadow = true
      wall.receiveShadow = true
      group.add(wall)
    }

    const roof = new this._THREE.Mesh(
      new this._THREE.BoxGeometry(E.width + 2 * t, t, E.depth), wallMat
    )
    roof.position.set(0, E.height + t / 2, midZ)
    roof.castShadow = true
    group.add(roof)

    // Lit panel under the roof (emissive only).
    const lamp = new this._THREE.Mesh(
      new this._THREE.BoxGeometry(1.4, 0.06, 1.4),
      new this._THREE.MeshBasicMaterial({color: E.lightColor})
    )
    lamp.position.set(0, E.height - 0.06, midZ)
    group.add(lamp)

    this._addEntranceEmblem(group, standTop)

    group.position.set(cx, 0, cz)
    group.rotation.y = rotationY
    scene.add(group)
  }

  /**
   * The club emblem on the stand's back wall above an entrance, with two small
   * lamps on arms above it. Built into the entrance's own group, so it inherits
   * the entrance's place and facing — local -z is out, away from the pitch.
   *
   * The plate is squeezed into whatever the stand's back wall leaves between the
   * entrance roof and its top edge; a stand too low for a readable one simply
   * gets none.
   * @param {THREE.Group} group the entrance's group
   * @param {number} standTop height of the stand's back wall
   * @returns {Object|null} the plate mesh, or `null` when it does not fit
   */
  _addEntranceEmblem (group, standTop) {
    const S = CONFIG.emblemSign
    const E = CONFIG.entrance
    const bottom = E.height + E.wallThickness + S.gapAboveEntrance
    const size = Math.min(S.maxSize, standTop - S.gapBelowTop - bottom)
    if (!(size >= S.minSize)) return null

    const texture = this._emblemPlate()
    if (!texture) return null

    const centerY = bottom + size / 2
    // The entrance sits at the *inner* face of the stand's back wall, which grows
    // outward from there — so everything here has to start beyond it, or it ends
    // up buried in the wall.
    const wall = CONFIG.stand.backWallThickness
    const plate = new this._THREE.Mesh(
      new this._THREE.PlaneGeometry(size, size),
      // Transparent: only the emblem's own shape should show, no plate behind it.
      new this._THREE.MeshBasicMaterial({map: texture, transparent: true})
    )
    // Just proud of the wall's outer face, turned to face outward (the plane's
    // own normal is +z).
    plate.position.set(0, centerY, -(wall + 0.06))
    plate.rotation.y = Math.PI
    group.add(plate)

    const L = S.lamp
    const housingGeo = new this._THREE.BoxGeometry(L.housing, L.housing * 0.8, L.housing)
    const armGeo = new this._THREE.BoxGeometry(0.07, 0.07, L.arm)
    const lensGeo = new this._THREE.SphereGeometry(L.lensRadius, 6, 5)
    const metalMat = new this._THREE.MeshLambertMaterial({color: E.wallColor})
    const lensMat = new this._THREE.MeshBasicMaterial({color: L.color})
    const lampY = centerY + size / 2 + 0.3

    for (const side of [-1, 1]) {
      const x = side * size * L.spread

      // Arms reach out from the wall's outer face, over the plate.
      const arm = new this._THREE.Mesh(armGeo, metalMat)
      arm.position.set(x, lampY, -(wall + L.arm / 2))
      group.add(arm)

      const housing = new this._THREE.Mesh(housingGeo, metalMat)
      housing.position.set(x, lampY, -(wall + L.arm))
      group.add(housing)

      // The lens looks down at the plate, so it reads as aimed at the emblem.
      const lens = new this._THREE.Mesh(lensGeo, lensMat)
      lens.position.set(x, lampY - L.housing * 0.45, -(wall + L.arm))
      lens.userData.nightOnly = true
      group.add(lens)
    }

    return plate
  }

  /**
   * The emblem's texture, built once and shared by every entrance — ten canvases
   * of the same crest would be ten textures in video memory.
   * @returns {Object|null} a CanvasTexture, or `null` without a 2D canvas
   */
  _emblemPlate () {
    if (this._emblemSignTexture === undefined) {
      this._emblemSignTexture = emblemTexture(this._THREE, {
        emblemSvg: this.team?.name ? renderEmblem(this.team, 512) : undefined,
        size: CONFIG.emblemSign.textureSize
      })
    }
    return this._emblemSignTexture
  }

  /**
   * Place the entrances behind each main stand and join each to the sidewalk
   * with a lamp-lined footpath.
   * @param {THREE.Scene} scene
   */
  _buildEntrances (scene) {
    const distance = this._roadDistance()
    const sidewalkDist = distance - CONFIG.road.width / 2 - CONFIG.sidewalk.width / 2
    const pathMat = new this._THREE.MeshLambertMaterial({color: CONFIG.footpath.color})

    for (const st of this._mainStands()) {
      for (let i = 0; i < st.count; i++) {
        const off = -st.width / 2 + (i + 1) / (st.count + 1) * st.width // along the width

        // Entrance at the stand back, facing outward.
        const cx = st.axis === 'z' ? off : st.sign * st.back
        const cz = st.axis === 'z' ? st.sign * st.back : off
        this._createEntrance(scene, cx, cz, st.rotationY, st.top)

        // Footpath from under the stand, through the entrance, out to the
        // sidewalk (one continuous strip).
        const mouthDist = st.back + CONFIG.entrance.depth // outer end of the entrance
        const innerDist = st.back - CONFIG.footpath.underStand // reaches under the stand
        const len = sidewalkDist - innerDist
        if (len <= 0) continue
        const midDist = (innerDist + sidewalkDist) / 2
        const fw = CONFIG.footpath.width
        if (st.axis === 'z') {
          this._addPavement(scene, fw, len, off, st.sign * midDist, pathMat, CONFIG.footpath.y)
        } else {
          this._addPavement(scene, len, fw, st.sign * midDist, off, pathMat, CONFIG.footpath.y)
        }

        // Street lamps only on the open portion, from the entrance mouth out.
        const outerLen = sidewalkDist - mouthDist
        const lampSteps = Math.max(1, Math.round(outerLen / CONFIG.footpath.lampSpacing))
        const lampSide = off + fw / 2 + 0.4
        for (let k = 1; k <= lampSteps; k++) {
          const dist = mouthDist + (k / (lampSteps + 1)) * outerLen
          if (st.axis === 'z') {
            this._createStreetLamp(scene, lampSide, st.sign * dist)
          } else {
            this._createStreetLamp(scene, st.sign * dist, lampSide)
          }
        }
      }
    }
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
      areaMargin, spacing, jitter, roadClearance,
      minScale, maxScale, coneChance, trunkColor, greens
    } = CONFIG.trees

    const areaHalf = this._groundHalf() - areaMargin
    const distance = this._roadDistance()
    const roadEdge = CONFIG.road.width / 2 + roadClearance
    const plots = this._buildingPlots()
    const rand = this._seededRandom(0x9e3779b9)

    // Base (scale 1) tree dimensions.
    const trunkHeight = 3
    const sphereRadius = 2.4
    const coneRadius = 2.6
    const coneHeight = 5.5
    const sphereCenterY = trunkHeight + sphereRadius * 0.6
    const coneCenterY = trunkHeight + coneHeight / 2

    // Reject a candidate that would sit on the stadium footprint (inside the
    // road grid), on/near any road, or on a club building's plot (plus the
    // sidewalk that runs around it).
    const plotPad = CONFIG.sidewalk.width + 1
    const isBlocked = (x, z) =>
      (Math.abs(x) < distance && Math.abs(z) < distance) ||
      Math.abs(Math.abs(x) - distance) < roadEdge ||
      Math.abs(Math.abs(z) - distance) < roadEdge ||
      plots.some(p =>
        Math.abs(x - p.cx) < p.halfX + plotPad && Math.abs(z - p.cz) < p.halfZ + plotPad
      )

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

    const trunkMat = new THREE.MeshLambertMaterial({color: trunkColor})
    // Foliage colour comes from per-instance colours; base material is white
    // so the instance colour shows unmodified.
    const foliageMat = new THREE.MeshLambertMaterial({color: 0xffffff})

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

    // The forest is split into a near and a far half so only the near one takes
    // part in the shadow passes (see `trees.shadowRadius`). Each half is three
    // instanced meshes — trunks, round foliage, cone foliage.
    const addGroup = (group, castShadow) => {
      if (group.length === 0) return
      const cones = group.filter(t => t.isCone)
      const spheres = group.filter(t => !t.isCone)

      const trunks = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.3, 0.45, trunkHeight, 6), trunkMat, group.length
      )
      const sphereFoliage = new THREE.InstancedMesh(
        new THREE.SphereGeometry(sphereRadius, 8, 6), foliageMat, spheres.length
      )
      const coneFoliage = new THREE.InstancedMesh(
        new THREE.ConeGeometry(coneRadius, coneHeight, 7), foliageMat, cones.length
      )

      group.forEach((t, i) => setInstance(trunks, i, t.x, t.z, trunkHeight / 2, t.scale))
      spheres.forEach((t, i) => setInstance(sphereFoliage, i, t.x, t.z, sphereCenterY, t.scale, t.green))
      cones.forEach((t, i) => setInstance(coneFoliage, i, t.x, t.z, coneCenterY, t.scale, t.green))

      for (const mesh of [trunks, sphereFoliage, coneFoliage]) {
        if (mesh.count === 0) continue
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
        mesh.castShadow = castShadow
        mesh.receiveShadow = castShadow
        scene.add(mesh)
      }
    }

    const shadowRadius = CONFIG.trees.shadowRadius
    const isNear = t => Math.hypot(t.x, t.z) <= shadowRadius
    addGroup(trees.filter(isNear), true)
    addGroup(trees.filter(t => !isNear(t)), false)
  }

  /**
   * Build the roads around the stadium as a grid (#-shape): the two north/south
   * roads run continuously, the two west/east roads cross them at four
   * intersections, and every road continues outward past its corner to the edge
   * of the ground plane — exactly that far and no further, so a road never runs
   * on past the grass into the void; out there the trees on the horizon take it
   * over. Dashed white centre markings run the full length and skip the
   * intersections. The grid sits a fixed margin beyond the deepest stand so it
   * always clears the stadium regardless of its size.
   * @param {THREE.Scene} scene
   */
  _buildRoads (scene) {
    const THREE = this._THREE
    const {
      width: rw, color,
      markingColor, dashLength, dashGap, markingWidth
    } = CONFIG.road

    const far = this._groundHalf()
    const distance = this._roadDistance()

    const roadY = 0
    const markingY = 0.05
    const roadMat = new THREE.MeshLambertMaterial({color})
    // The dashes lie a few centimetres above asphalt that runs out to the
    // horizon, and that gap is far below what the depth buffer can resolve out
    // there — the markings flickered against the road. `polygonOffset` biases
    // them towards the camera in depth-buffer units, so the correction scales
    // with distance the way a fixed height offset never could.
    const markingMat = new THREE.MeshBasicMaterial({
      color: markingColor,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4
    })

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
    // crossings (just like real road markings). The roads reach all the way to
    // the horizon, so these are instanced — one draw call per orientation
    // instead of one per dash.
    const period = dashLength + dashGap
    const dashCount = Math.floor((2 * far) / period)
    const dashSpan = dashCount * period - dashGap
    const dashStart = -dashSpan / 2 + dashLength / 2
    const nearCrossing = p =>
      Math.abs(p - distance) < rw / 2 + dashLength / 2 ||
      Math.abs(p + distance) < rw / 2 + dashLength / 2

    const alongX = [] // dashes on the north/south roads
    const alongZ = [] // dashes on the west/east roads
    for (let i = 0; i < dashCount; i++) {
      const p = dashStart + i * period
      if (nearCrossing(p)) continue
      alongX.push({x: p, z: -distance}, {x: p, z: distance})
      alongZ.push({x: -distance, z: p}, {x: distance, z: p})
    }

    // Instances carry the flat-on-the-ground rotation themselves, so their
    // positions stay plain world coordinates.
    const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
    const unitScale = new THREE.Vector3(1, 1, 1)
    const matrix = new THREE.Matrix4()
    const pos = new THREE.Vector3()

    const addDashes = (geo, dashes) => {
      if (dashes.length === 0) return
      const mesh = new THREE.InstancedMesh(geo, markingMat, dashes.length)
      dashes.forEach((d, i) => {
        pos.set(d.x, markingY, d.z)
        matrix.compose(pos, flat, unitScale)
        mesh.setMatrixAt(i, matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
      scene.add(mesh)
    }
    addDashes(new THREE.PlaneGeometry(dashLength, markingWidth), alongX)
    addDashes(new THREE.PlaneGeometry(markingWidth, dashLength), alongZ)
  }

  /**
   * @param {THREE.Scene} scene
   * @param {number} width
   * @param {number} depth
   * @param {string} teamColor
   */
  _createField (scene, width, depth, teamColor) {
    // The mown stripes tile the whole pitch instead of lying on top of one
    // full-size plane: two coplanar surfaces a hundredth of a unit apart z-fight
    // across this scene's depth range (near 0.1 / far 2500) and the pitch
    // shimmers as the camera orbits. Side by side at one height they cannot.
    const stripeCount = 8
    const stripeWidth = depth / stripeCount
    const stripeGeo = new this._THREE.PlaneGeometry(width, stripeWidth)
    const stripeMats = [
      new this._THREE.MeshLambertMaterial({color: 0x2e8b2e}),
      new this._THREE.MeshLambertMaterial({color: 0x35a535})
    ]
    for (let i = 0; i < stripeCount; i++) {
      const stripe = new this._THREE.Mesh(stripeGeo, stripeMats[i % 2])
      stripe.rotation.x = -Math.PI / 2
      stripe.position.y = 0.01
      stripe.position.z = -depth / 2 + stripeWidth / 2 + i * stripeWidth
      stripe.receiveShadow = true
      scene.add(stripe)
    }

    const lineMaterial = new this._THREE.LineBasicMaterial({color: 0xffffff})

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
    const circleMat = new this._THREE.MeshBasicMaterial({color: 0xffffff, side: this._THREE.DoubleSide})
    const circle = new this._THREE.Mesh(circleGeo, circleMat)
    circle.rotation.x = -Math.PI / 2
    // Just above the lines: the centre line runs straight through the circle, and
    // at the same height the two would z-fight where they cross.
    circle.position.y = 0.04
    scene.add(circle)

    this._createGoal(scene, -width / 2)
    this._createGoal(scene, width / 2)

    const cornerPositions = [
      {x: -width / 2, z: -depth / 2},
      {x: width / 2, z: -depth / 2},
      {x: -width / 2, z: depth / 2},
      {x: width / 2, z: depth / 2}
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
    const poleMat = new this._THREE.MeshLambertMaterial({color: 0xffffff})
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

    const towerMat = new this._THREE.MeshLambertMaterial({color: 0xcccccc})

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

    const spotlightMat = new this._THREE.MeshLambertMaterial({color: 0x666666})
    const spotlightLensMat = new this._THREE.MeshBasicMaterial({color: 0xffffcc})

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
        lens.userData.nightOnly = true
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
    const goalMat = new this._THREE.MeshLambertMaterial({color: 0xffffff})
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

    // Net: a line grid enclosing the back of the goal (away from the field).
    const sign = Math.sign(x) || 1 // direction pointing away from the pitch
    const netDepth = 1.3
    const backHeight = goalHeight * 0.45
    const xBack = x + sign * netDepth
    const zL = -goalWidth / 2
    const zR = goalWidth / 2

    const ft = z => [x, goalHeight, z] // front-top (at the crossbar)
    const fb = z => [x, 0, z] // front-bottom (at the posts)
    const bt = z => [xBack, backHeight, z] // back-top
    const bb = z => [xBack, 0, z] // back-bottom

    const positions = []
    const cell = 0.28 // net mesh size
    this._addNetPanel(positions, ft(zL), ft(zR), bt(zR), bt(zL), cell) // top
    this._addNetPanel(positions, bt(zL), bt(zR), bb(zR), bb(zL), cell) // back
    this._addNetPanel(positions, fb(zL), bb(zL), bt(zL), ft(zL), cell) // left side
    this._addNetPanel(positions, fb(zR), bb(zR), bt(zR), ft(zR), cell) // right side

    const netGeo = new this._THREE.BufferGeometry()
    netGeo.setAttribute('position', new this._THREE.Float32BufferAttribute(positions, 3))
    const netMat = new this._THREE.LineBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.4})
    scene.add(new this._THREE.LineSegments(netGeo, netMat))
  }

  /**
   * Append a net-like line grid spanning a flat quad to a shared positions
   * array. Corners are given in loop order (a→b→c→d); the grid density follows
   * the quad's side lengths so cells stay roughly `cell` units square.
   * @param {number[]} positions flat [x,y,z,...] sink for LineSegments
   * @param {number[]} a corner [x,y,z] (grid origin)
   * @param {number[]} b corner adjacent to a (one grid axis)
   * @param {number[]} c corner opposite a
   * @param {number[]} d corner adjacent to a (other grid axis)
   * @param {number} cell target cell size
   */
  _addNetPanel (positions, a, b, c, d, cell) {
    const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
    const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]
    const nu = Math.max(1, Math.round(dist(a, b) / cell))
    const nv = Math.max(1, Math.round(dist(a, d) / cell))

    for (let i = 0; i <= nu; i++) {
      const t = i / nu
      positions.push(...lerp(a, b, t), ...lerp(d, c, t)) // line across the a→d axis
    }
    for (let j = 0; j <= nv; j++) {
      const s = j / nv
      positions.push(...lerp(a, d, s), ...lerp(b, c, s)) // line across the a→b axis
    }
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
  _addSideWalls (group, mat, {width, depth, baseZ, frontY, backY, baseY}) {
    const shape = new this._THREE.Shape()
    shape.moveTo(0, baseY)
    shape.lineTo(depth, baseY)
    shape.lineTo(depth, backY)
    shape.lineTo(0, frontY)
    shape.closePath()

    const thickness = 0.5
    const geo = new this._THREE.ExtrudeGeometry(shape, {depth: thickness, bevelEnabled: false})
    for (const sign of [1, -1]) {
      const wall = new this._THREE.Mesh(geo, mat)
      wall.rotation.y = Math.PI * 1.5
      // The extrude always adds its thickness toward -x, so the -x wall would sit
      // that much further out than the +x one; pull it back in so both walls hug
      // the base symmetrically.
      const xPos = sign > 0 ? width / 2 + 1 : -(width / 2 + 1) + thickness
      wall.position.set(xPos, 0, baseZ)
      wall.castShadow = true
      group.add(wall)
    }
  }

  /**
   * Split a stand's rows into a lower and (for large stands) an upper tier.
   * The threshold is on the row count (physical depth), not the seat count, so
   * the overhang appears at the same physical size regardless of the stand's
   * width — a narrow side stand reaches it at roughly half the seats of a wide
   * end stand. Below the threshold the whole stand is one tier; at or above it,
   * the lower tier gets ~2/3 of the rows and the upper tier the rest.
   * @param {number} numRows total row count
   * @returns {{ twoTier: boolean, lowerRows: number, upperRows: number }}
   */
  _standTierRows (numRows) {
    const {twoTierRowThreshold, lowerTierFraction} = CONFIG.stand
    if (numRows < twoTierRowThreshold) {
      return {twoTier: false, lowerRows: numRows, upperRows: 0}
    }
    const lowerRows = Math.round(numRows * lowerTierFraction)
    return {twoTier: true, lowerRows, upperRows: numRows - lowerRows}
  }

  /**
   * Height of the top of a main stand's terracing (its envelope top) — the
   * counterpart of `_standDepth`. On a two-tier stand that is the top of the
   * steeper upper tier, above the overhang clearance.
   * @param {number} numRows total row count
   * @returns {number}
   */
  _standTopY (numRows) {
    const {lowerRowHeight, upperRowHeight, overhangClearance} = CONFIG.stand
    const {twoTier, lowerRows, upperRows} = this._standTierRows(numRows)
    const lowerTopY = 0.5 + lowerRows * lowerRowHeight
    if (!twoTier) return lowerTopY
    return lowerTopY + overhangClearance + upperRows * upperRowHeight
  }

  /**
   * @param {THREE.Scene} scene
   * @param {Object} config
   */
  _createStand (scene, config) {
    const {width, depthWidth, seats, x, z, rotation, hasRoof, hasTunnel, underConstruction} = config
    const {lowerRowHeight, upperRowHeight, overhangClearance, overhangCoverFraction} = CONFIG.stand

    const group = new this._THREE.Group()

    const seatWidth = 0.5
    const seatsPerRow = Math.floor(width / seatWidth) // actual seats per row (render)
    // Depth (rows) is sized against `depthWidth` so narrow side stands can be
    // scaled independently of their rendered width; defaults to the real width.
    const numRows = this._standRowCount(seats, depthWidth ?? width)
    const rowDepth = 1.0

    // Seats to leave out for the players' tunnel: a central channel through the
    // front rows of the lower tier (+1 row of clearance beyond the ceiling).
    const tunnelHalfW = hasTunnel ? CONFIG.tunnel.width / 2 + 0.3 : 0
    const tunnelRows = hasTunnel ? Math.ceil(CONFIG.tunnel.depth) + 1 : 0

    // Large stands split into two tiers: the lower ~2/3 of the rows sit under a
    // cantilevered overhang, the upper ~1/3 (steeper) sit above it.
    const {twoTier, lowerRows, upperRows} = this._standTierRows(numRows)

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
    const envTop = this._standTopY(numRows) // envelope top height

    // baseY 0.5 = top of the foundation slab (row 0 sits on it).
    const tiers = [{rows: lowerRows, rowHeight: lowerRowHeight, baseY: 0.5, baseZ: 0}]
    if (twoTier) {
      tiers.push({rows: upperRows, rowHeight: upperRowHeight, baseY: deckY, baseZ: upperFrontZ})
    }

    // --- foundation slab ---
    const baseMat = new this._THREE.MeshLambertMaterial({color: 0x505050})
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
    const stepMat = new this._THREE.MeshLambertMaterial({color: 0x909090})
    const stepInstancedMesh = new this._THREE.InstancedMesh(
      new this._THREE.BoxGeometry(width, lowerRowHeight, rowDepth), stepMat, numRows
    )
    stepInstancedMesh.castShadow = true
    stepInstancedMesh.receiveShadow = true

    const seatColors = [
      {color: 0xe74c3c, threshold: 0.35},
      {color: 0x3498db, threshold: 0.70},
      {color: 0xf39c12, threshold: 0.85},
      {color: 0x27ae60, threshold: 0.95},
      {color: 0xf1c40f, threshold: 1.0}
    ]
    const seatsByColor = new Map()
    seatColors.forEach(c => seatsByColor.set(c.color, []))

    const stepMatrix = new this._THREE.Matrix4()
    const stepQuat = new this._THREE.Quaternion()
    const stepScale = new this._THREE.Vector3()
    const stepPos = new this._THREE.Vector3()

    let stepIndex = 0
    for (const [tierIndex, tier] of tiers.entries()) {
      const yScale = tier.rowHeight / lowerRowHeight
      const tunnelRow = hasTunnel && tierIndex === 0
      for (let row = 0; row < tier.rows; row++) {
        const rowBottomY = tier.baseY + row * tier.rowHeight
        const rowZ = tier.baseZ + row * rowDepth

        stepPos.set(0, rowBottomY + tier.rowHeight / 2, rowZ + rowDepth / 2)
        stepScale.set(1, yScale, 1)
        stepMatrix.compose(stepPos, stepQuat, stepScale)
        stepInstancedMesh.setMatrixAt(stepIndex++, stepMatrix)

        // A stand being rebuilt shows its bare terracing: the seats are out.
        if (underConstruction) continue

        const inTunnelRow = tunnelRow && row < tunnelRows
        const seatY = rowBottomY + tier.rowHeight // step surface
        const seatZ = rowZ + rowDepth * 0.35
        for (let s = 0; s < seatsPerRow; s++) {
          const seatX = -width / 2 + seatWidth / 2 + s * seatWidth
          if (inTunnelRow && Math.abs(seatX) < tunnelHalfW) continue // tunnel channel

          const colorChoice = Math.random()
          let seatColor = seatColors[seatColors.length - 1].color
          for (const {color, threshold} of seatColors) {
            if (colorChoice < threshold) {
              seatColor = color
              break
            }
          }
          seatsByColor.get(seatColor).push({x: seatX, y: seatY, z: seatZ})
        }
      }
    }
    stepInstancedMesh.instanceMatrix.needsUpdate = true
    group.add(stepInstancedMesh)

    const seatGeo = this._createSeatGeometry(seatWidth, rowDepth)
    const seatMatrix = new this._THREE.Matrix4()

    for (const [color, positions] of seatsByColor) {
      if (positions.length === 0) continue

      const seatMat = new this._THREE.MeshLambertMaterial({color, side: this._THREE.DoubleSide})
      const instancedSeats = new this._THREE.InstancedMesh(seatGeo, seatMat, positions.length)

      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i]
        seatMatrix.setPosition(pos.x, pos.y, pos.z)
        instancedSeats.setMatrixAt(i, seatMatrix)
      }
      instancedSeats.instanceMatrix.needsUpdate = true
      group.add(instancedSeats)
    }

    const backWallMat = new this._THREE.MeshLambertMaterial({color: 0x606060})

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

      const deckMat = new this._THREE.MeshLambertMaterial({color: 0x777777})
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
    const backWallHeight = envTop + 0.5
    const wallThickness = CONFIG.stand.backWallThickness
    const backWall = new this._THREE.Mesh(
      new this._THREE.BoxGeometry(width + 2, backWallHeight, wallThickness), backWallMat
    )
    backWall.position.y = backWallHeight / 2
    backWall.position.z = totalDepth + wallThickness / 2
    backWall.castShadow = true
    group.add(backWall)

    // --- side walls (one pair per tier, so the overhang void stays open) ---
    this._addSideWalls(group, backWallMat, {
      width,
      depth: lowerDepth,
      baseZ: 0,
      baseY: 0,
      frontY: 1.5,
      backY: twoTier ? deckY : lowerTopY + 0.5
    })
    if (twoTier) {
      this._addSideWalls(group, backWallMat, {
        width,
        depth: upperDepth,
        baseZ: upperFrontZ,
        baseY: deckY,
        frontY: deckY + 0.5,
        backY: upperTopY + 0.5
      })
      // Close the sides of the section behind the lower tier's rear wall (from
      // there to the back wall, up to the deck) — a flat rectangular fill.
      const rearFillDepth = totalDepth - lowerDepth
      if (rearFillDepth > 0) {
        this._addSideWalls(group, backWallMat, {
          width,
          depth: rearFillDepth,
          baseZ: lowerDepth,
          baseY: 0,
          frontY: deckY,
          backY: deckY
        })
      }
    }

    if (hasRoof) {
      const roofY = envTop + 3
      const pillarZ = totalDepth - 1
      const pillarTopY = roofY + 4
      const pillarHeight = pillarTopY + 0.5
      const roofSetback = 1 // shift the roof back, away from the field
      const roofFrontZ = -1.5 + roofSetback // front edge of the roof box

      const roofGeo = new this._THREE.BoxGeometry(width, 0.3, totalDepth + 3)
      const roofMat = new this._THREE.MeshLambertMaterial({
        color: 0xe6e6e6,
        transparent: true,
        opacity: 0.8
      })
      const roof = new this._THREE.Mesh(roofGeo, roofMat)
      roof.position.y = roofY
      roof.position.z = totalDepth / 2 + roofSetback
      roof.rotation.x = -0.05
      roof.castShadow = true
      group.add(roof)

      const supportGeo = new this._THREE.CylinderGeometry(0.4, 0.4, pillarHeight, 8)
      const supportMat = new this._THREE.MeshLambertMaterial({color: 0x444444})

      const pillarPositions = [-width / 2 + 3, 0, width / 2 - 3]

      const cableMat = new this._THREE.LineBasicMaterial({color: 0x333333, linewidth: 3})

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

      this._addRoofFloodlights(group, width, roofY, roofFrontZ)
    }

    if (hasTunnel) {
      this._createTunnel(group)
      this._createBenches(group)
    }

    group.position.set(x, 0, z)
    group.rotation.y = rotation
    scene.add(group)
  }

  /**
   * Mount a row of small floodlight spotlights along the front edge of a stand's
   * roof, aimed at the pitch. Used instead of a corner mast when both stands at
   * a corner are roofed. Built in the stand's local space (front toward -z).
   * @param {THREE.Group} group
   * @param {number} width stand width
   * @param {number} roofY roof height
   * @param {number} frontZ z of the roof's front edge
   */
  _addRoofFloodlights (group, width, roofY, frontZ) {
    const y = roofY - 0.4 // fixtures hang just under the roof front
    const aim = [0, 0, -25] // a point out on the pitch
    const count = Math.max(3, Math.floor(width / 6))

    const housingMat = new this._THREE.MeshLambertMaterial({color: 0x666666})
    const lensMat = new this._THREE.MeshBasicMaterial({color: 0xfff2cc})
    const housingGeo = new this._THREE.BoxGeometry(0.9, 0.5, 0.6)
    const lensGeo = new this._THREE.CircleGeometry(0.22, 12)

    for (let i = 0; i < count; i++) {
      const fx = -width / 2 + (i + 0.5) * (width / count)

      const housing = new this._THREE.Mesh(housingGeo, housingMat)
      housing.position.set(fx, y, frontZ)
      housing.lookAt(fx, aim[1], aim[2]) // tilt down toward the pitch
      group.add(housing)

      const lens = new this._THREE.Mesh(lensGeo, lensMat)
      lens.position.set(fx, y, frontZ - 0.35)
      lens.lookAt(fx, aim[1], aim[2])
      group.add(lens)
    }

    // A couple of spotlights so a roofed stand actually lights the pitch.
    for (const sx of [-width / 4, width / 4]) {
      const light = new this._THREE.SpotLight(0xfff5e6, 90, 130, Math.PI / 4, 0.5, 1.2)
      light.position.set(sx, y, frontZ)
      light.target.position.set(0, aim[1], aim[2])
      group.add(light)
      group.add(light.target)
    }
  }

  /**
   * A triangular corner stand. Unlike a normal stand, each row is wider than the
   * one below (row width = (2r+1) * fanSlope), forming a fan that fills the 90°
   * corner wedge: narrow at the front apex, widening toward the back. Built in
   * local space (apex/front at z=0, rows rising in +z) so it inherits the
   * group's diagonal placement/rotation.
   * @param {THREE.Scene} scene
   * @param {{x:number,z:number,rotation:number,rows:number,roof:boolean,underConstruction?:boolean}} config
   */
  _createCornerStand (scene, config) {
    const {x, z, rotation, rows, roof, underConstruction} = config
    const {fanSlope} = CONFIG.cornerStand
    const rowDepth = 1.0
    const seatWidth = 0.5
    const group = new this._THREE.Group()

    const {
      rowHeight, upperTierRowHeight, twoTier, lowerRows,
      overhang, lowerTopY, deckY, overallTop, backDist
    } = this._cornerTierLayout(rows)

    // Width of the fan at distance `d` (in rows) from the apex — it fills the
    // 90° wedge, so width = 2·distance.
    const fanWidth = d => (2 * d + 1) * rowDepth * fanSlope

    // Distance from the apex for a given row (upper rows are pulled forward).
    const rowDist = r => (twoTier && r >= lowerRows) ? r - overhang : r
    const totalDepth = (backDist + 1) * rowDepth

    const seatColors = [
      {color: 0xe74c3c, threshold: 0.35},
      {color: 0x3498db, threshold: 0.70},
      {color: 0xf39c12, threshold: 0.85},
      {color: 0x27ae60, threshold: 0.95},
      {color: 0xf1c40f, threshold: 1.0}
    ]
    const seatsByColor = new Map()
    seatColors.forEach(c => seatsByColor.set(c.color, []))

    // Steps: one solid block per row, from the ground up to the row surface, so
    // the widening blocks form a solid stepped wedge. One instanced mesh with a
    // per-row scale (width, height, depth) off a unit box.
    const stepMesh = new this._THREE.InstancedMesh(
      new this._THREE.BoxGeometry(1, 1, 1),
      new this._THREE.MeshLambertMaterial({color: 0x808080}),
      rows
    )
    stepMesh.castShadow = true
    stepMesh.receiveShadow = true

    const matrix = new this._THREE.Matrix4()
    const quat = new this._THREE.Quaternion()
    const scale = new this._THREE.Vector3()
    const pos = new this._THREE.Vector3()

    for (let r = 0; r < rows; r++) {
      const dist = rowDist(r)
      const w = fanWidth(dist)
      const rowZ = dist * rowDepth
      // Lower rows are solid blocks from the ground; upper rows sit on the deck.
      const isUpper = twoTier && r >= lowerRows
      const blockBottom = isUpper ? deckY : 0
      const blockTop = isUpper
        ? deckY + (r - lowerRows + 1) * upperTierRowHeight
        : 0.5 + (r + 1) * rowHeight

      scale.set(w, blockTop - blockBottom, rowDepth)
      pos.set(0, (blockBottom + blockTop) / 2, rowZ + rowDepth / 2)
      matrix.compose(pos, quat, scale)
      stepMesh.setMatrixAt(r, matrix)

      // A stand being rebuilt shows its bare terracing: the seats are out.
      if (underConstruction) continue

      const seatsPerRow = Math.max(1, Math.floor(w / seatWidth))
      const seatZ = rowZ + rowDepth * 0.35
      for (let s = 0; s < seatsPerRow; s++) {
        const colorChoice = Math.random()
        let seatColor = seatColors[seatColors.length - 1].color
        for (const {color, threshold} of seatColors) {
          if (colorChoice < threshold) {
            seatColor = color
            break
          }
        }
        seatsByColor.get(seatColor).push({
          x: -w / 2 + seatWidth / 2 + s * seatWidth,
          y: blockTop,
          z: seatZ
        })
      }
    }
    stepMesh.instanceMatrix.needsUpdate = true
    group.add(stepMesh)

    const seatGeo = this._createSeatGeometry(seatWidth, rowDepth)
    const seatMatrix = new this._THREE.Matrix4()
    for (const [color, positions] of seatsByColor) {
      if (positions.length === 0) continue
      const seatMat = new this._THREE.MeshLambertMaterial({color, side: this._THREE.DoubleSide})
      const instancedSeats = new this._THREE.InstancedMesh(seatGeo, seatMat, positions.length)
      positions.forEach((p, i) => {
        seatMatrix.setPosition(p.x, p.y, p.z)
        instancedSeats.setMatrixAt(i, seatMatrix)
      })
      instancedSeats.instanceMatrix.needsUpdate = true
      group.add(instancedSeats)
    }

    // --- overhang: rear wall of the lower tier + cantilevered deck ---
    if (twoTier) {
      const lowerBackWidth = fanWidth(lowerRows - 1)
      const wallHeight = deckY - lowerTopY
      const wall = new this._THREE.Mesh(
        new this._THREE.BoxGeometry(lowerBackWidth, wallHeight, 0.5),
        new this._THREE.MeshLambertMaterial({color: 0x606060})
      )
      wall.position.set(0, lowerTopY + wallHeight / 2, lowerRows * rowDepth)
      wall.castShadow = true
      group.add(wall)

      const deck = new this._THREE.Mesh(
        new this._THREE.BoxGeometry(lowerBackWidth, 0.4, overhang),
        new this._THREE.MeshLambertMaterial({color: 0x777777})
      )
      deck.position.set(0, deckY - 0.2, lowerRows * rowDepth - overhang / 2)
      deck.castShadow = true
      deck.receiveShadow = true
      group.add(deck)
    }

    // Back wall closing the wide, tall rear of the wedge.
    const backWidth = fanWidth(backDist) + 1
    const backHeight = overallTop + 0.5
    const backWall = new this._THREE.Mesh(
      new this._THREE.BoxGeometry(backWidth, backHeight, 0.5),
      new this._THREE.MeshLambertMaterial({color: 0x606060})
    )
    backWall.position.set(0, backHeight / 2, totalDepth + 0.25)
    backWall.castShadow = true
    group.add(backWall)

    if (roof) {
      // A triangular roof over the fan, held by a mast at the back with a cable
      // to the front — like the main stands' cantilever roof.
      const backZ = totalDepth
      const halfBack = fanWidth(backDist) / 2 + 2 // roof overhangs the sides a bit
      const roofY = overallTop + 3 // clear above the top seats

      // Triangular prism with the same look as the other roofs: a solid slab of
      // thickness `t`, gently raked (front lower, back higher) at the same slope.
      const t = 0.6
      const apexZ = -0.7 // apex (front) overhangs slightly toward the field
      const rearZ = backZ + 1
      const tilt = 0.05 * (rearZ - apexZ) / 2 // matches the main roofs' rake
      const frontY = roofY - tilt // front (toward field) sits lower
      const rearY = roofY + tilt // back sits higher
      const roofGeo = new this._THREE.BufferGeometry()
      roofGeo.setAttribute('position', new this._THREE.Float32BufferAttribute([
        0, frontY, apexZ, // 0 top apex
        -halfBack, rearY, rearZ, // 1 top back-left
        halfBack, rearY, rearZ, // 2 top back-right
        0, frontY - t, apexZ, // 3 bottom apex
        -halfBack, rearY - t, rearZ, // 4 bottom back-left
        halfBack, rearY - t, rearZ // 5 bottom back-right
      ], 3))
      roofGeo.setIndex([
        0, 1, 2, // top
        3, 5, 4, // bottom
        0, 3, 4, 0, 4, 1, // left side
        1, 4, 5, 1, 5, 2, // back side
        2, 5, 3, 2, 3, 0 // right side
      ])
      roofGeo.computeVertexNormals()
      const roofMesh = new this._THREE.Mesh(
        roofGeo,
        new this._THREE.MeshLambertMaterial({
          color: 0xe6e6e6, transparent: true, opacity: 0.8, side: this._THREE.DoubleSide
        })
      )
      roofMesh.castShadow = true
      group.add(roofMesh)

      // A single mast at the centre of the corner stand, with its cable running
      // forward toward the field centre (the apex direction).
      const pillarTopY = roofY + 4
      const pillarHeight = pillarTopY + 0.5
      const supportMat = new this._THREE.MeshLambertMaterial({color: 0x444444})
      const cableMat = new this._THREE.LineBasicMaterial({color: 0x333333, linewidth: 3})

      const support = new this._THREE.Mesh(
        new this._THREE.CylinderGeometry(0.3, 0.3, pillarHeight, 8), supportMat
      )
      support.position.set(0, pillarHeight / 2, backZ)
      support.castShadow = true
      group.add(support)

      const cablePoints = [
        new this._THREE.Vector3(0, pillarTopY, backZ),
        new this._THREE.Vector3(0, roofY + 0.2, backZ * 0.25) // toward the apex / field centre
      ]
      const cableGeo = new this._THREE.BufferGeometry().setFromPoints(cablePoints)
      group.add(new this._THREE.Line(cableGeo, cableMat))

      const topCap = new this._THREE.Mesh(new this._THREE.SphereGeometry(0.4, 8, 8), supportMat)
      topCap.position.set(0, pillarTopY, backZ)
      group.add(topCap)

      // Floodlight at the roof's front tip, aimed at the pitch.
      const tipY = frontY - 0.4
      const aim = [0, 0, -25]
      const housing = new this._THREE.Mesh(
        new this._THREE.BoxGeometry(0.9, 0.5, 0.6),
        new this._THREE.MeshLambertMaterial({color: 0x666666})
      )
      housing.position.set(0, tipY, apexZ)
      housing.lookAt(0, aim[1], aim[2])
      group.add(housing)

      const lens = new this._THREE.Mesh(
        new this._THREE.CircleGeometry(0.22, 12),
        new this._THREE.MeshBasicMaterial({color: 0xfff2cc})
      )
      lens.position.set(0, tipY, apexZ - 0.35)
      lens.lookAt(0, aim[1], aim[2])
      group.add(lens)

      const tipLight = new this._THREE.SpotLight(0xfff5e6, 90, 130, Math.PI / 4, 0.5, 1.2)
      tipLight.position.set(0, tipY, apexZ)
      tipLight.target.position.set(0, aim[1], aim[2])
      group.add(tipLight)
      group.add(tipLight.target)
    }

    group.position.set(x, 0, z)
    group.rotation.y = rotation
    scene.add(group)
  }

  /**
   * Players' tunnel at the front-centre of a stand: two side walls, a ceiling
   * and a lit fixture underneath. The mouth protrudes forward onto the pitch and
   * the passage runs back into the stand (through the seat channel left open by
   * `_createStand`). Built in the stand's local space (front at z=0, +z into the
   * stand), so it inherits the stand's placement/rotation.
   * @param {THREE.Group} group
   */
  _createTunnel (group) {
    const T = CONFIG.tunnel
    const zFront = -T.protrude // mouth, forward onto the pitch
    const zBack = T.depth // reaches back into the stand
    const length = zBack - zFront
    const midZ = (zFront + zBack) / 2
    const halfW = T.width / 2
    const th = T.wallThickness

    const wallMat = new this._THREE.MeshLambertMaterial({color: T.wallColor})

    // Side walls.
    for (const sign of [1, -1]) {
      const wall = new this._THREE.Mesh(
        new this._THREE.BoxGeometry(th, T.height, length), wallMat
      )
      wall.position.set(sign * (halfW + th / 2), T.height / 2, midZ)
      wall.castShadow = true
      wall.receiveShadow = true
      group.add(wall)
    }

    // Ceiling.
    const ceiling = new this._THREE.Mesh(
      new this._THREE.BoxGeometry(T.width + 2 * th, th, length), wallMat
    )
    ceiling.position.set(0, T.height + th / 2, midZ)
    ceiling.castShadow = true
    group.add(ceiling)

    // Flat floor over the protruding mouth (the part standing on the pitch).
    const floorLen = -zFront
    if (floorLen > 0) {
      const floor = new this._THREE.Mesh(
        new this._THREE.BoxGeometry(T.width, 0.1, floorLen), wallMat
      )
      floor.position.set(0, 0.05, zFront + floorLen / 2)
      floor.receiveShadow = true
      group.add(floor)
    }

    // Ceiling light: an always-lit fixture panel plus a point light that spills
    // onto the tunnel walls.
    const lamp = new this._THREE.Mesh(
      new this._THREE.BoxGeometry(1.4, 0.06, 1.4),
      new this._THREE.MeshBasicMaterial({color: T.lightColor})
    )
    lamp.position.set(0, T.height - 0.06, midZ)
    group.add(lamp)

    const light = new this._THREE.PointLight(T.lightColor, T.lightIntensity, T.lightRange, 2)
    light.position.set(0, T.height - 0.5, midZ)
    group.add(light)
  }

  /**
   * Substitute benches (dugouts) flanking the players' tunnel, in the field-side
   * gap in front of the stand. Each is a grey base carrying a row of light-grey
   * seats (the same seat geometry as the stands), facing the field. Built in the
   * stand's local space so it inherits the stand's placement/rotation.
   * @param {THREE.Group} group
   */
  _createBenches (group) {
    const B = CONFIG.bench
    const seatWidth = 0.5
    const benchLength = B.seatCount * seatWidth
    const tunnelOuterHalf = CONFIG.tunnel.width / 2 + CONFIG.tunnel.wallThickness
    const centerXMag = tunnelOuterHalf + B.gap + benchLength / 2

    const baseMat = new this._THREE.MeshLambertMaterial({color: B.baseColor})
    const seatMat = new this._THREE.MeshLambertMaterial({color: B.seatColor, side: this._THREE.DoubleSide})
    const seatDepth = 1.0
    const seatGeo = this._createSeatGeometry(seatWidth, seatDepth)

    // The base front (field side) must sit flush with the seat front, not stick
    // out past it: the seat pan reaches seatDepth * 0.25 in front of B.z.
    const seatFrontOffset = seatDepth * 0.25
    const baseZ = B.z - seatFrontOffset + B.baseDepth / 2

    // Collect seat positions for both benches into one instanced mesh.
    const seatPositions = []
    for (const sign of [-1, 1]) {
      const centerX = sign * centerXMag

      const base = new this._THREE.Mesh(
        new this._THREE.BoxGeometry(benchLength + 0.4, B.baseHeight, B.baseDepth), baseMat
      )
      base.position.set(centerX, B.baseHeight / 2, baseZ)
      base.castShadow = true
      base.receiveShadow = true
      group.add(base)

      for (let i = 0; i < B.seatCount; i++) {
        seatPositions.push({
          x: centerX - benchLength / 2 + seatWidth / 2 + i * seatWidth,
          y: B.baseHeight, // top of the base; seat sits on it
          z: B.z
        })
      }
    }

    const seats = new this._THREE.InstancedMesh(seatGeo, seatMat, seatPositions.length)
    const seatMatrix = new this._THREE.Matrix4()
    seatPositions.forEach((p, i) => {
      seatMatrix.setPosition(p.x, p.y, p.z)
      seats.setMatrixAt(i, seatMatrix)
    })
    seats.instanceMatrix.needsUpdate = true
    group.add(seats)
  }
}
