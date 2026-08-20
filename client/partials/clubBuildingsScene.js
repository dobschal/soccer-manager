import {emblemTexture, loadEmblemImage} from '../util/emblemRaster.js'

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
  },
  // The clubhouse north of the pitch, in its own strip of the plot. Three parts:
  // a solid block left and right, and a glass hall between them that carries the
  // entrance and the emblem. It grows with the training ground — a storey per
  // level — and is joined to the pitch's north gate and to the car park by paths.
  clubhouse: {
    depth: 16,
    gapToFence: 6,
    plotMargin: 2, // from its back wall to the plot's north edge
    storeys: {1: 1, 2: 2, 3: 3},
    storeyHeight: 3.4,
    base: 0.3,
    plinthColor: 0x55595e,
    // The two solid wings.
    side: {
      width: 15,
      facadeColor: 0xe2ded4, // light render, brighter than the academy's grey
      roofColor: 0x4a4f55,
      // Single, generously sized windows rather than a continuous band.
      window: {width: 2.8, height: 1.9, sill: 1, proud: 0.1, perFacade: 3, color: 0xffe6b0},
      parapet: 0.5
    },
    // The glass hall in the middle: taller than the wings, glazed on all sides
    // with strutted panes, lit from within.
    center: {
      width: 18,
      extraHeight: 1.6, // how far it rises above the wings
      minHeight: 6.4, // …but never lower than this, so level 1 still reads as a hall
      glassColor: 0xa8ccd8,
      glassOpacity: 0.18,
      frameColor: 0x3a3f45,
      strutColor: 0x2a2e33,
      floorColor: 0xb0aba1,
      roofColor: 0x4a4f55,
      mullionSpacing: 2.4,
      courses: 1,
      // Ceiling panels plus one light per storey — the hall is meant to glow.
      lightColor: 0xffeccc,
      lightIntensity: 40,
      lightRange: 26
    },
    entrance: {width: 6.5, height: 4, doorColor: 0x1b1e22, glassColor: 0x9fd6e8},
    // The emblem on the glass facade, big, right above the entrance.
    emblem: {size: 5, gapAboveEntrance: 0.8},
    solar: {
      1: {cols: 2, rows: 1},
      2: {cols: 3, rows: 1},
      3: {cols: 3, rows: 2},
      panel: {width: 2.4, depth: 1.4, tilt: 25, gapX: 0.4, gapZ: 1.2, lift: 0.5},
      color: 0x16233f,
      frameColor: 0x8f959c,
      legColor: 0x6b7076
    },
    path: {width: 3.5, color: 0x9a9a9a}
  }
})

const PLOT_X = TRAINING.pitch.width + 2 * TRAINING.fence.margin + TRAINING.parking.strip
// The pitch's own square plus the clubhouse strip north of it.
const CLUBHOUSE_STRIP = TRAINING.clubhouse.gapToFence + TRAINING.clubhouse.depth +
  TRAINING.clubhouse.plotMargin
const PLOT_Z = TRAINING.pitch.depth + 2 * TRAINING.fence.margin + CLUBHOUSE_STRIP
// The fenced ground keeps its south edge on the kerb, so it sits at the plot's
// south end and everything else is measured from there.
const GROUND_Z = PLOT_Z / 2 - (TRAINING.pitch.depth / 2 + TRAINING.fence.margin)
const CLUBHOUSE_X = -TRAINING.parking.strip / 2 // centred on the pitch
const CLUBHOUSE_Z = -PLOT_Z / 2 + TRAINING.clubhouse.plotMargin + TRAINING.clubhouse.depth / 2

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
/**
 * The youth academy: a multi-storey block with a light grey facade and blue
 * window bands, the club crest and a "Youth Academy" sign on a blue accent
 * column, a fenced half-size pitch with training kit beside it and a car park in
 * the strip on its far side. Modelled on the building in the level images
 * (`client/assets/youth-academy/`).
 *
 * The footprint stays the same at every level and only the storeys stack up, so
 * the plot, the pitch and the car park never move on an upgrade.
 */
const ACADEMY = Object.freeze({
  building: {
    width: 24,
    depth: 14,
    // Two storeys make the main block; a third, recessed one sits on its roof and
    // is what an upgrade adds first, a fourth main storey what it adds next. The
    // block's own roof is the terrace around the recessed floor.
    storeys: {1: 2, 2: 2, 3: 3},
    penthouse: {1: false, 2: true, 3: true},
    storeyHeight: 3.4,
    base: 0.3, // top of the plinth
    plinthColor: 0x55595e,
    facadeColor: 0xd8d5cc, // light grey, like the render's rendered concrete
    trimColor: 0xb9b6ad, // roof slabs and copings
    accentColor: 0x1e4bb8, // the blue entrance bay
    roofColor: 0x4a4f55,
    // Window bands: one per storey on all four sides, blue glass with dark
    // mullions. `proud` keeps them clear of the facade behind them — far more
    // than the depth buffer needs, since the facade is a solid block.
    window: {
      height: 1.7,
      sill: 0.9, // above each storey's floor
      proud: 0.12,
      spacing: 2.6,
      glassColor: 0x3f7ad6,
      strutColor: 0x24303f
    }
  },
  // The recessed top floor: set back from the main block all round, and further
  // back from the street so the terrace in front of it is the widest.
  penthouse: {inset: 3, streetInset: 1.6, height: 3},
  // The roof terrace's balustrade: glass panels with struts, just inside the roof
  // edge, around the whole slab.
  railing: {height: 1.1, inset: 0.25, glassOpacity: 0.2},
  // The blue entrance bay: a tall volume standing proud of the street facade over
  // the full height of the block, with the emblem sign high up and the entrance
  // at its foot.
  bay: {width: 8.4, proud: 1.8, riseAboveRoof: 1, offsetX: -5.5},
  // Tilted modules on the topmost flat roof, growing per level.
  solar: {
    1: {cols: 2, rows: 1},
    2: {cols: 4, rows: 1},
    3: {cols: 4, rows: 2},
    panel: {width: 2.4, depth: 1.4, tilt: 25, gapX: 0.4, gapZ: 1.2, lift: 0.5},
    color: 0x16233f,
    frameColor: 0x8f959c,
    legColor: 0x6b7076
  },
  sign: {
    width: 8.6,
    height: 3.2,
    // Canvas pixels the sign is drawn at (enough for the emblem's banner text to
    // stay legible), and the two lines of lettering.
    texture: {width: 1024, height: 380},
    lines: ['YOUTH', 'ACADEMY'],
    textColor: '#ffffff',
    fallbackCrestColor: '#1e4bb8',
    // The square the club emblem (or the fallback crest) occupies and where the
    // lettering starts, both as a share of the sign's height.
    crest: {x: 0.08, y: 0.08, size: 0.84},
    textX: 0.98
  },
  entrance: {
    width: 6,
    height: 3.2,
    // A small canopy over the door with a lit strip under it.
    canopyDepth: 1.6,
    canopyColor: 0x143a91,
    doorColor: 0x1b1e22,
    glassColor: 0x9fd6e8,
    // The lobby behind the glass: an emissive panel plus a light, so the doorway
    // glows from inside at dusk.
    lobbyColor: 0xffeec9,
    lobbyLight: {intensity: 30, range: 18},
    pathWidth: 4,
    pathColor: 0x9a9a9a
  },
  // Half the stadium pitch (`CONFIG.field` in stadiumCanvas.js), fenced with a
  // gate on the street side.
  pitch: {width: 25, depth: 15, fenceMargin: 3, goalScale: 0.7},
  // Two masts at the pitch's street-side corners, aimed at their own half the way
  // the training ground's are.
  masts: {
    1: {height: 9, intensity: 170, distance: 70, lamps: 1, pairs: 1},
    2: {height: 11, intensity: 260, distance: 85, lamps: 2, pairs: 1},
    3: {height: 13, intensity: 420, distance: 100, lamps: 2, pairs: 1}
  },
  // Training kit on the pitch, growing with the level: marker cones, a slalom
  // line, hurdles to jump and free-kick dummies to shoot over.
  kit: {
    1: {cones: 10, poles: 5, hurdles: 2, dummies: 0, balls: 6},
    2: {cones: 16, poles: 7, hurdles: 3, dummies: 2, balls: 10},
    3: {cones: 22, poles: 9, hurdles: 5, dummies: 4, balls: 14}
  },
  hurdle: {width: 1.2, height: 0.5, color: 0xff7a1a},
  dummy: {height: 1.8, radius: 0.22, color: 0xf2c200},
  // Car park in the strip beyond the pitch, built by the shared `addParking`.
  parking: {
    strip: 17,
    aisle: 6,
    bay: {depth: 5, width: 2.5},
    rows: {1: 1, 2: 1, 3: 2},
    bays: {1: 5, 2: 7, 3: 8},
    band: {north: -9},
    driveway: {width: 6},
    asphaltColor: 0x3a3a3c,
    markingColor: 0xf2f2f2,
    masts: {1: 0, 2: 1, 3: 2},
    mast: {height: 8, intensity: 180, distance: 60, lamps: 2}
  },
  // Pedestrian lamps along the path from the entrance to the car park, built like
  // the stadium's street lamps (`_createStreetLamp`): emissive head, no light of
  // its own.
  lamp: {height: 4, poleColor: 0x2a2a2a, lightColor: 0xffdd88},
  margin: 4, // gap from the building and the pitch fence to the plot edge
  gap: 4, // between the pitch fence and the building's back
  pathGap: 8 // between the building's entrance and the car park
})

const ACADEMY_FENCE_X = ACADEMY.pitch.width + 2 * ACADEMY.pitch.fenceMargin
const ACADEMY_FENCE_Z = ACADEMY.pitch.depth + 2 * ACADEMY.pitch.fenceMargin
// Building and pitch are both built facing the street and then turned a quarter
// turn, so along the plot's x axis the building takes up its *depth* and the
// pitch its fence's *short* side. Order across the plot: pitch, building, path,
// car park. The whole plot is mirrored into the world by the 180° turn in the
// builder, so its far end is the one at the crossing.
const ACADEMY_PLOT_X = ACADEMY.margin + ACADEMY_FENCE_Z + ACADEMY.gap +
  ACADEMY.building.depth + ACADEMY.pathGap + ACADEMY.parking.strip
const ACADEMY_PLOT_Z = ACADEMY_FENCE_X + 2 * 4.5
const ACADEMY_PITCH_X = -ACADEMY_PLOT_X / 2 + ACADEMY.margin + ACADEMY_FENCE_Z / 2
const ACADEMY_BUILDING_X = -ACADEMY_PLOT_X / 2 + ACADEMY.margin + ACADEMY_FENCE_Z +
  ACADEMY.gap + ACADEMY.building.depth / 2
