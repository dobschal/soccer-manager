import { onClick } from '../lib/htmlEventHandlers.js'
import { server } from '../lib/gateway.js'
import { generateId } from '../lib/html.js'
import { getQueryParams, goTo, setQueryParams } from '../lib/router.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { formatLeague } from '../util/league.js'
import { showGameModal } from '../partials/gameModal.js'
import { UIElement } from '../lib/UIElement.js'

export class ResultsPage extends UIElement {
  get template () {
    return `
    <div>
      <div class="mb-4">
        <h2>Results</h2>
        <table>
          <tr>
            <th>
                League
            </th>
            <td>
              <span id="prev-league-button" class="fa fa-chevron-left fa-button"></span>
              ${formatLeague(this.level, this.league)}
              <span id="next-league-button" class="fa fa-chevron-right fa-button"></span>
            </td>
          </tr>
          <tr>
            <th>Season</th>
            <td>
              <span id="prev-season-button" class="fa fa-chevron-left fa-button"></span>
              ${this.season + 1}
              <span id="next-season-button" class="fa fa-chevron-right fa-button"></span>
            </td>
          </tr>
          <tr>
            <th>Game Day</th>
            <td>
              <span id="prev-game-day-button" class="fa fa-chevron-left fa-button"></span>
              ${this.gameDay + 1}
              <span id="next-game-day-button" class="fa fa-chevron-right fa-button"></span><br>
            </td>
          </tr>
        </table>
      </div>
      
      <h3>Games</h3>
      <table class="table table-hover mb-4">
        <thead>
          <tr>
            <th scope="col">Team 1</th>
            <th scope="col">Team 2</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
            ${this.results.map(this._renderResultListItem.bind(this)).join('')}
        </tbody>
      </table>    
      <h3>Standing</h3>
      <table class="table table-hover mb-4">
        <thead>
          <tr>
            <th scope="col" style="width: 30px">#</th>
            <th scope="col" class="d-none d-md-table-cell" style="width: 30px"></th>
            <th scope="col">Team</th>
            <th scope="col" class="d-none d-md-table-cell">Games</th>
            <th scope="col" class="d-none d-md-table-cell">Goals</th>
            <th scope="col" class="d-none d-lg-table-cell">Diff</th>
            <th scope="col">Points</th>
          </tr>
        </thead>
        <tbody>
          ${this.standing.map(this._renderStandingListItem.bind(this)).join('')}
        </tbody>
      </table>
      <h3>Top Scorer</h3>
      <table class="table table-hover">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Goals</th>
            <th scope="col">Name</th>
            <th scope="col" class="d-none d-sm-table-cell">Team</th>
          </tr>
        </thead>
        <tbody>
          ${this.topScorer.map(this._renderTopScorer.bind(this)).join('')}
        </tbody>
      </table>
    </div>
    `
  }

  onMounted () {
    onClick('#prev-game-day-button', async () => {
      setQueryParams({
        season: this.season,
        gameDay: this.gameDay - 1
      })
    })

    onClick('#next-game-day-button', async () => {
      setQueryParams({
        season: this.season,
        gameDay: this.gameDay + 1
      })
    })

    onClick('#prev-season-button', async () => {
      setQueryParams({
        season: this.season - 1,
        gameDay: 0
      })
    })

    onClick('#next-season-button', async () => {
      setQueryParams({
        season: this.season + 1,
        gameDay: 0
      })
    })

    onClick('#prev-league-button', async () => {
      setQueryParams(this._getPrevLeague(this.level, this.league))
    })

    onClick('#next-league-button', async () => {
      setQueryParams(this._getNextLeague(this.level, this.league))
    })
  }

  async onQueryChanged (queryParams) {
    if (queryParams.game_id) {
      await showGameModal(Number(queryParams.game_id))
    }
    if (queryParams.player_id) {
      await showPlayerModal(Number(queryParams.player_id))
    }
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
    await this.update(false)
  }

  async load () {
    this.info = await server.getMyTeam()
    this.myTeamId = this.info.team.id
    if (typeof this.level === 'undefined' || typeof this.league === 'undefined') {
      this.level = this.info.team.level
      this.league = this.info.team.league
    }
    if (typeof this.season === 'undefined' || typeof this.gameDay === 'undefined') {
      const response = await server.getCurrentGameday()
      this.season = response.season
      this.gameDay = Math.max(0, response.gameDay - 1)
    }
    console.log(this.gameDay, this.season, this.level, this.league)
    const [{ results }, standing, yesterday] = await Promise.all([
      server.getResults({
        season: this.season,
        gameDay: this.gameDay,
        level: this.level,
        league: this.league
      }),
      server.getStanding({
        season: this.season,
        gameDay: this.gameDay,
        level: this.level,
        league: this.league
      }),
      server.getStanding({
        season: this.season,
        gameDay: Math.max(0, this.gameDay - 1),
        level: this.level,
        league: this.league
      })
    ])
    this.results = results
    this.yesterdayStanding = yesterday
    this.standing = standing
    this.standing.sort(_sortStanding)
    this.yesterdayStanding.sort(_sortStanding)
    this.topScorer = await _calculateGoals(this.level, this.league, this.season, this.gameDay, this.standing)
  }

