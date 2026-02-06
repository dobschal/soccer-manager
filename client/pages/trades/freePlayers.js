import { UIElement } from '../../lib/UIElement.js'
import { Table } from '../../partials/table.js'
import { euroFormat } from '../../lib/currency.js'
import { server } from '../../lib/gateway.js'
import { calculatePlayerAge, sallaryPerLevel, sortByPosition } from '../../util/player.js'
import { showDialog } from '../../partials/dialog.js'
import { toast } from '../../partials/toast.js'
import { setQueryParams } from '../../lib/router.js'

export class FreePlayers extends UIElement {
  players = []
  season = 0

  /** @type {() => void} */
  _onPlayerHired = () => this.update(false)

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
        player.level,
        `<button class="btn btn-success btn-sm" data-hire-player="${player.id}">Hire</button>`
      ]
    })

    return `
      <div>
        <h2>Free Players</h2>
        <p>Here is a list of free players without team. </p>
        ${table}
        <div class="row ${this.players.length === 0 ? '' : 'hidden'}">
          <div class="col">
            <h4 class="text-muted text-center mt-5 mb-5">No players without team currently...</h4>
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
      name: 'Name'
    }, {
      name: 'Position',
      sortFn: (playerA, playerB, isAsc) => {
        if (isAsc) {
          return sortByPosition(playerB, playerA)
        }
        return sortByPosition(playerA, playerB)
      }
    }, {
      name: 'Age',
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
      name: 'Level',
      sortKey: 'level',
      align: 'right'
    }, {
      name: '',
      largeScreenOnly: true,
      onClick: (player) => {
        this._showHireDialog(player)
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
      title: `Hire ${player.name}?`,
      text: 'Do you want to hire the player for your team? The salary would be ' + euroFormat.format(sallaryPerLevel[player.level]) + ' per game day.',
      hasInput: false,
      buttonText: 'Yes, hire!',
      buttonType: 'success'
    })
    if (!ok) return
    try {
      await server.givePlayerContract(player.id)
      toast('You gave ' + player.name + ' a new contract.', 'success')
      await this.update(false)
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong', 'error')
    }
  }
}