const ACADEMY_PARKING_X = ACADEMY_PLOT_X / 2 - ACADEMY.parking.strip / 2
// Front of the entrance bay, and the west edge of the car park's asphalt — the
// two ends of the footpath between them. The bay sits off-centre on its facade,
// and the quarter turn puts that offset on the plot's z axis, so the path has to
// follow it to actually meet the door.
const ACADEMY_ENTRANCE_X = ACADEMY_BUILDING_X + ACADEMY.building.depth / 2 + ACADEMY.bay.proud
const ACADEMY_ENTRANCE_Z = -ACADEMY.bay.offsetX
const ACADEMY_LOT_EDGE_X = ACADEMY_PARKING_X - ACADEMY.parking.aisle / 2 -
  ACADEMY.parking.bay.depth - 0.5

// The south facade sits here on every level, so the entrance, its path and the
// plinth in front of it never move when the hall grows.
const GYM_SOUTH_FACE = HALL[3].depth / 2
// Top of the entrance canopy — the sign band starts just above it.
const GYM_CANOPY_Y = FITNESS.building.base + FITNESS.entrance.height + 0.5
const GYM_CANOPY_TOP = GYM_CANOPY_Y + 0.11

/**
 * The medical practice: a small modern block with a flat roof west of the gym,
 * fronted by a colonnade from the street and, beside it, a driveway with an
 * ambulance standing in it. A big illuminated red cross hangs on the front
 * facade above the driveway, and a satellite dish sits on the roof.
 *
 * Unlike the other three this building has a **single level** — it is built or it
 * is not — so nothing in here is keyed by level.
 *
 * Its plot is the strip between the gym's plot and the west ring road, and it is
 * only ever as wide as that strip is at the smallest stadium (the roads move
 * outward with the stands, so it can only ever get roomier). Local coordinates,
 * origin = plot centre, street along the south (+z) edge.
 */
// Centre line of the colonnade, its entrance and the cross above it — they all
// have to line up, so the value lives outside the frozen config.
const PRACTICE_ENTRANCE_X = -4.1

const PRACTICE = Object.freeze({
  building: {
    width: 14,
    depth: 9,
    height: 5.6,
    base: 0.3, // top of the plinth
    plinthColor: 0x55595e,
    facadeColor: 0xe6e3db, // light render, a shade warmer than the clubhouse's
    trimColor: 0x4a4f55,
    parapet: 0.6,
    // A glazed band per facade rather than single windows: consulting rooms.
    // On the front, the colonnade takes the west half, so the band sits on the
    // east one — over the ambulance bay, where the cross used to hang.
    band: {height: 1.7, sill: 1.5, inset: 0.06, frontWidth: 5.2, frontX: 3.4},
    glassColor: 0x9fc6d8,
    glassOpacity: 0.28,
    frameColor: 0x3a3f45,
    strutColor: 0x2a2e33,
    mullionSpacing: 1.8
  },
  // The illuminated red cross on the front facade, in the band between the
  // colonnade's roof slab and the top of the wall, centred over the entrance
  // below it. A dark backing panel, the cross itself unlit-bright
  // (`MeshBasicMaterial`) and a point light in front of it so it actually
  // colours the colonnade's roof.
  cross: {
    x: PRACTICE_ENTRANCE_X,
    y: 4.7,
    span: 1.8, // tip to tip, both arms
    thickness: 0.6,
    proud: 0.18, // how far it stands off the facade
    color: 0xe62222,
    panelColor: 0x23272c,
    panelPadding: 0.3,
    lightIntensity: 20,
    lightRange: 18
  },
  // The colonnade: a covered walkway from the street to the entrance, a row of
  // round columns on either side carrying a flat slab.
  colonnade: {
    centerX: PRACTICE_ENTRANCE_X,
    width: 5, // between the two rows of columns
    columns: 5,
    column: {radius: 0.32, height: 3, color: 0xe6e3db, baseHeight: 0.16, baseRadius: 0.44},
    slab: {thickness: 0.26, overhang: 0.6, color: 0xd6d2c8},
    paving: {color: 0xb4b0a7},
    // Lit from under the slab, like the gym's canopy.
    lightColor: 0xfff2cc,
    lightIntensity: 12,
    lightRange: 14
  },
  entrance: {width: 3.2, height: 2.6, doorColor: 0x1b1e22, glassColor: 0x9fd6e8},
  // The driveway east of the colonnade, off the same street.
  driveway: {centerX: 4, width: 6.4, northEnd: 0.6, color: 0x3a3a3c},
  // The dish on the flat roof, tilted up towards the south-west sky. `x` / `z`
  // are in the block's own frame (origin = centre of its footprint), so both have
  // to stay inside half its width / depth for it to stand on the roof at all.
  dish: {
    x: -4.2,
    z: -2.4,
    radius: 1.1,
    tilt: 38, // degrees up from vertical
    yaw: -35, // degrees off south, towards the west
    mastHeight: 1.1,
    color: 0xdad6cd,
    frameColor: 0x8f959c
  },
  // The ambulance parked in the driveway, nose towards the street.
  ambulance: {
    z: 5.4,
    body: {length: 5.4, width: 2.1, height: 1.9, clearance: 0.34},
    cabin: {length: 1.9, height: 1.55},
    bodyColor: 0xf1f4f7,
    stripeColor: 0xe62222,
    glassColor: 0x2a3440,
    wheelColor: 0x1b1d20,
    crossSize: 1,
    // The beacon: two lenses on a bar across the cabin roof that take turns, so
    // it reads as a rotating light rather than a lamp switching on and off.
    // `speed` is radians of animation time per unit (~3 units/second), so this
    // works out at roughly one turn every three and a half seconds.
    beacon: {
      color: 0x2f6fff,
      speed: 0.55,
      lensRadius: 0.17,
      spread: 0.52,
      barWidth: 1.5,
      lightIntensity: 16,
      lightRange: 13
    }
  }
})

const PRACTICE_PLOT_X = 18
// The same depth as the gym's plot, so both south edges land on the same kerb and
// the practice's colonnade opens onto the very street the gym's entrance does.
const PRACTICE_PLOT_Z = GYM_PLOT_Z
// The block sits in the middle of the plot's x range with its front set back far
// enough for the colonnade to have some length.
const PRACTICE_BUILDING_Z = -PRACTICE_PLOT_Z / 2 + 4 + PRACTICE.building.depth / 2
const PRACTICE_FRONT = PRACTICE_BUILDING_Z + PRACTICE.building.depth / 2

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
 *
 * A quadrant only holds one plot, and the fourth is the stadium, so the medical
 * practice does not get one of its own: `beside` puts it in the same quadrant as
 * the fitness studio but shifted along x by the studio's full width, i.e. on the
 * strip further west, sharing the studio's street. `roadSides` says which of the
 * plot's two quadrant-facing sides actually borders a road — for the practice
 * only the street on the south, since its east side is the studio's plot.
 * @type {Readonly<Object<string, {size: {x: number, z: number}, quadrant: {x: number, z: number}, beside?: string, roadSides?: {x: boolean, z: boolean}}>>}
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
  youth_academy: {
    size: {x: ACADEMY_PLOT_X, z: ACADEMY_PLOT_Z},
    quadrant: {x: 1, z: 1}
  },
  medical_practice: {
    size: {x: PRACTICE_PLOT_X, z: PRACTICE_PLOT_Z},
    quadrant: {x: -1, z: -1},
    beside: 'fitness_studio',
    roadSides: {x: false, z: true}
  }
})

/**
 * How each building is framed for its own portrait — the still the buildings page
 * shows on the card next to the description, cropped straight out of the same 3D
 * scene the canvas above it orbits.
 *
 * `x` / `y` / `z` is the point the camera looks at in the plot's **own** frame
 * (origin = plot centre, y = height above the ground), `radius` the half-size of
 * the sphere around it that has to fit in frame, `elevation` how high above the
 * horizon the camera stands. The youth academy's plot is turned around by its
 * builder, so its target is given in the turned frame (hence the negated x).
 * @type {Readonly<Object<string, {x: number, y: number, z: number, radius: number, elevation: number}>>}
 */
export const BUILDING_VIEWS = Object.freeze({
  // The fenced pitch with the clubhouse behind it — the whole ground bar the car
  // park, which is what the plot is really about.
  training_area: {x: CLUBHOUSE_X, y: 4, z: 1, radius: 31, elevation: 32},
  // Just the hall: its south facade carries the entrance and the neon sign.
  fitness_studio: {x: GYM_BUILDING_X, y: 4, z: GYM_SOUTH_FACE - HALL[3].depth / 2, radius: 17, elevation: 22},
  // The block, close enough that the crest and the lettering on the entrance bay
  // stay legible.
  youth_academy: {x: -ACADEMY_BUILDING_X, y: 7, z: 0, radius: 19, elevation: 22},
  // The front: the colonnade, the ambulance in the driveway and the red cross
  // above it are all on this side, so the portrait looks straight at it.
  medical_practice: {x: 0, y: 3.4, z: PRACTICE_FRONT + 4, radius: 12, elevation: 20}
})

/**
 * How each building is framed when it is used as a *backdrop* rather than as a
 * portrait: the youth-team page stands its squad photo in front of the academy
 * (#563), and for that the camera drops far closer to the ground than a
 * portrait needs, so the building stands behind the players instead of the plot
 * being looked down on.
 *
 * Same shape as `BUILDING_VIEWS`, and only defined for the buildings that are
 * actually used this way.
 * @type {Readonly<Object<string, {x: number, y: number, z: number, radius: number, elevation: number}>>}
 */
export const BUILDING_BACKDROP_VIEWS = Object.freeze({
  // Wide and high enough that both roads, the crossing, the training pitch and
  // the car park frame the building, while it still stands squarely behind the
  // squad rather than being looked down on like the portrait view does.
  youth_academy: {x: -ACADEMY_BUILDING_X, y: 4, z: 0, radius: 22, elevation: 22}
})

// How much air the portrait keeps around its framed sphere.
const VIEW_MARGIN = 1.08

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
 * @returns {Array<{type: string, level: number, cx: number, cz: number, halfX: number, halfZ: number, qx: number, qz: number, roadSides: {x: boolean, z: boolean}}>}
 */
export function clubBuildingPlots (buildings, intersection, clearance) {
  return (buildings || [])
    .filter(b => BUILDING_PLOTS[b?.type] && (b.level || 0) >= 1)
    .map(b => clubBuildingPlot(b.type, Math.max(1, Math.min(3, b.level)), intersection, clearance))
}

