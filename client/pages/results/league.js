import { server } from '../../lib/gateway.js'
import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { getQueryParams, goTo, setQueryParams } from '../../lib/router.js'
import { formatLeague } from '../../util/league.js'
import { UIElement } from '../../lib/UIElement.js'
import { calculatePlayerAge } from '../../util/player.js'
import { renderEmblem } from '../../partials/emblem.js'
import { renderPlayerImage } from '../../partials/playerImage.js'
import { loadManagerChatSvg, renderManagerChatInline } from '../../partials/managerChat.js'
import { t } from '../../i18n/index.js'
import { Table } from '../../partials/table.js'
import { shortenTeamName } from '../../util/team.js'

export class LeagueResultsPage extends UIElement {
  /**
   * @param {UIElement} parentPage
   */
  constructor (parentPage) {
    super()
    this.parentPage = parentPage
  }
  // -1 = desc, 1 = asc
  async load () {
    if (typeof this.level === 'undefined' || typeof this.league === 'undefined') {
      this.level = this.parentPage.info.team.level
      this.league = this.parentPage.info.team.league
    }
    if (typeof this.season === 'undefined' || typeof this.gameDay === 'undefined') {
      const response = await server.getCurrentGameday()
      this.season = response.season
      this.gameDay = Math.max(0, response.gameDay - 1)
    }
    const [{ results }, standing, yesterday, { topScorers }, { suspendedPlayers }, { teamStats }] = await Promise.all([
      server.getResults(this.gameDay, this.season, this.level, this.league),
      server.getStanding(this.gameDay, this.season, this.level, this.league),
      server.getStanding(Math.max(0, this.gameDay - 1), this.season, this.level, this.league),
      server.getTopScorers(this.season, this.level, this.league, 10),
      server.getSuspendedPlayers(this.level, this.league),
      server.getTeamStats(this.gameDay, this.season, this.level, this.league)
    ])
    this.results = results
    this.yesterdayStanding = yesterday
    this.standing = standing
    this.standing.sort(_sortStanding)
    this.yesterdayStanding.sort(_sortStanding)
    this.topScorer = topScorers
    this.suspendedPlayers = suspendedPlayers
    this.teamStats = teamStats || []

    this._buildManagerChat()
  }
  onMounted () {
    this._loadTopScorerImages()
    this._attachTeamStatsHeaderHandler()
    if (this._managerSvgId && this._teamColor) {
      void loadManagerChatSvg(this._managerSvgId, this._teamColor)
    }
  }
  suspendedPlayers = []
  
  teamStats = []
  
  _teamStatsSortCol = 'squad_value'
  _teamStatsSortDir = -1 
  
  get events () {
    return {
      '#prev-game-day-button': {
        click: () => setQueryParams({
          season: this.season,
          game_day: this.gameDay - 1
        })
      },
      '#next-game-day-button': {
        click: () => setQueryParams({
          season: this.season,
          game_day: this.gameDay + 1
        })
      },
      '#prev-season-button': {
        click: () => setQueryParams({
          season: this.season - 1,
          game_day: 0
        })
      },
      '#next-season-button': {
        click: () => setQueryParams({
          season: this.season + 1,
          game_day: 0
        })
      },
      '#prev-league-button': {
        click: () => setQueryParams(this._getPrevLeague(this.level, this.league))
      },
      '#next-league-button': {
        click: () => setQueryParams(this._getNextLeague(this.level, this.league))
      }
    }
  }
  
