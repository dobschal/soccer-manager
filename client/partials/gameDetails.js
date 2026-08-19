import { UIElement } from '../lib/UIElement.js'
import { GameAnimation } from './gameAnimation.js'
import { renderEmblem } from './emblem.js'
import { renderPositionBadge } from './positionBadge.js'
import { buildTickerEvents, buildTickerRow, fillTickerPortraits, logHasMinutes } from '../lib/tickerEvents.js'
import { GameReport } from './gameReport.js'
import { renderCollapsibleCard, toggleCollapsibleCard } from '../lib/collapsibleCard.js'
import { formatDate } from '../lib/date.js'
import { t } from '../i18n/index.js'

/**
 * Return a short team name by stripping the middle part (prefix2).
 * E.g. "SSC Dynamic Gütersloh" → "SSC Gütersloh", "Olympic Ironhold" → "Ironhold"
 * @param {string} name
 * @returns {string}
 */
function shortTeamName (name) {
  if (!name) return ''
  const words = name.split(' ')
  if (words.length <= 1) return name
  const isAbbrev = (w) => /^[A-Z.0-9]+\.?$/.test(w) || /^\d/.test(w)
  return words.filter((w, i) => i === words.length - 1 || isAbbrev(w)).join(' ')
}

/**
 * Sort players by position for display: GK, defenders, midfielders, attackers
 * @param {Object} a
 * @param {Object} b
 * @returns {number}
 */
function positionOrder (a, b) {
  const order = {
    GK: 0,
    LD: 1,
    CD: 2,
    RD: 3,
    DM: 4,
    LM: 5,
    CM: 6,
    RM: 7,
    OM: 8,
    LA: 9,
    CA: 10,
    RA: 11
  }
  return (order[a.in_game_position] ?? 99) - (order[b.in_game_position] ?? 99)
}

/**
 * Render a squad list table for one team
 * @param {Array} teamPlayers
 * @param {string} teamName
 * @param {Array} substitutions - Substitution events for this team
 * @returns {string}
 */
function renderSquadList (teamPlayers, teamName, substitutions) {
  if (!teamPlayers || teamPlayers.length === 0) return ''

  const sorted = [...teamPlayers].sort(positionOrder)
  const rows = sorted.map(p => {
    const freshnessPct = Math.floor(p.freshness * 100)
    const originalLevel = p.originalLevel != null ? Math.round(p.originalLevel) : (p.freshness > 0 ? Math.round(p.level / p.freshness) : p.level)
    const inGameLevel = Math.round(p.level)
    const freshnessColor = freshnessPct < 40 ? 'text-danger' : freshnessPct < 70 ? 'text-warning' : 'text-success'
    const levelDiffClass = inGameLevel > originalLevel ? 'text-success' : inGameLevel < originalLevel ? 'text-danger' : ''
    const subOut = substitutions.find(s => s.playerOutId === p.id)
    const subIn = substitutions.find(s => s.playerInId === p.id)
    let subIndicator = ''
    if (subOut) {
      subIndicator = ` <span class="sub-out" title="Substituted out"><i class="fa fa-arrow-right"></i> ${subOut.minute}'</span>`
    }
    if (subIn) {
      subIndicator = ` <span class="sub-in" title="Substituted in"><i class="fa fa-arrow-left"></i> ${subIn.minute}'</span>`
    }
    return `
      <tr>
        <td>${p.in_game_position ? renderPositionBadge(p.in_game_position) : '<small class="text-muted">-</small>'}</td>
        <td>${p.name}${subIndicator}</td>
        <td class="text-end">${originalLevel}</td>
        <td class="text-end ${levelDiffClass}">${inGameLevel}</td>
        <td class="text-end ${freshnessColor}">${freshnessPct}%</td>
      </tr>
    `
  }).join('')

  return renderCollapsibleCard({
    title: teamName,
    icon: 'fa-users',
    bodyClass: 'card-body p-0',
    body: `
        <div class="horizontal-scrollable-table">
        <table class="table table-sm mb-0 wide-on-mobile">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Name</th>
              <th class="text-end">Lvl</th>
              <th class="text-end">IG</th>
              <th class="text-end">Fit</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        </div>
    `
  })
}

