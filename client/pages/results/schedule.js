import { server } from '../../lib/gateway.js'
import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { setQueryParams } from '../../lib/router.js'
import { UIElement } from '../../lib/UIElement.js'
import { renderEmblem } from '../../partials/emblem.js'
import { Table } from '../../partials/table.js'
import { t } from '../../i18n/index.js'
import { shortenTeamName } from '../../util/team.js'

export class SchedulePage extends UIElement {
  /**
   * @param {UIElement} parentPage
   */
  constructor (parentPage) {
    super()
    this.parentPage = parentPage
  }

  async load () {
    const response = await server.getMySchedule()
    this.season = response.season
    this.totalCupRounds = response.totalCupRounds
    this.schedule = response.schedule
  }

  get template () {
    const myTeam = this.parentPage.info.team
    return `
      <div>
        <h2>${t('schedule.title')}</h2>
        <p class="text-muted">${t('schedule.subtitle', {
    team: myTeam.name,
    season: (this.season ?? 0) + 1
  })}</p>

        ${this.schedule.length === 0
    ? `<p class="text-muted">${t('schedule.noGames')}</p>`
    : new Table({
      cols: [
        { name: t('schedule.what'), width: '120px' },
        { name: t('results.team1'), align: 'right' },
        { name: '', align: 'center' },
        { name: t('results.team2') }
      ],
      renderRow: (entry) => this._renderRow(entry),
      rowAttrs: (entry) => entry._rowId ? `id="${entry._rowId}"` : '',
      data: this.schedule
    })}
      </div>
    `
  }

  schedule = []
  season = 0
  totalCupRounds = 0

  get myTeamId () {
    return this.parentPage.myTeamId
  }

  /**
   * Called by parent when query params change. No params consumed (always
   * shows the current season for the user's team).
   */
  async applyQueryParams (_queryParams) {}

  _renderRow (entry) {
    if (entry.type === 'cup_round') {
      return this._renderCupRoundPlaceholder(entry)
    }
    return this._renderGameRow(entry)
  }

  _renderGameRow (entry) {
    const g = entry.game
    if (!entry._rowId && g) {
      entry._rowId = generateId()
      onClick(entry._rowId, () => {
        if (entry.played) {
          setQueryParams({ game_id: g.id })
        }
      })
    }

    const isBye = entry.type === 'cup' && entry.isBye
    const labelHtml = this._renderLabel(entry)

    const team1Data = {
      name: g.team1,
      color: g.team1Color,
      emblem: g.team1Emblem
    }
    const team2Data = isBye
      ? null
      : {
        name: g.team2,
        color: g.team2Color,
        emblem: g.team2Emblem
      }

    const emblem1 = `<span class="emblem-thumb">${renderEmblem(team1Data, 24)}</span>`
    const emblem2 = isBye ? '' : `<span class="emblem-thumb">${renderEmblem(team2Data, 24)}</span>`

    const team1IsMyTeam = this.myTeamId === g.team1Id
    const team2IsMyTeam = !isBye && this.myTeamId === g.team2Id
    const hasResult = entry.played && typeof g.goalsTeam1 === 'number' && typeof g.goalsTeam2 === 'number'
    const team1Won = !g.isForfeit && hasResult && g.goalsTeam1 > g.goalsTeam2
    const team2Won = !g.isForfeit && hasResult && g.goalsTeam2 > g.goalsTeam1

    const team1HasUser = Boolean(g.team1UserId)
    const team2HasUser = Boolean(g.team2UserId)
    const userIcon = '<i class="fa fa-user fa-sm ms-1" aria-hidden="true"></i>'

    const nameLabel1 = shortenTeamName(g.team1, g.team1Short)
    const nameLabel2 = isBye ? '' : shortenTeamName(g.team2, g.team2Short)

    const team1Name = `${team1Won ? '<b>' : ''}${team1IsMyTeam ? '<span class="text-info">' : ''}${nameLabel1}${team1HasUser ? userIcon : ''}${team1IsMyTeam ? '</span>' : ''}${team1Won ? '</b>' : ''}`
    const team2Name = isBye
      ? `<span class="text-muted">${t('cup.bye')}</span>`
      : `${team2Won ? '<b>' : ''}${team2IsMyTeam ? '<span class="text-info">' : ''}${nameLabel2}${team2HasUser ? userIcon : ''}${team2IsMyTeam ? '</span>' : ''}${team2Won ? '</b>' : ''}`

    const forfeitIcon = `<i class="fa fa-exclamation-circle text-warning ms-1" title="${t('results.forfeitIcon')}" aria-label="${t('results.forfeitIcon')}"></i>`
    const center = entry.played
      ? (isBye
        ? `<span class="text-muted">-</span>`
        : (g.isForfeit
          ? `${g.goalsTeam1 ?? '-'} : ${g.goalsTeam2 ?? '-'}${forfeitIcon}`
          : `${g.goalsTeam1 ?? '-'} : ${g.goalsTeam2 ?? '-'}`))
      : this._renderCountdown(entry)

    return [
      labelHtml,
      `${team1Name}${emblem1}`,
      center,
      `${emblem2}${team2Name}`
    ]
  }

  _renderCupRoundPlaceholder (entry) {
    const labelHtml = this._renderLabel(entry)
    const stateText = entry.played
      ? `<span class="text-muted">${t('schedule.notParticipating')}</span>`
      : `<span class="text-muted">${t('schedule.maybeParticipating')}</span>`
    const center = entry.played
      ? `<span class="text-muted">-</span>`
      : this._renderCountdown(entry)
    return [
      labelHtml,
      stateText,
      center,
      ''
    ]
  }

  _renderLabel (entry) {
    if (entry.type === 'league') {
      return `<span class="badge bg-secondary"><i class="fa fa-diamond"></i> ${t('schedule.leagueDay', { day: entry.matchDay })}</span>`
    }
    return `<span class="badge bg-warning text-dark"><i class="fa fa-trophy"></i> ${this._getCupRoundName(entry.cupRound)}</span>`
  }

  _renderCountdown (entry) {
    if (!entry.gameDate) {
      return `<span class="text-muted">-</span>`
    }
    const gameDate = new Date(entry.gameDate)
    const diff = gameDate.getTime() - Date.now()
    if (diff <= 0) {
      return `<span class="text-muted">${t('dashboard.startingSoon')}</span>`
    }
    const hoursAway = diff / (1000 * 60 * 60)
    if (hoursAway > 24) {
      const daysAway = Math.ceil(hoursAway / 24)
      const daysText = daysAway === 1
        ? t('dashboard.inOneDay')
        : t('dashboard.inDays', { days: daysAway })
      return `<small><i class="fa fa-calendar"></i> ${daysText}</small>`
    }
    const hours = Math.floor(hoursAway)
    const minutes = Math.floor((diff / (1000 * 60)) % 60)
    return `<small><i class="fa fa-clock-o"></i> ${t('schedule.inHoursMinutes', { hours, minutes })}</small>`
  }

  _getCupRoundName (round) {
    if (round === 1) return t('cup.final')
    if (round === 2) return t('cup.semiFinal')
    if (round === 4) return t('cup.quarterFinal')
    if (round === 8) return t('cup.roundOf16')
    const sequentialNumber = (this.totalCupRounds || 0) - Math.log2(round)
    return t('cup.roundNumber', { number: sequentialNumber })
  }
}
