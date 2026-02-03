import { query } from '../lib/database.js'
import { News } from '../entities/news.js'
import { calculateStanding, randomItem } from '../lib/util.js'
import { euroFormat } from '../../client/lib/currency.js'

const newsTemplates = {
  transfer: [
    {
      title: 'Record Transfer: {playerName} joins {toTeam} for {price}',
      text: 'In a stunning move, {playerName} has completed a transfer from {fromTeam} to {toTeam} for {price}. This marks the most expensive transfer of the day in the league.'
    },
    {
      title: '{playerName} Makes Big Money Move to {toTeam}',
      text: '{toTeam} has secured the services of {playerName} from {fromTeam} for a hefty sum of {price}. The transfer is expected to strengthen their squad significantly.'
    },
    {
      title: '{toTeam} Splashes {price} on {playerName}',
      text: 'In the biggest deal of the day, {toTeam} has acquired {playerName} from {fromTeam} for {price}. Fans are excited to see what the new signing will bring to the team.'
    }
  ],
  highestWin: [
    {
      title: '{teamName} Dominates with {goalDiff}-Goal Victory',
      text: '{teamName} delivered a commanding performance, crushing their opponents {goalsFor}-{goalsAgainst}. This was the biggest win of the game day in the league.'
    },
    {
      title: 'Crushing Victory: {teamName} Wins {goalsFor}-{goalsAgainst}',
      text: '{teamName} put on a clinical display, dismantling their opponents with a {goalDiff}-goal margin. The result sends a strong message to the rest of the league.'
    },
    {
      title: '{teamName} Runs Riot in {goalDiff}-Goal Thrashing',
      text: 'It was a day to remember for {teamName} as they recorded a stunning {goalsFor}-{goalsAgainst} victory. The convincing win demonstrates their title credentials.'
    }
  ],
  positionFirst: [
    {
      title: '{teamName} Claims Top Spot!',
      text: '{teamName} has risen to the top of the league table after an impressive run of form. Can they maintain their position at the summit?'
    },
    {
      title: 'New Leaders: {teamName} Takes First Place',
      text: '{teamName} has climbed to the top of the standings. The team will be looking to consolidate their position in the coming weeks.'
    },
    {
      title: '{teamName} Moves Into First Place',
      text: 'After another strong performance, {teamName} now sits at the top of the table. Their recent form has been nothing short of exceptional.'
    }
  ],
  positionLast: [
    {
      title: 'Relegation Fears Grow for {teamName}',
      text: '{teamName} has dropped to the bottom of the table. With relegation looming, the pressure is on to turn things around quickly.'
    },
    {
      title: '{teamName} Falls to Last Place',
      text: 'Troubling times for {teamName} as they find themselves at the foot of the table. The team must find form soon to avoid the drop.'
    },
    {
      title: 'Bottom of the Table: {teamName} in Crisis',
      text: '{teamName} is now in the relegation zone after slipping to last place. The management will need to act fast to save their season.'
    }
  ],
  stadiumExtension: [
    {
      title: '{teamName} Expands Stadium',
      text: '{teamName} has invested in their future by expanding their stadium. The increased capacity will help attract more fans and generate additional revenue.'
    },
    {
      title: 'New Stadium Works at {teamName}',
      text: '{teamName} has begun major stadium improvements. The expansion shows the club\'s ambition to grow both on and off the pitch.'
    },
    {
      title: '{teamName} Invests in Stadium Upgrade',
      text: 'Big news from {teamName} as they announce stadium expansion plans. The improvements will enhance the matchday experience for supporters.'
    }
  ],
  levelUp: [
    {
      title: '{playerName} Reaches New Heights at {teamName}',
      text: '{playerName} has leveled up to level {newLevel}, showcasing their continued development at {teamName}. The player is becoming a key asset for the team.'
    },
    {
      title: '{playerName} Levels Up to {newLevel}',
      text: 'Great news for {teamName} as {playerName} has improved to level {newLevel}. The player\'s hard work in training is paying off.'
    },
    {
      title: 'Rising Star: {playerName} Hits Level {newLevel}',
      text: '{teamName}\'s {playerName} continues to impress, reaching level {newLevel}. The improvement makes them an even more valuable member of the squad.'
    }
  ]
}

/**
 * Generate all news for a completed game day
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<void>}
 */
export async function generateNewsForGameDay (gameDay, season) {
  console.log(`📰 Generating news for season ${season}, game day ${gameDay}...`)

  // Get all unique level/league combinations that had games
  const leagues = await query(
    'SELECT DISTINCT level, league FROM game WHERE game_day=? AND season=? AND played=1',
    [gameDay, season]
  )

  for (const { level, league } of leagues) {
    await _generateTransferNews(gameDay, season, level, league)
    await _generateHighestWinNews(gameDay, season, level, league)
    await _generateStandingNews(gameDay, season, level, league)
    await _generateLevelUpNews(gameDay, season, level, league)
  }

  // Stadium news is not league-specific, assign to team's league
  await _generateStadiumNews(gameDay, season)

  console.log(`📰 News generation complete`)
}