/**
 * Render the Match Events card — the same timeline the animated match ticker
 * plays, only printed at once and oldest first (#539). Both go through
 * `lib/tickerEvents.js`, so a game shows the same events wherever it is opened.
 *
 * Games from before minute tracking have no usable timeline (every event would
 * claim minute 0), so they fall back to their goals and cards alone, shown
 * without a minute.
 *
 * @param {object} details - parsed game details
 * @param {Record<number, object>} players
 * @returns {string}
 */
function renderEventTicker (details, players) {
  const log = details.log || []
  const events = logHasMinutes(log)
    ? buildTickerEvents(log, details)
    : log.filter(l => l.goal || l.yellowCard || l.redCard)

  if (events.length === 0) return ''

  const rows = events.map(event => {
    const { className, html } = buildTickerRow(event, players)
    return `<div class="${className}">${html}</div>`
  }).join('')

  return renderCollapsibleCard({
    title: 'Match Events',
    icon: 'fa-clock-o',
    body: `<div class="spiel-ticker__feed spiel-ticker__feed--static">${rows}</div>`
  })
}

/**
 * Render the stadium attendance card.
 *
 * The fill rate is measured against the seats that were actually on sale, not
 * against every seat the stadium owns: a stand under construction is closed and
 * booked with 0 guests, so counting its seats would report a well-filled
 * stadium as half empty for the whole build. This matches the capacity the game
 * engine uses for the home bonus.
 *
 * @param {number} guests
 * @param {number} openCapacity - Seats on sale (`operationalCapacity`).
 * @param {number} totalCapacity - All seats, for the "of X seats" hint.
 * @param {number} totalEarnings
 * @returns {string}
 */
function renderStadiumCard (guests, openCapacity, totalCapacity, totalEarnings) {
  const closedSeats = Math.max(0, totalCapacity - openCapacity)
  return renderCollapsibleCard({
    title: 'Stadium',
    icon: 'fa-ticket',
    cardClass: '',
    body: `
      <div class="row text-center">
        <div class="col-4">
          <div class="fs-4 fw-bold">${guests.toLocaleString()}</div>
          <div class="text-muted small">Guests</div>
        </div>
        <div class="col-4">
          <div class="fs-4 fw-bold">${openCapacity ? Math.round(guests / openCapacity * 100) : '-'}%</div>
          <div class="text-muted small">Capacity</div>
          ${closedSeats > 0
    ? `<div class="text-muted small" title="${closedSeats.toLocaleString()} seats were closed for construction">of ${openCapacity.toLocaleString()} open seats</div>`
    : ''}
        </div>
        <div class="col-4">
          <div class="fs-4 fw-bold">${totalEarnings.toLocaleString()} &euro;</div>
          <div class="text-muted small">Ticket Earnings</div>
        </div>
      </div>
    `
  })
}

/**
 * Build the intro sentence of the game details modal.
 * Mentions the game day, the season and the real-world kick-off date/time so a
 * result can be placed in time without leaving the modal. Season and kick-off
 * are both optional — older/partial game rows fall back to shorter variants.
 * @param {Object} game - Game result (gameDay, season, created_at)
 * @param {Object} team1 - Home team
 * @param {number} guests - Number of spectators
 * @returns {string}
 */
export function renderGameIntro (game, team1, guests) {
  const kickOff = game.created_at ? new Date(game.created_at) : null
  const hasKickOff = kickOff && !Number.isNaN(kickOff.getTime())
  const when = hasKickOff
    ? t('gameDetails.introWhen', {
      date: formatDate('DD.MM.YYYY', kickOff),
      time: formatDate('hh:mm', kickOff)
    })
    : ''
  return t(game.season == null ? 'gameDetails.introWithoutSeason' : 'gameDetails.intro', {
    gameDay: game.gameDay + 1,
    season: game.season,
    when,
    homeTeam: team1.name,
    guests: guests.toLocaleString()
  })
}

/**
 * Game details partial that renders the match statistics table,
 * event ticker, squad lists, and stadium info.
 */