  _renderTopScorer (scorer, index) {
    const teamId = generateId()
    onClick(teamId, () => goTo(`team?id=${scorer.team.id}`))
    const playerId = generateId()
    onClick(playerId, () => {
      setQueryParams({ player_id: scorer.id })
    })
    return `
      <tr class="${this.myTeamId === scorer.team.id ? 'table-info' : ''}">
          <th>${index + 1}.</th>
          <td>${scorer.goals}</td>
          <td id="${playerId}">${scorer.name}</td>
          <td class="d-none d-sm-table-cell" id="${teamId}">${scorer.team.name}</td>
      </tr>
    `
  }

  _getLeagueAndLevel () {
    let { level, league } = getQueryParams()
    if (typeof level === 'undefined' || typeof league === 'undefined') return {}
    level = Number(level)
    league = Number(league)
    if (league < 0) league = 0
    if (level < 0) level = 0
    return { level, league }
  }

  _getPrevLeague (level, league) {
    if (level === 0) return { level, league }
    if (league === 0) {
      level--
      league = Math.pow(2, level) - 1
    } else {
      league--
    }
    return { level, league }
  }

  _getNextLeague (level, league) {
    if (league === Math.pow(2, level) - 1) {
      level++
      league = 0
    } else {
      league++
    }
    return { level, league }
  }

  _renderStandingListItem (standingItem, index) {
    const id = generateId()

    onClick('#' + id, () => goTo(`team?id=${standingItem.team.id}`))

    const trClasses = [
      this.myTeamId === standingItem.team.id ? 'table-info' : '',
      index < 2 ? 'table-success' : '',
      index > 13 ? 'table-warning' : ''
    ]

    const diff = this.yesterdayStanding.findIndex(s => s.team.id === standingItem.team.id) - index

    return `
      <tr id="${id}" class="${trClasses.join(' ')}">
        <th style="width: 30px">${index + 1}.</th>
        <td class="d-none d-md-table-cell" style="width: 30px">${diff < 0 ? '<i class="fa fa-arrow-down text-danger" aria-hidden="true"></i>' : (diff > 0 ? '<i class="fa fa-arrow-up text-success" aria-hidden="true"></i>' : '')}</td>
        <td>${standingItem.team.name}</td>
        <td class="d-none d-md-table-cell">${standingItem.games}</td>
        <td class="d-none d-md-table-cell">${standingItem.goals}:${standingItem.against}</td>
        <td class="d-none d-lg-table-cell">${standingItem.goals - standingItem.against}</td>
        <td>${standingItem.points}</td>
      </tr>
    `
  }

  async _getSeasonAndGameDay () {
    let { season, gameDay } = getQueryParams()
    if (typeof season === 'undefined' && typeof gameDay === 'undefined') {
      return {}
    }
    season = Number(season)
    gameDay = Number(gameDay)
    if (gameDay > 33) gameDay = 33
    if (gameDay < 0) gameDay = 0
    if (season < 0) season = 0
    return { season, gameDay }
  }

  _renderResultListItem (result) {
    const details = JSON.parse(result.details)
    const id = generateId()

    onClick(id, () => {
      console.log('Result:', result)
      setQueryParams({ game_id: result.id })
    })

    return `
    <tr id="${id}">
      <td>
        ${this.myTeamId === result.team1Id ? '<b class="text-info">' : ''}
        ${result.team1} (${details.strengthTeamA ?? '-'})
        ${this.myTeamId === result.team1Id ? '</b>' : ''}
      </td>
      <td>
        ${this.myTeamId === result.team2Id ? '<b class="text-info">' : ''}
        ${result.team2} (${details.strengthTeamB ?? '-'})
        ${this.myTeamId === result.team2Id ? '</b>' : ''}
      </td>
      <td>${result.goalsTeam1 ?? '-'} : ${result.goalsTeam2 ?? '-'}</td>
    </tr>
  `
  }
}

function _sortStanding (s1, s2) {
  const retVal = s2.points - s1.points
  if (retVal === 0) {
    return (s2.goals - s2.against) - (s1.goals - s1.against)
  }
  return retVal
}

async function _calculateGoals (level, league, season, gameDay, standing) {
  const games = await server.getSeasonResults_V2(season, gameDay, level, league)
  games.forEach((game) => (game.details = JSON.parse(game.details ?? '{}')))
  if (games.length === 0) return []
  const goalsByPlayers = {}
  for (const game of games) {
    game.details.log.filter(logItem => logItem.goal).forEach(({ player: playerId }) => {
      goalsByPlayers[playerId] = goalsByPlayers[playerId] ?? 0
      goalsByPlayers[playerId]++
    })
  }
  if (Object.keys(goalsByPlayers).length === 0) return []
  const { players } = await server.getPlayersWithIds({ playerIds: Object.keys(goalsByPlayers) })
  const playersWithGoals = Object.keys(goalsByPlayers)
    .map(playerId => {
      const player = players.find(p => p.id === Number(playerId))
      return {
        team: standing.find(({ team }) => team.id === player.team_id)?.team,
        goals: goalsByPlayers[playerId],
        ...player
      }
    })
  playersWithGoals.sort((a, b) => b.goals - a.goals)
  return playersWithGoals.slice(0, 10)
}
