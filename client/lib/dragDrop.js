/**
 * Drag-and-drop manager for the my-team page.
 * Supports three scenarios:
 *   A. Bench player → pitch position (assign to lineup)
 *   B. Swap two lineup players in the list
 *   C. Reorder bench players (persisted via sort_index)
 *
 * Uses native HTML5 Drag and Drop API. Skipped on touch devices.
 *
 * @param {Object} options
 * @param {HTMLElement} options.tableBodyEl  - <tbody> of the player list
 * @param {HTMLElement} options.squadEl      - .squad element on the pitch
 * @param {HTMLElement} [options.benchEl]    - .bench element (sidebar bench panel)
 * @param {Array} options.players           - players array reference
 * @param {Object} options.team             - team object reference
 * @param {(players: Array, formation: string) => Promise} options.onLineupChange
 * @param {(sortData: Array<{playerId:number,sortIndex:number}>) => Promise} options.onSortChanged
 * @returns {{ destroy: () => void }}
 */
export function initDragDrop ({ tableBodyEl, squadEl, benchEl, players, team, onLineupChange, onSortChanged }) {
  // Skip on touch devices — the click overlay remains as fallback
  if (navigator.maxTouchPoints > 0) {
    return { destroy () {} }
  }

  let draggedPlayerId = null
  let draggedRow = null

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

  // --- make rows draggable ---

  const rows = tableBodyEl.querySelectorAll('tr[data-player-id]')
  rows.forEach(row => {
    const playerId = Number(row.dataset.playerId)
    const player = getPlayerById(playerId)
    if (!player || player.is_suspended) return

    row.draggable = true
    row.classList.add('drag-enabled')

    row.addEventListener('dragstart', onRowDragStart)
    row.addEventListener('dragend', onRowDragEnd)
    row.addEventListener('dragover', onRowDragOver)
    row.addEventListener('dragenter', onRowDragEnter)
    row.addEventListener('dragleave', onRowDragLeave)
    row.addEventListener('drop', onRowDrop)
  })

  // --- make pitch players drop targets ---

  const pitchPlayers = squadEl.querySelectorAll('.player')
  pitchPlayers.forEach(el => {
    el.addEventListener('dragover', onPitchDragOver)
    el.addEventListener('dragenter', onPitchDragEnter)
    el.addEventListener('dragleave', onPitchDragLeave)
    el.addEventListener('drop', onPitchDrop)
  })

  // --- row event handlers ---

  function onRowDragStart (e) {
    draggedPlayerId = Number(e.currentTarget.dataset.playerId)
    draggedRow = e.currentTarget
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(draggedPlayerId))
    requestAnimationFrame(() => {
      if (draggedRow) draggedRow.classList.add('dragging')
    })
  }

  function onRowDragEnd () {
    if (draggedRow) draggedRow.classList.remove('dragging')
    clearAllHighlights()
    draggedPlayerId = null
    draggedRow = null
  }

  function onRowDragOver (e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function onRowDragEnter (e) {
    const row = e.currentTarget
    if (row === draggedRow) return
    const targetId = Number(row.dataset.playerId)
    const draggedPlayer = getPlayerById(draggedPlayerId)
    const targetPlayer = getPlayerById(targetId)
    if (!draggedPlayer || !targetPlayer) return

    // Both bench → show sort indicator
    if (isOnBench(draggedPlayer) && isOnBench(targetPlayer)) {
      row.classList.add('drag-over-below')
    } else if (!isOnBench(draggedPlayer) || !isOnBench(targetPlayer)) {
      // At least one in lineup — highlight if compatible
      if (positionsCompatible(draggedPlayer.position, targetPlayer.position)) {
        row.classList.add('drag-over-below')
      }
    }
  }

  function onRowDragLeave (e) {
    e.currentTarget.classList.remove('drag-over-above', 'drag-over-below')
  }

  function onRowDrop (e) {
    e.preventDefault()
    const row = e.currentTarget
    row.classList.remove('drag-over-above', 'drag-over-below')

    const targetId = Number(row.dataset.playerId)
    if (targetId === draggedPlayerId) return

    const draggedPlayer = getPlayerById(draggedPlayerId)
    const targetPlayer = getPlayerById(targetId)
    if (!draggedPlayer || !targetPlayer) return

    if (isOnBench(draggedPlayer) && isOnBench(targetPlayer)) {
      // Scenario C: reorder bench players
      reorderBench(draggedPlayer, targetPlayer)
    } else if (positionsCompatible(draggedPlayer.position, targetPlayer.position)) {
      // Scenario B: swap in_game_position
      swapLineupPositions(draggedPlayer, targetPlayer)
    }
  }

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

    const draggedPlayer = getPlayerById(draggedPlayerId)
    if (!draggedPlayer) return

    const pitchPosition = getPitchPosition(pitchEl)
    if (!pitchPosition || !positionsCompatible(draggedPlayer.position, pitchPosition)) return

    // Find who currently occupies this pitch slot
    const pitchPlayerId = pitchEl.dataset.playerId
    const isFake = String(pitchPlayerId).startsWith('fake-')

    if (isFake) {
      // Empty slot — just assign dragged player
      draggedPlayer.in_game_position = pitchPosition
      onLineupChange(players.filter(p => !p.fake), team.formation)
    } else {
      const occupant = getPlayerById(Number(pitchPlayerId))
      if (occupant) {
        // Swap: occupant goes to bench, dragged player takes the spot
        occupant.in_game_position = draggedPlayer.in_game_position || ''
        draggedPlayer.in_game_position = pitchPosition
        onLineupChange(players.filter(p => !p.fake), team.formation)
      }
    }
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

    if (positionsCompatible(draggedPlayer.position, targetPlayer.position)) {
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

    const draggedPlayer = getPlayerById(draggedPlayerId)
    if (!draggedPlayer) return

    const targetId = Number(benchPlayerEl.dataset.playerId)
    const targetPlayer = getPlayerById(targetId)
    if (!targetPlayer) return

    if (positionsCompatible(draggedPlayer.position, targetPlayer.position)) {
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

    onSortChanged(sortData)
  }

  function clearAllHighlights () {
    tableBodyEl.querySelectorAll('.drag-over-above, .drag-over-below').forEach(el => {
      el.classList.remove('drag-over-above', 'drag-over-below')
    })
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
    rows.forEach(row => {
      row.removeAttribute('draggable')
      row.classList.remove('drag-enabled', 'dragging')
      row.removeEventListener('dragstart', onRowDragStart)
      row.removeEventListener('dragend', onRowDragEnd)
      row.removeEventListener('dragover', onRowDragOver)
      row.removeEventListener('dragenter', onRowDragEnter)
      row.removeEventListener('dragleave', onRowDragLeave)
      row.removeEventListener('drop', onRowDrop)
    })
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

  return { destroy }
}
