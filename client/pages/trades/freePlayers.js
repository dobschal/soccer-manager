import { UIElement } from '../../lib/UIElement.js'
import { renderTable } from '../../partials/table.js'
import { euroFormat } from '../../lib/currency.js'
import { renderButton } from '../../partials/button.js'
import { server } from '../../lib/gateway.js'
import { calculatePlayerAge, sallaryPerLevel } from '../../util/player.js'
import { showDialog } from '../../partials/dialog.js'
import { toast } from '../../partials/toast.js'

export class FreePlayers extends UIElement {
  get template () {
    return `
      <div>
        <h2>Free Players</h2>
        <p>Here is a list of free players without team. </p>
        ${this.table}
        <div class="row ${this.players.length === 0 ? '' : 'hidden'}">
          <div class="col">
            <h4 class="text-muted text-center mt-5 mb-5">No players without team currently...</h4>
          </div>
        </div>
      </div>  
    `
  }

  /**
   * @returns {Array<TableHeadCellConfig>}
   */
  get columns () {
    return [
      {
        name: 'Name'
      }, {
        name: 'Position'
      }, {
        name: 'Age'
      }, {
        name: 'Level'
      }, {
        name: 'Action'
      }
    ]
  }

  async load () {
    const response = await server.getCurrentGameday()
    this.gameDay = response.gameDay
    this.season = response.season
    this.players = await server.getPlayersWithoutTeam_V2()
    this.table = renderTable({
      data: this.players,
      cols: this.columns,
      renderRow: this._renderRow.bind(this)
    })
  }

  /**
   * @param {PlayerType} player
   * @returns {Array<string>}
   * @private
   */
  _renderRow (player) {
    return [
      player.name,
      player.position,
      calculatePlayerAge(player, this.season),
      player.level,
      renderButton('Hire', () => this._showHireDialog(player), 'success')
    ]
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
      await server.givePlayerContract_V2(player.id)
      toast('You gave ' + player.name + ' a new contract.', 'success')
      await this.update(false)
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong', 'error')
    }
  }
}
