import { server } from '../lib/gateway.js'
import { getQueryParams, setQueryParams } from '../lib/router.js'
import { PlayerList } from '../partials/playerList.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { Emblem } from '../partials/emblem.js'
import { UIElement } from '../lib/UIElement.js'
import { formatLeague } from '../util/league.js'

/**
 * Information to render:
 * emblem (/)
 * name (/)
 * strength (/)
 * freshness (/)
 * stadium + size (/)
 * league (level) (/)
 * players (/)
 * username (/)
 * trade_history
 * player value
 */

export class TeamPage extends UIElement {
  /** @type {StadiumType} */
  stadium

  get template () {
    return `
      <div class="mb-4">
        <div class="float-start me-4 mb-4 ms-2">
            ${new Emblem({ team: this.team, size: 300, withText: true })}
        </div>
        <h2>${this.team.name}</h2>
        <p>
          <b>League</b>: ${formatLeague(this.team.level, this.team.league)}<br>
          <b>Team Strength</b>: ${this._teamStrength}<br>
          <b>Ø Freshness</b>: ${Math.floor(this._teamFreshness * 100)}%<br>
          <b>Trainer</b>: ${this._username}<br>
          <b>Stadium Size</b>: ${this._stadiumSize} seats
        </p>
      </div>
      ${new PlayerList(
        this.players,
        true,
        (player) => setQueryParams({ player_id: player.id + '' })
      )}
    `
  }

  async load () {
    this._handleQueryParams()
    const { team, players, user } = await server.getTeam({ teamId: this.teamId + '' })
    this.user = user
    this.team = team
    this.players = players
    this.stadium = await server.getStadiumByTeamId_V2(this.team.id)
    if (this.playerId) await showPlayerModal(this.playerId)
  }

  _handleQueryParams () {
    const params = getQueryParams()
    if (!params.id) throw new Error('No team id present...')
    this.teamId = Number(params.id)
    if (params.player_id) {
      this.playerId = Number(params.player_id)
    }
  }

  /**
   * @returns {number}
   * @private
   */
  get _teamStrength () {
    return this.players.filter(p => p.in_game_position).reduce((sum, player) => sum + player.level, 0)
  }

  /**
   * @returns {number}
   * @private
   */
  get _teamFreshness () {
    return this.players.filter(p => p.in_game_position).reduce((sum, player, _, { length }) => sum + player.freshness / length, 0)
  }

  get _username () {
    return this.user?.username ?? 'N/A <i class="fa fa-user-secret" aria-hidden="true"></i>'
  }

  get _stadiumSize () {
    return this.stadium.south_stand_size + this.stadium.north_stand_size + this.stadium.east_stand_size + this.stadium.west_stand_size
  }
}
