import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { getAveragePlanPriceOfPlayer } from '../helper/playerHelper.js'
import { addLogMessage } from '../helper/logMessageHelper.js'
import { getSponsor } from '../helper/sponsorHelper.js'
import { completeAllStadiumConstructionsForTeam } from '../helper/stadiumHelper.js'
import { prepareSeason, regenerateTeamData } from '../prepare-season.js'
import { t } from '../i18n/index.js'
import { ActionCard } from '../entities/actionCard.js'
import { clearUserCache } from '../lib/userCache.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { config } from '../config.js'
import { sendPushNotifications } from '../lib/pushNotification.js'

const MIN_CHOOSABLE_LEVEL = config.MIN_CHOOSABLE_LEVEL

/**
 * The cards a manager finds in their inventory right after signing for a club.
 * The star player and the youth star were added so a new manager has something
 * to shape their squad with from day one (#518).
 * @type {string[]}
 */
export const STARTER_ACTION_CARDS = [
  'NEW_YOUTH_PLAYER_1',
  'LEVEL_UP_PLAYER_40',
  'STAR_PLAYER',
  'NEW_YOUTH_PLAYER_3'
]

/**
 * Free, non-system teams that the user is allowed to take over.
 * Starting from the 3rd league (level 2) so users don't pick into
 * the top divisions.
 * @returns {Promise<Array<Object>>}
 */
async function _loadChoosableTeams () {
  return await query(
    `SELECT * FROM team
     WHERE user_id IS NULL
       AND is_system_team = 0
       AND level >= ?
     ORDER BY level ASC, league ASC, name ASC`,
    [MIN_CHOOSABLE_LEVEL]
  )
}

/**
 * Take over a free team for the current user: reset balance, wipe old
 * offers/logs/sponsor, regenerate players/stadium/buildings and grant starter
 * action cards. Shared by chooseTeam and chooseRandomTeamInLeague (#453).
 * @param {Object} team
 * @param {Request} req
 * @param {string} locale
 * @returns {Promise<void>}
 */
async function _takeOverTeam (team, req, locale) {
  await query('DELETE FROM log_message WHERE team_id=?', [team.id])
  await query('DELETE FROM finance_log WHERE team_id=?', [team.id])
  await query('DELETE FROM trade_offer WHERE from_team_id=?', [team.id])
  await query('DELETE FROM trade_offer WHERE player_id IN (SELECT id FROM player WHERE team_id=?)', [team.id])
  await addLogMessage(t('log.welcome', {
    username: req.user.username,
    teamName: team.name
  }, locale), team, null, null, 'hand-peace-o', undefined, 'info')
  await query('UPDATE team SET user_id=?, balance=500000, coach_since=CURRENT_TIMESTAMP WHERE id=?', [req.user.id, team.id])
  const { sponsor } = await getSponsor(team)
  if (sponsor) {
    await query('DELETE FROM sponsor WHERE id=?', [sponsor.id])
  }
  await regenerateTeamData(team)
  const { gameDay, season } = await getGameDayAndSeason()
  await completeAllStadiumConstructionsForTeam(team.id, gameDay, season)
  await query('DELETE FROM action_card WHERE team_id=?', [team.id])
  for (const action of STARTER_ACTION_CARDS) {
    await query('INSERT INTO action_card SET ?', new ActionCard({
      team_id: team.id, action, played: 0, season
    }))
  }
  clearUserCache(req.user.id)
  // Let the admins know a manager actually made it through registration and
  // picked a club (#449). Fire-and-forget — a push failure must never break
  // the takeover.
  void notifyAdminsAboutNewManager(req.user.username, team.name)
}

/**
 * Push a "new manager signed" notification to every admin that has a device
 * registered. Swallows its own errors.
 * @param {string} username
 * @param {string} teamName
 * @returns {Promise<void>}
 */
async function notifyAdminsAboutNewManager (username, teamName) {
  try {
    const admins = await query('SELECT id FROM user WHERE is_admin = 1')
    const adminIds = Array.isArray(admins) ? admins.map(a => a.id) : []
    if (adminIds.length === 0) return
    await sendPushNotifications(
      adminIds,
      'FootballManager.IO',
      `New manager: ${username} took over ${teamName}`,
      { deep_link: '#admin?sub_page=users' }
    )
  } catch (e) {
    console.error('[Push] Failed to notify admins about a new manager:', e?.message ?? e)
  }
}