/**
 * The plot of one building type, whether or not the team owns it — the same
 * geometry `clubBuildingPlots` hands out, for a building that is only being
 * portrayed (the buildings page shows what an unbuilt one would look like).
 * @param {string} type
 * @param {number} level
 * @param {{x: number, z: number}} intersection
 * @param {number} clearance
 * @returns {{type: string, level: number, cx: number, cz: number, halfX: number, halfZ: number, qx: number, qz: number, roadSides: {x: boolean, z: boolean}}|null}
 */
export function clubBuildingPlot (type, level, intersection, clearance) {
  const spec = BUILDING_PLOTS[type]
  if (!spec) return null
  const {size, quadrant, beside, roadSides} = spec
  const halfX = size.x / 2
  const halfZ = size.z / 2
  // A plot placed `beside` another one starts at that neighbour's far edge
  // instead of at the crossing, so the two sit side by side along the same road.
  const neighbour = beside ? BUILDING_PLOTS[beside] : null
  const shiftX = neighbour ? quadrant.x * neighbour.size.x : 0
  return {
    type,
    level,
    halfX,
    halfZ,
    qx: quadrant.x,
    qz: quadrant.z,
    roadSides: roadSides || {x: true, z: true},
    cx: intersection.x + quadrant.x * (clearance + halfX) + shiftX,
    cz: intersection.z + quadrant.z * (clearance + halfZ)
  }
}

/**
 * Where to put a camera to portray one building on its plot: the crop of the
 * scene the buildings page shows on that building's card.
 *
 * The camera always stands over the plot's crossing-facing corner — the two sides
 * a plot borders a road on, so it looks along the sidewalk at the front of the
 * building instead of at its back — and far enough out that `BUILDING_VIEWS`'
 * sphere fits in the narrower of the two field-of-view angles. Pure geometry, so
 * the framing can be checked without a scene.
 * @param {{type: string, cx: number, cz: number, halfX: number, halfZ: number, qx: number, qz: number}} plot
 * @param {{aspect?: number, fov?: number, view?: {x: number, y: number, z: number, radius: number, elevation: number}}} [options]
 *   `fov` is the camera's vertical field of view in degrees, `aspect` the
 *   still's width / height, `view` a framing to use instead of the building's
 *   own portrait one (see `BUILDING_BACKDROP_VIEWS`).
 * @returns {{position: {x: number, y: number, z: number}, target: {x: number, y: number, z: number}, fov: number}}
 */
export function buildingSnapshotView (plot, {aspect = 1.6, fov = 45, view: framing} = {}) {
  const view = framing || BUILDING_VIEWS[plot.type] ||
    {x: 0, y: 4, z: 0, radius: Math.max(plot.halfX, plot.halfZ), elevation: 26}
  const target = {x: plot.cx + view.x, y: view.y, z: plot.cz + view.z}

  // The tighter of the two half-angles decides the distance — a wide still is
  // limited by its height, a tall one by its width.
  const vertical = (fov * Math.PI / 180) / 2
  const horizontal = Math.atan(Math.tan(vertical) * aspect)
  const distance = view.radius * VIEW_MARGIN / Math.sin(Math.min(vertical, horizontal))

  const elevation = view.elevation * Math.PI / 180
  // Diagonally out over the crossing-facing corner (the plot's -qx / -qz side).
  const reach = distance * Math.cos(elevation) / Math.SQRT2
  return {
    position: {
      x: target.x - plot.qx * reach,
      y: target.y + distance * Math.sin(elevation),
      z: target.z - plot.qz * reach
    },
    target,
    fov
  }
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
export function buildTrainingArea (THREE, scene, {level, rand, x, z, sidewalkWidth = 3, emblemSvg}) {
  const lvl = Math.max(1, Math.min(3, level || 1))
  const group = new THREE.Group()
  const {pitch, fence, parking} = TRAINING

  // The fenced ground sits at the west end of the plot, the car park fills the
  // strip east of it — so everything fenced is built in a sub-group shifted west
  // by half the strip.
  const ground = new THREE.Group()
  ground.position.set(-parking.strip / 2, 0, GROUND_Z)
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
    centerZ: 0,
    northGate: true // the way in from the clubhouse
  })
  addFloodlights(THREE, ground, lvl)

  if (lvl >= 2) {
    addEquipment(THREE, ground, rand)
    addBenches(THREE, ground, lvl)
  }

  addClubhouse(THREE, group, {level: lvl, emblemSvg})

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
    // Same ratio as the stadium's centre circle, off the short side — so a pitch
    // built the other way round (the academy's) gets the same circle, not a
    // stretched one.
    const radius = Math.min(width, depth) / 6
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
function addFence (THREE, parent, {halfWidth, halfDepth, centerZ, northGate = false}) {
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
  if (northGate) {
    // Swap the closed north side for two runs with an opening in the middle.
    segments.splice(0, 1,
      {from: [-halfWidth, north], to: [-gate, north]},
      {from: [gate, north], to: [halfWidth, north]}
    )
  }

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
    // Off with the floodlights by day (`_setNightLightsOn` in stadiumCanvas.js).
    lens.userData.nightOnly = true
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
  addSolarArray(THREE, parent, {
    spec: S[level],
    panel: S.panel,
    colors: S,
    roofTop: FITNESS.building.base + size.height + 0.28
  })
}

/**
 * A grid of tilted solar modules standing on a flat roof, each on a short front
 * and a taller back leg so its face turns south towards the low evening sun.
 * Shared by the fitness studio and the youth academy.
 * @param {Object} THREE
 * @param {Object} parent the group the roof belongs to
 * @param {{spec: {cols: number, rows: number}, panel: Object, colors: {color: number, frameColor: number, legColor: number}, roofTop: number, x?: number, z?: number}} config
 *   `x` / `z` centre the array over a roof that is not the parent's own origin.
 */
function addSolarArray (THREE, parent, {spec, panel: P, colors, roofTop, x = 0, z = 0}) {
  if (!spec) return
  const tilt = P.tilt * Math.PI / 180
  // What a tilted module takes up on the roof, and how far its edges rise/fall.
  const footprint = P.depth * Math.cos(tilt)
  const rise = P.depth * Math.sin(tilt) / 2

  const panelGeo = new THREE.BoxGeometry(P.width, 0.06, P.depth)
  const frameGeo = new THREE.BoxGeometry(P.width + 0.12, 0.05, P.depth + 0.12)
  const panelMat = new THREE.MeshLambertMaterial({color: colors.color})
  const frameMat = new THREE.MeshLambertMaterial({color: colors.frameColor})
  const legMat = new THREE.MeshLambertMaterial({color: colors.legColor})
  const frontLegGeo = new THREE.BoxGeometry(0.08, P.lift - rise, 0.08)
  const backLegGeo = new THREE.BoxGeometry(0.08, P.lift + rise, 0.08)

  const spanX = spec.cols * P.width + (spec.cols - 1) * P.gapX
  const spanZ = spec.rows * footprint + (spec.rows - 1) * P.gapZ

  for (let col = 0; col < spec.cols; col++) {
    const px = x - spanX / 2 + P.width / 2 + col * (P.width + P.gapX)
    for (let row = 0; row < spec.rows; row++) {
      const pz = z - spanZ / 2 + footprint / 2 + row * (footprint + P.gapZ)

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

/**
 * Build the youth academy of a given level.
 *
 * A multi-storey block with a light grey facade and blue window bands stands at
 * one end of the plot, the club crest and a "Youth Academy" sign on the blue
 * accent column beside its entrance. Next to it lies a fenced half-size pitch
 * with training kit on it, and beyond that the car park.
 *
 * - **Level 1** – two storeys, a light kit (cones, a slalom line, two hurdles)
 *   and a short row of parking bays.
 * - **Level 2** – three storeys, more kit plus free-kick dummies, more bays and a
 *   lamp mast over the car park.
 * - **Level 3** – four storeys, a fully equipped pitch, a second row of bays and
 *   a second mast.
 *
 * @param {Object} THREE the Three.js module
 * @param {Object} scene object with `.add()`
 * @param {{level: number, rand: () => number, x: number, z: number, sidewalkWidth?: number, teamColor?: string}} options
 *   `emblemSvg` is the club's own emblem (from `renderEmblem`) for the facade,
 *   with `teamColor` colouring the generic crest that stands in until it has been
 *   rasterised; `sidewalkWidth` is how far the entrance path and the driveway
 *   reach past the plot boundary to meet the road.
 * @returns {{group: Object, entrance: {x: number, z: number, width: number}, openings: Array<{x: number, z: number, width: number}>}}
 *   the built group, its entrance and every opening in the plot's road-facing
 *   sides, in plot-local coordinates.
 */
export function buildYouthAcademy (THREE, scene, {level, rand, x, z, sidewalkWidth = 3, teamColor, emblemSvg}) {
  const lvl = Math.max(1, Math.min(3, level || 1))
  const group = new THREE.Group()
  const A = ACADEMY
  const storeys = A.building.storeys[lvl]

  // Both volumes are built facing the street and turned a quarter turn: the
  // building's entrance then looks at the car park, the pitch lies crosswise
  // behind it, and the solar modules end up facing the low western sun.
  const building = new THREE.Group()
  building.position.set(ACADEMY_BUILDING_X, 0, 0)
  building.rotation.y = Math.PI / 2
  group.add(building)
  addAcademyBlock(THREE, building, {
    storeys,
    penthouse: A.building.penthouse[lvl],
    level: lvl
  })
  addAcademySign(THREE, building, {storeys, teamColor, emblemSvg})

  // Turned the same way, so its gate and floodlights face the building.
  const pitch = new THREE.Group()
  pitch.position.set(ACADEMY_PITCH_X, 0, 0)
  pitch.rotation.y = Math.PI / 2
  group.add(pitch)
  addAcademyPitch(THREE, pitch, {level: lvl, rand})

  const southEdge = ACADEMY_PLOT_Z / 2
  addAcademyPath(THREE, group)
  const driveway = addParking(THREE, group, {
    spec: A.parking,
    rows: A.parking.rows[lvl],
    bayCount: A.parking.bays[lvl],
    centerX: ACADEMY_PARKING_X,
    southEdge,
    sidewalkWidth,
    firstSide: -1 // the first row goes next to the pitch fence
  })
  addAcademyParkingLights(THREE, group, lvl)

  // Built with its street side toward +z (like the fitness studio), but this plot
  // borders its roads on the opposite sides — so the whole plot is turned around.
  // The openings go back out in the plot's own frame, hence the negated axes.
  group.rotation.y = Math.PI
  group.position.set(x, 0, z)
  scene.add(group)

  const turned = o => o && {x: -o.x, z: -o.z, width: o.width}

  return {
    group,
    // The entrance faces the car park, not a road, so it is no opening in the
    // plot's boundary — only the driveway is.
    entrance: turned({x: ACADEMY_ENTRANCE_X, z: ACADEMY_ENTRANCE_Z, width: A.entrance.width}),
    openings: [turned(driveway)].filter(Boolean)
  }
}

/**
 * The building itself: a plinth carrying a solid light-grey block with a blue
 * window band per storey, the tall blue entrance bay on the street facade, a roof
 * terrace behind a glass balustrade and — from level 2 — a recessed top floor
 * standing in the middle of that terrace, with the solar array on its roof.
 * @param {Object} THREE
 * @param {Object} parent the building's group, centred on its footprint
 * @param {{storeys: number, penthouse: boolean, level: number}} config
 */
function addAcademyBlock (THREE, parent, {storeys, penthouse, level}) {
  const B = ACADEMY.building
  const P = ACADEMY.penthouse
  const height = storeys * B.storeyHeight
  const hw = B.width / 2
  const hd = B.depth / 2
  const facadeMat = new THREE.MeshLambertMaterial({color: B.facadeColor})
  const slabMat = new THREE.MeshLambertMaterial({color: B.trimColor})

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(B.width + 1.2, B.base, B.depth + 1.2),
    new THREE.MeshLambertMaterial({color: B.plinthColor})
  )
  plinth.position.set(0, B.base / 2, 0)
  plinth.receiveShadow = true
  parent.add(plinth)

  const shell = new THREE.Mesh(new THREE.BoxGeometry(B.width, height, B.depth), facadeMat)
  shell.position.set(0, B.base + height / 2, 0)
  shell.castShadow = true
  shell.receiveShadow = true
  parent.add(shell)

  addAcademyWindows(THREE, parent, {
    storeys,
    width: B.width,
    depth: B.depth,
    fromY: B.base,
    splitAroundBay: true
  })

  // The main roof doubles as the terrace floor, so it is a walkable slab rather
  // than a parapet-ringed lid.
  const terraceY = B.base + height
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(B.width + 0.8, 0.26, B.depth + 0.8), slabMat
  )
  slab.position.set(0, terraceY + 0.13, 0)
  slab.castShadow = true
  slab.receiveShadow = true
  parent.add(slab)

  const terraceTop = terraceY + 0.26
  addAcademyRailing(THREE, parent, {y: terraceTop, halfWidth: hw + 0.4, halfDepth: hd + 0.4})

  let topRoof = terraceTop
  if (penthouse) {
    const width = B.width - 2 * P.inset
    const depth = B.depth - 2 * P.inset - P.streetInset
    // Pushed away from the street, so the terrace is deepest where it is seen.
    const centerZ = -P.streetInset / 2
    const top = terraceTop + P.height

    const box = new THREE.Mesh(new THREE.BoxGeometry(width, P.height, depth), facadeMat)
    box.position.set(0, terraceTop + P.height / 2, centerZ)
    box.castShadow = true
    parent.add(box)

    addAcademyWindows(THREE, parent, {
      storeys: 1,
      width,
      depth,
      centerZ,
      fromY: terraceTop,
      splitAroundBay: false
    })

    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.7, 0.24, depth + 0.7), slabMat
    )
    cap.position.set(0, top + 0.12, centerZ)
    cap.castShadow = true
    parent.add(cap)
    topRoof = top + 0.24
  }

  addAcademySolar(THREE, parent, {level, roofTop: topRoof})
  addAcademyBay(THREE, parent, {height, hd})
}

