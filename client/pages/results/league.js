import { server } from '../../lib/gateway.js'
import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { getQueryParams, goTo, setQueryParams } from '../../lib/router.js'
import { formatLeague } from '../../util/league.js'
import { UIElement } from '../../lib/UIElement.js'
import { renderEmblem } from '../../partials/emblem.js'
import { renderPlayerImage } from '../../partials/playerImage.js'
import { loadManagerChatSvg, renderManagerChatInline } from '../../partials/managerChat.js'
import { t } from '../../i18n/index.js'

export class LeagueResultsPage extends UIElement {
  suspendedPlayers = []

  /**
   * @param {UIElement} parentPage
   */
  constructor (parentPage) {
    super()
    this.parentPage = parentPage
  }

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
        <div class="d-flex align-items-start gap-3 mb-4">
          <div class="flex-grow-1 w-50">
            <h2>${t('results.resultsTitle')}</h2>
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
          <div class="d-none d-lg-block">${this._managerChatHtml || ''}</div>
        </div>

        <h3>${t('results.games')}</h3>
        <table class="table table-hover mb-4">
          <thead>
            <tr>
              <th scope="col">${t('results.team1')}</th>
              <th scope="col">${t('results.team2')}</th>
              <th scope="col">${t('results.result')}</th>
            </tr>
          </thead>
          <tbody>
              ${this.results.map(this._renderResultListItem.bind(this)).join('')}
          </tbody>
        </table>
        <h3>${t('results.standing')}</h3>
        <table class="table table-hover mb-4">
          <thead>
            <tr>
              <th scope="col" class="results-rank-cell">#</th>
              <th scope="col" class="d-none d-md-table-cell results-rank-cell"></th>
              <th scope="col">${t('results.team')}</th>
              <th scope="col" class="d-none d-md-table-cell">${t('results.games')}</th>
              <th scope="col" class="d-none d-md-table-cell">${t('results.goals')}</th>
              <th scope="col" class="d-none d-lg-table-cell">${t('results.diff')}</th>
              <th scope="col">${t('results.points')}</th>
            </tr>
          </thead>
          <tbody>
            ${this.standing.map(this._renderStandingListItem.bind(this)).join('')}
          </tbody>
        </table>
        <h3>${t('results.topScorer')}</h3>
        <table class="table table-hover">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">${t('results.goals')}</th>
              <th scope="col">${t('results.name')}</th>
              <th scope="col" class="d-none d-sm-table-cell">${t('results.team')}</th>
            </tr>
          </thead>
          <tbody>
            ${this.topScorer.map(this._renderTopScorer.bind(this)).join('')}
          </tbody>
        </table>

