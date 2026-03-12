import { server } from '../../lib/gateway.js'
import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { getQueryParams, setQueryParams } from '../../lib/router.js'
import { UIElement } from '../../lib/UIElement.js'
import { renderEmblem } from '../../partials/emblem.js'
import { Table } from '../../partials/table.js'
import { t } from '../../i18n/index.js'
import { shortenTeamName } from '../../util/team.js'

export class FriendlyResultsPage extends UIElement {
  /**
   * @param {UIElement} parentPage
   */
  constructor (parentPage) {
    super()
    this.parentPage = parentPage
  }
  async load () {
    if (typeof this.season === 'undefined') {
      const response = await server.getCurrentGameday()
      this.season = response.season
    }
    const { results } = await server.getFriendlyResults(this.season)
    this.results = results
  }
  get template () {
    return `
      <div>
        <div class="mb-4">
          <h2>${t('friendly.title')}</h2>
          <table>
            <tr>
              <th>${t('results.season')}</th>
              <td>
                <span id="prev-season-button" class="fa fa-chevron-left fa-button"></span>
                ${this.season + 1}
                <span id="next-season-button" class="fa fa-chevron-right fa-button"></span>
              </td>
            </tr>
          </table>
        </div>

        <h3>${t('results.games')}</h3>
        ${this.results.length === 0
    ? `<p class="text-muted">${t('friendly.noResults')}</p>`
    : new Table({
      cols: [
        { name: t('results.gameDayLabel') },
        { name: t('results.team1'), align: 'right' },
        { name: t('results.result'), align: 'center' },
        { name: t('results.team2') }
      ],
      renderRow: (result) => this._renderResultItem(result),
      data: this.results,
      rowAttrs: (result) => `id="${result._rowId}"`
    })
}
      </div>
    `
  }
  get events () {
    return {
      '#prev-season-button': {
        click: () => setQueryParams({
          sub_page: 'friendly',
          season: this.season - 1
        })
      },
      '#next-season-button': {
        click: () => setQueryParams({
          sub_page: 'friendly',
          season: this.season + 1
        })
      }
    }
  }
  results = []

  get myTeamId () {
    return this.parentPage.myTeamId
  }

  _renderResultItem (result) {
    if (!result._rowId) {
      result._rowId = generateId()
      onClick(result._rowId, () => {
        setQueryParams({ game_id: result.id })
      })
    }

    const team1Data = {
      name: result.team1,
      color: result.team1Color,
      emblem: result.team1Emblem
    }
    const team2Data = {
      name: result.team2,
      color: result.team2Color,
      emblem: result.team2Emblem
    }

    const emblem1 = `<span class="emblem-thumb">${renderEmblem(team1Data, 24)}</span>`
    const emblem2 = `<span class="emblem-thumb">${renderEmblem(team2Data, 24)}</span>`

    const nameLabel1 = shortenTeamName(result.team1)
    const nameLabel2 = shortenTeamName(result.team2)

    const team1IsMyTeam = this.myTeamId === result.team1Id
    const team2IsMyTeam = this.myTeamId === result.team2Id

    return [
      `${result.gameDay + 1}`,
      `${team1IsMyTeam ? `<b class="text-info">${nameLabel1}</b>` : nameLabel1}${emblem1}`,
      `${result.goalsTeam1 ?? '-'} : ${result.goalsTeam2 ?? '-'}`,
      `${emblem2}${team2IsMyTeam ? `<b class="text-info">${nameLabel2}</b>` : nameLabel2}`
    ]
  }

  /**
   * Called by parent when query params change
   * @param {Object} _queryParams
   */
  async applyQueryParams (_queryParams) {
    const { season } = getQueryParams()
    if (typeof season !== 'undefined') {
      const s = Number(season)
      if (s >= 0) this.season = s
    }
  }
}