/**
 * The glass balustrade around the roof terrace: strutted panels just inside the
 * slab's edge, on all four sides.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{y: number, halfWidth: number, halfDepth: number}} config
 */
function addAcademyRailing (THREE, parent, {y, halfWidth, halfDepth}) {
  const R = ACADEMY.railing
  const W = ACADEMY.building.window
  const glassMat = new THREE.MeshLambertMaterial({
    color: W.glassColor,
    transparent: true,
    opacity: R.glassOpacity,
    side: THREE.DoubleSide
  })
  const strutMat = new THREE.MeshLambertMaterial({color: W.strutColor})
  const x = halfWidth - R.inset
  const z = halfDepth - R.inset
  const centerY = y + R.height / 2

  // The street side is interrupted by the entrance bay, which rises past the roof
  // line — the balustrade runs either side of it instead of through it.
  const A = ACADEMY.bay
  const bayLeft = A.offsetX - A.width / 2
  const bayRight = A.offsetX + A.width / 2

  addGlassPane(THREE, parent, {
    glassMat, strutMat, width: 2 * x, height: R.height, x: 0, y: centerY, z: -z, axis: 'x'
  })
  for (const [from, to] of [[-x, bayLeft], [bayRight, x]]) {
    if (to - from < 0.5) continue
    addGlassPane(THREE, parent, {
      glassMat,
      strutMat,
      width: to - from,
      height: R.height,
      x: (from + to) / 2,
      y: centerY,
      z,
      axis: 'x'
    })
  }
  for (const sx of [-1, 1]) {
    addGlassPane(THREE, parent, {
      glassMat, strutMat, width: 2 * z, height: R.height, x: sx * x, y: centerY, z: 0, axis: 'z'
    })
  }
}

/**
 * Tilted solar modules on the topmost flat roof — the penthouse's once it is
 * there, the main block's before that.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{level: number, roofTop: number}} config
 */
function addAcademySolar (THREE, parent, {level, roofTop}) {
  const S = ACADEMY.solar
  addSolarArray(THREE, parent, {spec: S[level], panel: S.panel, colors: S, roofTop})
}

/**
 * The blue entrance bay: a tall volume proud of the street facade over the full
 * height of the block, carrying the emblem sign high up (added separately) and
 * the entrance at its foot.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{height: number, hd: number}} config the block's storey height and its
 *   street facade's z
 */
function addAcademyBay (THREE, parent, {height, hd}) {
  const B = ACADEMY.building
  const A = ACADEMY.bay

  const bay = new THREE.Mesh(
    new THREE.BoxGeometry(A.width, height + A.riseAboveRoof, A.proud),
    new THREE.MeshLambertMaterial({color: B.accentColor})
  )
  bay.position.set(A.offsetX, B.base + (height + A.riseAboveRoof) / 2, hd + A.proud / 2)
  bay.castShadow = true
  parent.add(bay)

  addAcademyEntrance(THREE, parent, {face: hd + A.proud})
}

/**
 * One blue, mullioned window band per storey, on all four facades of a volume.
 * The bands sit proud of the solid facade instead of being cut into it — cheaper
 * than a glass shell and, unlike a flush decal, impossible to z-fight with. On
 * the main block the street-side band runs in two pieces, because the entrance
 * bay stands in the middle of that facade.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{storeys: number, width: number, depth: number, fromY: number, centerZ?: number, splitAroundBay?: boolean}} config
 */
function addAcademyWindows (THREE, parent, {
  storeys, width, depth, fromY, centerZ = 0, splitAroundBay = false
}) {
  const B = ACADEMY.building
  const W = B.window
  const A = ACADEMY.bay
  const glassMat = new THREE.MeshBasicMaterial({color: W.glassColor})
  const strutMat = new THREE.MeshLambertMaterial({color: W.strutColor})
  const hw = width / 2
  const hd = depth / 2

  // Street-side pieces: the whole facade, or the strips either side of the bay.
  const streetBands = splitAroundBay
    ? [
      [A.offsetX - A.width / 2 + hw, -hw],
      [hw - (A.offsetX + A.width / 2), hw]
    ].map(([bandWidth, edge]) => ({
      width: bandWidth - 0.8,
      x: edge + Math.sign(-edge) * bandWidth / 2
    }))
    : [{width: width - 1, x: 0}]

  for (let i = 0; i < storeys; i++) {
    const y = fromY + i * B.storeyHeight + W.sill + W.height / 2
    const band = (config) => addGlassPane(THREE, parent, {
      glassMat,
      strutMat,
      height: W.height,
      y,
      spacing: W.spacing,
      ...config
    })

    band({width: width - 1, x: 0, z: centerZ - (hd + W.proud), axis: 'x'})
    for (const sx of [-1, 1]) {
      band({width: depth - 1, x: sx * (hw + W.proud), z: centerZ, axis: 'z'})
    }
    for (const piece of streetBands) {
      if (piece.width < 1.5) continue
      band({...piece, z: centerZ + hd + W.proud, axis: 'x'})
    }
  }
}

/**
 * The entrance at the foot of the blue bay: a glazed double door with the lit
 * lobby glowing behind it, and a small canopy over it with a light strip
 * underneath.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{face: number}} config `face` is the z of the bay's front face
 */
function addAcademyEntrance (THREE, parent, {face}) {
  const B = ACADEMY.building
  const E = ACADEMY.entrance
  const x = ACADEMY.bay.offsetX
  const frameMat = new THREE.MeshLambertMaterial({color: E.doorColor})
  const glassMat = new THREE.MeshLambertMaterial({
    color: E.glassColor,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide
  })

  // The lobby: an emissive panel a little way behind the glass plus a light, so
  // the doorway reads as lit from inside rather than as a dark hole.
  const lobby = new THREE.Mesh(
    new THREE.PlaneGeometry(E.width - 0.3, E.height - 0.3),
    new THREE.MeshBasicMaterial({color: E.lobbyColor})
  )
  lobby.position.set(x, B.base + (E.height - 0.3) / 2, face - 0.5)
  parent.add(lobby)

  const inside = new THREE.PointLight(E.lobbyColor, E.lobbyLight.intensity, E.lobbyLight.range, 2)
  inside.position.set(x, B.base + E.height / 2, face - 0.9)
  parent.add(inside)

  const leafWidth = E.width / 2 - 0.15
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(leafWidth, E.height - 0.2, 0.1), glassMat
    )
    leaf.position.set(x + side * E.width / 4, B.base + (E.height - 0.2) / 2, face)
    parent.add(leaf)

    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.16, E.height, 0.18), frameMat)
    jamb.position.set(x + side * E.width / 2, B.base + E.height / 2, face)
    parent.add(jamb)

    const stile = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, E.height - 0.2, 0.14), frameMat
    )
    stile.position.set(x + side * 0.06, B.base + (E.height - 0.2) / 2, face)
    parent.add(stile)
  }

  const header = new THREE.Mesh(new THREE.BoxGeometry(E.width + 0.4, 0.2, 0.24), frameMat)
  header.position.set(x, B.base + E.height, face)
  parent.add(header)

  const canopyY = B.base + E.height + 0.5
  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(E.width + 1.4, 0.2, E.canopyDepth),
    new THREE.MeshLambertMaterial({color: E.canopyColor})
  )
  canopy.position.set(x, canopyY, face + E.canopyDepth / 2 - 0.1)
  canopy.castShadow = true
  parent.add(canopy)

  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(E.width + 0.8, E.canopyDepth - 0.4),
    new THREE.MeshBasicMaterial({color: COLORS.lampGlow})
  )
  strip.rotation.x = Math.PI / 2
  strip.position.set(x, canopyY - 0.11, face + E.canopyDepth / 2 - 0.1)
  parent.add(strip)

  const light = new THREE.PointLight(COLORS.lampGlow, 22, 14, 2)
  light.position.set(x, canopyY - 0.4, face + E.canopyDepth)
  parent.add(light)
}

