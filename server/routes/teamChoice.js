import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { getAveragePlanPriceOfPlayer } from '../helper/playerHelper.js'
import { addLogMessage } from '../helper/logMessageHelper.js'
import { getSponsor } from '../helper/sponsorHelper.js'
import { prepareSeason, regenerateTeamData } from '../prepare-season.js'
import { t } from '../i18n/index.js'
import { ActionCard } from '../entities/actionCard.js'
import { clearUserCache } from '../lib/userCache.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'

const MIN_CHOOSABLE_LEVEL = 2

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
    await query('DELETE FROM log_message WHERE team_id=?', [team.id])
    await query('DELETE FROM trade_offer WHERE from_team_id=?', [team.id])
    await query('DELETE FROM trade_offer WHERE player_id IN (SELECT id FROM player WHERE team_id=?)', [team.id])
    await addLogMessage(t('log.welcome', {
      username: req.user.username,
      teamName: team.name
    }, locale), team, null, null, 'hand-peace-o', undefined, 'info')
    await query('UPDATE team SET user_id=?, balance=500000 WHERE id=?', [req.user.id, team.id])
    const { sponsor } = await getSponsor(team)
    if (sponsor) {
      await query('DELETE FROM sponsor WHERE id=?', [sponsor.id])
    }
    await regenerateTeamData(team)
    await query('DELETE FROM action_card WHERE team_id=?', [team.id])
    const { season } = await getGameDayAndSeason()
    const starterCards = [
      new ActionCard({ team_id: team.id, action: 'NEW_YOUTH_PLAYER', played: 0, season }),
      new ActionCard({ team_id: team.id, action: 'LEVEL_UP_PLAYER_40', played: 0, season })
    ]
    for (const card of starterCards) {
      await query('INSERT INTO action_card SET ?', card)
    }
    clearUserCache(req.user.id)
    return { success: true }
  }
}
