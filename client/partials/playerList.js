import { server } from '../lib/gateway.js'
import { calculateMarketValue, calculatePlayerAge, getSalary, sortByPosition } from '../util/player.js'
import { UIElement } from '../lib/UIElement.js'
import { PlayerListItem } from './playerListItem.js'
import { Table } from './table.js'
import { t } from '../i18n/index.js'
import { getQueryParams, setQueryParams } from '../lib/router.js'
import { el } from '../lib/html.js'

export class PlayerList extends UIElement {
  /**
   * @param {PlayerType[]} players
   * @param {boolean} showTitle
   * @param {(player: PlayerType) => void} onClickHandler
   * @param {boolean} enableDragDrop
   * @param {boolean} extended
   * @param {() => void} onToggleExtended
   * @param {number|null} captainId
   */
  constructor (players, showTitle = true, onClickHandler, enableDragDrop = false, extended = false, onToggleExtended = null, captainId = null) {
    super()
    this.players = players
    this.showTitle = showTitle
    this.onClickHandler = onClickHandler
    this.enableDragDrop = enableDragDrop
    this.extended = extended
    this.onToggleExtended = onToggleExtended
    this.captainId = captainId
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
        <div class="player-list-toolbar mb-2 ${PlayerList._isSortActive() ? '' : 'hidden'}">
          <button class="btn btn-sm btn-outline-secondary player-list-reset-sort" title="${t('common.resetSort')}">
            <i class="fa fa-times"></i> ${t('common.resetSort')}
          </button>
        </div>
        ${this._renderTable()}
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
      },
      '.player-list-reset-sort': {
        click: () => {
          this.players.sort(sortByPosition)
          setQueryParams({ sort_dir: null, col: null })
          this.update()
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
  /**
   * Toggle the reset-sort button visibility when the URL sort params change.
   * Avoids a full re-render so the underlying Table keeps managing its own state.
   * @returns {void}
   */
  onQueryChanged () {
    const toolbar = el(`${this._elementQuery} .player-list-toolbar`)
    if (!toolbar) return
    toolbar.classList.toggle('hidden', !PlayerList._isSortActive())
  }
  /**
   * @returns {boolean}
   * @private
   */
  static _isSortActive () {
    const { sort_dir: sortDir, col } = getQueryParams()
    return Boolean(sortDir && col !== undefined)
  }
  
  /**
   * @returns {Table}
   */
  _renderTable () {
    const season = this.season
    return new Table({
      cols: [
        {
          name: 'Name',
          sortFn: (a, b, asc) => asc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
        },
        {
          name: 'Pos',
          sortFn: (a, b, asc) => asc ? a.position.localeCompare(b.position) : b.position.localeCompare(a.position)
        },
        {
          name: 'Age',
          align: 'right',
          sortFn: (a, b, asc) => {
            const ageA = calculatePlayerAge(a, season)
            const ageB = calculatePlayerAge(b, season)
            return asc ? ageA - ageB : ageB - ageA
          }
        },
        {
          name: 'Fit',
          align: 'right',
          sortKey: 'freshness'
        },
        {
          name: 'Lvl',
          align: 'right',
          sortKey: 'level'
        },
        {
          name: t('player.salary'),
          align: 'right',
          sortFn: (a, b, asc) => {
            const sA = getSalary(a.level)
            const sB = getSalary(b.level)
            return asc ? sA - sB : sB - sA
          }
        },
        {
          name: t('player.value'),
          align: 'right',
          sortFn: (a, b, asc) => {
            const vA = calculateMarketValue(a.level, calculatePlayerAge(a, season))
            const vB = calculateMarketValue(b.level, calculatePlayerAge(b, season))
            return asc ? vA - vB : vB - vA
          }
        },
        {
          name: t('player.goals'),
          align: 'right',
          sortFn: (a, b, asc) => {
            const gA = a.season_goals ?? 0
            const gB = b.season_goals ?? 0
            return asc ? gA - gB : gB - gA
          }
        },
        {
          name: t('player.games'),
          align: 'right',
          sortFn: (a, b, asc) => {
            const gA = a.season_games ?? 0
            const gB = b.season_games ?? 0
            return asc ? gA - gB : gB - gA
          }
        }
      ],
      data: this.players,
      renderRow: (player) => this._buildItem(player).cells,
      rowClass: (player) => this._buildItem(player).rowClass,
      rowAttrs: (player) => `data-player-id="${player.id}"`,
      onClick: (player) => {
        if (typeof this.onClickHandler === 'function') {
          this.onClickHandler(player)
        }
      }
    })
  }

  /**
   * @param {PlayerType} player
   * @returns {PlayerListItem}
   */
  _buildItem (player) {
    return new PlayerListItem(player, this.season, this.sellOfferPlayerIds, this.captainId)
  }

}