/**
 * @param {number} gameDay
 * @param {number} season
 * @param {number} level
 * @param {number} league
 */
async function _generateTransferNews (gameDay, season, level, league) {
  const trades = await query(
    `SELECT th.*, p.name as player_name,
            t1.name as from_team_name, t2.name as to_team_name
     FROM trade_history th
     JOIN player p ON p.id = th.player_id
     JOIN team t1 ON t1.id = th.from_team_id
     JOIN team t2 ON t2.id = th.to_team_id
     WHERE th.game_day=? AND th.season=? AND (t1.level=? AND t1.league=? OR t2.level=? AND t2.league=?)
     ORDER BY th.price DESC
     LIMIT 1`,
    [gameDay, season, level, league, level, league]
  )

  if (trades.length === 0) return

  const trade = trades[0]
  const template = randomItem(newsTemplates.transfer)
  const news = new News({
    game_day: gameDay,
    season,
    level,
    league,
    type: 'TRANSFER',
    title: _fillTemplate(template.title, {
      playerName: trade.player_name,
      fromTeam: trade.from_team_name,
      toTeam: trade.to_team_name,
      price: euroFormat.format(trade.price)
    }),
    text: _fillTemplate(template.text, {
      playerName: trade.player_name,
      fromTeam: trade.from_team_name,
      toTeam: trade.to_team_name,
      price: euroFormat.format(trade.price)
    }),
    player_id: trade.player_id,
    team_id: trade.to_team_id,
    metadata: JSON.stringify({ price: trade.price })
  })

  await query('INSERT INTO news SET ?', news)
}

/**
 * @param {number} gameDay
 * @param {number} season
 * @param {number} level
 * @param {number} league
 */
async function _generateHighestWinNews (gameDay, season, level, league) {
  const games = await query(
    `SELECT g.*, t1.name as team1_name, t2.name as team2_name,
            ABS(g.goals_team_1 - g.goals_team_2) as goal_diff
     FROM game g
     JOIN team t1 ON t1.id = g.team_1_id
     JOIN team t2 ON t2.id = g.team_2_id
     WHERE g.game_day=? AND g.season=? AND g.level=? AND g.league=? AND g.played=1
       AND g.goals_team_1 <> g.goals_team_2
     ORDER BY goal_diff DESC
     LIMIT 1`,
    [gameDay, season, level, league]
  )

  if (games.length === 0) return

  const game = games[0]
  if (game.goal_diff < 2) return // Only newsworthy if 2+ goal difference

  const isTeam1Winner = game.goals_team_1 > game.goals_team_2
  const winnerName = isTeam1Winner ? game.team1_name : game.team2_name
  const winnerId = isTeam1Winner ? game.team_1_id : game.team_2_id
  const goalsFor = isTeam1Winner ? game.goals_team_1 : game.goals_team_2
  const goalsAgainst = isTeam1Winner ? game.goals_team_2 : game.goals_team_1

  const template = randomItem(newsTemplates.highestWin)
  const news = new News({
    game_day: gameDay,
    season,
    level,
    league,
    type: 'HIGHEST_WIN',
    title: _fillTemplate(template.title, {
      teamName: winnerName,
      goalDiff: game.goal_diff,
      goalsFor,
      goalsAgainst
    }),
    text: _fillTemplate(template.text, {
      teamName: winnerName,
      goalDiff: game.goal_diff,
      goalsFor,
      goalsAgainst
    }),
    team_id: winnerId,
    metadata: JSON.stringify({ goalDiff: game.goal_diff, goalsFor, goalsAgainst })
  })

  await query('INSERT INTO news SET ?', news)
}

/**
 * @param {number} gameDay
 * @param {number} season
 * @param {number} level
 * @param {number} league
 */