/**
 * The sign high up on the entrance bay: the club emblem next to "YOUTH ACADEMY"
 * in two lines, drawn into a canvas and mapped onto a plane. Without a 2D context
 * (in tests, for instance) the panel is skipped rather than faked.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{storeys: number, teamColor?: string, emblemSvg?: string}} config
 * @returns {Object|null} the sign mesh, or `null` when it could not be drawn
 */
function addAcademySign (THREE, parent, {storeys, teamColor, emblemSvg}) {
  const B = ACADEMY.building
  const A = ACADEMY.bay
  const S = ACADEMY.sign
  const texture = academySignTexture(THREE, {teamColor, emblemSvg})
  if (!texture) return null

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(S.width, S.height),
    new THREE.MeshBasicMaterial({map: texture})
  )
  // Near the top of the bay, on its street-facing face — well above the entrance.
  const bayTop = B.base + storeys * B.storeyHeight + A.riseAboveRoof
  sign.position.set(A.offsetX, bayTop - S.height / 2 - 0.8, B.depth / 2 + A.proud + 0.06)
  parent.add(sign)
  return sign
}

/**
 * Draw the facade sign onto a canvas: the club emblem and the two lines of
 * lettering on the accent blue. The emblem is an SVG that has to be rasterised
 * asynchronously, so the panel starts out with a generic crest in the team's
 * colour and is repainted once the real one is ready.
 * @param {Object} THREE
 * @param {{teamColor?: string, emblemSvg?: string}} config
 * @returns {Object|null} a CanvasTexture, or `null` without a 2D context
 */
function academySignTexture (THREE, {teamColor, emblemSvg}) {
  const S = ACADEMY.sign
  const canvas = document.createElement('canvas')
  canvas.width = S.texture.width
  canvas.height = S.texture.height
  const ctx = canvas.getContext?.('2d')
  if (!ctx) return null

  const {width: w, height: h} = canvas
  const accent = '#' + ACADEMY.building.accentColor.toString(16).padStart(6, '0')
  const box = {x: h * S.crest.x, y: h * S.crest.y, size: h * S.crest.size}
  ctx.fillStyle = accent
  ctx.fillRect(0, 0, w, h)

  // A generic crest goes on straight away: the club's own emblem has to be
  // rasterised first, and the sign must never show an empty patch in between (or
  // at all, if that fails).
  drawCrest(ctx, {
    x: box.x,
    y: box.y,
    width: box.size * 0.8,
    height: box.size,
    color: teamColor || S.fallbackCrestColor
  })

  ctx.fillStyle = S.textColor
  ctx.textBaseline = 'middle'
  ctx.font = `bold ${Math.round(h * 0.34)}px system-ui, sans-serif`
  const textX = h * S.textX
  S.lines.forEach((line, i) => {
    ctx.fillText(line, textX, h * (0.32 + i * 0.38))
  })

  const texture = new THREE.CanvasTexture(canvas)

  if (emblemSvg) {
    // The real emblem lands on the facade a frame or two later — the render loop
    // is running anyway, so flagging the texture is all it takes.
    loadEmblemImage(emblemSvg).then(image => {
      ctx.fillStyle = accent
      ctx.fillRect(0, 0, box.x * 2 + box.size, h)
      ctx.drawImage(image, box.x, box.y, box.size, box.size)
      texture.needsUpdate = true
    }).catch(() => {
      // Keep the generic crest — better than a blank blue square.
    })
  }

  return texture
}

/**
 * A generic club crest: a shield in the team's colour with a white outline and a
 * football on it. Stands in for the club's own emblem while that loads.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number, width: number, height: number, color: string}} config
 */
function drawCrest (ctx, {x, y, width, height, color}) {
  const cx = x + width / 2
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + width, y)
  ctx.lineTo(x + width, y + height * 0.58)
  ctx.quadraticCurveTo(x + width, y + height * 0.9, cx, y + height)
  ctx.quadraticCurveTo(x, y + height * 0.9, x, y + height * 0.58)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineWidth = Math.max(2, width * 0.06)
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()

  // The football: a white ball with a few dark panels.
  const r = width * 0.28
  const by = y + height * 0.46
  ctx.beginPath()
  ctx.arc(cx, by, r, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.fillStyle = '#1a1a1a'
  ctx.beginPath()
  ctx.arc(cx, by, r * 0.34, 0, Math.PI * 2)
  ctx.fill()
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + i * (Math.PI * 2 / 5)
    ctx.beginPath()
    ctx.arc(cx + Math.cos(angle) * r * 0.72, by + Math.sin(angle) * r * 0.72, r * 0.17, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * The academy's own pitch: half the size of the stadium's, striped and marked,
 * with two small goals, a fence with a gate to the street, two floodlight masts
 * and the training kit of this level.
 * @param {Object} THREE
 * @param {Object} parent the pitch group, centred on the pitch
 * @param {{level: number, rand: () => number}} config
 */
function addAcademyPitch (THREE, parent, {level, rand}) {
  const A = ACADEMY
  const P = A.pitch

  addPitch(THREE, parent, {
    width: P.width,
    depth: P.depth,
    centerZ: 0,
    stripes: true,
    circle: true
  })
  // Youth goals: smaller than the full-size ones, but a good deal bigger than
  // half the pitch's scale would suggest.
  addGoal(THREE, parent, {x: -P.width / 2, z: 0, scale: P.goalScale, facing: 1})
  addGoal(THREE, parent, {x: P.width / 2, z: 0, scale: P.goalScale, facing: -1})
  addFence(THREE, parent, {
    halfWidth: ACADEMY_FENCE_X / 2,
    halfDepth: ACADEMY_FENCE_Z / 2,
    centerZ: 0
  })

  // Masts in the two street-side fence corners, each aimed at its own half so the
  // corners get light too (see `addFloodlights`).
  const spec = A.masts[level]
  for (const side of [-1, 1]) {
    const x = side * ACADEMY_FENCE_X / 2
    const z = ACADEMY_FENCE_Z / 2
    addMast(THREE, parent, {
      x,
      z,
      aim: {x: x * TRAINING.aimFactor, z: z * TRAINING.aimFactor},
      spec
    })
  }

  addAcademyKit(THREE, parent, {level, rand})
}

/**
 * The training kit on the academy pitch: a slalom line of poles, marker cones, a
 * row of hurdles, free-kick dummies and loose balls. Cones and balls come in as
 * instanced meshes; positions come from the caller's seeded generator so they
 * stay put across renders.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{level: number, rand: () => number}} config
 */
function addAcademyKit (THREE, parent, {level, rand}) {
  const A = ACADEMY
  const kit = A.kit[level]
  const hw = A.pitch.width / 2 - 1.5
  const hd = A.pitch.depth / 2 - 1.5
  const matrix = new THREE.Matrix4()

  const cones = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.3, 0.5, 8),
    new THREE.MeshLambertMaterial({color: 0xff7a1a}),
    kit.cones
  )
  for (let i = 0; i < kit.cones; i++) {
    // Half the cones mark out a drill grid, the rest lie about.
    const drill = i < kit.cones / 2
    const px = drill ? -hw + 1 + i * 1.3 : (rand() * 2 - 1) * hw
    const pz = drill ? -hd + 1.5 : (rand() * 2 - 1) * hd
    matrix.setPosition(px, 0.25, pz)
    cones.setMatrixAt(i, matrix)
  }
  cones.instanceMatrix.needsUpdate = true
  cones.castShadow = true
  parent.add(cones)

  const balls = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.25, 8, 6),
    new THREE.MeshLambertMaterial({color: 0xf2f2f2}),
    kit.balls
  )
  for (let i = 0; i < kit.balls; i++) {
    matrix.setPosition((rand() * 2 - 1) * hw, 0.25, (rand() * 2 - 1) * hd)
    balls.setMatrixAt(i, matrix)
  }
  balls.instanceMatrix.needsUpdate = true
  balls.castShadow = true
  parent.add(balls)

  // Slalom poles: a straight line, alternating yellow and blue like in the render.
  const poleGeo = new THREE.CylinderGeometry(0.055, 0.055, 1.6, 6)
  const poleMats = [
    new THREE.MeshLambertMaterial({color: 0xf2c200}),
    new THREE.MeshLambertMaterial({color: 0x2f5fd0})
  ]
  for (let i = 0; i < kit.poles; i++) {
    const pole = new THREE.Mesh(poleGeo, poleMats[i % 2])
    pole.position.set(-hw + 2 + i * 1.6, 0.8, hd - 2)
    pole.castShadow = true
    parent.add(pole)
  }

  const H = A.hurdle
  const hurdleMat = new THREE.MeshLambertMaterial({color: H.color})
  const legGeo = new THREE.CylinderGeometry(0.05, 0.05, H.height, 6)
  const barGeo = new THREE.BoxGeometry(H.width, 0.09, 0.09)
  for (let i = 0; i < kit.hurdles; i++) {
    const px = -2 + i * 1.8
    const pz = hd - 5.5
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, hurdleMat)
      leg.position.set(px + side * H.width / 2, H.height / 2, pz)
      parent.add(leg)
    }
    const bar = new THREE.Mesh(barGeo, hurdleMat)
    bar.position.set(px, H.height, pz)
    bar.castShadow = true
    parent.add(bar)
  }

  // Free-kick dummies: a body on a weighted base, standing in a defensive wall.
  const D = A.dummy
  const dummyMat = new THREE.MeshLambertMaterial({color: D.color})
  const bodyGeo = new THREE.CylinderGeometry(D.radius, D.radius * 1.15, D.height, 8)
  const baseGeo = new THREE.CylinderGeometry(D.radius * 1.8, D.radius * 1.8, 0.12, 10)
  for (let i = 0; i < kit.dummies; i++) {
    const px = 4 + i * 0.75
    const pz = -hd + 4
    const body = new THREE.Mesh(bodyGeo, dummyMat)
    body.position.set(px, 0.12 + D.height / 2, pz)
    body.castShadow = true
    parent.add(body)

    const base = new THREE.Mesh(baseGeo, dummyMat)
    base.position.set(px, 0.06, pz)
    parent.add(base)
  }
}

