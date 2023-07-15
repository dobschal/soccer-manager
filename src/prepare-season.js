import { Game } from './entities/game.js'
import { Player } from './entities/player.js'
import { Team } from './entities/team.js'
import { query } from './lib/database.js'
import { Formation, Position, getPositionsOfFormation } from './lib/formation.js'
import { cityNames, clubPrefixes1, clubPrefixes2, playerNames } from './lib/name-library.js'
import { calculateGamePlan, randomItem } from './lib/util.js'

/**
 * This script is checking for enough games, teams and players
 * If too less, it creates those.
 */

const teamsPerLeague = 18
const maxLevels = 20
const amountTeamsPerLevel = _calculateAmountPerLevel()
const minimumTeams = 126 // three leagues, will be overwritten by amount of users...

export async function prepareSeason () {
  await _ajustAmountOfTeams()
  await _createGames()
  process.exit(0)
}

async function _createGames () {
  if (!(await _newGamesNeeded())) {
    return console.log('No new games needed.')
  }
  const season = await _seasonForNewGames()
  const gamePlan = calculateGamePlan(teamsPerLeague)
  const teams = await query('SELECT * FROM team')
  for (let level = 0; level < maxLevels; level++) {
    const teamsOfLevel = teams.filter(t => t.level === level)
    if (teamsOfLevel.length === 0) break
    const leagues = []
    for (let i = 0; i < teamsOfLevel.length; i++) {
      const league = Math.floor(i / teamsPerLeague)
      if (!leagues[league]) leagues[league] = []
      leagues[league].push(teamsOfLevel[i])
    }
    await Promise.all(leagues.map((teamsOfLeague, league) => {
      return _createGamesForLeague(season, level, league, teamsOfLeague, gamePlan)
    }))
  }
  console.log(`Created games for season ${season}`)
}

async function _createGamesForLeague (season, level, league, teams, gamePlan) {
  let gameDay = 0
  for (const gamesOfGameday of gamePlan) {
    for (const gamePair of gamesOfGameday) {
      const teamA = teams[gamePair[0] - 1]
      const teamB = teams[gamePair[1] - 1]
      const game = new Game({
        team_1_id: teamA.id,
        team_2_id: teamB.id,
        season,
        game_day: gameDay,
        level,
        league,
        played: 0,
        details: '{}'
      })
      const backGame = new Game({
        team_1_id: teamB.id,
        team_2_id: teamA.id,
        season,
        game_day: gameDay + (teamsPerLeague - 1),
        level,
        league,
        played: 0,
        details: '{}'
      })
      await query('INSERT INTO game SET ?', game)
      await query('INSERT INTO game SET ?', backGame)
    }
    gameDay++
  }
}

/**
 *  If all games are played, take the last games season + 1 for new games...
 *
 * @returns {Promise<number>}
 */
async function _seasonForNewGames () {
  const [game] = await query('SELECT * FROM game g ORDER BY g.season DESC LIMIT 1')
  return game?.season ?? 0
}

/**
 * Number of teams per level. on level 20 we have more the 10mio teams... enough :D
 *
 * @returns {Array<number>}
 */
function _calculateAmountPerLevel () {
  const amountTeamsPerLevel = []
  for (let level = 0; level < maxLevels; level++) {
    const amount = Math.pow(2, level) * teamsPerLeague
    amountTeamsPerLevel.push(amount)
  }
  return amountTeamsPerLevel
}

/**
 * The core function to create new teams...
 */
async function _ajustAmountOfTeams () {
  const [{ amount: amountOfUsers }] = await query('SELECT COUNT(*) AS amount FROM team WHERE user_id IS NOT NULL')
  const minimumAmountOfTeams = Math.max((amountOfUsers ?? 0) * 2, minimumTeams)
  let teams = await query('SELECT * FROM team')
  while (teams.length === 0 || teams.length % teamsPerLeague !== 0 || teams.length < minimumAmountOfTeams) {
    const levelForNewTeam = _determineLevelForNewTeam(teams)
    const team = await _createRandomTeam(levelForNewTeam)
    Promise.all([...Array(16)].map((_, i) => _createRandomPlayer(team, i)))
    teams = await query('SELECT * FROM team')
  }
}

/**
 * Create a new team and save to database
 *
 * @param {number} level
 * @returns {Promise<Team>}
 */
async function _createRandomTeam (level) {
  const team = new Team({
    name: _generateRandomTeamName(),
    level,
    formation: _generateRandomFormation()
  })
  const { insertId: teamId } = await query('INSERT INTO team SET ?', team)
  team.id = teamId
  return team
}

/**
 * Create a random player for a team and save to database
 *
 * @param {Team} team
 * @param {number} i - index of player creation ot get correct position and so
 */
async function _createRandomPlayer (team, i) {
  const fixPosition = getPositionsOfFormation(team.formation)[i]
  const player = new Player({
    team_id: team.id,
    name: _generateRandomPlayerName(),
    level: Math.floor(Math.random() * 10) + 1,
    in_game_position: fixPosition ?? '',
    position: fixPosition ?? _generateRandomPosition()
  })
  await query('INSERT INTO player SET ?', player)
}

/**
 * Every level has a specific amount of teams. E.g. 0 =18, 1, 36, ...
 * If that number is reached for a level, we increase the level for new teams to be created
 *
 * @param {Array<Team>} teams
 * @returns {number}
 */
function _determineLevelForNewTeam (teams) {
  let levelForNewTeams = teams.sort((ta, tb) => tb.level - ta.level)[0]?.level ?? 0
  const amountOfTeamsInLatestLevel = teams.filter(t => t.level === levelForNewTeams).length ?? 0
  if (amountOfTeamsInLatestLevel > amountTeamsPerLevel[levelForNewTeams]) {
    throw new Error('Too many teams in level!!!')
  } else if (amountOfTeamsInLatestLevel === amountTeamsPerLevel[levelForNewTeams]) {
    levelForNewTeams++
  }
  return levelForNewTeams
}

/**
 * Read the database and check if there are games with player=0
 * If so, skip the game creation.
 * @returns {boolean}
 */
async function _newGamesNeeded () {
  const [{ amount }] = await query('SELECT COUNT(*) AS amount FROM game g WHERE g.played=0')
  return amount === 0
}

function _generateRandomTeamName () {
  return `${randomItem(clubPrefixes1)} ${randomItem(clubPrefixes2)} ${randomItem(cityNames)}`.trim()
}

function _generateRandomPlayerName () {
  return `${randomItem(playerNames).firstName} ${randomItem(playerNames).lastName}`
}

function _generateRandomPosition () {
  return randomItem(Object.values(Position))
}

function _generateRandomFormation () {
  return randomItem(Object.values(Formation))
}

prepareSeason()
