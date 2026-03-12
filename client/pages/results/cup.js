import { server } from '../../lib/gateway.js'
import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { setQueryParams } from '../../lib/router.js'
import { UIElement } from '../../lib/UIElement.js'
import { renderEmblem } from '../../partials/emblem.js'
import { Table } from '../../partials/table.js'
import { t } from '../../i18n/index.js'
import { shortenTeamName } from '../../util/team.js'

export class CupResultsPage extends UIElement {
  /**
   * @param {UIElement} parentPage
   */
  constructor (parentPage) {
    super()
    this.parentPage = parentPage
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
    : new Table({
      cols: [
        { name: t('results.team1'), align: 'right' },
        { name: t('results.result'), align: 'center' },
        { name: t('results.team2') }
      ],
      renderRow: (result) => this._renderCupResultItem(result),
      data: this.cupResults,
      rowAttrs: (result) => `id="${result._rowId}"`
    })
}
      </div>
    `
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
  cupSeason = null
  
  cupRound = null
  cupRounds = []
  cupResults = []
  cupSeasons = []
  cupTotalRounds = 0

  get myTeamId () {
    return this.parentPage.myTeamId
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
    if (!result._rowId) {
      result._rowId = generateId()
      onClick(result._rowId, () => {
        setQueryParams({ game_id: result.id })
      })
    }

    const isPlayed = result.played === 1
    const isBye = !result.team2 && !result.team2Id

    const team1Data = {
      name: result.team1,
      color: result.team1Color,
      emblem: result.team1Emblem
    }
    const team2Data = isBye
      ? null
      : {
        name: result.team2,
        color: result.team2Color,
        emblem: result.team2Emblem
      }

    const emblem1 = `<span class="emblem-thumb">${renderEmblem(team1Data, 24)}</span>`
    const emblem2 = isBye ? '' : `<span class="emblem-thumb">${renderEmblem(team2Data, 24)}</span>`

    const team1HasUser = Boolean(result.team1UserId)
    const team2HasUser = Boolean(result.team2UserId)
    const hasResult = isPlayed && typeof result.goalsTeam1 === 'number' && typeof result.goalsTeam2 === 'number'
    const team1Won = hasResult && result.goalsTeam1 > result.goalsTeam2
    const team2Won = hasResult && result.goalsTeam2 > result.goalsTeam1

    const userIcon = '<i class="fa fa-user fa-sm ms-1" aria-hidden="true"></i>'

    const team1IsMyTeam = this.myTeamId === result.team1Id
    const team2IsMyTeam = this.myTeamId === result.team2Id

    const nameLabel1 = shortenTeamName(result.team1)
    const nameLabel2 = isBye ? '' : shortenTeamName(result.team2)

    const team1Name = `${team1Won ? '<b>' : ''}${team1IsMyTeam ? '<span class="text-info">' : ''}${nameLabel1}${team1HasUser ? userIcon : ''}${team1IsMyTeam ? '</span>' : ''}${team1Won ? '</b>' : ''}`

    const team2Name = isBye
      ? `<span class="text-muted">${t('cup.bye')}</span>`
      : `${team2Won ? '<b>' : ''}${team2IsMyTeam ? '<span class="text-info">' : ''}${nameLabel2}${team2HasUser ? userIcon : ''}${team2IsMyTeam ? '</span>' : ''}${team2Won ? '</b>' : ''}`

    return [
      `${team1Name}${emblem1}`,
      `${isBye ? t('cup.bye') : (isPlayed ? `${result.goalsTeam1 ?? '-'} : ${result.goalsTeam2 ?? '-'}` : t('cup.upcoming'))}`,
      `${emblem2}${team2Name}`
    ]
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