/**
 * The short footpath between the entrance and the car park, with a lamp on either
 * side of it.
 * @param {Object} THREE
 * @param {Object} parent the plot's group
 */
function addAcademyPath (THREE, parent) {
  const E = ACADEMY.entrance
  const L = ACADEMY.lamp
  const from = ACADEMY_ENTRANCE_X
  const length = ACADEMY_LOT_EDGE_X - from

  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(length, E.pathWidth),
    new THREE.MeshLambertMaterial({color: E.pathColor})
  )
  path.rotation.x = -Math.PI / 2
  path.position.set(from + length / 2, 0.045, ACADEMY_ENTRANCE_Z)
  parent.add(path)

  // Staggered along the path, one on each side, clear of the walking surface.
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.13, L.height, 6)
  const poleMat = new THREE.MeshLambertMaterial({color: L.poleColor})
  const headGeo = new THREE.SphereGeometry(0.28, 8, 8)
  const headMat = new THREE.MeshBasicMaterial({color: L.lightColor})
  const offset = E.pathWidth / 2 + 0.6

  for (const [t, side] of [[0.3, 1], [0.75, -1]]) {
    const x = from + length * t
    const z = ACADEMY_ENTRANCE_Z + side * offset
    const pole = new THREE.Mesh(poleGeo, poleMat)
    pole.position.set(x, L.height / 2, z)
    pole.castShadow = true
    parent.add(pole)

    const head = new THREE.Mesh(headGeo, headMat)
    head.position.set(x, L.height + 0.15, z)
    head.userData.nightOnly = true
    parent.add(head)
  }
}

/**
 * Lamp masts over the academy's car park, aimed at the bays. Level 1 makes do
 * with the street lamps; level 2 gets one mast, level 3 two.
 * @param {Object} THREE
 * @param {Object} parent the plot's group
 * @param {number} level
 */
function addAcademyParkingLights (THREE, parent, level) {
  const P = ACADEMY.parking
  const aim = {x: ACADEMY_PARKING_X, z: (P.band.north + ACADEMY_PLOT_Z / 2) / 2}
  const positions = [
    {x: ACADEMY_LOT_EDGE_X + 0.8, z: -6},
    {x: ACADEMY_LOT_EDGE_X + 0.8, z: 6}
  ]

  for (const pos of positions.slice(0, P.masts[level])) {
    addMast(THREE, parent, {x: pos.x, z: pos.z, aim, spec: P.mast})
  }
}

/**
 * The clubhouse north of the training pitch: two solid wings with a glass hall
 * between them, joined to the pitch's north gate and to the car park by paths.
 * It grows with the training ground — a storey per level, and a bigger solar
 * array on the roofs.
 * @param {Object} THREE
 * @param {Object} parent the plot's group
 * @param {{level: number, emblemSvg?: string}} config
 */
function addClubhouse (THREE, parent, {level, emblemSvg}) {
  const C = TRAINING.clubhouse
  const storeys = C.storeys[level]
  const sideHeight = storeys * C.storeyHeight
  const centerHeight = Math.max(C.center.minHeight, sideHeight + C.center.extraHeight)

  const house = new THREE.Group()
  house.position.set(CLUBHOUSE_X, 0, CLUBHOUSE_Z)
  parent.add(house)

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(2 * C.side.width + C.center.width + 1.4, C.base, C.depth + 1.4),
    new THREE.MeshLambertMaterial({color: C.plinthColor})
  )
  plinth.position.set(0, C.base / 2, 0)
  plinth.receiveShadow = true
  house.add(plinth)

  for (const sx of [-1, 1]) {
    addClubhouseWing(THREE, house, {
      x: sx * (C.center.width + C.side.width) / 2,
      storeys,
      height: sideHeight,
      level
    })
  }
  addClubhouseHall(THREE, house, {height: centerHeight, level, emblemSvg})
  addClubhousePaths(THREE, parent)
}

/**
 * One of the two solid wings: a light rendered block with single large windows,
 * a flat roof with a coping and solar modules on top. The windows are emissive —
 * the rooms behind them are lit.
 * @param {Object} THREE
 * @param {Object} parent the clubhouse group
 * @param {{x: number, storeys: number, height: number, level: number}} config
 */
function addClubhouseWing (THREE, parent, {x, storeys, height, level}) {
  const C = TRAINING.clubhouse
  const S = C.side
  const W = S.window
  const top = C.base + height

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(S.width, height, C.depth),
    new THREE.MeshLambertMaterial({color: S.facadeColor})
  )
  shell.position.set(x, C.base + height / 2, 0)
  shell.castShadow = true
  shell.receiveShadow = true
  parent.add(shell)

  const glassMat = new THREE.MeshBasicMaterial({color: W.color})
  const glassGeo = new THREE.BoxGeometry(W.width, W.height, 0.08)
  const sideGeo = new THREE.BoxGeometry(0.08, W.height, W.width)

  for (let storey = 0; storey < storeys; storey++) {
    const y = C.base + storey * C.storeyHeight + W.sill + W.height / 2
    // Evenly spaced along both long facades…
    for (let i = 0; i < W.perFacade; i++) {
      const offset = -S.width / 2 + (i + 1) / (W.perFacade + 1) * S.width
      for (const sz of [-1, 1]) {
        const window = new THREE.Mesh(glassGeo, glassMat)
        window.position.set(x + offset, y, sz * (C.depth / 2 + W.proud))
        parent.add(window)
      }
    }
    // …and one on the outward-facing end wall.
    const end = new THREE.Mesh(sideGeo, glassMat)
    end.position.set(x + Math.sign(x) * (S.width / 2 + W.proud), y, 0)
    parent.add(end)
  }

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(S.width + 0.6, 0.24, C.depth + 0.6),
    new THREE.MeshLambertMaterial({color: S.roofColor})
  )
  roof.position.set(x, top + 0.12, 0)
  roof.castShadow = true
  parent.add(roof)

  addSolarArray(THREE, parent, {
    spec: C.solar[level],
    panel: C.solar.panel,
    colors: C.solar,
    roofTop: top + 0.24,
    x
  })
}

/**
 * The glass hall in the middle: glazed on all four sides with strutted panes, a
 * lit floor and ceiling behind them, the entrance in its south face and the club
 * emblem big above it. Taller than the wings, so it reads as the centre.
 * @param {Object} THREE
 * @param {Object} parent the clubhouse group
 * @param {{height: number, level: number, emblemSvg?: string}} config
 */
function addClubhouseHall (THREE, parent, {height, level, emblemSvg}) {
  const C = TRAINING.clubhouse
  const H = C.center
  const E = C.entrance
  const hw = H.width / 2
  const hd = C.depth / 2
  const top = C.base + height

  const glassMat = new THREE.MeshLambertMaterial({
    color: H.glassColor,
    transparent: true,
    opacity: H.glassOpacity,
    side: THREE.DoubleSide
  })
  const strutMat = new THREE.MeshLambertMaterial({color: H.strutColor})
  const frameMat = new THREE.MeshLambertMaterial({color: H.frameColor})
  const pane = config => addGlassPane(THREE, parent, {
    glassMat,
    strutMat,
    spacing: H.mullionSpacing,
    courses: H.courses,
    ...config
  })

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(H.width, 0.12, C.depth),
    new THREE.MeshLambertMaterial({color: H.floorColor})
  )
  floor.position.set(0, C.base + 0.06, 0)
  floor.receiveShadow = true
  parent.add(floor)

  // Three closed sides; the south one is split around the entrance.
  pane({width: H.width, height, x: 0, y: C.base + height / 2, z: -hd, axis: 'x'})
  for (const sx of [-1, 1]) {
    pane({width: C.depth, height, x: sx * hw, y: C.base + height / 2, z: 0, axis: 'z'})
  }
  const sideWidth = (H.width - E.width) / 2
  for (const sx of [-1, 1]) {
    pane({
      width: sideWidth,
      height,
      x: sx * (E.width + sideWidth) / 2,
      y: C.base + height / 2,
      z: hd,
      axis: 'x'
    })
  }
  pane({
    width: E.width,
    height: height - E.height,
    x: 0,
    y: C.base + E.height + (height - E.height) / 2,
    z: hd,
    axis: 'x'
  })

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const column = new THREE.Mesh(new THREE.BoxGeometry(0.34, height, 0.34), frameMat)
      column.position.set(sx * hw, C.base + height / 2, sz * hd)
      column.castShadow = true
      parent.add(column)
    }
  }

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(H.width + 0.8, 0.26, C.depth + 0.8),
    new THREE.MeshLambertMaterial({color: H.roofColor})
  )
  roof.position.set(0, top + 0.13, 0)
  roof.castShadow = true
  parent.add(roof)

  addClubhouseEntrance(THREE, parent, {hd, height})
  addClubhouseEmblem(THREE, parent, {hd, emblemSvg})

  // Lit from within: an emissive ceiling panel per storey height plus one light,
  // so the hall glows through its glass at dusk without a light per floor.
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(H.width - 2, C.depth - 2),
    new THREE.MeshBasicMaterial({color: H.lightColor})
  )
  panel.rotation.x = Math.PI / 2
  panel.position.set(0, top - 0.2, 0)
  parent.add(panel)

  const light = new THREE.PointLight(H.lightColor, H.lightIntensity, H.lightRange, 2)
  light.position.set(0, C.base + height / 2, 0)
  parent.add(light)

  addSolarArray(THREE, parent, {
    spec: C.solar[level],
    panel: C.solar.panel,
    colors: C.solar,
    roofTop: top + 0.26
  })
}

/**
 * The clubhouse's entrance: a wide glazed double door in the hall's south face
 * under a lit header.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{hd: number, height: number}} config
 */
function addClubhouseEntrance (THREE, parent, {hd}) {
  const C = TRAINING.clubhouse
  const E = C.entrance
  const frameMat = new THREE.MeshLambertMaterial({color: E.doorColor})
  const doorMat = new THREE.MeshLambertMaterial({
    color: E.glassColor,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide
  })

  const leafWidth = E.width / 2 - 0.15
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(leafWidth, E.height - 0.2, 0.1), doorMat
    )
    leaf.position.set(side * E.width / 4, C.base + (E.height - 0.2) / 2, hd)
    parent.add(leaf)

    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.16, E.height, 0.18), frameMat)
    jamb.position.set(side * E.width / 2, C.base + E.height / 2, hd)
    parent.add(jamb)
  }

  const header = new THREE.Mesh(new THREE.BoxGeometry(E.width + 0.4, 0.2, 0.26), frameMat)
  header.position.set(0, C.base + E.height, hd)
  parent.add(header)
}