  get template () {
    return `
      <div>
        <div class="d-flex flex-column flex-lg-row align-items-start gap-3 mb-4">
          <div class="flex-grow-1 u-w-lg-50">
            <h2>${t('results.resultsTitle')}</h2>
            <div>
            <table>
              <tr>
                <th>
                    ${t('results.league')}
                </th>
                <td>
                  <span id="prev-league-button" class="fa fa-chevron-left fa-button"></span>
                  ${formatLeague(this.level, this.league)}
                  <span id="next-league-button" class="fa fa-chevron-right fa-button"></span>
                </td>
              </tr>
              <tr>
                <th>${t('results.season')}</th>
                <td>
                  <span id="prev-season-button" class="fa fa-chevron-left fa-button"></span>
                  ${this.season + 1}
                  <span id="next-season-button" class="fa fa-chevron-right fa-button"></span>
                </td>
              </tr>
              <tr>
                <th>${t('results.gameDayLabel')}</th>
                <td>
                  <span id="prev-game-day-button" class="fa fa-chevron-left fa-button"></span>
                  ${this.gameDay + 1}
                  <span id="next-game-day-button" class="fa fa-chevron-right fa-button"></span><br>
                </td>
              </tr>
            </table>
            </div>
          </div>
          <div class="d-none d-lg-block">${this._managerChatHtml || ''}</div>
        </div>

        <h3>${t('results.games')}</h3>
        ${new Table({
    cols: [
      { name: t('results.team1'), align: 'right' },
      { name: t('results.result'), align: 'center' },
      { name: t('results.team2') }
    ],
    data: this.results,
    renderRow: (result) => this._renderResultListItem(result),
    onClick: (result) => setQueryParams({ game_id: result.id })
  })}
        <h3>${t('results.standing')} - ${this.gameDay + 1}. ${t('results.gameDayLabel')}</h3>
        ${new Table({
    cols: [
      { name: '#', width: '32px' },
      { name: '', width: '32px' },
      { name: t('results.team') },
      { name: t('results.games') },
      { name: 'W/D/L' },
      { name: t('results.goals') },
      { name: t('results.diff') },
      { name: t('results.points') }
    ],
    data: this.standing,
    renderRow: (item, index) => this._renderStandingListItem(item, index),
    onClick: (item) => goTo(`team?id=${item.team.id}`),
    rowClass: (item, index) => {
      const isMyTeam = this.myTeamId === item.team.id
      return [
        isMyTeam ? 'table-info' : '',
        !isMyTeam && index < 2 ? 'table-success' : '',
        !isMyTeam && index > 13 ? 'table-warning' : ''
      ].join(' ')
    }
  })}
        <h3>${t('results.topScorer')}</h3>
        ${new Table({
    cols: [
      { name: '#' },
      { name: t('results.name') },
      { name: t('results.goals') },
      { name: t('results.team') },
      { name: 'Pos' },
      { name: 'Lvl' },
      { name: 'Age' }
    ],
    data: this.topScorer,
    renderRow: (scorer, index) => this._renderTopScorer(scorer, index),
    rowClass: (scorer) => scorer && scorer.team && this.myTeamId === scorer.team.id ? 'table-info' : ''
  })}

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

        ${this.teamStats.length > 0 ? `
          <h3>${t('results.teamStats')}</h3>
          <div class="horizontal-scrollable-table">
            <table class="table table-hover wide-on-mobile mb-4">
              <thead class="team-stats-thead">
                <tr>
                  <th scope="col"></th>
                  <th scope="col" class="u-cursor-pointer text-nowrap" data-col="name">
                    ${t('results.team')} <span class="ts-sort-icon" data-sort-col="name">${this._sortIcon('name')}</span>
                  </th>
                  <th scope="col" class="u-cursor-pointer text-end text-nowrap" data-col="squad_size">
                    ${t('results.playerCount')} <span class="ts-sort-icon" data-sort-col="squad_size">${this._sortIcon('squad_size')}</span>
                  </th>
                  <th scope="col" class="u-cursor-pointer text-end text-nowrap" data-col="avg_strength">
                    ${t('results.avgStrength')} <span class="ts-sort-icon" data-sort-col="avg_strength">${this._sortIcon('avg_strength')}</span>
                  </th>
                  <th scope="col" class="u-cursor-pointer text-end text-nowrap" data-col="total_strength">
                    ${t('results.totalStrength')} <span class="ts-sort-icon" data-sort-col="total_strength">${this._sortIcon('total_strength')}</span>
                  </th>
                  <th scope="col" class="u-cursor-pointer text-end text-nowrap" data-col="squad_size">
                    ${t('results.squadSize')} <span class="ts-sort-icon" data-sort-col="squad_size">${this._sortIcon('squad_size')}</span>
                  </th>
                  <th scope="col" class="u-cursor-pointer text-end text-nowrap" data-col="avg_freshness">
                    ${t('results.avgFreshness')} <span class="ts-sort-icon" data-sort-col="avg_freshness">${this._sortIcon('avg_freshness')}</span>
                  </th>
                  <th scope="col" class="u-cursor-pointer text-end text-nowrap" data-col="stadium_size">
                    ${t('results.stadiumSize')} <span class="ts-sort-icon" data-sort-col="stadium_size">${this._sortIcon('stadium_size')}</span>
                  </th>
                  <th scope="col" class="u-cursor-pointer text-end text-nowrap" data-col="squad_value">
                    ${t('results.squadValue')} <span class="ts-sort-icon" data-sort-col="squad_value">${this._sortIcon('squad_value')}</span>
                  </th>
                </tr>
              </thead>
              <tbody id="team-stats-tbody">
                ${this._getSortedTeamStats().map(this._renderTeamStatsRow.bind(this)).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
      </div>
    `
  }

  get myTeamId () {
    return this.parentPage.myTeamId
  }
  
  /**
   * Builds manager chat HTML from results data
   */
  _buildManagerChat () {
    this._managerSvgId = generateId()
    this._teamColor = this.parentPage.info.team.color
    this._managerChatHtml = ''

    const team = this.parentPage.info.team
    const user = this.parentPage.info.user
    if (!user) return

    // Find the user's game in the current results
    const myGame = this.results.find(
      r => r.team1Id === this.myTeamId || r.team2Id === this.myTeamId
    )
    if (!myGame) return

    const isHomeGame = myGame.team1Id === this.myTeamId
    const myGoals = isHomeGame ? myGame.goalsTeam1 : myGame.goalsTeam2
    const opponentGoals = isHomeGame ? myGame.goalsTeam2 : myGame.goalsTeam1
    const hasResult = typeof myGoals === 'number' && typeof opponentGoals === 'number'
    const isWin = hasResult && myGoals > opponentGoals
    const isDraw = hasResult && myGoals === opponentGoals
    const resultMessage = !hasResult
      ? t('dashboard.resultNotAvailable')
      : isWin
        ? t('dashboard.congratsWin')
        : isDraw
          ? t('dashboard.drawMessage')
          : t('dashboard.lossMessage')

    const teamPosition = this.standing.findIndex(s => s.team.id === this.myTeamId) + 1
    const positionText = this._getPositionText(teamPosition)

    const chatText = `
      <p class="mb-1">${t('dashboard.hey')} <b>${user.username}</b>!</p>
      <p class="mb-1">${t('dashboard.teamPosition', {
    position: positionText,
    league: team.level + 1
  })}</p>
      <p class="mb-0">${t('dashboard.gameDayInfo', {
    gameDay: Math.max(1, this.gameDay + 1),
    season: this.season + 1,
    opponent: isHomeGame ? myGame.team2 : myGame.team1
  })} ${resultMessage}</p>
    `
    this._managerChatHtml = renderManagerChatInline(this._managerSvgId, chatText)
  }

  /**
   * @param {number} teamPosition
   * @returns {string}
   */
  _getPositionText (teamPosition) {
    if (teamPosition === 0) return t('dashboard.notRankedYet')
    const pos = teamPosition
    if (pos === 1) return t('dashboard.positionSt', { pos })
    if (pos === 2) return t('dashboard.positionNd', { pos })
    if (pos === 3) return t('dashboard.positionRd', { pos })
    return t('dashboard.positionTh', { pos })
  }

  async update (reloadData = false) {
    await super.update(reloadData)
    this._loadTopScorerImages()
    this._attachTeamStatsHeaderHandler()
    if (this._managerSvgId && this._teamColor) {
      void loadManagerChatSvg(this._managerSvgId, this._teamColor)
    }
  }

  _attachTeamStatsHeaderHandler () {
    const thead = document.querySelector(`${this._elementQuery} .team-stats-thead`)
    if (!thead) return
    thead.addEventListener('click', (e) => {
      const th = e.target.closest('[data-col]')
      if (!th) return
      const col = th.dataset.col
      if (this._teamStatsSortCol === col) {
        this._teamStatsSortDir *= -1
      } else {
        this._teamStatsSortCol = col
        this._teamStatsSortDir = col === 'name' ? 1 : -1
      }
      this._updateTeamStatsTable()
    })
  }

  _updateTeamStatsTable () {
    const tbody = document.querySelector(`${this._elementQuery} #team-stats-tbody`)
    if (tbody) {
      tbody.innerHTML = this._getSortedTeamStats().map(this._renderTeamStatsRow.bind(this)).join('')
    }
    document.querySelectorAll(`${this._elementQuery} .ts-sort-icon`).forEach(el => {
      const col = el.dataset.sortCol
      if (col) el.innerHTML = this._sortIcon(col)
    })
  }

  _loadTopScorerImages () {
    if (this.topScorer) {
      this.topScorer.forEach((scorer) => {
        if (!scorer || !scorer.team) return
        renderPlayerImage(scorer, scorer.team, 48).then(image => {
          const imageEl = document.querySelector(`${this._elementQuery} .scorer-image[data-scorer-id="${scorer.id}"]`)
          if (imageEl) {
            imageEl.innerHTML = image
          }
        })
      })
    }

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

  _renderTopScorer (scorer, index) {
    if (!scorer || !scorer.team) return ['', '', '', '', '', '', '']
    const teamId = generateId()
    onClick(teamId, () => goTo(`team?id=${scorer.team.id}`))
    const playerId = generateId()
    onClick(playerId, () => {
      setQueryParams({ player_id: scorer.id + '' })
    })
    return [
      `${index + 1}.`,
      `<div id="${playerId}" class="d-flex align-items-center u-cursor-pointer"><span class="scorer-image me-2" data-scorer-id="${scorer.id}"></span>${scorer.name}</div>`,
      `${scorer.goals}`,
      `<span id="${teamId}" class="u-cursor-pointer"><span class="emblem-thumb">${renderEmblem(scorer.team, 24)}</span>${scorer.team.name}</span>`,
      `<span class="text-muted">${scorer.position}</span>`,
      `<span class="text-muted">${scorer.level}</span>`,
      `<span class="text-muted">${calculatePlayerAge(scorer, this.season)}</span>`
    ]
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

  _getLeagueAndLevel () {
    let {
      level,
      league
    } = getQueryParams()
    if (typeof level === 'undefined' || typeof league === 'undefined') return {}
    level = Number(level)
    league = Number(league)
    if (league < 0) league = 0
    if (level < 0) level = 0
    return {
      level,
      league
    }
  }

  _getPrevLeague (level, league) {
    if (level === 0) {
      return {
        level,
        league
      }
    }
    if (league === 0) {
      level--
      league = Math.pow(2, level) - 1
    } else {
      league--
    }
    return {
      level,
      league
    }
  }

  _getNextLeague (level, league) {
    if (league === Math.pow(2, level) - 1) {
      level++
      league = 0
    } else {
      league++
    }
    return {
      level,
      league
    }
  }

  _renderStandingListItem (standingItem, index) {
    const hasUser = Boolean(standingItem.team.user_id)
    const diff = this.yesterdayStanding.findIndex(s => s.team.id === standingItem.team.id) - index

    return [
      `${index + 1}.`,
      diff < 0 ? '<i class="fa fa-arrow-down text-danger" aria-hidden="true"></i>' : (diff > 0 ? '<i class="fa fa-arrow-up text-success" aria-hidden="true"></i>' : ''),
      `<span class="emblem-thumb">${renderEmblem(standingItem.team, 24)}</span>${standingItem.team.name} ${hasUser ? '<i class="fa fa-user" aria-hidden="true"></i>' : ''}`,
      `${standingItem.games}`,
      `${standingItem.wins || 0}/${standingItem.draws || 0}/${standingItem.losses || 0}`,
      `${standingItem.goals}:${standingItem.against}`,
      `${standingItem.goals - standingItem.against}`,
      `${standingItem.points}`
    ]
  }

  async _getSeasonAndGameDay () {
    let {
      season,
      game_day: gameDay
    } = getQueryParams()
    if (typeof season === 'undefined' && typeof gameDay === 'undefined') {
      return {}
    }
    season = Number(season)
    gameDay = Number(gameDay)
    if (gameDay > 33) gameDay = 33
    if (gameDay < 0) gameDay = 0
    if (season < 0) season = 0
    return {
      season,
      gameDay
    }
  }

  _renderResultListItem (result) {
    const team1Data = this.standing.find(s => s.team.id === result.team1Id)?.team
    const team2Data = this.standing.find(s => s.team.id === result.team2Id)?.team

    const emblem1 = team1Data ? `<span class="emblem-thumb">${renderEmblem(team1Data, 24)}</span>` : ''
    const emblem2 = team2Data ? `<span class="emblem-thumb">${renderEmblem(team2Data, 24)}</span>` : ''

    const team1HasUser = Boolean(team1Data?.user_id)
    const team2HasUser = Boolean(team2Data?.user_id)
    const hasResult = typeof result.goalsTeam1 === 'number' && typeof result.goalsTeam2 === 'number'
    const team1Won = hasResult && result.goalsTeam1 > result.goalsTeam2
    const team2Won = hasResult && result.goalsTeam2 > result.goalsTeam1

    const userIcon = '<i class="fa fa-user fa-sm ms-1" aria-hidden="true"></i>'

    const team1IsMyTeam = this.myTeamId === result.team1Id
    const team2IsMyTeam = this.myTeamId === result.team2Id

    const team1Name = `${team1Won ? '<b>' : ''}${team1IsMyTeam ? '<span class="text-info">' : ''}${shortenTeamName(result.team1)} (${result.strengthTeamA ?? '-'})${team1HasUser ? userIcon : ''}${team1IsMyTeam ? '</span>' : ''}${team1Won ? '</b>' : ''}`
    const team2Name = `${team2Won ? '<b>' : ''}${team2IsMyTeam ? '<span class="text-info">' : ''}${shortenTeamName(result.team2)} (${result.strengthTeamB ?? '-'})${team2HasUser ? userIcon : ''}${team2IsMyTeam ? '</span>' : ''}${team2Won ? '</b>' : ''}`

    return [
      `${team1Name}${emblem1}`,
      `${result.goalsTeam1 ?? '-'} : ${result.goalsTeam2 ?? '-'}`,
      `${emblem2}${team2Name}`
    ]
  }

  _sortIcon (col) {
    if (this._teamStatsSortCol !== col) return '<i class="fa fa-sort text-muted"></i>'
    return this._teamStatsSortDir === 1
      ? '<i class="fa fa-sort-up"></i>'
      : '<i class="fa fa-sort-down"></i>'
  }

  _getSortedTeamStats () {
    const col = this._teamStatsSortCol
    const dir = this._teamStatsSortDir
    return [...this.teamStats].sort((a, b) => {
      const av = col === 'name'
        ? (a[col] || '').localeCompare(b[col] || '')
        : Number(a[col]) - Number(b[col])
      return av * dir
    })
  }

  _renderTeamStatsRow (stat) {
    const id = generateId()
    onClick('#' + id, () => goTo(`team?id=${stat.team_id}`))
    const isMyTeam = this.myTeamId === stat.team_id
    const team = { id: stat.team_id, name: stat.name, emblem: stat.emblem, color: stat.color, user_id: stat.user_id }
    const hasUser = Boolean(stat.user_id)
    const avgFreshness = Math.round(parseFloat(stat.avg_freshness) * 100)
    const squadValue = _formatValue(Number(stat.squad_value))
    return `
      <tr id="${id}" class="u-cursor-pointer ${isMyTeam ? 'table-info' : ''}">
        <td style="width:32px;"><span class="emblem-thumb">${renderEmblem(team, 24)}</span></td>
        <td>${stat.name}${hasUser ? ' <i class="fa fa-user fa-sm" aria-hidden="true"></i>' : ''}</td>
        <td class="text-end">${stat.squad_size}</td>
        <td class="text-end">${parseFloat(stat.avg_strength).toFixed(1)}</td>
        <td class="text-end">${stat.total_strength}</td>
        <td class="text-end">${stat.squad_size}</td>
        <td class="text-end">${avgFreshness}%</td>
        <td class="text-end">${Number(stat.stadium_size).toLocaleString()}</td>
        <td class="text-end">${squadValue}</td>
      </tr>
    `
  }

  /**
   * Called by parent when query params change
   * @param {Object} queryParams
   */
  async applyQueryParams (_queryParams) {
    const {
      level,
      league
    } = this._getLeagueAndLevel()
    if (typeof level !== 'undefined' && typeof league !== 'undefined') {
      this.level = level
      this.league = league
    }
    const {
      season,
      gameDay
    } = await this._getSeasonAndGameDay()
    if (typeof season !== 'undefined') {
      this.season = season
    }
    if (typeof gameDay !== 'undefined') {
      this.gameDay = gameDay
    }
  }
}

function _sortStanding (s1, s2) {
  const retVal = s2.points - s1.points
  if (retVal === 0) {
    return (s2.goals - s2.against) - (s1.goals - s1.against)
  }
  return retVal
}

function _formatValue (value) {
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M €'
  if (value >= 1_000) return (value / 1_000).toFixed(0) + 'K €'
  return value + ' €'
}
