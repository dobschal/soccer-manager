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
 * @param {object} [gameOverrides]
 * @returns {GameDetails}
 */
function createGameDetails (detailOverrides = {}, gameOverrides = {}) {
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
    game: { gameDay: 4, season: 4, created_at: '2026-08-18T14:05:00', goalsTeam1: 1, goalsTeam2: 0, ...gameOverrides },
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

describe('GameDetails intro sentence', () => {
  it('names game day, season and the real-world kick-off date and time', () => {
    const html = createGameDetails().template
    expect(html).toContain('game day #5 of season 4 on 18.08.2026 at 14:05')
  })

  it('leaves out the kick-off clause when the game has no timestamp', () => {
    const html = createGameDetails({}, { created_at: null }).template
    expect(html).toContain('game day #5 of season 4 and Home FC welcomes')
    expect(html).not.toContain('18.08.2026')
  })

  it('leaves out the season when the game has none', () => {
    const html = createGameDetails({}, { season: null }).template
    expect(html).toContain('game day #5 on 18.08.2026 at 14:05')
    expect(html).not.toContain('season')
  })
})

describe('GameDetails collapsible cards', () => {
  it('renders every card collapsed by default', () => {
    const html = createGameDetails().template
    const cards = html.match(/class="card collapsible-card [^"]*"/g) ?? []
    // Match Events, both squad lists and the stadium card.
    expect(cards).toHaveLength(4)
    expect(cards.every(c => c.includes('is-collapsed'))).toBe(true)
    expect(html).not.toContain('aria-expanded="true"')
  })

  it('keeps the match report out of its own toggle selector', () => {
    // The report card re-renders itself, so it wires up its own handler —
    // binding it here as well would toggle it twice per click.
    const selectors = Object.keys(createGameDetails().events)
    expect(selectors).toEqual(['.collapsible-card:not(.game-report) > .collapsible-card-toggle'])
  })
})

describe('GameDetails stadium card', () => {
  it('measures the fill rate against the seats that were on sale', () => {
    // Half the stadium was a building site that day: 1.500 guests in the 3.000
    // seats that were open is 50%, not the 25% the total capacity suggests.
    const html = createGameDetails({
      stadiumDetails: {
        northGuests: 1500,
        totalCapacity: 6000,
        operationalCapacity: 3000,
        totalEarnings: 22500
      }
    }).template

    expect(html).toContain('>50%<')
    expect(html).not.toContain('>25%<')
    expect(html).toContain('of 3,000 open seats')
  })

  it('does not mention open seats when the whole stadium was open', () => {
    const html = createGameDetails({
      stadiumDetails: {
        northGuests: 1500,
        totalCapacity: 3000,
        operationalCapacity: 3000,
        totalEarnings: 22500
      }
    }).template

    expect(html).toContain('>50%<')
    expect(html).not.toContain('open seats')
  })

  it('falls back to the total capacity for games played before it was recorded', () => {
    const html = createGameDetails({
      stadiumDetails: { northGuests: 1500, totalCapacity: 3000, totalEarnings: 22500 }
    }).template

    expect(html).toContain('>50%<')
    expect(html).not.toContain('open seats')
  })

  it('shows a dash instead of dividing by zero without a stadium', () => {
    const html = createGameDetails({ stadiumDetails: {} }).template
    expect(html).toContain('>-%<')
  })
})
