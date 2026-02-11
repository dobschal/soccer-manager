import { server } from '../lib/gateway.js'
import { generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { getQueryParams, goTo, setQueryParams } from '../lib/router.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { formatLeague } from '../util/league.js'
import { showGameModal } from '../partials/gameModal.js'
import { UIElement } from '../lib/UIElement.js'
import { renderEmblem } from '../partials/emblem.js'
import { renderPlayerImage } from '../partials/playerImage.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { t } from '../i18n/index.js'

export class ResultsPage extends UIElement {
  // Cup-related state
  subPage = null
  cupSeason = null
  cupRound = null
  cupRounds = []
  cupResults = []
  cupSeasons = []

  // Suspended players
  suspendedPlayers = []

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    // Cup-specific events when on cup sub-page
    if (this.subPage === 'cup') {
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

    // League-specific events
    return {
      '#prev-game-day-button': {
        click: () => setQueryParams({
          season: this.season,
          gameDay: this.gameDay - 1
        })
      },
      '#next-game-day-button': {
        click: () => setQueryParams({
          season: this.season,
          gameDay: this.gameDay + 1
        })
      },
      '#prev-season-button': {
        click: () => setQueryParams({
          season: this.season - 1,
          gameDay: 0
        })
      },
      '#next-season-button': {
        click: () => setQueryParams({
          season: this.season + 1,
          gameDay: 0
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

  /**
   * @returns {string}
   */
  get template () {
    return `
    <div>
      <nav class="nav nav-pills mb-4">
        <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#results">${t('results.leagueResults')}</a>
        <a class="nav-link ${this.subPage === 'cup' ? 'active' : ''}" href="#results?sub_page=cup">${t('results.cupResults')}</a>
      </nav>

      ${this.subPage === 'cup' ? this._renderCupResults() : this._renderLeagueResults()}
    </div>
    `
  }

  /**
   * Render the league results view
   * @returns {string}
   */
  _renderLeagueResults () {
    return `
      <div class="mb-4">
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
            <th scope="col" style="width: 30px">#</th>
            <th scope="col" class="d-none d-md-table-cell" style="width: 30px"></th>
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
    `
  }

  /**
   * Render the cup results view
   * @returns {string}
   */
  _renderCupResults () {
    const roundName = this._getCupRoundName(this.cupRound)

    return `
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
          <table class="table table-hover mb-4">
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
        `
      }
    `
  }

  /**
   * Get display name for a cup round number
   * @param {number} round
   * @returns {string}
   */
  _getCupRoundName (round) {
    if (round === 1) return t('cup.final')
    if (round === 2) return t('cup.semiFinal')
    if (round === 4) return t('cup.quarterFinal')
    return t('cup.roundOf', { count: round * 2 })
  }

  /**
   * Navigate to a different cup round
   * @param {number} direction - -1 for larger rounds, 1 for smaller rounds (toward final)
   */
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

  /**
   * Navigate to a different cup season
   * @param {number} direction - -1 for previous season, 1 for next season
   */
  _navigateCupSeason (direction) {
    const currentIndex = this.cupSeasons.indexOf(this.cupSeason)
    const newIndex = currentIndex - direction // Reverse because seasons are sorted DESC

    if (newIndex >= 0 && newIndex < this.cupSeasons.length) {
      setQueryParams({
        sub_page: 'cup',
        cup_season: this.cupSeasons[newIndex]
      })
    }
  }

  /**
   * Render a cup result item
   * @param {Object} result
   * @returns {string}
   */
  _renderCupResultItem (result) {
    const id = generateId()

    onClick(id, () => {
      setQueryParams({ game_id: result.id })
    })

    const isPlayed = result.played === 1

    // Construct team objects for emblem rendering
    const team1Data = { name: result.team1, color: result.team1Color, emblem: result.team1Emblem }
    const team2Data = { name: result.team2, color: result.team2Color, emblem: result.team2Emblem }

    const emblem1 = `<span style="display: inline-block; width: 18px; height: 18px; vertical-align: middle; margin-right: 12px; margin-top: -8px;">${renderEmblem(team1Data, 24)}</span>`
    const emblem2 = `<span style="display: inline-block; width: 18px; height: 18px; vertical-align: middle; margin-right: 12px; margin-top: -8px;">${renderEmblem(team2Data, 24)}</span>`

    return `
      <tr id="${id}">
        <td>
          ${this.myTeamId === result.team1Id ? '<b class="text-info">' : ''}
          ${emblem1}${result.team1}
          ${this.myTeamId === result.team1Id ? '</b>' : ''}
        </td>
        <td>
          ${this.myTeamId === result.team2Id ? '<b class="text-info">' : ''}
          ${emblem2}${result.team2}
          ${this.myTeamId === result.team2Id ? '</b>' : ''}
        </td>
        <td>${isPlayed ? `${result.goalsTeam1 ?? '-'} : ${result.goalsTeam2 ?? '-'}` : t('cup.upcoming')}</td>
      </tr>
    `
  }

  /**
   * @param {Object} queryParams
   * @returns {Promise<void>}
   */
  async onQueryChanged (queryParams) {
    if (queryParams.game_id) {
      await showGameModal(Number(queryParams.game_id))
    }
    if (queryParams.player_id) {
      await showPlayerModal(Number(queryParams.player_id))
    }

    // Handle sub-page (cup vs league)
    this.subPage = queryParams.sub_page || null

    if (this.subPage === 'cup') {
      // Handle cup-specific query params
      if (queryParams.cup_season !== undefined) {
        this.cupSeason = Number(queryParams.cup_season)
      }
      if (queryParams.cup_round !== undefined) {
        this.cupRound = Number(queryParams.cup_round)
      }
    } else {
      // Handle league-specific query params
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

    await this.update(true)

    // Load images after update when on league view
    if (this.subPage !== 'cup') {
      this._loadTopScorerImages()
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    this.info = await server.getMyTeam()
    this.myTeamId = this.info.team.id

    if (this.subPage === 'cup') {
      await this._loadCupData()
    } else {
      await this._loadLeagueData()
    }
  }

  /**
   * Load league-specific data
   * @returns {Promise<void>}
   */
  async _loadLeagueData () {
    if (typeof this.level === 'undefined' || typeof this.league === 'undefined') {
      this.level = this.info.team.level
      this.league = this.info.team.league
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
  }

  /**
   * Load cup-specific data
   * @returns {Promise<void>}
   */
  async _loadCupData () {
    // Get available cup seasons
    const { seasons } = await server.getAvailableCupSeasons()
    this.cupSeasons = seasons

    // Default to current season if not set
    if (this.cupSeason === null && seasons.length > 0) {
      this.cupSeason = seasons[0]
    }

    if (this.cupSeason === null) {
      this.cupRounds = []
      this.cupResults = []
      return
    }

    // Get rounds for this season
    const { rounds } = await server.getCupRounds(this.cupSeason)
    this.cupRounds = rounds

    // Default to first round (highest round number) if not set
    if ((this.cupRound === null || !rounds.some(r => r.round === this.cupRound)) && rounds.length > 0) {
      this.cupRound = rounds[0].round
    }

    if (this.cupRound === null) {
      this.cupResults = []
      return
    }

    // Get results for the selected round
    const { results } = await server.getCupResults(this.cupSeason, this.cupRound)
    this.cupResults = results
  }

  /**
   * @returns {void}
   */
  onMounted () {
    this._loadTopScorerImages()
    void showTutorialIfNeeded('results', this)
  }

  /**
   * @returns {void}
   */
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

  /**
   * @param {PlayerType & { team: TeamType, goals: number }} scorer
   * @param {number} index
   * @returns {string}
   */
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
          <td id="${playerId}" style="cursor: pointer;">
            <div class="d-flex align-items-center">
              <span class="scorer-image me-2" data-scorer-id="${scorer.id}" style="width: 48px; height: 20px; margin-top: -32px;"></span>
              ${scorer.name}
            </div>
          </td>
          <td class="d-none d-sm-table-cell" id="${teamId}">${scorer.team.name}</td>
      </tr>
    `
  }

  /**
   * @param {PlayerType & { team: TeamType }} player
   * @returns {string}
   */
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
            <span class="suspended-image" data-suspended-id="${player.id}" style="width: 48px; height: 20px; margin-top: -32px; display: inline-block;"></span>
          </td>
          <td id="${playerId}" style="cursor: pointer;">${player.name}</td>
          <td class="d-none d-sm-table-cell" id="${teamId}" style="cursor: pointer;">${player.team.name}</td>
          <td>
            ${yellowCards > 0 ? `<span class="text-warning">${yellowCards} <i class="fa fa-square"></i></span>` : ''}
            ${redCards > 0 ? `<span class="text-danger ms-1">${redCards} <i class="fa fa-square"></i></span>` : ''}
          </td>
      </tr>
    `
  }

  /**
   * @returns {Object}
   */
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

  /**
   * @param {number} level
   * @param {number} league
   * @returns {Object}
   */
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

  /**
   * @param {number} level
   * @param {number} league
   * @returns {Object}
   */
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

  /**
   * @param {Object} standingItem
   * @param {number} index
   * @returns {string}
   */
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
        <th style="width: 30px">${index + 1}.</th>
        <td class="d-none d-md-table-cell" style="width: 30px">${diff < 0 ? '<i class="fa fa-arrow-down text-danger" aria-hidden="true"></i>' : (diff > 0 ? '<i class="fa fa-arrow-up text-success" aria-hidden="true"></i>' : '')}</td>
        <td><span style="display: inline-block; width: 20px; height: 20px; vertical-align: middle; margin-right: 12px; margin-top: -8px;">${renderEmblem(standingItem.team, 24)}</span>${standingItem.team.name} ${hasUser ? '<i class="fa fa-user" aria-hidden="true"></i>' : ''}</td>
        <td class="d-none d-md-table-cell">${standingItem.games}</td>
        <td class="d-none d-md-table-cell">${standingItem.goals}:${standingItem.against}</td>
        <td class="d-none d-lg-table-cell">${standingItem.goals - standingItem.against}</td>
        <td>${standingItem.points}</td>
      </tr>
    `
  }

  /**
   * @returns {Promise<Object>}
   */
  async _getSeasonAndGameDay () {
    let {
      season,
      gameDay
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

  /**
   * @param {Object} result
   * @returns {string}
   */
  _renderResultListItem (result) {
    const id = generateId()

    onClick(id, () => {
      console.log('Result:', result)
      setQueryParams({ game_id: result.id })
    })

    // Find team objects from standing to get emblem data
    const team1Data = this.standing.find(s => s.team.id === result.team1Id)?.team
    const team2Data = this.standing.find(s => s.team.id === result.team2Id)?.team

    const emblem1 = team1Data ? `<span style="display: inline-block; width: 18px; height: 18px; vertical-align: middle; margin-right: 12px; margin-top: -8px;">${renderEmblem(team1Data, 24)}</span>` : ''
    const emblem2 = team2Data ? `<span style="display: inline-block; width: 18px; height: 18px; vertical-align: middle; margin-right: 12px; margin-top: -8px;">${renderEmblem(team2Data, 24)}</span>` : ''

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
}

/**
 * @param {Object} s1
 * @param {Object} s2
 * @returns {number}
 */
function _sortStanding (s1, s2) {
  const retVal = s2.points - s1.points
  if (retVal === 0) {
    return (s2.goals - s2.against) - (s1.goals - s1.against)
  }
  return retVal
}

