import { UIElement } from '../lib/UIElement.js'
import { SERVER_EVENTS } from '../lib/serverEvents.js'
import { server, showServerError } from '../lib/gateway.js'
import { toast } from './toast.js'
import { t } from '../i18n/index.js'
import { calculatePlayerAge } from '../util/player.js'

/**
 * The "Captain" dropdown on the my-team page. Wrapped as its own UIElement
 * so it can react to server events atomically:
 *
 * - `CAPTAIN_CHANGED` — flip the selected option (works across tabs too).
 * - `BENCH_CHANGED`   — a lineup player may have been demoted to the bench;
 *   their entry needs to disappear from the captain-candidate list.
 *
 * `players` and `team` are passed by reference from `ATeamPage`. The page
 * mutates the same arrays / objects on the same events, so this select just
 * re-reads them from the shared refs on update.
 */
export class CaptainSelect extends UIElement {
  /**
   * @param {PlayerType[]} players - Shared with ATeamPage (mutated in place on events).
   * @param {TeamType} team - Shared with ATeamPage (captain_id kept in sync).
   * @param {number} season - Current season, used for the age hint on each option.
   */
  constructor (players, team, season) {
    super()
    this.players = players
    this.team = team
    this.season = season
  }

  /**
   * @returns {string}
   */
  get template () {
    const lineupPlayers = this.players.filter(p => p.in_game_position && !p.fake)
    const currentCaptainId = this.team.captain_id || null
    return `
      <select class="form-control captain-select">
        <option value="">${t('myTeam.captain.none')}</option>
        ${lineupPlayers.map(p => `<option value="${p.id}" ${p.id === currentCaptainId ? 'selected' : ''}>${p.name} (${p.position}, Lvl ${p.level}, ${t('player.age')} ${calculatePlayerAge(p, this.season)})</option>`).join('')}
      </select>
    `
  }
  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '.captain-select': {
        change: async (e) => {
          const newCaptainId = e.target.value ? Number(e.target.value) : null
          const currentCaptainId = this.team.captain_id || null
          if (newCaptainId === currentCaptainId) return
          try {
            await server.setCaptain(newCaptainId)
            toast(t('myTeam.captainUpdated'), 'success')
            // No manual update — CAPTAIN_CHANGED reaches this element (and
            // every other subscriber, incl. other tabs) via the server event.
          } catch (err) {
            showServerError(err)
          }
        }
      }
    }
  }
  /**
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      [SERVER_EVENTS.CAPTAIN_CHANGED.name]: (data) => {
        this.team.captain_id = data?.captainId ?? null
        this.update()
      },
      [SERVER_EVENTS.BENCH_CHANGED.name]: (data) => {
        // Only relevant when a bench pick vacated a lineup slot — otherwise
        // the option list didn't change.
        if (!data?.vacatedLineupPosition) return
        this.update()
      },
      [SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]: () => {
        // Any lineup change may add / remove a candidate from the option
        // list (players moved in from bench / reserves, ejected players
        // dropped out). Just refresh — the template re-derives from the
        // shared `players` array which the ATeamPage handler has already
        // updated by this point.
        this.update()
      }
    }
  }
  
}
