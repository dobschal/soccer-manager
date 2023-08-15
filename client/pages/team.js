import { server } from '../lib/gateway.js'
import { getQueryParams, goTo, setQueryParams } from '../lib/router.js'
import { renderPlayersList } from '../partials/playersList.js'
import { toast } from '../partials/toast.js'
import { showPlayerModal } from '../partials/playerModal.js'

export async function renderTeamPage () {
  const { id, player_id: playerId } = getQueryParams()
  if (!id || isNaN(id)) {
    toast('No team id present...')
    goTo('')
    return ''
  }
  if (playerId) await showPlayerModal(Number(playerId))
  const info = await server.getTeam({ teamId: Number(id) })
  const playersList = await renderPlayersList(
    info.players,
    true,
    (player) => setQueryParams({ player_id: player.id })
  )
  return `
    <div class="mb-4">
      <h2>${info.team.name}</h2>
      <p>      
        <b>Team Strength</b>: ${_calculateTeamStrength(info.players)}
      </p>
    </div>
    ${playersList}
  `
}

function _calculateTeamStrength (players) {
  return players.filter(p => p.in_game_position).reduce((sum, player) => sum + player.level, 0)
}