/**
 * The club emblem on the glass facade, right above the entrance. Same transparent
 * emblem texture as the stadium's entrance signs, just bigger.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{hd: number, emblemSvg?: string}} config
 * @returns {Object|null} the plate, or `null` without a 2D canvas
 */
function addClubhouseEmblem (THREE, parent, {hd, emblemSvg}) {
  const C = TRAINING.clubhouse
  const M = C.emblem
  const texture = emblemTexture(THREE, {emblemSvg})
  if (!texture) return null

  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(M.size, M.size),
    // Transparent: the emblem's own shape on the glass, not a panel behind it.
    new THREE.MeshBasicMaterial({map: texture, transparent: true})
  )
  plate.position.set(
    0,
    C.base + C.entrance.height + M.gapAboveEntrance + M.size / 2,
    hd + 0.12
  )
  parent.add(plate)
  return plate
}

/**
 * The paved ways from the clubhouse: straight south to the pitch's north gate,
 * and an L to the east around to the car park.
 * @param {Object} THREE
 * @param {Object} parent the plot's group
 */
function addClubhousePaths (THREE, parent) {
  const C = TRAINING.clubhouse
  const P = C.path
  const mat = new THREE.MeshLambertMaterial({color: P.color})
  const strip = (sizeX, sizeZ, x, z) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ), mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, 0.045, z)
    mesh.receiveShadow = true
    parent.add(mesh)
  }

  // Clubhouse front to the fence's north gate.
  const front = CLUBHOUSE_Z + C.depth / 2
  const gateZ = GROUND_Z - (TRAINING.pitch.depth / 2 + TRAINING.fence.margin)
  strip(P.width, gateZ - front, CLUBHOUSE_X, (front + gateZ) / 2)

  // …and around the pitch's north-east corner to the car park.
  const parkingX = PLOT_X / 2 - TRAINING.parking.strip / 2
  const alongZ = CLUBHOUSE_Z
  const fromX = CLUBHOUSE_X + C.center.width / 2 + C.side.width
  strip(parkingX - fromX + P.width / 2, P.width, (fromX + parkingX + P.width / 2) / 2, alongZ)
  strip(P.width, TRAINING.parking.band.north - 0.5 - alongZ, parkingX,
    (alongZ + TRAINING.parking.band.north - 0.5) / 2)
}

/**
 * Build the medical practice.
 *
 * A small modern block with a flat roof and glazed bands, a colonnade leading
 * from the street to its entrance and, right beside that, a driveway with an
 * ambulance in it. A big red cross hangs on the front facade above the driveway
 * and is lit from in front; a satellite dish sits on the roof.
 *
 * The building has a **single level** — a club either has a practice or it does
 * not — so nothing here varies with `level`; the parameter is only accepted so
 * every builder has the same signature.
 *
 * @param {Object} THREE the Three.js module
 * @param {Object} scene object with `.add()`
 * @param {{x: number, z: number, sidewalkWidth?: number}} options `sidewalkWidth`
 *   is how far the colonnade's paving and the driveway reach past the plot
 *   boundary to cross the sidewalk and meet the road.
 * @returns {{group: Object, entrance: {x: number, z: number, width: number}, openings: Array<{x: number, z: number, width: number}>, update: (time: number) => void}}
 *   the built group, its entrance, the openings in the plot's street side, and
 *   the per-frame updater that blinks the ambulance's beacon.
 */
export function buildMedicalPractice (THREE, scene, {x, z, sidewalkWidth = 3}) {
  const group = new THREE.Group()
  const southEdge = PRACTICE_PLOT_Z / 2

  const block = new THREE.Group()
  block.position.set(0, 0, PRACTICE_BUILDING_Z)
  group.add(block)
  addPracticeBlock(THREE, block)
  addPracticeCross(THREE, block)
  addSatelliteDish(THREE, block)

  addColonnade(THREE, group, {southEdge, sidewalkWidth})
  addPracticeDriveway(THREE, group, {southEdge, sidewalkWidth})
  const beacon = addAmbulance(THREE, group)

  group.position.set(x, 0, z)
  scene.add(group)

  const C = PRACTICE.colonnade
  const D = PRACTICE.driveway
  return {
    group,
    entrance: {x: C.centerX, z: southEdge, width: C.width},
    openings: [
      {x: C.centerX, z: southEdge, width: C.width},
      {x: D.centerX, z: southEdge, width: D.width}
    ],
    update: beacon.update
  }
}

/**
 * The block itself: a plinth carrying a rendered box with a glazed band around
 * the south and east facades, a flat roof and a parapet.
 * @param {Object} THREE
 * @param {Object} parent the block's group, centred on its footprint
 */
function addPracticeBlock (THREE, parent) {
  const B = PRACTICE.building
  const hw = B.width / 2
  const hd = B.depth / 2
  const top = B.base + B.height

  const facadeMat = new THREE.MeshLambertMaterial({color: B.facadeColor})
  const trimMat = new THREE.MeshLambertMaterial({color: B.trimColor})

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(B.width + 1, B.base, B.depth + 1),
    new THREE.MeshLambertMaterial({color: B.plinthColor})
  )
  plinth.position.set(0, B.base / 2, 0)
  plinth.receiveShadow = true
  parent.add(plinth)

  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(B.width, B.height, B.depth), facadeMat
  )
  walls.position.set(0, B.base + B.height / 2, 0)
  walls.castShadow = true
  walls.receiveShadow = true
  parent.add(walls)

  // The window band, laid onto the facade rather than cut into it: the wall is
  // one solid box, so a pane has to stand a few centimetres proud of it.
  const glassMat = new THREE.MeshLambertMaterial({
    color: B.glassColor,
    transparent: true,
    opacity: B.glassOpacity,
    side: THREE.DoubleSide
  })
  const strutMat = new THREE.MeshLambertMaterial({color: B.strutColor})
  const bandY = B.base + B.band.sill + B.band.height / 2
  // The front band stops short of the colonnade and the cross panel.
  // The front carries the colonnade on its west half and the cross panel on its
  // east half, so all that is left for glass there is the strip between them.
  addGlassPane(THREE, parent, {
    glassMat,
    strutMat,
    width: B.band.frontWidth,
    height: B.band.height,
    x: B.band.frontX,
    y: bandY,
    z: hd + B.band.inset,
    axis: 'x',
    spacing: B.mullionSpacing
  })
  for (const sx of [-1, 1]) {
    addGlassPane(THREE, parent, {
      glassMat,
      strutMat,
      width: B.depth - 2.4,
      height: B.band.height,
      x: sx * (hw + B.band.inset),
      y: bandY,
      z: 0,
      axis: 'z',
      spacing: B.mullionSpacing
    })
  }

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(B.width + 0.7, 0.24, B.depth + 0.7), trimMat
  )
  roof.position.set(0, top + 0.12, 0)
  roof.castShadow = true
  parent.add(roof)

  const parapetY = top + 0.24 + B.parapet / 2
  for (const sz of [-1, 1]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(B.width + 0.7, B.parapet, 0.16), trimMat
    )
    wall.position.set(0, parapetY, sz * (hd + 0.27))
    parent.add(wall)
  }
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, B.parapet, B.depth + 0.7), trimMat
    )
    wall.position.set(sx * (hw + 0.27), parapetY, 0)
    parent.add(wall)
  }

  addPracticeDoors(THREE, parent, {hd})
}

/**
 * The glazed double door at the head of the colonnade, in the block's south
 * facade, under a lit header.
 * @param {Object} THREE
 * @param {Object} parent the block's group
 * @param {{hd: number}} config `hd` is the block's half depth — its south facade
 */
function addPracticeDoors (THREE, parent, {hd}) {
  const B = PRACTICE.building
  const E = PRACTICE.entrance
  const x = PRACTICE.colonnade.centerX
  const frameMat = new THREE.MeshLambertMaterial({color: E.doorColor})
  const doorMat = new THREE.MeshLambertMaterial({
    color: E.glassColor,
    transparent: true,
    opacity: 0.38,
    side: THREE.DoubleSide
  })

  const leafWidth = E.width / 2 - 0.12
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(leafWidth, E.height - 0.18, 0.1), doorMat
    )
    leaf.position.set(x + side * E.width / 4, B.base + (E.height - 0.18) / 2, hd + 0.06)
    parent.add(leaf)

    const jamb = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, E.height, 0.16), frameMat
    )
    jamb.position.set(x + side * E.width / 2, B.base + E.height / 2, hd + 0.06)
    parent.add(jamb)
  }

  const header = new THREE.Mesh(
    new THREE.BoxGeometry(E.width + 0.36, 0.18, 0.22), frameMat
  )
  header.position.set(x, B.base + E.height, hd + 0.06)
  parent.add(header)
}

/**
 * The illuminated red cross on the front facade: a dark backing panel, the cross
 * itself as two crossing bars in an unlit-bright material (there is no bloom in
 * this scene, so that is what "glowing" looks like here) and a red point light in
 * front of it, which is what makes the ambulance bay below read as lit.
 * @param {Object} THREE
 * @param {Object} parent the block's group
 */
function addPracticeCross (THREE, parent) {
  const B = PRACTICE.building
  const X = PRACTICE.cross
  const z = B.depth / 2

  const panelSize = X.span + 2 * X.panelPadding
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(panelSize, panelSize, 0.16),
    new THREE.MeshLambertMaterial({color: X.panelColor})
  )
  panel.position.set(X.x, X.y, z + 0.08)
  parent.add(panel)

  const mat = new THREE.MeshBasicMaterial({color: X.color})
  const bars = [
    new THREE.BoxGeometry(X.span, X.thickness, X.proud),
    new THREE.BoxGeometry(X.thickness, X.span, X.proud)
  ]
  for (const geo of bars) {
    const bar = new THREE.Mesh(geo, mat)
    bar.position.set(X.x, X.y, z + 0.16 + X.proud / 2)
    parent.add(bar)
  }

  const light = new THREE.PointLight(X.color, X.lightIntensity, X.lightRange, 2)
  light.position.set(X.x, X.y, z + 2)
  parent.add(light)
}

