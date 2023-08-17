import { Game } from './entities/game.js'
import { Player } from './entities/player.js'
import { Team } from './entities/team.js'
import { query } from './lib/database.js'
import { Formation, Position, getPositionsOfFormation } from '../client/lib/formation.js'
import { cityNames, clubPrefixes1, clubPrefixes2, playerNames } from './lib/name-library.js'
import { calculateGamePlan, calculateStanding, randomItem } from './lib/util.js'
import { Stadium } from './entities/stadium.js'
import { addLogMessage } from './helper/newsHelper.js'
import { getTeamById } from './helper/teamHelper.js'

/**
 * This script is checking for enough games, teams and players
 * If too less, it creates those.
 * It is also managing the relegation and promotion at the end of a season
 */

const teamsPerLeague = 18
const maxLevels = 20
const startBalance = 100000 // €
const amountTeamsPerLevel = _calculateAmountPerLevel()
const minimumTeams = 126 // three leagues, will be overwritten by amount of users...

export async function prepareSeason () {
  await _archiveTooOldPlayers()
  await _ajustAmountOfTeams()
  await _promotionRelegation()
  await _createGames()
  console.log('✅ Prepared Season')
}

async function _archiveTooOldPlayers () {
  const season = await _latestSeason() ?? 0
  /** @type {PlayerType[]} */
  const players = await query('SELECT * FROM player WHERE carrier_end_season<=? AND team_id IS NOT NULL', [season])
  const result = await query('UPDATE player SET team_id=NULL WHERE carrier_end_season<=? AND team_id IS NOT NULL', [season])
  for (const player of players) {
    const team = await getTeamById(player.team_id)
    await addLogMessage(`Your player ${player.name} is saying goodbye and ends his carrier today.`, team)
  }
  console.log(`👴🏽 ${result.affectedRows} players ended their carrier...`, result)
}

async function _promotionRelegation () {
  if (!(await _newGamesNeeded())) {
    return console.log('⏭️ No promotion, relegation needed because still games to play.')
  }
  const season = await _latestSeason()
  if (typeof season === 'undefined') {
    return console.log('⏭️ No promotion, relegation needed because no season available.')
  }
  const games = await query('SELECT * FROM game WHERE season=?', [season])
  const teams = await query('SELECT * FROM team')
  if (teams.some(t => typeof t.league !== 'number')) {
    return console.log('Relegation and promotion for this season already ran')
  }
  await query('UPDATE team SET league=NULL WHERE true')
  let hightestLevel = 0
  const gamesByLevelAndLeague = {}
  for (const game of games) {
    if (game.level > hightestLevel) hightestLevel = game.level
    gamesByLevelAndLeague[game.level] = gamesByLevelAndLeague[game.level] ?? {}
    gamesByLevelAndLeague[game.level][game.league] = gamesByLevelAndLeague[game.level][game.league] ?? []
    gamesByLevelAndLeague[game.level][game.league].push(game)
  }
  const promises = []
  for (const level in gamesByLevelAndLeague) {
    if (Object.hasOwnProperty.call(gamesByLevelAndLeague, level)) {
      const leagues = gamesByLevelAndLeague[level]
      for (const league in leagues) {
        if (Object.hasOwnProperty.call(leagues, league)) {
          const gamesOfLeague = leagues[league]
          const standing = calculateStanding(gamesOfLeague, teams)
          const teamsForPromotion = [
            standing[0].team,
            standing[1].team
          ].filter(t => t.level > 0) // teams on first level cannot get promoted...
          console.log('Promotion for: ', teamsForPromotion)
          teamsForPromotion.forEach(t => {
            promises.push(addLogMessage('Congratulations! Your team got promoted to the next higher league!', t))
            promises.push(query('UPDATE team SET level=? WHERE id=?', [t.level - 1, t.id]))
          })
          const teamsForRelegation = [
            standing[teamsPerLeague - 1].team,
            standing[teamsPerLeague - 2].team,
            standing[teamsPerLeague - 3].team,
            standing[teamsPerLeague - 4].team
          ].filter(t => t.level < hightestLevel) // teams in last level cannot go for relegation...
          console.log('Relegation for ', teamsForRelegation)
          teamsForRelegation.forEach(t => {
            promises.push(addLogMessage('Very sad... Your team needs to got to the next lower league.', t))
            promises.push(query('UPDATE team SET level=? WHERE id=?', [t.level + 1, t.id]))
          })
        }
      }
    }
  }
  console.log('Teams to move: ', promises.length)
  await Promise.all(promises)
  console.log('Relegation and promotion done.')
}

