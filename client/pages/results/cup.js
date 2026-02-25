import { server } from '../../lib/gateway.js'
import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { setQueryParams } from '../../lib/router.js'
import { UIElement } from '../../lib/UIElement.js'
import { renderEmblem } from '../../partials/emblem.js'
import { t } from '../../i18n/index.js'

export class CupResultsPage extends UIElement {
  cupSeason = null
  cupRound = null
  cupRounds = []
  cupResults = []
  cupSeasons = []
  cupTotalRounds = 0

  /**
   * @param {UIElement} parentPage
   */
  constructor (parentPage) {
    super()
    this.parentPage = parentPage
  }

  get events () {
    return {
      '#prev-cup-round-button': {
        click: () => this._navigateCupRound(-1)
      },
      '#next-cup-round-button': {
        click: () => this._navigateCupRound(1)
      },
      '#prev-cup-season-button': {
        click: () => this._navigateCupSeason(-1)
      },
      '#next-cup-season-button': {
        click: () => this._navigateCupSeason(1)
      }
    }
  }

  get template () {
    const roundName = this._getCupRoundName(this.cupRound)

    return `
      <div>
        <div class="mb-4">
          <h2>${t('cup.results')}</h2>
          <table>
            <tr>
              <th>${t('results.season')}</th>
              <td>
                <span id="prev-cup-season-button" class="fa fa-chevron-left fa-button"></span>
                ${(this.cupSeason ?? 0) + 1}
                <span id="next-cup-season-button" class="fa fa-chevron-right fa-button"></span>
              </td>
            </tr>
            <tr>
              <th>${t('cup.round')}</th>
              <td>
                <span id="prev-cup-round-button" class="fa fa-chevron-left fa-button"></span>
                ${roundName}
                <span id="next-cup-round-button" class="fa fa-chevron-right fa-button"></span>
              </td>
            </tr>
          </table>
        </div>

        <h3>${t('results.games')}</h3>
        ${this.cupResults.length === 0
      ? `<p class="text-muted">${t('cup.noGames')}</p>`
      : `
            <div class="horizontal-scrollable-table">
              <table class="table table-hover mb-4 wide-on-mobile">
                <thead>
                  <tr>
                    <th scope="col">${t('results.team1')}</th>
                    <th scope="col">${t('results.team2')}</th>
                    <th scope="col">${t('results.result')}</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.cupResults.map(this._renderCupResultItem.bind(this)).join('')}
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
    const { seasons } = await server.getAvailableCupSeasons()
    this.cupSeasons = seasons

    if (this.cupSeason === null && seasons.length > 0) {
      this.cupSeason = seasons[0]
    }

    if (this.cupSeason === null) {
      this.cupRounds = []
      this.cupResults = []
      return
    }

    const { rounds, totalRounds } = await server.getCupRounds(this.cupSeason)
    this.cupRounds = rounds
    this.cupTotalRounds = totalRounds || 0

    if ((this.cupRound === null || !rounds.some(r => r.round === this.cupRound)) && rounds.length > 0) {
      const lastPlayedRound = [...rounds].reverse().find(r => r.played)
      this.cupRound = lastPlayedRound ? lastPlayedRound.round : rounds[0].round
    }

    if (this.cupRound === null) {
      this.cupResults = []
      return
    }

    const { results } = await server.getCupResults(this.cupSeason, this.cupRound)
    this.cupResults = results
  }

  _getCupRoundName (round) {
    if (round === 1) return t('cup.final')
    if (round === 2) return t('cup.semiFinal')
    if (round === 4) return t('cup.quarterFinal')
    if (round === 8) return t('cup.roundOf16')
    const sequentialNumber = this.cupTotalRounds - Math.log2(round)
    return t('cup.roundNumber', { number: sequentialNumber })
  }

  _navigateCupRound (direction) {
    const currentIndex = this.cupRounds.findIndex(r => r.round === this.cupRound)
    const newIndex = currentIndex + direction

    if (newIndex >= 0 && newIndex < this.cupRounds.length) {
      setQueryParams({
        sub_page: 'cup',
        cup_season: this.cupSeason,
        cup_round: this.cupRounds[newIndex].round
      })
    }
  }

  _navigateCupSeason (direction) {
    const currentIndex = this.cupSeasons.indexOf(this.cupSeason)
    const newIndex = currentIndex - direction

    if (newIndex >= 0 && newIndex < this.cupSeasons.length) {
      setQueryParams({
        sub_page: 'cup',
        cup_season: this.cupSeasons[newIndex]
      })
    }
  }

  _renderCupResultItem (result) {
    const id = generateId()

    onClick(id, () => {
      setQueryParams({ game_id: result.id })
    })

    const isPlayed = result.played === 1

    const team1Data = {
      name: result.team1,
      color: result.team1Color,
      emblem: result.team1Emblem
    }
    const isBye = !result.team2 && !result.team2Id

    const team2Data = isBye
      ? null
      : {
          name: result.team2,
          color: result.team2Color,
          emblem: result.team2Emblem
        }

    const emblem1 = `<span class="emblem-thumb">${renderEmblem(team1Data, 24)}</span>`
    const emblem2 = isBye ? '' : `<span class="emblem-thumb">${renderEmblem(team2Data, 24)}</span>`

    return `
      <tr id="${id}">
        <td>
          ${this.myTeamId === result.team1Id ? '<b class="text-info">' : ''}
          ${emblem1}${result.team1}
          ${this.myTeamId === result.team1Id ? '</b>' : ''}
        </td>
        <td>
          ${isBye
            ? `<span class="text-muted">${t('cup.bye')}</span>`
            : `${this.myTeamId === result.team2Id ? '<b class="text-info">' : ''}
              ${emblem2}${result.team2}
              ${this.myTeamId === result.team2Id ? '</b>' : ''}`
          }
        </td>
        <td>${isBye ? t('cup.bye') : (isPlayed ? `${result.goalsTeam1 ?? '-'} : ${result.goalsTeam2 ?? '-'}` : t('cup.upcoming'))}</td>
      </tr>
    `
  }

  /**
   * Called by parent when query params change
   * @param {Object} queryParams
   */
  applyQueryParams (queryParams) {
    if (queryParams.cup_season !== undefined) {
      this.cupSeason = Number(queryParams.cup_season)
    }
    if (queryParams.cup_round !== undefined) {
      this.cupRound = Number(queryParams.cup_round)
    }
  }
}
