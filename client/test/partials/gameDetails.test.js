import { describe, it, expect, vi } from 'vitest'

vi.mock('../../partials/gameAnimation.js', () => ({ GameAnimation: class { toString () { return '<div></div>' } } }))
vi.mock('../../partials/playerImage.js', () => ({ renderPlayerImage: vi.fn(async () => '<svg></svg>') }))

import { GameDetails } from '../../partials/gameDetails.js'
import { buildTickerEvents } from '../../lib/tickerEvents.js'

const team1 = { id: 1, name: 'Home FC', color: '#ff0000' }
const team2 = { id: 2, name: 'Away FC', color: '#0000ff' }

const players = {
  1: { id: 1, name: 'Home Hero', team1: true, in_game_position: 'CA', level: 50, freshness: 1, hair_color: 0, skin_color: 0 },
  2: { id: 2, name: 'Away Ace', team2: true, in_game_position: 'CD', level: 50, freshness: 1, hair_color: 0, skin_color: 0 },
  3: { id: 3, name: 'Sub Boy', team1: true, in_game_position: 'CA', level: 40, freshness: 1, hair_color: 0, skin_color: 0 }
}

/**
 * @param {object} [detailOverrides]
 * @returns {GameDetails}
 */
function createGameDetails (detailOverrides = {}) {
  const details = {
    log: [
      { minute: 12, goal: true, player: 1 },
      { minute: 55, yellowCard: true, player: 2 },
      { minute: 70, keeperHolds: true, player: 1 }
    ],
    injuries: [{ playerId: 1, playerName: 'Home Hero', teamIndex: 0, injuryType: 'bruise', injuryDays: 1, minute: 61 }],
    substitutions: [{ playerInId: 3, playerInName: 'Sub Boy', playerOutId: 1, playerOutName: 'Home Hero', teamIndex: 0, reason: 'injury', minute: 62 }],
    playerTeamA: [players[1]],
    playerTeamB: [players[2]],
    stadiumDetails: {},
    ...detailOverrides
  }
  return new GameDetails({
    game: { gameDay: 4, goalsTeam1: 1, goalsTeam2: 0 },
    team1,
    team2,
    details,
    players,
    playersTeam1: [players[1]],
    playersTeam2: [players[2]],
    stadium: null
  })
}

describe('GameDetails match events (#539)', () => {
  it('shows every event the match ticker shows', () => {
    const gameDetails = createGameDetails()
    const html = gameDetails.template
    const events = buildTickerEvents(gameDetails.details.log, gameDetails.details)

    expect(html).toContain('Match Events')
    // One row per ticker event — the two surfaces must not drift apart.
    expect(html.match(/class="spiel-ticker__event /g) ?? []).toHaveLength(events.length)
    // Injuries and substitutions used to be missing here entirely.
    expect(html).toContain('fa-medkit')
    expect(html).toContain('comes on for Home Hero')
    expect(html).toContain('Kick-off')
    expect(html).toContain('Half time')
    expect(html).toContain('Chance')
  })

  it('renders the events oldest first', () => {
    const html = createGameDetails().template
    const minutes = [...html.matchAll(/spiel-ticker__minute">(\d+)'/g)].map(m => Number(m[1]))
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b))
  })

  it('falls back to goals and cards for games played before minute tracking', () => {
    const html = createGameDetails({
      log: [{ goal: true, player: 1 }, { yellowCard: true, player: 2 }, { keeperHolds: true, player: 1 }],
      injuries: [],
      substitutions: []
    }).template
    expect(html.match(/class="spiel-ticker__event /g) ?? []).toHaveLength(2)
    expect(html).toContain('<span class="spiel-ticker__minute">-</span>')
  })

  it('leaves out the card when nothing notable happened', () => {
    const html = createGameDetails({ log: [], injuries: [], substitutions: [] }).template
    expect(html).not.toContain('Match Events')
  })
})
