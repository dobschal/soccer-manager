import { describe, it, expect, vi } from 'vitest'

vi.mock('../../partials/playerImage.js', () => ({
  renderPlayerImage: vi.fn(async (player) => `<svg data-player="${player.id}"></svg>`)
}))

import { renderPlayerImage } from '../../partials/playerImage.js'
import { buildTickerRow, fillTickerPortraits } from '../../lib/tickerEvents.js'

const players = {
  1: { id: 1, name: 'Home Hero', team1: true, hair_color: 0, skin_color: 0 },
  2: { id: 2, name: 'Away Ace', team2: true, hair_color: 0, skin_color: 0 }
}

describe('buildTickerRow (#539)', () => {
  it('marks a goal by the home side', () => {
    const row = buildTickerRow({ goal: true, player: 1, minute: 23 }, players)
    expect(row.type).toBe('goal')
    expect(row.isBreak).toBe(false)
    expect(row.className).toContain('spiel-ticker__event--goal')
    expect(row.className).toContain('spiel-ticker__event--home')
    expect(row.html).toContain("23'")
    expect(row.html).toContain('Home Hero')
    expect(row.html).toContain('Goal!')
  })

  it('puts an event of the away side on the other flank', () => {
    const row = buildTickerRow({ goal: true, player: 2, minute: 5 }, players)
    expect(row.className).toContain('spiel-ticker__event--away')
  })

  it('names the injury and how long the player is out', () => {
    const row = buildTickerRow(
      { injury: true, player: 1, injuryType: 'muscle_strain', injuryDays: 2, minute: 61 },
      players
    )
    expect(row.type).toBe('injury')
    expect(row.html).toContain('fa-medkit')
    expect(row.html).toContain('Home Hero')
    expect(row.html).toContain('2')
  })

  it('says who a substitute came on for', () => {
    const row = buildTickerRow(
      { substitution: true, player: 1, playerOut: 2, playerOutName: 'Away Ace', minute: 70 },
      players
    )
    expect(row.html).toContain('comes on for Away Ace')
  })

  it('credits a recovery to the player who won the ball', () => {
    const row = buildTickerRow({ recovery: true, player: 2, oponentPlayer: 1, minute: 30 }, players)
    expect(row.playerId).toBe(1)
    expect(row.html).toContain('Won the ball off Away Ace')
  })

  it('renders a break without a player or a minute', () => {
    const row = buildTickerRow({ halfTime: true, minute: 45 }, players)
    expect(row.isBreak).toBe(true)
    expect(row.className).toContain('spiel-ticker__event--break')
    expect(row.html).toContain('Half time')
    expect(row.html).not.toContain('spiel-ticker__minute')
  })

  it('shows a dash instead of a made-up minute for pre-minute-tracking games', () => {
    const row = buildTickerRow({ yellowCard: true, player: 1 }, players)
    expect(row.html).toContain('<span class="spiel-ticker__minute">-</span>')
  })

  it('falls back to the stored name when the player is not in the squad list', () => {
    const row = buildTickerRow({ injury: true, player: 99, playerName: 'Loanee', minute: 12 }, players)
    expect(row.html).toContain('Loanee')
  })
})

describe('fillTickerPortraits (#539)', () => {
  /**
   * @param {object} event
   * @returns {HTMLElement}
   */
  function renderRow (event) {
    const row = document.createElement('div')
    const built = buildTickerRow(event, players)
    row.className = built.className
    row.innerHTML = built.html
    return row
  }

  it('fills the portrait slot of a known player', async () => {
    const row = renderRow({ goal: true, player: 1, minute: 10 })
    await fillTickerPortraits(row, players, () => ({ color: '#ff0000' }))
    expect(row.querySelector('.spiel-ticker__portrait').innerHTML).toContain('data-player="1"')
    expect(renderPlayerImage).toHaveBeenCalledWith(players[1], { color: '#ff0000' }, 22)
  })

  it('leaves the slot empty for an unknown player', async () => {
    const row = renderRow({ injury: true, player: 99, playerName: 'Loanee', minute: 12 })
    await fillTickerPortraits(row, players)
    expect(row.querySelector('.spiel-ticker__portrait').innerHTML).toBe('')
  })

  it('does nothing without a root node', async () => {
    await expect(fillTickerPortraits(null, players)).resolves.toBeUndefined()
  })
})