export class GameDetails extends UIElement {
  /**
   * @param {Object} params
   * @param {Object} params.game - Game result data
   * @param {Object} params.team1 - Team 1 object
   * @param {Object} params.team2 - Team 2 object
   * @param {Object} params.details - Parsed game details
   * @param {Object} params.players - Map of player id to player object
   * @param {Array} params.playersTeam1 - Team 1 players
   * @param {Array} params.playersTeam2 - Team 2 players
   * @param {Object} params.stadium - Stadium data
   */
  constructor (params) {
    super(params)
    /** @type {GameReport|null} */
    this._gameReport = null
  }

  get template () {
    const {
      game,
      team1,
      team2,
      details,
      players,
      playersTeam1,
      playersTeam2,
      stadium
    } = this

    const sd = details.stadiumDetails || {}
    const guests = (sd.northGuests || 0) + (sd.southGuests || 0) + (sd.eastGuests || 0) + (sd.westGuests || 0) +
      (sd.corner_neGuests || 0) + (sd.corner_nwGuests || 0) + (sd.corner_seGuests || 0) + (sd.corner_swGuests || 0)
    const totalEarnings = sd.totalEarnings ?? ((sd.northEarnings || 0) + (sd.southEarnings || 0) + (sd.eastEarnings || 0) + (sd.westEarnings || 0) +
      (sd.corner_neEarnings || 0) + (sd.corner_nwEarnings || 0) + (sd.corner_seEarnings || 0) + (sd.corner_swEarnings || 0))
    const totalCapacity = sd.totalCapacity || (stadium
      ? (stadium.north_stand_size || 0) + (stadium.south_stand_size || 0) + (stadium.east_stand_size || 0) + (stadium.west_stand_size || 0) +
        (stadium.corner_ne_stand_size || 0) + (stadium.corner_nw_stand_size || 0) + (stadium.corner_se_stand_size || 0) + (stadium.corner_sw_stand_size || 0)
      : 0)
    // Games from before the closed-stand fix have no `operationalCapacity`; for
    // them the total is the best available denominator.
    const openCapacity = sd.operationalCapacity ?? totalCapacity

    let ballControllA = 0
    let ballControllB = 0
    const goalsChancesA = details.log.filter(l => l.keeperHolds && playersTeam1.some(p => l.player === p.id)).length + game.goalsTeam1
    const goalsChancesB = details.log.filter(l => l.keeperHolds && playersTeam2.some(p => l.player === p.id)).length + game.goalsTeam2
    details.log.filter(l => typeof l.lostBall === 'boolean').forEach(l => {
      try {
        if (l.lostBall && players[l.player]?.team1) {
          ballControllB++
        } else if (l.lostBall && !players[l.player]?.team1) {
          ballControllA++
        } else if (!l.lostBall && players[l.player]?.team1) {
          ballControllA++
        } else if (!l.lostBall && !players[l.player]?.team1) {
          ballControllB++
        }
      } catch (e) {
        console.error('Error on game details: ', e)
      }
    })

    const detailPlayersA = (details.playerTeamA || []).filter(p => p.in_game_position)
    const detailPlayersB = (details.playerTeamB || []).filter(p => p.in_game_position)
    const freshnessTeamA = detailPlayersA.length ? Math.floor(100 * detailPlayersA.reduce((sum, p) => sum + p.freshness, 0) / detailPlayersA.length) : 0
    const freshnessTeamB = detailPlayersB.length ? Math.floor(100 * detailPlayersB.reduce((sum, p) => sum + p.freshness, 0) / detailPlayersB.length) : 0
    const total = ballControllA + ballControllB

    const team1Emblem = renderEmblem(team1, 20)
    const team2Emblem = renderEmblem(team2, 20)

    const penaltyShootout = details.penaltyShootout
    const decidedByLabel = penaltyShootout
      ? ' <small class="text-warning">(i.E.)</small>'
      : (details.extraTime ? ' <small class="text-warning">(n.V.)</small>' : '')

    const statsRows = [
      {
        label: `Goals${decidedByLabel}`,
        valA: game.goalsTeam1,
        valB: game.goalsTeam2
      },
      ...(penaltyShootout
        ? [{
          label: 'Penalties',
          valA: penaltyShootout.goalsTeamA,
          valB: penaltyShootout.goalsTeamB
        }]
        : []),
      {
        label: 'Control',
        valA: `${Math.floor(ballControllA / total * 100)}%`,
        valB: `${Math.ceil(ballControllB / total * 100)}%`
      },
      {
        label: 'Shots',
        valA: details.shotsTeamA || goalsChancesA,
        valB: details.shotsTeamB || goalsChancesB
      },
      {
        label: 'On Target',
        valA: goalsChancesA,
        valB: goalsChancesB
      },
      {
        label: 'Strength',
        valA: details.effectiveStrengthTeamA ?? details.strengthTeamA,
        valB: details.effectiveStrengthTeamB ?? details.strengthTeamB
      },
      {
        label: 'Freshness',
        valA: `${freshnessTeamA}%`,
        valB: `${freshnessTeamB}%`
      }
    ]

    return `
      <div>
        <p>${renderGameIntro(game, team1, guests)}</p>
        ${new GameAnimation(game, team1, team2)}
        <div class="horizontal-scrollable-table">
        <table class="table mb-4 wide-on-mobile game-details-table">
          <colgroup>
            <col style="width: 40%">
            <col style="width: 20%">
            <col style="width: 40%">
          </colgroup>
          <thead>
            <tr>
              <td class="text-end">
                <a href="#team?id=${team1.id}" class="text-info border-0">${team1Emblem} ${shortTeamName(team1.name)}</a>
              </td>
              <th class="text-center">Team</th>
              <td>
                <a href="#team?id=${team2.id}" class="text-info border-0">${shortTeamName(team2.name)} ${team2Emblem}</a>
              </td>
            </tr>
            ${statsRows.map(row => `
              <tr>
                <td class="text-end">${row.valA}</td>
                <th class="text-center">${row.label}</th>
                <td>${row.valB}</td>
              </tr>
            `).join('')}
          </thead>
        </table>
        </div>
        ${details.teamA?.motivating_speech_active ? `<div class="alert alert-info mb-3"><i class="fa fa-bullhorn me-2"></i><strong>${team1.name}</strong> used a motivating speech! (+10% strength)</div>` : ''}
        ${details.teamB?.motivating_speech_active ? `<div class="alert alert-info mb-3"><i class="fa fa-bullhorn me-2"></i><strong>${team2.name}</strong> used a motivating speech! (+10% strength)</div>` : ''}
        ${this._reportElement}
        ${renderEventTicker(details, players)}
        ${renderSquadList(details.playerTeamA, team1.name, (details.substitutions || []).filter(s => s.teamIndex === 0))}
        ${renderSquadList(details.playerTeamB, team2.name, (details.substitutions || []).filter(s => s.teamIndex === 1))}

        ${renderStadiumCard(guests, openCapacity, totalCapacity, totalEarnings)}

        <p class="text-muted small mt-3 mb-0"><strong>IG</strong> (In-Game Level) is the effective strength of a player during the match. It is based on the base level and influenced by freshness, captain choice, star player status and motivating speeches.</p>
      </div>
    `
  }
  /**
   * The match report card brings its own toggle handler (it re-renders itself
   * when a report is generated), so only the cards this element owns are
   * wired up here.
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '.collapsible-card:not(.game-report) > .collapsible-card-toggle': {
        click: (event) => toggleCollapsibleCard(event)
      }
    }
  }
  /**
   * Fill in the player portraits of the Match Events rows. Rendering a player
   * SVG is async, so it cannot happen inside the template.
   * @returns {void}
   */
  onMounted () {
    const root = document.querySelector(this._elementQuery)
    void fillTickerPortraits(root, this.players, p => (p.team1 ? this.team1 : this.team2))
  }
  /**
   * The AI match report element, created once and reused. Recreating it on
   * every parent render would restart its placeholder/async render cycle and
   * make the card flicker.
   * @returns {GameReport}
   */
  get _reportElement () {
    if (!this._gameReport) {
      this._gameReport = new GameReport({ gameId: this.game.id })
    }
    return this._gameReport
  }
  
}
