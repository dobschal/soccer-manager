/**
 * Drag-and-drop manager for the my-team page.
 * Supports three scenarios:
 *   A. Bench player → pitch position (assign to lineup)
 *   B. Swap bench player with lineup player on pitch
 *   C. Reorder bench players (persisted via sort_index)
 *
 * Uses native HTML5 Drag and Drop API. Skipped on touch devices.
 *
 * @param {Object} options
 * @param {HTMLElement} options.squadEl      - .squad element on the pitch
 * @param {HTMLElement} [options.benchEl]    - .bench element (sidebar bench panel)
 * @param {Array} options.players           - players array reference
 * @param {Object} options.team             - team object reference
 * @param {(players: Array, formation: string) => Promise} options.onLineupChange
 * @param {(sortData: Array<{playerId:number,sortIndex:number}>) => Promise} options.onSortChanged
 * @returns {{ destroy: () => void, unlock: () => void }}
 */
export function initDragDrop ({ squadEl, benchEl, players, team, onLineupChange, onSortChanged }) {
  // Skip on touch devices — the click overlay remains as fallback
  if (navigator.maxTouchPoints > 0) {
    return { destroy () {}, unlock () {} }
  }

  let draggedPlayerId = null
  let draggedRow = null
  let isSaving = false

  // --- helpers ---

  function getPlayerById (id) {
    return players.find(p => p.id === id)
  }

  function isOnBench (player) {
    return !player.in_game_position
  }

  function positionsCompatible (posA, posB) {
    return posA === posB
  }

  // --- make pitch players drop targets ---

  const pitchPlayers = squadEl.querySelectorAll('.player')
  pitchPlayers.forEach(el => {
    el.addEventListener('dragover', onPitchDragOver)
    el.addEventListener('dragenter', onPitchDragEnter)
    el.addEventListener('dragleave', onPitchDragLeave)
    el.addEventListener('drop', onPitchDrop)
  })

  // --- pitch event handlers ---

  function onPitchDragOver (e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function onPitchDragEnter (e) {
    const pitchEl = e.currentTarget
    const draggedPlayer = getPlayerById(draggedPlayerId)
    if (!draggedPlayer) return

    // Get position class from the pitch element
    const pitchPosition = getPitchPosition(pitchEl)
    if (pitchPosition && positionsCompatible(draggedPlayer.position, pitchPosition)) {
      pitchEl.classList.add('drop-target-highlight')
    }
  }

  function onPitchDragLeave (e) {
    e.currentTarget.classList.remove('drop-target-highlight')
  }

  function onPitchDrop (e) {
    e.preventDefault()
    const pitchEl = e.currentTarget
    pitchEl.classList.remove('drop-target-highlight')

    if (isSaving) return

    const draggedPlayer = getPlayerById(draggedPlayerId)
    if (!draggedPlayer) return

    const pitchPosition = getPitchPosition(pitchEl)
    if (!pitchPosition || !positionsCompatible(draggedPlayer.position, pitchPosition)) return

    // Find who currently occupies this pitch slot
    const pitchPlayerId = pitchEl.dataset.playerId
    const isFake = String(pitchPlayerId).startsWith('fake-')

    if (isFake) {
      // Empty slot — assign dragged player, but guard against exceeding 11
      const currentLineupCount = players.filter(p => !p.fake && p.in_game_position).length
      if (currentLineupCount >= 11) return
      draggedPlayer.in_game_position = pitchPosition
    } else {
      const occupant = getPlayerById(Number(pitchPlayerId))
      if (!occupant) return
      // Swap: occupant goes to bench, dragged player takes the spot
      occupant.in_game_position = draggedPlayer.in_game_position || ''
      draggedPlayer.in_game_position = pitchPosition
    }

    isSaving = true
    onLineupChange(players.filter(p => !p.fake), team.formation)
  }

  // --- bench panel: make bench players draggable + drop targets ---

  const benchPlayerEls = benchEl ? benchEl.querySelectorAll('.player') : []
  benchPlayerEls.forEach(el => {
    const playerId = Number(el.dataset.playerId)
    const player = getPlayerById(playerId)
    if (!player || player.is_suspended) return

    el.draggable = true

    el.addEventListener('dragstart', onBenchDragStart)
    el.addEventListener('dragend', onBenchDragEnd)
    el.addEventListener('dragover', onBenchDragOver)
    el.addEventListener('dragenter', onBenchDragEnter)
    el.addEventListener('dragleave', onBenchDragLeave)
    el.addEventListener('drop', onBenchDrop)
  })

  function onBenchDragStart (e) {
    draggedPlayerId = Number(e.currentTarget.dataset.playerId)
    draggedRow = e.currentTarget
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(draggedPlayerId))
    requestAnimationFrame(() => {
      if (draggedRow) draggedRow.classList.add('dragging')
    })
  }

  function onBenchDragEnd () {
    if (draggedRow) draggedRow.classList.remove('dragging')
    clearAllHighlights()
    draggedPlayerId = null
    draggedRow = null
  }

  function onBenchDragOver (e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function onBenchDragEnter (e) {
    const benchPlayerEl = e.currentTarget
    const draggedPlayer = getPlayerById(draggedPlayerId)
    if (!draggedPlayer) return

    const targetId = Number(benchPlayerEl.dataset.playerId)
    const targetPlayer = getPlayerById(targetId)
    if (!targetPlayer) return

    // Allow drop for bench-to-bench reorder or compatible position swap
    if ((isOnBench(draggedPlayer) && isOnBench(targetPlayer)) ||
        positionsCompatible(draggedPlayer.position, targetPlayer.position)) {
      benchPlayerEl.classList.add('drop-target-highlight')
    }
  }

  function onBenchDragLeave (e) {
    e.currentTarget.classList.remove('drop-target-highlight')
  }

  function onBenchDrop (e) {
    e.preventDefault()
    const benchPlayerEl = e.currentTarget
    benchPlayerEl.classList.remove('drop-target-highlight')

    if (isSaving) return

    const draggedPlayer = getPlayerById(draggedPlayerId)
    if (!draggedPlayer) return

    const targetId = Number(benchPlayerEl.dataset.playerId)
    const targetPlayer = getPlayerById(targetId)
    if (!targetPlayer) return

    if (isOnBench(draggedPlayer) && isOnBench(targetPlayer)) {
      reorderBench(draggedPlayer, targetPlayer)
    } else if (positionsCompatible(draggedPlayer.position, targetPlayer.position)) {
      swapLineupPositions(draggedPlayer, targetPlayer)
    }
  }

  // --- utilities ---

  function getPitchPosition (el) {
    // Position is encoded as a CSS class on .player (GK, CD, LD, etc.)
    const classes = el.className.split(' ')
    const positions = ['GK', 'LD', 'CD', 'RD', 'LM', 'DM', 'CM', 'RM', 'OM', 'LA', 'CA', 'RA']
    return classes.find(c => positions.includes(c)) || null
  }

  function swapLineupPositions (playerA, playerB) {
    const posA = playerA.in_game_position
    const posB = playerB.in_game_position
    playerA.in_game_position = posB
    playerB.in_game_position = posA
    isSaving = true
    onLineupChange(players.filter(p => !p.fake), team.formation)
  }

  function reorderBench (draggedPlayer, targetPlayer) {
    // Get bench players in current order
    const benchPlayers = players
      .filter(p => !p.fake && !p.in_game_position)
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0))

    const dragIdx = benchPlayers.findIndex(p => p.id === draggedPlayer.id)
    const targetIdx = benchPlayers.findIndex(p => p.id === targetPlayer.id)
    if (dragIdx === -1 || targetIdx === -1) return

    // Remove dragged and insert at target position
    benchPlayers.splice(dragIdx, 1)
    const insertIdx = targetIdx > dragIdx ? targetIdx : targetIdx
    benchPlayers.splice(insertIdx, 0, draggedPlayer)

    // Assign sequential sort_index values
    const sortData = benchPlayers.map((p, i) => {
      p.sort_index = i + 1
      return { playerId: p.id, sortIndex: i + 1 }
    })

    isSaving = true
    onSortChanged(sortData)
  }

  function clearAllHighlights () {
    squadEl.querySelectorAll('.drop-target-highlight').forEach(el => {
      el.classList.remove('drop-target-highlight')
    })
    if (benchEl) {
      benchEl.querySelectorAll('.drop-target-highlight').forEach(el => {
        el.classList.remove('drop-target-highlight')
      })
    }
  }

  // --- cleanup ---

  function destroy () {
    pitchPlayers.forEach(el => {
      el.removeEventListener('dragover', onPitchDragOver)
      el.removeEventListener('dragenter', onPitchDragEnter)
      el.removeEventListener('dragleave', onPitchDragLeave)
      el.removeEventListener('drop', onPitchDrop)
    })
    benchPlayerEls.forEach(el => {
      el.removeAttribute('draggable')
      el.classList.remove('dragging')
      el.removeEventListener('dragstart', onBenchDragStart)
      el.removeEventListener('dragend', onBenchDragEnd)
      el.removeEventListener('dragover', onBenchDragOver)
      el.removeEventListener('dragenter', onBenchDragEnter)
      el.removeEventListener('dragleave', onBenchDragLeave)
      el.removeEventListener('drop', onBenchDrop)
    })
  }

  return {
    destroy,
    unlock () { isSaving = false }
  }
}
