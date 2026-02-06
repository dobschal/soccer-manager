import { server } from '../lib/gateway.js'
import { setQueryParams } from '../lib/router.js'
import { PlayerList } from '../partials/playerList.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { renderEmblem } from '../partials/emblem.js'
import { renderPlayerImage } from '../partials/playerImage.js'
import { UIElement } from '../lib/UIElement.js'
import { formatLeague } from '../util/league.js'
import { showStadiumModal } from '../partials/stadiumModal.js'
import { euroFormat } from '../lib/currency.js'
import { t } from '../i18n/index.js'

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
  /** @type {string} */
  _bestPlayerImage = ''
  /** @type {number} */
  _teamValue = 0

  /**
   * @returns {string}
   */
  get template () {
    const bestPlayer = this._bestPlayer
    return `
      <div>
        <div class="row mb-4 align-items-center">
          <div class="col-12 col-md-4 text-center mb-3 mb-md-0">
            ${renderEmblem(this.team, 200)}
          </div>
          <div class="col-12 col-md-4 text-center mb-3 mb-md-0">
            <h2>${this.team.name}</h2>
            <p class="mb-0">
              <b>${t('team.leagueLabel')}</b>: <a href="#results?level=${this.team.level}&league=${this.team.league}" class="text-info">${formatLeague(this.team.level, this.team.league)}</a><br>
              <b>${t('team.teamValue')}</b>: ${euroFormat.format(this._teamValue)}<br>
              <b>${t('team.lineupStrength')}</b>: ${this._teamStrength}<br>
              <b>${t('team.avgFreshness')}</b>: ${Math.floor(this._teamFreshness * 100)}%<br>
              <b>${t('team.trainer')}</b>: ${this._username}<br>
              <b>${t('team.stadiumSize')}</b>: <a href="#" class="stadium-link text-info">${t('team.seats', { seats: this._stadiumSize })}</a>
            </p>
          </div>
          <div class="col-12 col-md-4 text-center">
            ${bestPlayer ? `
              <div class="best-player-link" style="cursor: pointer;" data-player-id="${bestPlayer.id}">
                <div class="mb-2" style="display: inline-block;">${this._bestPlayerImage}</div>
                <div style="clear: both;">
                  <div class="text-muted small">${t('team.bestPlayer')}</div>
                  <div><strong>${bestPlayer.name}</strong></div>
                  <div class="text-info">${t('team.levelLabel', { level: bestPlayer.level })}</div>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
        ${new PlayerList(
      this.players,
      true,
      (player) => setQueryParams({ player_id: player.id + '' })
    )}
      </div>
    `
  }

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '.stadium-link': {
        click: (event) => {
          event.preventDefault()
          showStadiumModal(this.team.id)
        }
      },
      '.best-player-link': {
        click: (event) => {
          const playerId = event.currentTarget.dataset.playerId
          if (playerId) {
            setQueryParams({ player_id: playerId })
          }
        }
      }
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    if (!this.teamId) throw new Error('No team id present...')
    const {
      team,
      players,
      user
    } = await server.getTeam(this.teamId)
    this.user = user
    this.team = team
    this.players = players

    const [stadium, teamValue] = await Promise.all([
      server.getStadiumByTeamId(this.team.id),
      server.getTeamValue(this.team.id)
    ])
    this.stadium = stadium
    this._teamValue = teamValue.value

    // Render best player image
    const bestPlayer = this._bestPlayer
    if (bestPlayer) {
      this._bestPlayerImage = await renderPlayerImage(bestPlayer, this.team, 150)
    }
  }

  /**
   * @param {Object} params
   * @param {string} params.player_id
   * @param {string} params.id
   * @returns {Promise<void>}
   */
  async onQueryChanged ({
    player_id: playerId,
    id
  }) {
    if (playerId) await showPlayerModal(Number(playerId))
    this.teamId = Number(id)
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

  /**
   * @returns {string}
   */
  get _username () {
    return this.user?.username ?? 'N/A <i class="fa fa-user-secret" aria-hidden="true"></i>'
  }

  /**
   * @returns {number}
   */
  get _stadiumSize () {
    return this.stadium.south_stand_size + this.stadium.north_stand_size + this.stadium.east_stand_size + this.stadium.west_stand_size
  }

  /**
   * @returns {PlayerType|null}
   * @private
   */
  get _bestPlayer () {
    if (!this.players || this.players.length === 0) return null
    return this.players.reduce((best, player) => {
      if (!best || player.level > best.level) return player
      return best
    }, null)
  }
}