async function _generateStandingNews (gameDay, season, level, league) {
  // Need at least 2 game days to compare positions
  if (gameDay < 2) return

  // Calculate current standing
  const currentGames = await query(
    'SELECT * FROM game WHERE game_day<=? AND season=? AND level=? AND league=? AND played=1',
    [gameDay, season, level, league]
  )

  if (currentGames.length === 0) return

  const teamIds = new Set()
  currentGames.forEach(g => {
    teamIds.add(g.team_1_id)
    teamIds.add(g.team_2_id)
  })

  if (teamIds.size === 0) return

  const teams = await query(`SELECT * FROM team WHERE id IN (${[...teamIds].join(', ')})`)
  const currentStanding = calculateStanding(currentGames, teams)

  if (currentStanding.length === 0) return

  // Calculate previous standing
  const prevGames = await query(
    'SELECT * FROM game WHERE game_day<? AND season=? AND level=? AND league=? AND played=1',
    [gameDay, season, level, league]
  )

  if (prevGames.length === 0) return

  const prevStanding = calculateStanding(prevGames, teams)

  // Check for new #1
  const currentFirst = currentStanding[0]
  const prevFirst = prevStanding[0]

  if (currentFirst && prevFirst && currentFirst.team.id !== prevFirst.team.id) {
    const template = randomItem(newsTemplates.positionFirst)
    const news = new News({
      game_day: gameDay,
      season,
      level,
      league,
      type: 'POSITION_FIRST',
      title: _fillTemplate(template.title, { teamName: currentFirst.team.name }),
      text: _fillTemplate(template.text, { teamName: currentFirst.team.name }),
      team_id: currentFirst.team.id,
      metadata: JSON.stringify({ position: 1, points: currentFirst.points })
    })
    await query('INSERT INTO news SET ?', news)
  }

  // Check for new last place (only if league has enough teams)
  if (currentStanding.length >= 10) {
    const currentLast = currentStanding[currentStanding.length - 1]
    const prevLast = prevStanding[prevStanding.length - 1]

    if (currentLast && prevLast && currentLast.team.id !== prevLast.team.id) {
      const template = randomItem(newsTemplates.positionLast)
      const news = new News({
        game_day: gameDay,
        season,
        level,
        league,
        type: 'POSITION_LAST',
        title: _fillTemplate(template.title, { teamName: currentLast.team.name }),
        text: _fillTemplate(template.text, { teamName: currentLast.team.name }),
        team_id: currentLast.team.id,
        metadata: JSON.stringify({ position: currentStanding.length, points: currentLast.points })
      })
      await query('INSERT INTO news SET ?', news)
    }
  }
}

/**
 * @param {number} gameDay
 * @param {number} season
 */
async function _generateStadiumNews (gameDay, season) {
  // Find stadium expansions by checking finance_log for stadium construction
  const expansions = await query(
    `SELECT fl.*, t.name as team_name, t.level, t.league
     FROM finance_log fl
     JOIN team t ON t.id = fl.team_id
     WHERE fl.game_day=? AND fl.season=? AND fl.reason='Stadium construction build'`,
    [gameDay, season]
  )

  for (const expansion of expansions) {
    const template = randomItem(newsTemplates.stadiumExtension)
    const news = new News({
      game_day: gameDay,
      season,
      level: expansion.level,
      league: expansion.league,
      type: 'STADIUM_EXTENSION',
      title: _fillTemplate(template.title, { teamName: expansion.team_name }),
      text: _fillTemplate(template.text, { teamName: expansion.team_name }),
      team_id: expansion.team_id,
      metadata: JSON.stringify({ cost: Math.abs(expansion.value) })
    })
    await query('INSERT INTO news SET ?', news)
  }
}

/**
 * @param {number} gameDay
 * @param {number} season
 * @param {number} level
 * @param {number} league
 */
async function _generateLevelUpNews (gameDay, season, level, league) {
  const levelUps = await query(
    `SELECT ph.*, p.name as player_name, p.level as new_level,
            t.name as team_name, t.id as current_team_id
     FROM player_history ph
     JOIN player p ON p.id = ph.player_id
     JOIN team t ON t.id = p.team_id
     WHERE ph.game_day=? AND ph.season=? AND ph.type='LEVEL_UP'
       AND t.level=? AND t.league=?
     ORDER BY p.level DESC
     LIMIT 3`,
    [gameDay, season, level, league]
  )

  for (const levelUp of levelUps) {
    // Only create news for significant level ups (level 4, 7, or 10)
    if (![4, 7, 10].includes(levelUp.new_level)) continue

    const template = randomItem(newsTemplates.levelUp)
    const news = new News({
      game_day: gameDay,
      season,
      level,
      league,
      type: 'LEVEL_UP',
      title: _fillTemplate(template.title, {
        playerName: levelUp.player_name,
        teamName: levelUp.team_name,
        newLevel: levelUp.new_level
      }),
      text: _fillTemplate(template.text, {
        playerName: levelUp.player_name,
        teamName: levelUp.team_name,
        newLevel: levelUp.new_level
      }),
      player_id: levelUp.player_id,
      team_id: levelUp.current_team_id,
      metadata: JSON.stringify({ newLevel: levelUp.new_level })
    })
    await query('INSERT INTO news SET ?', news)
  }
}

/**
 * @param {string} template
 * @param {Object} values
 * @returns {string}
 */
function _fillTemplate (template, values) {
  let result = template
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{${key}}`, String(value))
  }
  return result
}

/**
 * Get news for a specific league
 * @param {number} gameDay
 * @param {number} season
 * @param {number} level
 * @param {number} league
 * @returns {Promise<NewsType[]>}
 */
export async function getNewsByLeague (gameDay, season, level, league) {
  return await query(
    'SELECT * FROM news WHERE game_day=? AND season=? AND level=? AND league=? ORDER BY created_at DESC',
    [gameDay, season, level, league]
  )
}