async function _createGames () {
  if (!(await _newGamesNeeded())) {
    return console.log('⏭️ No new games needed.')
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
      query(`UPDATE team SET league=${league} WHERE id=${teamsOfLevel[i].id}`)
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
  return (game?.season ?? -1) + 1
}

/**
 * @returns {Promise<number|undefined>}
 */
async function _latestSeason () {
  const [game] = await query('SELECT * FROM game g ORDER BY g.season DESC LIMIT 1')
  return game?.season
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
  const season = await _latestSeason() ?? 0
  const [{ amount: amountOfUsers }] = await query('SELECT COUNT(*) AS amount FROM team WHERE user_id IS NOT NULL')
  const minimumAmountOfTeams = Math.max((amountOfUsers ?? 0) * 2, minimumTeams)
  let teams = await query('SELECT * FROM team')
  while (teams.length === 0 || teams.length % teamsPerLeague !== 0 || teams.length < minimumAmountOfTeams) {
    const levelForNewTeam = _determineLevelForNewTeam(teams)
    const team = await _createRandomTeam(levelForNewTeam)
    await Promise.all([...Array(18)].map((_, i) => _createRandomPlayer(team, i, season)))
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
    balance: startBalance,
    formation: _generateRandomFormation(),
    color: '#00d9ff'
  })
  const { insertId: teamId } = await query('INSERT INTO team SET ?', team)
  team.id = teamId
  const stadium = new Stadium({
    team_id: team.id,
    north_stand_roof: 0,
    south_stand_roof: 0,
    east_stand_roof: 0,
    west_stand_roof: 0,
    north_stand_size: 1000,
    south_stand_size: 100,
    east_stand_size: 100,
    west_stand_size: 100,
    north_stand_price: 13,
    south_stand_price: 13,
    east_stand_price: 13,
    west_stand_price: 13
  })
  await query('INSERT INTO stadium SET ?', stadium)
  return team
}

/**
 * Create a random player for a team and save to database
 *
 * @param {Team} team
 * @param {number} i - index of player creation ot get correct position and so
 * @param {number} season
 */
async function _createRandomPlayer (team, i, season) {
  const fixPosition = getPositionsOfFormation(team.formation)[i]
  const age = Math.floor(Math.random() * 16) // have new players a bit younger, 16 means max 32 years old
  const carrierLength = 22 + Math.floor(Math.random() * 4)
  let maxLevel
  if (age + 16 < 19) {
    maxLevel = 3
  } else if (age + 16 < 25) {
    maxLevel = 5
  } else {
    maxLevel = 7 // not too strong players on start
  }
  const player = new Player({
    hair_color: Math.floor(Math.random() * 7),
    skin_color: Math.floor(Math.random() * 3),
    team_id: team.id,
    name: (await generateRandomPlayerName()),
    carrier_start_season: season - age,
    carrier_end_season: season - age + carrierLength,
    level: Math.floor(Math.random() * maxLevel) + 1,
    in_game_position: fixPosition ?? '',
    position: fixPosition ?? _generateRandomPosition(),
    freshness: 1.0
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
 * @returns {Promise<boolean>}
 */
async function _newGamesNeeded () {
  const [{ amount }] = await query('SELECT COUNT(*) AS amount FROM game g WHERE g.played=0')
  return amount === 0
}

function _generateRandomTeamName () {
  return `${randomItem(clubPrefixes1)} ${randomItem(clubPrefixes2)} ${randomItem(cityNames)}`.trim()
}

/**
 * @returns {Promise<string>}
 * @private
 */
export async function generateRandomPlayerName () {
  const name = `${randomItem(playerNames).firstName} ${randomItem(playerNames).lastName}`
  const results = await query('SELECT * FROM player WHERE name=?', [name])
  if (results.length > 0) {
    console.log('Found player with same name...', name)
    return await generateRandomPlayerName()
  }
  return name
}

function _generateRandomPosition () {
  return randomItem(Object.values(Position))
}

function _generateRandomFormation () {
  return randomItem(Object.values(Formation))
}