/**
 * The satellite dish on the flat roof: a mast carrying a shallow bowl (the cap of
 * a sphere, which is close enough to a paraboloid at this size) with an arm and a
 * feed horn in front of it, turned up and to the west.
 * @param {Object} THREE
 * @param {Object} parent the block's group
 */
function addSatelliteDish (THREE, parent) {
  const B = PRACTICE.building
  const D = PRACTICE.dish
  const roofTop = B.base + B.height + 0.24
  const frameMat = new THREE.MeshLambertMaterial({color: D.frameColor})

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.11, D.mastHeight, 8), frameMat
  )
  mast.position.set(D.x, roofTop + D.mastHeight / 2, D.z)
  parent.add(mast)

  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.7), frameMat)
  foot.position.set(D.x, roofTop + 0.06, D.z)
  parent.add(foot)

  // The bowl is built facing +y and then turned: `tilt` off the vertical, `yaw`
  // around it, so the same two angles read as "aimed at that patch of sky".
  const dish = new THREE.Group()
  dish.position.set(D.x, roofTop + D.mastHeight, D.z)
  dish.rotation.y = D.yaw * Math.PI / 180
  dish.rotation.x = D.tilt * Math.PI / 180
  parent.add(dish)

  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(D.radius * 2.1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 6),
    new THREE.MeshLambertMaterial({color: D.color, side: THREE.DoubleSide})
  )
  // Pull the cap back down so its rim, not its pole, sits on the mast head.
  bowl.position.set(0, -D.radius * 2.1 * Math.cos(Math.PI / 6), 0)
  bowl.castShadow = true
  dish.add(bowl)

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), frameMat)
  arm.position.set(0, 0.5, 0)
  dish.add(arm)

  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.3, 8), frameMat)
  horn.position.set(0, 0.95, 0)
  dish.add(horn)
}

/**
 * The colonnade: the paved walk from the street to the entrance, a row of round
 * columns either side of it carrying a flat slab, with a lit strip under the
 * slab so the walk is not a black tunnel at dusk.
 * @param {Object} THREE
 * @param {Object} parent the plot's group
 * @param {{southEdge: number, sidewalkWidth: number}} config
 */
function addColonnade (THREE, parent, {southEdge, sidewalkWidth}) {
  const C = PRACTICE.colonnade
  const length = southEdge - PRACTICE_FRONT
  const centerZ = PRACTICE_FRONT + length / 2

  // The paving runs on over the sidewalk to the kerb.
  const paving = new THREE.Mesh(
    new THREE.PlaneGeometry(C.width, length + sidewalkWidth),
    new THREE.MeshLambertMaterial({color: C.paving.color})
  )
  paving.rotation.x = -Math.PI / 2
  paving.position.set(C.centerX, 0.045, centerZ + sidewalkWidth / 2)
  paving.receiveShadow = true
  parent.add(paving)

  const col = C.column
  const columnGeo = new THREE.CylinderGeometry(col.radius, col.radius, col.height, 12)
  const baseGeo = new THREE.CylinderGeometry(col.baseRadius, col.baseRadius, col.baseHeight, 12)
  const columnMat = new THREE.MeshLambertMaterial({color: col.color})
  const slabMat = new THREE.MeshLambertMaterial({color: C.slab.color})

  // Columns from just in front of the facade to the kerb, evenly spaced.
  const first = PRACTICE_FRONT + 0.8
  const last = southEdge - 0.8
  for (let i = 0; i < C.columns; i++) {
    const cz = first + (i / (C.columns - 1)) * (last - first)
    for (const side of [-1, 1]) {
      const cx = C.centerX + side * C.width / 2

      const base = new THREE.Mesh(baseGeo, columnMat)
      base.position.set(cx, col.baseHeight / 2, cz)
      parent.add(base)

      const column = new THREE.Mesh(columnGeo, columnMat)
      column.position.set(cx, col.baseHeight + col.height / 2, cz)
      column.castShadow = true
      parent.add(column)
    }
  }

  const slabY = col.baseHeight + col.height + C.slab.thickness / 2
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(
      C.width + 2 * col.radius + C.slab.overhang,
      C.slab.thickness,
      last - first + 2 * col.radius + C.slab.overhang
    ),
    slabMat
  )
  slab.position.set(C.centerX, slabY, (first + last) / 2)
  slab.castShadow = true
  parent.add(slab)

  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(C.width - 1.4, 0.06, 0.5),
    new THREE.MeshBasicMaterial({color: C.lightColor})
  )
  strip.position.set(C.centerX, slabY - C.slab.thickness / 2 - 0.05, PRACTICE_FRONT + 1.6)
  parent.add(strip)

  const light = new THREE.PointLight(C.lightColor, C.lightIntensity, C.lightRange, 2)
  light.position.set(C.centerX, slabY - 0.5, PRACTICE_FRONT + 2)
  parent.add(light)
}

/**
 * The ambulance bay east of the colonnade: an asphalt apron off the street,
 * reaching over the sidewalk to the road.
 * @param {Object} THREE
 * @param {Object} parent the plot's group
 * @param {{southEdge: number, sidewalkWidth: number}} config
 */
function addPracticeDriveway (THREE, parent, {southEdge, sidewalkWidth}) {
  const D = PRACTICE.driveway
  const length = southEdge - D.northEnd + sidewalkWidth
  const drive = new THREE.Mesh(
    new THREE.PlaneGeometry(D.width, length),
    new THREE.MeshLambertMaterial({color: D.color})
  )
  drive.rotation.x = -Math.PI / 2
  drive.position.set(D.centerX, 0.045, D.northEnd + length / 2)
  drive.receiveShadow = true
  parent.add(drive)
}

/**
 * The ambulance standing in the driveway: a white van with a red stripe and a red
 * cross on each flank, dark glazing, and a beacon on the cabin roof whose two
 * lenses take turns.
 * @param {Object} THREE
 * @param {Object} parent the plot's group
 * @returns {{update: (time: number) => void}} the beacon's per-frame updater
 */
function addAmbulance (THREE, parent) {
  const A = PRACTICE.ambulance
  const V = A.body
  const x = PRACTICE.driveway.centerX
  const z = A.z
  const bodyY = V.clearance + V.height / 2
  const hl = V.length / 2

  const bodyMat = new THREE.MeshLambertMaterial({color: A.bodyColor})
  const stripeMat = new THREE.MeshLambertMaterial({color: A.stripeColor})
  const glassMat = new THREE.MeshLambertMaterial({color: A.glassColor})

  // The box: a tall body with a lower cabin at its southern (street) end.
  const boxLength = V.length - A.cabin.length
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(V.width, V.height, boxLength), bodyMat
  )
  box.position.set(x, bodyY, z - hl + boxLength / 2)
  box.castShadow = true
  parent.add(box)

  const cabinY = V.clearance + A.cabin.height / 2
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(V.width - 0.1, A.cabin.height, A.cabin.length), bodyMat
  )
  cabin.position.set(x, cabinY, z + hl - A.cabin.length / 2)
  cabin.castShadow = true
  parent.add(cabin)

  // Windscreen and the two flank stripes with a cross on each.
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(V.width - 0.3, A.cabin.height - 0.5, 0.08), glassMat
  )
  screen.position.set(x, cabinY + 0.22, z + hl - 0.04)
  parent.add(screen)

  // Three things on each flank, stacked so they never share a band: the stripe
  // low down and running the whole box, the rear window high up next to the
  // cabin, and the cross between them over the rear axle.
  for (const side of [-1, 1]) {
    const flankX = x + side * (V.width / 2 + 0.02)
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.3, boxLength - 0.4), stripeMat
    )
    stripe.position.set(flankX, V.clearance + V.height * 0.24, z - hl + boxLength / 2)
    parent.add(stripe)

    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 1.2), glassMat)
    pane.position.set(flankX, V.clearance + V.height * 0.74, z - hl + boxLength - 0.9)
    parent.add(pane)

    // The cross on the flank, as two crossing slabs like the one on the facade.
    const crossY = V.clearance + V.height * 0.55
    const crossZ = z - hl + boxLength * 0.34
    for (const geo of [
      new THREE.BoxGeometry(0.05, A.crossSize * 0.32, A.crossSize),
      new THREE.BoxGeometry(0.05, A.crossSize, A.crossSize * 0.32)
    ]) {
      const bar = new THREE.Mesh(geo, stripeMat)
      bar.position.set(x + side * (V.width / 2 + 0.05), crossY, crossZ)
      parent.add(bar)
    }
  }

  const wheelGeo = new THREE.CylinderGeometry(V.clearance + 0.14, V.clearance + 0.14, 0.24, 12)
  const wheelMat = new THREE.MeshLambertMaterial({color: A.wheelColor})
  for (const side of [-1, 1]) {
    for (const along of [z - hl + 1.2, z + hl - 1.3]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat)
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(x + side * V.width / 2, V.clearance + 0.06, along)
      parent.add(wheel)
    }
  }

  return addBeacon(THREE, parent, {
    x,
    y: V.clearance + A.cabin.height,
    z: z + hl - A.cabin.length / 2
  })
}

/**
 * The blue beacon on the ambulance's cabin roof: a dark bar carrying a lens on
 * either side, each with its own light. The two take turns rather than flashing
 * together, so it reads as a beacon turning slowly rather than a lamp being
 * switched on and off.
 * @param {Object} THREE
 * @param {Object} parent
 * @param {{x: number, y: number, z: number}} config the top of the cabin roof
 * @returns {{update: (time: number) => void}}
 */
function addBeacon (THREE, parent, {x, y, z}) {
  const B = PRACTICE.ambulance.beacon

  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(B.barWidth, 0.1, 0.34),
    new THREE.MeshLambertMaterial({color: 0x24272b})
  )
  bar.position.set(x, y + 0.05, z)
  parent.add(bar)

  const lensGeo = new THREE.SphereGeometry(B.lensRadius, 10, 8)
  const lensMat = new THREE.MeshBasicMaterial({color: B.color})
  const sides = []
  for (const side of [-1, 1]) {
    const lens = new THREE.Mesh(lensGeo, lensMat)
    lens.position.set(x + side * B.spread, y + 0.14, z)
    parent.add(lens)

    const light = new THREE.PointLight(B.color, B.lightIntensity, B.lightRange, 2)
    light.position.set(x + side * B.spread, y + 0.3, z)
    parent.add(light)

    sides.push({lens, light})
  }

  const update = (time) => {
    // One side on while the sine is positive, the other while it is negative.
    const on = Math.sin(time * B.speed) > 0
    sides[0].lens.visible = on
    sides[0].light.visible = on
    sides[1].lens.visible = !on
    sides[1].light.visible = !on
  }
  update(0)

  return {update}
}
