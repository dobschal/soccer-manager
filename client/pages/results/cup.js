import { server } from '../../lib/gateway.js'
import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { goTo, setQueryParams } from '../../lib/router.js'
import { UIElement } from '../../lib/UIElement.js'
import { renderEmblem } from '../../partials/emblem.js'
import { renderPlayerImage } from '../../partials/playerImage.js'
import { Table } from '../../partials/table.js'
import { t } from '../../i18n/index.js'
import { shortenTeamName } from '../../util/team.js'
import { euroFormat } from '../../lib/currency.js'

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

    const {
      rounds,
      totalRounds
    } = await server.getCupRounds(this.cupSeason)
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

    const nextUnplayedRound = rounds.find(r => !r.played)
    const isNextRound = nextUnplayedRound && this.cupRound === nextUnplayedRound.round
    const isCurrentSeason = this.cupSeasons.length > 0 && this.cupSeason === this.cupSeasons[0]
    const [{ results }, { suspendedPlayers }] = await Promise.all([
      server.getCupResults(this.cupSeason, this.cupRound),
      isCurrentSeason && isNextRound ? server.getSuspendedPlayersForCup(this.cupSeason, this.cupRound) : Promise.resolve({ suspendedPlayers: [] })
    ])
    this.cupResults = results
    this.suspendedPlayers = suspendedPlayers
  }

  get template () {
    const roundName = this._getCupRoundName(this.cupRound)

    return `
      <div>
        <div class="mb-4 d-flex align-items-center gap-4">
          <div>
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
          <div class="cup-trophy-icon">🏆</div>
        </div>

        <div class="alert alert-info mb-4">
          <i class="fa fa-info-circle me-1"></i>
          <b>${t('cup.infoTitle')}</b><br>
          ${t('cup.infoFormat', { totalRounds: this.cupTotalRounds })}
          ${t('cup.infoPrize', { basePrize: euroFormat.format(25000), winnerPrize: euroFormat.format(2000000) })}
        </div>

        <h3>${t('results.games')}</h3>
        ${this.cupResults.length === 0
    ? `<p class="text-muted">${t('cup.noGames')}</p>`
    : new Table({
      cols: [
        {
          name: t('results.team1'),
          align: 'right'
        },
        {
          name: '',
          align: 'center'
        },
        { name: t('results.team2') }
      ],
      renderRow: (result) => this._renderCupResultItem(result),
      data: this.cupResults,
      rowAttrs: (result) => `id="${result._rowId}"`
    })
}

        ${this.suspendedPlayers.length > 0 ? `
          <h3>${t('results.suspendedPlayers')}</h3>
          ${new Table({
    cols: [
      { name: '' },
      { name: t('results.name') },
      { name: t('results.team') },
      { name: t('player.cards') }
    ],
    data: this.suspendedPlayers,
    renderRow: (player) => this._renderSuspendedPlayer(player),
    rowClass: (player) => player && player.team && this.myTeamId === player.team.id ? 'table-info' : ''
  })}
        ` : ''}
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

  onMounted () {
    this._loadSuspendedPlayerImages()
  }
  cupSeason = null

  cupRound = null
  cupRounds = []
  cupResults = []
  cupSeasons = []
  cupTotalRounds = 0
  suspendedPlayers = []

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

  _loadSuspendedPlayerImages () {
    if (this.suspendedPlayers) {
      this.suspendedPlayers.forEach((player) => {
        if (!player || !player.team) return
        renderPlayerImage(player, player.team, 48).then(image => {
          const imageEl = document.querySelector(`${this._elementQuery} .suspended-image[data-suspended-id="${player.id}"]`)
          if (imageEl) {
            imageEl.innerHTML = image
          }
        })
      })
    }
  }

  _renderSuspendedPlayer (player) {
    if (!player || !player.team) return ['', '', '', '']
    const teamId = generateId()
    onClick(teamId, () => goTo(`team?id=${player.team.id}`))
    const playerId = generateId()
    onClick(playerId, () => {
      setQueryParams({ player_id: player.id + '' })
    })
    const yellowCards = player.yellow_cards || 0
    const redCards = player.red_cards || 0
    return [
      `<span class="suspended-image" data-suspended-id="${player.id}" style="display:inline-block;width:48px;"></span>`,
      `<span id="${playerId}" class="u-cursor-pointer">${player.name}</span>`,
      `<span id="${teamId}" class="u-cursor-pointer">${player.team.name}</span>`,
      `${yellowCards > 0 ? `<span class="text-warning">${yellowCards} <i class="fa fa-square"></i></span>` : ''}${redCards > 0 ? `<span class="text-danger ms-1">${redCards} <i class="fa fa-square"></i></span>` : ''}`
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
