import { query } from '../lib/database.js'
import { News } from '../entities/news.js'
import { calculateStanding } from '../lib/util.js'
import { euroFormat } from '../../client/lib/currency.js'
import { t, getSupportedLocales } from '../i18n/index.js'
import { getCupRoundDisplayName, getTotalRoundsForSeason } from './cupHelper.js'

const TEMPLATE_COUNT = 5

/**
 * Get a translated news template for a given type
 * @param {string} type - The news template type
 * @param {Object} params - Parameters for template substitution
 * @param {string} locale - The locale for translation
 * @param {number} templateIndex - Which template to use (1-5)
 * @returns {{title: string, text: string}}
 */
function getNewsTemplate (type, params, locale, templateIndex) {
  const titleKey = `news.${type}.${templateIndex}.title`
  const textKey = `news.${type}.${templateIndex}.text`

  return {
    title: t(titleKey, params, locale),
    text: t(textKey, params, locale)
  }
}

/**
 * Get a random template index to use for all locales (ensures consistency)
 * @returns {number}
 */
function getRandomTemplateIndex () {
  return Math.floor(Math.random() * TEMPLATE_COUNT) + 1
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
    'SELECT DISTINCT level, league FROM game WHERE game_day=? AND season=? AND played=1 AND game_type=\'league\'',
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

  // Cup news spans all leagues
  await _generateCupNews(gameDay, season)

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
  const params = {
    playerName: trade.player_name,
    fromTeam: trade.from_team_name,
    toTeam: trade.to_team_name,
    price: euroFormat.format(trade.price)
  }
  const templateIndex = getRandomTemplateIndex()
  const locales = getSupportedLocales()

  for (const locale of locales) {
    const template = getNewsTemplate('transfer', params, locale, templateIndex)
    const news = new News({
      game_day: gameDay,
      season,
      level,
      league,
      type: 'TRANSFER',
      title: template.title,
      text: template.text,
      locale,
      player_id: trade.player_id,
      team_id: trade.to_team_id,
      metadata: JSON.stringify({ price: trade.price })
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
async function _generateHighestWinNews (gameDay, season, level, league) {
  const games = await query(
    `SELECT g.*, t1.name as team1_name, t2.name as team2_name,
            ABS(g.goals_team_1 - g.goals_team_2) as goal_diff
     FROM game g
     JOIN team t1 ON t1.id = g.team_1_id
     JOIN team t2 ON t2.id = g.team_2_id
     WHERE g.game_day=? AND g.season=? AND g.level=? AND g.league=? AND g.played=1 AND g.game_type='league'
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

  const params = {
    teamName: winnerName,
    goalDiff: game.goal_diff,
    goalsFor,
    goalsAgainst
  }
  const templateIndex = getRandomTemplateIndex()
  const locales = getSupportedLocales()

  for (const locale of locales) {
    const template = getNewsTemplate('highestWin', params, locale, templateIndex)
    const news = new News({
      game_day: gameDay,
      season,
      level,
      league,
      type: 'HIGHEST_WIN',
      title: template.title,
      text: template.text,
      locale,
      team_id: winnerId,
      metadata: JSON.stringify({ goalDiff: game.goal_diff, goalsFor, goalsAgainst })
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
async function _generateStandingNews (gameDay, season, level, league) {
  // Need at least 2 game days to compare positions
  if (gameDay < 2) return

  // Calculate current standing
  const currentGames = await query(
    'SELECT * FROM game WHERE game_day<=? AND season=? AND level=? AND league=? AND played=1 AND game_type=\'league\'',
    [gameDay, season, level, league]
  )

  if (currentGames.length === 0) return

  const teamIds = new Set()
  currentGames.forEach(g => {
    teamIds.add(g.team_1_id)
    teamIds.add(g.team_2_id)
  })

  if (teamIds.size === 0) return

  const teamIdArray = [...teamIds]
  const placeholders = teamIdArray.map(() => '?').join(', ')
  const teams = await query(`SELECT * FROM team WHERE id IN (${placeholders})`, teamIdArray)
  const currentStanding = calculateStanding(currentGames, teams)

  if (currentStanding.length === 0) return

  // Calculate previous standing
  const prevGames = await query(
    'SELECT * FROM game WHERE game_day<? AND season=? AND level=? AND league=? AND played=1 AND game_type=\'league\'',
    [gameDay, season, level, league]
  )

  if (prevGames.length === 0) return

  const prevStanding = calculateStanding(prevGames, teams)

  // Check for new #1
  const currentFirst = currentStanding[0]
  const prevFirst = prevStanding[0]

  if (currentFirst && prevFirst && currentFirst.team.id !== prevFirst.team.id) {
    const params = { teamName: currentFirst.team.name }
    const templateIndex = getRandomTemplateIndex()
    const locales = getSupportedLocales()

    for (const locale of locales) {
      const template = getNewsTemplate('positionFirst', params, locale, templateIndex)
      const news = new News({
        game_day: gameDay,
        season,
        level,
        league,
        type: 'POSITION_FIRST',
        title: template.title,
        text: template.text,
        locale,
        team_id: currentFirst.team.id,
        metadata: JSON.stringify({ position: 1, points: currentFirst.points })
      })
      await query('INSERT INTO news SET ?', news)
    }
  }

  // Check for new last place (only if league has enough teams)
  if (currentStanding.length >= 10) {
    const currentLast = currentStanding[currentStanding.length - 1]
    const prevLast = prevStanding[prevStanding.length - 1]

    if (currentLast && prevLast && currentLast.team.id !== prevLast.team.id) {
      const params = { teamName: currentLast.team.name }
      const templateIndex = getRandomTemplateIndex()
      const locales = getSupportedLocales()

      for (const locale of locales) {
        const template = getNewsTemplate('positionLast', params, locale, templateIndex)
        const news = new News({
          game_day: gameDay,
          season,
          level,
          league,
          type: 'POSITION_LAST',
          title: template.title,
          text: template.text,
          locale,
          team_id: currentLast.team.id,
          metadata: JSON.stringify({ position: currentStanding.length, points: currentLast.points })
        })
        await query('INSERT INTO news SET ?', news)
      }
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
    const params = { teamName: expansion.team_name }
    const templateIndex = getRandomTemplateIndex()
    const locales = getSupportedLocales()

    for (const locale of locales) {
      const template = getNewsTemplate('stadiumExtension', params, locale, templateIndex)
      const news = new News({
        game_day: gameDay,
        season,
        level: expansion.level,
        league: expansion.league,
        type: 'STADIUM_EXTENSION',
        title: template.title,
        text: template.text,
        locale,
        team_id: expansion.team_id,
        metadata: JSON.stringify({ cost: Math.abs(expansion.value) })
      })
      await query('INSERT INTO news SET ?', news)
    }
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

    const params = {
      playerName: levelUp.player_name,
      teamName: levelUp.team_name,
      newLevel: levelUp.new_level
    }
    const templateIndex = getRandomTemplateIndex()
    const locales = getSupportedLocales()

    for (const locale of locales) {
      const template = getNewsTemplate('levelUp', params, locale, templateIndex)
      const news = new News({
        game_day: gameDay,
        season,
        level,
        league,
        type: 'LEVEL_UP',
        title: template.title,
        text: template.text,
        locale,
        player_id: levelUp.player_id,
        team_id: levelUp.current_team_id,
        metadata: JSON.stringify({ newLevel: levelUp.new_level })
      })
      await query('INSERT INTO news SET ?', news)
    }
  }
}

/**
 * @param {number} gameDay
 * @param {number} season
 */
async function _generateCupNews (gameDay, season) {
  const games = await query(
    `SELECT g.*, t1.name as team1_name, t2.name as team2_name,
            t1.level as team1_level, t1.league as team1_league,
            t2.level as team2_level, t2.league as team2_league,
            ABS(g.goals_team_1 - g.goals_team_2) as goal_diff
     FROM game g
     JOIN team t1 ON t1.id = g.team_1_id
     JOIN team t2 ON t2.id = g.team_2_id
     WHERE g.game_day=? AND g.season=? AND g.game_type='cup' AND g.played=1
     ORDER BY g.cup_round ASC
     LIMIT 3`,
    [gameDay, season]
  )

  const totalRounds = games.length > 0 ? await getTotalRoundsForSeason(season) : 0

  for (const game of games) {
    // Only newsworthy if 2+ goal difference or semi-final/final
    const isBigRound = game.cup_round <= 4
    if (game.goal_diff < 2 && !isBigRound) continue

    const isTeam1Winner = game.goals_team_1 > game.goals_team_2
    const winnerName = isTeam1Winner ? game.team1_name : game.team2_name
    const winnerId = isTeam1Winner ? game.team_1_id : game.team_2_id
    const loserName = isTeam1Winner ? game.team2_name : game.team1_name
    const goalsFor = isTeam1Winner ? game.goals_team_1 : game.goals_team_2
    const goalsAgainst = isTeam1Winner ? game.goals_team_2 : game.goals_team_1

    const roundLabel = getCupRoundDisplayName(game.cup_round, totalRounds)

    const params = { winnerName, loserName, goalsFor, goalsAgainst, roundLabel }
    const templateIndex = getRandomTemplateIndex()
    const locales = getSupportedLocales()

    // Determine unique level/league combos from both teams
    const leagueCombos = new Map()
    leagueCombos.set(`${game.team1_level}-${game.team1_league}`, { level: game.team1_level, league: game.team1_league })
    leagueCombos.set(`${game.team2_level}-${game.team2_league}`, { level: game.team2_level, league: game.team2_league })

    for (const { level, league } of leagueCombos.values()) {
      for (const locale of locales) {
        const template = getNewsTemplate('cupMatch', params, locale, templateIndex)
        const news = new News({
          game_day: gameDay,
          season,
          level,
          league,
          type: 'CUP_MATCH',
          title: template.title,
          text: template.text,
          locale,
          team_id: winnerId,
          metadata: JSON.stringify({ goalsFor, goalsAgainst, cupRound: game.cup_round, roundLabel })
        })
        await query('INSERT INTO news SET ?', news)
      }
    }
  }
}

/**
 * Get news for a specific league and locale
 * @param {number} gameDay
 * @param {number} season
 * @param {number} level
 * @param {number} league
 * @param {string} [locale='en'] - The locale to filter by
 * @returns {Promise<NewsType[]>}
 */
export async function getNewsByLeague (gameDay, season, level, league, locale = 'en') {
  return await query(
    'SELECT * FROM news WHERE game_day=? AND season=? AND level=? AND league=? AND locale=? ORDER BY created_at DESC',
    [gameDay, season, level, league, locale]
  )
}
