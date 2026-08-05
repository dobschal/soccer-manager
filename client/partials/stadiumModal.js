import { server } from '../lib/gateway.js'
import { StadiumCanvas } from './stadiumCanvas.js'
import { showOverlay } from './overlay.js'
import { el, generateId } from '../lib/html.js'

/** @type {StadiumCanvas|null} */
let currentStadiumCanvas = null

/**
 * Show a modal with a team's stadium
 * @param {number} teamId
 * @returns {Promise<void>}
 */
export async function showStadiumModal (teamId) {
  // Fetch stadium and team data
  const [stadium, team] = await Promise.all([
    server.getStadiumByTeamId(teamId),
    server.getTeamById(teamId)
  ])

  // Clean up any existing stadium canvas
  if (currentStadiumCanvas) {
    currentStadiumCanvas.onDestroy()
    currentStadiumCanvas = null
  }

  // Calculate total seats
  const totalSeats = ['north', 'south', 'east', 'west', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw'].reduce(
    (total, name) => total + (stadium[name + '_stand_size'] || 0),
    0
  )

  const containerId = generateId()

  const overlay = showOverlay(
    `${team.name} Stadium`,
    `Total Capacity: ${totalSeats.toLocaleString()} seats`,
    `
      <div id="${containerId}" class="stadium-modal-container"></div>
      <div class="mt-3">
        <div class="row text-muted small">
          <div class="col-6 col-sm-3"><b>North:</b> ${(stadium.north_stand_size || 0).toLocaleString()}</div>
          <div class="col-6 col-sm-3"><b>South:</b> ${(stadium.south_stand_size || 0).toLocaleString()}</div>
          <div class="col-6 col-sm-3"><b>East:</b> ${(stadium.east_stand_size || 0).toLocaleString()}</div>
          <div class="col-6 col-sm-3"><b>West:</b> ${(stadium.west_stand_size || 0).toLocaleString()}</div>
          <div class="col-6 col-sm-3"><b>NE Corner:</b> ${(stadium.corner_ne_stand_size || 0).toLocaleString()}</div>
          <div class="col-6 col-sm-3"><b>NW Corner:</b> ${(stadium.corner_nw_stand_size || 0).toLocaleString()}</div>
          <div class="col-6 col-sm-3"><b>SE Corner:</b> ${(stadium.corner_se_stand_size || 0).toLocaleString()}</div>
          <div class="col-6 col-sm-3"><b>SW Corner:</b> ${(stadium.corner_sw_stand_size || 0).toLocaleString()}</div>
        </div>
      </div>
    `
  )

  // Create and mount stadium canvas after overlay is in DOM
  const container = el('#' + containerId)
  if (container) {
    currentStadiumCanvas = new StadiumCanvas(stadium, team, 'stadium-modal-canvas')
    container.innerHTML = currentStadiumCanvas.toString()

    // Initialize Three.js after DOM is ready
    setTimeout(() => {
      if (currentStadiumCanvas) {
        currentStadiumCanvas.onMounted()
      }
    }, 50)
  }

  // Clean up Three.js when overlay closes
  overlay.onClose(() => {
    if (currentStadiumCanvas) {
      currentStadiumCanvas.onDestroy()
      currentStadiumCanvas = null
    }
  })
}
