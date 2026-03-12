import { server } from '../lib/gateway.js'
import { sortByPosition } from '../util/player.js'
import { UIElement } from '../lib/UIElement.js'
import { PlayerListItem } from './playerListItem.js'
import { t } from '../i18n/index.js'

export class PlayerList extends UIElement {
  /**
   * @param {PlayerType[]} players
   * @param {boolean} showTitle
   * @param {(player: PlayerType) => void} onClickHandler
   * @param {boolean} enableDragDrop
   * @param {boolean} extended
   * @param {() => void} onToggleExtended
   */
  constructor (players, showTitle = true, onClickHandler, enableDragDrop = false, extended = false, onToggleExtended = null) {
    super()
    this.players = players
    this.showTitle = showTitle
    this.onClickHandler = onClickHandler
    this.enableDragDrop = enableDragDrop
    this.extended = extended
    this.onToggleExtended = onToggleExtended
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const [{ season }, { playerIds }] = await Promise.all([
      server.getCurrentGameday(),
      server.getMySellOfferPlayerIds()
    ])
    this.season = season
    this.sellOfferPlayerIds = new Set(playerIds)
    this.players.sort(sortByPosition)
  }
  /**
   * @returns {string}
   */
  get template () {
    const toggleBtn = this.onToggleExtended
      ? `<button class="btn btn-sm btn-outline-info player-list-toggle-btn float-end d-none d-md-inline-block" title="${this.extended ? 'Collapse' : 'Expand'}"><i class="fa fa-${this.extended ? 'compress' : 'expand'}"></i></button>`
      : ''

    return `
      <div>
        <h3 class="${this.showTitle ? '' : 'hidden'}" style="clear: both;">Players (${this.players.length}) ${toggleBtn}</h3>
        <div class="horizontal-scrollable-table">
          <table class="table table-hover mb-4 wide-on-mobile">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Pos</th>
                <th scope="col" class="text-right">Age</th>
                <th scope="col" class="text-right">Fit</th>
                <th scope="col" class="text-right">Lvl</th>
                <th scope="col" class="text-right">${t('player.salary')}</th>
                <th scope="col" class="text-right">${t('player.value')}</th>
                <th scope="col" class="text-right">${t('player.goals')}</th>
                <th scope="col" class="text-right">${t('player.games')}</th>
              </tr>
            </thead>
            <tbody>
                ${this.players.map(player => new PlayerListItem(player, this.season, this.onClickHandler, this.sellOfferPlayerIds, this.extended)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `
  }
  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '(optional).player-list-toggle-btn': {
        click: () => {
          if (this.onToggleExtended) {
            this.onToggleExtended()
          }
        }
      }
    }
  }
  /**
   * Server events to listen for
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      NEW_SELL_TRADE_OFFER: () => this.update(true)
    }
  }
  
}
