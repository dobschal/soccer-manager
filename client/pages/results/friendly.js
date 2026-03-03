import { server } from '../../lib/gateway.js'
import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { getQueryParams, setQueryParams } from '../../lib/router.js'
import { UIElement } from '../../lib/UIElement.js'
import { renderEmblem } from '../../partials/emblem.js'
import { t } from '../../i18n/index.js'

export class FriendlyResultsPage extends UIElement {
  results = []

  /**
   * @param {UIElement} parentPage
   */
  constructor (parentPage) {
    super()
    this.parentPage = parentPage
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
      : `
            <div class="horizontal-scrollable-table">
              <table class="table table-hover mb-4 wide-on-mobile">
                <thead>
                  <tr>
                    <th scope="col">${t('results.gameDayLabel')}</th>
                    <th scope="col" class="text-end">${t('results.team1')}</th>
                    <th scope="col" class="text-center">${t('results.result')}</th>
                    <th scope="col">${t('results.team2')}</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.results.map(this._renderResultItem.bind(this)).join('')}
                </tbody>
              </table>
            </div>
          `
    }
      </div>
    `
  }

  get myTeamId () {
    return this.parentPage.myTeamId
  }

  async load () {
    if (typeof this.season === 'undefined') {
      const response = await server.getCurrentGameday()
      this.season = response.season
    }
    const { results } = await server.getFriendlyResults(this.season)
    this.results = results
  }

  _renderResultItem (result) {
    const id = generateId()

    onClick(id, () => {
      setQueryParams({ game_id: result.id })
    })

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

    const short1 = result.team1.split(' ').pop()
    const short2 = result.team2.split(' ').pop()

    const nameLabel1 = `<span class="d-none d-lg-inline">${result.team1}</span><span class="d-lg-none">${short1}</span>`
    const nameLabel2 = `<span class="d-none d-lg-inline">${result.team2}</span><span class="d-lg-none">${short2}</span>`

    const team1IsMyTeam = this.myTeamId === result.team1Id
    const team2IsMyTeam = this.myTeamId === result.team2Id

    return `
      <tr id="${id}">
        <td>${result.gameDay + 1}</td>
        <td class="text-end">
          ${team1IsMyTeam ? `<b class="text-info">${nameLabel1}</b>` : nameLabel1}${emblem1}
        </td>
        <td class="text-center">${result.goalsTeam1 ?? '-'} : ${result.goalsTeam2 ?? '-'}</td>
        <td>
          ${emblem2}${team2IsMyTeam ? `<b class="text-info">${nameLabel2}</b>` : nameLabel2}
        </td>
      </tr>
    `
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