export default {

  /**
   * Returns whether the current user already manages a team.
   * Cheap check used by the client router to decide whether to show
   * the team-choice page.
   * @param {Request} req
   * @returns {Promise<{ hasTeam: boolean }>}
   */
  async hasTeam (req) {
    if (!req.user) {
      return { hasTeam: false }
    }
    const [row] = await query('SELECT id FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    return { hasTeam: !!row }
  },

  /**
   * List of free teams the user can take over after registration.
   * Includes emblem, color, name, level/league, and estimated team value.
   * @param {Request} req
   * @returns {Promise<{ teams: Array<Object> }>}
   */
  async getAvailableTeams (req) {
    const locale = req.locale || 'en'
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }
    let teams = await _loadChoosableTeams()
    if (teams.length === 0) {
      // No free teams yet — spin up a fresh league so the user has options.
      await prepareSeason()
      teams = await _loadChoosableTeams()
    }
    const teamIds = teams.map(team => team.id)
    let playersByTeam = new Map()
    if (teamIds.length > 0) {
      const players = await query('SELECT * FROM player WHERE team_id IN (?)', [teamIds])
      for (const player of players) {
        const list = playersByTeam.get(player.team_id) || []
        list.push(player)
        playersByTeam.set(player.team_id, list)
      }
    }
    const { season } = await getGameDayAndSeason()
    const result = await Promise.all(teams.map(async team => {
      const players = playersByTeam.get(team.id) || []
      const values = await Promise.all(players.map(p => getAveragePlanPriceOfPlayer(p, season)))
      const value = values.reduce((sum, v) => sum + v, 0)
      return {
        id: team.id,
        name: team.name,
        emblem: team.emblem,
        color: team.color,
        level: team.level,
        league: team.league,
        value
      }
    }))
    return { teams: result }
  },

  /**
   * Take over the selected team. Performs the same cleanup the previous
   * createAccount flow did: reset balance to 500_000, wipe trade offers,
   * remove sponsor, top up players/stadium/buildings, and grant starter
   * action cards.
   * @param {number} teamId
   * @param {Request} req
   * @returns {Promise<{ success: boolean }>}
   */
  async chooseTeam (teamId, req) {
    const locale = req.locale || 'en'
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }
    if (typeof teamId !== 'number') {
      throw new BadRequestError(t('error.invalidParam', {}, locale))
    }
    const [existing] = await query('SELECT id FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    if (existing) {
      throw new BadRequestError(t('chooseTeam.alreadyHasTeam', {}, locale))
    }
    const [team] = await query(
      `SELECT * FROM team
       WHERE id=? AND user_id IS NULL AND is_system_team = 0 AND level >= ?
       LIMIT 1`,
      [teamId, MIN_CHOOSABLE_LEVEL]
    )
    if (!team) {
      throw new BadRequestError(t('chooseTeam.teamUnavailable', {}, locale))
    }
    await _takeOverTeam(team, req, locale)
    return { success: true }
  },

  /**
   * Leagues (from the 3rd league downward) that still have free teams, so the
   * user picks a league rather than a specific team (#453). Each entry carries
   * the level/league and how many free teams are available there.
   * @param {Request} req
   * @returns {Promise<{ leagues: Array<{level: number, league: number, freeTeams: number}> }>}
   */
  async getAvailableLeagues (req) {
    const locale = req.locale || 'en'
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }
    let teams = await _loadChoosableTeams()
    if (teams.length === 0) {
      await prepareSeason()
      teams = await _loadChoosableTeams()
    }
    const counts = new Map()
    for (const team of teams) {
      const key = `${team.level}-${team.league}`
      const entry = counts.get(key) || { level: team.level, league: team.league, freeTeams: 0 }
      entry.freeTeams++
      counts.set(key, entry)
    }
    const leagues = [...counts.values()].sort((a, b) => a.level - b.level || a.league - b.league)
    return { leagues }
  },

  /**
   * Assign a random free team from the chosen league to the user (#453). Used
   * by the reworked post-registration flow, where the user picks a league and
   * is handed a random club to rename and re-skin afterwards.
   * @param {number} level
   * @param {number} league
   * @param {Request} req
   * @returns {Promise<{ team: Object }>}
   */
  async chooseRandomTeamInLeague (level, league, req) {
    const locale = req.locale || 'en'
    if (!req.user) {
      throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    }
    if (typeof level !== 'number' || typeof league !== 'number') {
      throw new BadRequestError(t('error.invalidParam', {}, locale))
    }
    const [existing] = await query('SELECT id FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    if (existing) {
      throw new BadRequestError(t('chooseTeam.alreadyHasTeam', {}, locale))
    }
    const [team] = await query(
      `SELECT * FROM team
       WHERE user_id IS NULL AND is_system_team = 0 AND level >= ? AND level = ? AND league = ?
       ORDER BY RAND() LIMIT 1`,
      [MIN_CHOOSABLE_LEVEL, level, league]
    )
    if (!team) {
      throw new BadRequestError(t('chooseTeam.teamUnavailable', {}, locale))
    }
    await _takeOverTeam(team, req, locale)
    return {
      team: {
        id: team.id,
        name: team.name,
        short_name: team.short_name ?? null,
        emblem: team.emblem,
        color: team.color,
        level: team.level,
        league: team.league
      }
    }
  }
}