        ${this.suspendedPlayers.length > 0 ? `
          <h3>${t('results.suspendedPlayers')}</h3>
          <table class="table table-hover">
            <thead>
              <tr>
                <th scope="col"></th>
                <th scope="col">${t('results.name')}</th>
                <th scope="col" class="d-none d-sm-table-cell">${t('results.team')}</th>
                <th scope="col">${t('player.cards')}</th>
              </tr>
            </thead>
            <tbody>
              ${this.suspendedPlayers.map(this._renderSuspendedPlayer.bind(this)).join('')}
            </tbody>
          </table>
        ` : ''}
      </div>
    `
  }

  get myTeamId () {
    return this.parentPage.myTeamId
  }

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
    const [{ results }, standing, yesterday, { topScorers }, { suspendedPlayers }] = await Promise.all([
      server.getResults(this.gameDay, this.season, this.level, this.league),
      server.getStanding(this.gameDay, this.season, this.level, this.league),
      server.getStanding(Math.max(0, this.gameDay - 1), this.season, this.level, this.league),
      server.getTopScorers(this.season, this.level, this.league, 10),
      server.getSuspendedPlayers(this.level, this.league)
    ])
    this.results = results
    this.yesterdayStanding = yesterday
    this.standing = standing
    this.standing.sort(_sortStanding)
    this.yesterdayStanding.sort(_sortStanding)
    this.topScorer = topScorers
    this.suspendedPlayers = suspendedPlayers

    this._buildManagerChat()
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

  onMounted () {
    this._loadTopScorerImages()
    if (this._managerSvgId && this._teamColor) {
      void loadManagerChatSvg(this._managerSvgId, this._teamColor)
    }
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
    if (!scorer || !scorer.team) return ''
    const teamId = generateId()
    onClick(teamId, () => goTo(`team?id=${scorer.team.id}`))
    const playerId = generateId()
    onClick(playerId, () => {
      setQueryParams({ player_id: scorer.id + '' })
    })
    return `
      <tr class="${this.myTeamId === scorer.team.id ? 'table-info' : ''}">
          <th>${index + 1}.</th>
          <td>${scorer.goals}</td>
          <td id="${playerId}" class="u-cursor-pointer">
            <div class="d-flex align-items-center">
              <span class="scorer-image me-2" data-scorer-id="${scorer.id}"></span>
              ${scorer.name}
            </div>
          </td>
          <td class="d-none d-sm-table-cell" id="${teamId}">${scorer.team.name}</td>
      </tr>
    `
  }

  _renderSuspendedPlayer (player) {
    if (!player || !player.team) return ''
    const teamId = generateId()
    onClick(teamId, () => goTo(`team?id=${player.team.id}`))
    const playerId = generateId()
    onClick(playerId, () => {
      setQueryParams({ player_id: player.id + '' })
    })
    const yellowCards = player.yellow_cards || 0
    const redCards = player.red_cards || 0
    return `
      <tr class="${this.myTeamId === player.team.id ? 'table-info' : ''}">
          <td style="width: 48px;">
            <span class="suspended-image" data-suspended-id="${player.id}"></span>
          </td>
          <td id="${playerId}" class="u-cursor-pointer">${player.name}</td>
          <td class="d-none d-sm-table-cell u-cursor-pointer" id="${teamId}">${player.team.name}</td>
          <td>
            ${yellowCards > 0 ? `<span class="text-warning">${yellowCards} <i class="fa fa-square"></i></span>` : ''}
            ${redCards > 0 ? `<span class="text-danger ms-1">${redCards} <i class="fa fa-square"></i></span>` : ''}
          </td>
      </tr>
    `
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
    const id = generateId()

    onClick('#' + id, () => goTo(`team?id=${standingItem.team.id}`))

    const isMyTeam = this.myTeamId === standingItem.team.id
    const trClasses = [
      isMyTeam ? 'table-info' : '',
      !isMyTeam && index < 2 ? 'table-success' : '',
      !isMyTeam && index > 13 ? 'table-warning' : ''
    ]

    const diff = this.yesterdayStanding.findIndex(s => s.team.id === standingItem.team.id) - index

    return `
      <tr id="${id}" class="${trClasses.join(' ')}">
        <th class="results-rank-cell">${index + 1}.</th>
        <td class="d-none d-md-table-cell results-rank-cell">${diff < 0 ? '<i class="fa fa-arrow-down text-danger" aria-hidden="true"></i>' : (diff > 0 ? '<i class="fa fa-arrow-up text-success" aria-hidden="true"></i>' : '')}</td>
        <td><span class="emblem-thumb">${renderEmblem(standingItem.team, 24)}</span>${standingItem.team.name} ${hasUser ? '<i class="fa fa-user" aria-hidden="true"></i>' : ''}</td>
        <td class="d-none d-md-table-cell">${standingItem.games}</td>
        <td class="d-none d-md-table-cell">${standingItem.goals}:${standingItem.against}</td>
        <td class="d-none d-lg-table-cell">${standingItem.goals - standingItem.against}</td>
        <td>${standingItem.points}</td>
      </tr>
    `
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
    const id = generateId()

    onClick(id, () => {
      setQueryParams({ game_id: result.id })
    })

    const team1Data = this.standing.find(s => s.team.id === result.team1Id)?.team
    const team2Data = this.standing.find(s => s.team.id === result.team2Id)?.team

    const emblem1 = team1Data ? `<span class="emblem-thumb">${renderEmblem(team1Data, 24)}</span>` : ''
    const emblem2 = team2Data ? `<span class="emblem-thumb">${renderEmblem(team2Data, 24)}</span>` : ''

    return `
    <tr id="${id}">
      <td>
        ${this.myTeamId === result.team1Id ? '<b class="text-info">' : ''}
        ${emblem1}${result.team1} (${result.strengthTeamA ?? '-'})
        ${this.myTeamId === result.team1Id ? '</b>' : ''}
      </td>
      <td>
        ${this.myTeamId === result.team2Id ? '<b class="text-info">' : ''}
        ${emblem2}${result.team2} (${result.strengthTeamB ?? '-'})
        ${this.myTeamId === result.team2Id ? '</b>' : ''}
      </td>
      <td>${result.goalsTeam1 ?? '-'} : ${result.goalsTeam2 ?? '-'}</td>
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
    this.level = level
    this.league = league
    const {
      season,
      gameDay
    } = await this._getSeasonAndGameDay()
    this.season = season
    this.gameDay = gameDay
  }
}

function _sortStanding (s1, s2) {
  const retVal = s2.points - s1.points
  if (retVal === 0) {
    return (s2.goals - s2.against) - (s1.goals - s1.against)
  }
  return retVal
}
