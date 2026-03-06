import { UIElement } from '../../lib/UIElement.js'
import { Table } from '../../partials/table.js'
import { server } from '../../lib/gateway.js'
import { calculatePlayerAge, getSalary, sortByPosition } from '../../util/player.js'
import { showDialog } from '../../partials/dialog.js'
import { toast } from '../../partials/toast.js'
import { setQueryParams } from '../../lib/router.js'
import { t } from '../../i18n/index.js'
import { renderLevelBadge } from '../../partials/levelBadge.js'

export class FreePlayers extends UIElement {
  players = []
  season = 0

  /** @type {() => void} */
  _onPlayerHired = () => this.update(true)

  onMounted () {
    window.addEventListener('player-hired', this._onPlayerHired)
  }

  onDestroy () {
    window.removeEventListener('player-hired', this._onPlayerHired)
  }

  /**
   * @returns {string}
   */
  get template () {
    const table = new Table({
      data: this.players,
      cols: this._prepareTableCols(),
      onClick: (player) => {
        setQueryParams({ player_id: player.id })
      },
      renderRow: player => [
        player.name,
        player.position,
        calculatePlayerAge(player, this.season),
        renderLevelBadge(player.level),
        `<button class="btn btn-primary btn-sm" data-hire-player="${player.id}">${t('player.hireBtn', { playerName: '' }).trim()}</button>`
      ]
    })

    return `
      <div>
        <h2>${t('trades.freePlayersTitle')}</h2>
        <p>${t('trades.freePlayersDesc')}</p>
        ${table}
        <div class="row ${this.players.length === 0 ? '' : 'hidden'}">
          <div class="col">
            <h4 class="text-muted text-center mt-5 mb-5">${t('trades.noFreePlayers')}</h4>
          </div>
        </div>
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const response = await server.getCurrentGameday()
    this.season = response.season
    this.players = await server.getPlayersWithoutTeam()
  }

  /**
   * @returns {Array<TableHeadCellConfig>}
   */
  _prepareTableCols () {
    return [{
      name: t('results.name')
    }, {
      name: t('player.position'),
      sortFn: (playerA, playerB, isAsc) => {
        if (isAsc) {
          return sortByPosition(playerB, playerA)
        }
        return sortByPosition(playerA, playerB)
      }
    }, {
      name: t('player.age'),
      sortFn: (playerA, playerB, isAsc) => {
        const ageA = calculatePlayerAge(playerA, this.season)
        const ageB = calculatePlayerAge(playerB, this.season)
        if (isAsc) {
          return ageA - ageB
        }
        return ageB - ageA
      },
      align: 'right'
    }, {
      name: t('player.level'),
      sortKey: 'level',
      align: 'right'
    }, {
      name: '',
      onClick: (player) => {
        void this._showHireDialog(player)
      }
    }]
  }

  /**
   * @param {PlayerType} player
   * @returns {Promise<void>}
   * @private
   */
  async _showHireDialog (player) {
    const { ok } = await showDialog({
      title: t('player.hireConfirmTitle', { playerName: player.name }),
      text: t('player.hireConfirmText', {
        playerName: player.name,
        salary: getSalary(player.level)
      }),
      hasInput: false,
      buttonText: t('player.yesHire'),
      buttonType: 'success'
    })
    if (!ok) return
    try {
      await server.givePlayerContract(player.id)
      toast(t('player.contractGiven', { playerName: player.name }), 'success')
      await this.update(true)
    } catch (e) {
      console.error(e)
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    }
  }
}
