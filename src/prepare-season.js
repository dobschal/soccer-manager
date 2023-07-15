import { Player } from './entities/player.js'
import { Team } from './entities/team.js'
import { query } from './lib/database.js'
import { Formation, Position, getPositionsOfFormation } from './lib/formation.js'
import { cityNames, clubPrefixes1, clubPrefixes2, playerNames } from './lib/name-library.js'
import { randomItem } from './lib/util.js'

const teamsPerLeague = 18
const maxLevels = 20
const amountTeamsPerLevel = _calculateAmountPerLevel()

export async function prepareSeason () {
  await _ajustAmountOfTeams()
  await _createGames()
  process.exit(0)
}

async function _createGames () {
  if (!(await _newGamesNeeded())) {
    return console.log('No new games needed.')
  }
  console.log('Need new games...')
  //
  // TODO: setup game days with related teams
  //
  // for each team in a league, give an index from 0 to 17 --> fix gameplan, create game days
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

async function _ajustAmountOfTeams () {
  let teams = await query('SELECT * FROM team')
  const levelForNewTeams = _determineLevelForNewTeam(teams)
  while (teams.length === 0 || teams.length % teamsPerLeague !== 0) {
    const team = await _createRandomTeam(levelForNewTeams)
    for (let i = 0; i < 16; i++) {
      await _createRandomPlayer(team, i)
    }
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
