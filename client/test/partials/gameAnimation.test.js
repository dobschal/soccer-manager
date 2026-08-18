import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

vi.mock('../../partials/playerImage.js', () => ({
  renderPlayerImage: vi.fn(() => Promise.resolve(''))
}))

vi.mock('../../lib/html.js', () => ({
  el: vi.fn(),
  generateId: vi.fn().mockReturnValue('test-id')
}))

vi.mock('../../lib/delay.js', () => ({
  delay: vi.fn(() => Promise.resolve())
}))

import { GameAnimation, playerSizeForWidth } from '../../partials/gameAnimation.js'

describe('GameAnimation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders only starters in the formation, not substituted-in players', () => {
    const team1 = testData.team({ id: 1, name: 'Home FC' })
    const team2 = testData.team({ id: 2, name: 'Away FC' })

    const starterA = testData.player({ id: 11, name: 'Hans Starter', position: 'CM', in_game_position: 'CM', enterMinute: 0 })
    const subA = testData.player({ id: 12, name: 'Peter Sub', position: 'CA', in_game_position: 'CA', enterMinute: 65 })
    const starterB = testData.player({ id: 21, name: 'Otto Starter', position: 'GK', in_game_position: 'GK', enterMinute: 0 })
    const subB = testData.player({ id: 22, name: 'Karl Sub', position: 'LD', in_game_position: 'LD', enterMinute: 70 })

    const game = testData.gameResult({
      details: JSON.stringify({
        playerTeamA: [starterA, subA],
        playerTeamB: [starterB, subB],
        log: []
      })
    })

    const animation = new GameAnimation(game, team1, team2)
    const html = animation.template

    expect(html).toContain('Starter')
    expect(html).not.toContain('Sub')
    expect(animation.startersTeamA).toHaveLength(1)
    expect(animation.startersTeamA[0].id).toBe(11)
    expect(animation.startersTeamB).toHaveLength(1)
    expect(animation.startersTeamB[0].id).toBe(21)
  })

  it('treats players without enterMinute as starters (back-compat for older game data)', () => {
    const team1 = testData.team({ id: 1 })
    const team2 = testData.team({ id: 2 })

    const legacyStarter = testData.player({ id: 11, name: 'Hans Legacy', position: 'CM', in_game_position: 'CM' })

    const game = testData.gameResult({
      details: JSON.stringify({
        playerTeamA: [legacyStarter],
        playerTeamB: [],
        log: []
      })
    })

    const animation = new GameAnimation(game, team1, team2)
    expect(animation.startersTeamA).toHaveLength(1)
    expect(animation.template).toContain('Legacy')
  })

  describe('playerSizeForWidth', () => {
    it('scales the player size with the screen width', () => {
      expect(playerSizeForWidth(600)).toBe(51)
      expect(playerSizeForWidth(700)).toBe(60)
    })

    it('clamps to a readable minimum on narrow phones', () => {
      expect(playerSizeForWidth(320)).toBe(34)
      expect(playerSizeForWidth(0)).toBe(34)
      expect(playerSizeForWidth(undefined)).toBe(34)
    })

    it('keeps the size stable up to 900px', () => {
      expect(playerSizeForWidth(800)).toBe(60)
      expect(playerSizeForWidth(900)).toBe(60)
    })

    it('grows the players further on desktop screens', () => {
      expect(playerSizeForWidth(1000)).toBe(66)
      expect(playerSizeForWidth(1100)).toBe(72)
    })

    it('caps the size once the modal stops growing', () => {
      expect(playerSizeForWidth(1440)).toBe(72)
      expect(playerSizeForWidth(3000)).toBe(72)
    })
  })

  it('renders the player images at the size calculated from the screen width', async () => {
    const { renderPlayerImage } = await import('../../partials/playerImage.js')
    const team1 = testData.team({ id: 1 })
    const team2 = testData.team({ id: 2 })
    const player = testData.player({ id: 11, name: 'Hans Starter', position: 'CM', in_game_position: 'CM', enterMinute: 0 })
    const game = testData.gameResult({
      details: JSON.stringify({ playerTeamA: [player], playerTeamB: [], log: [] })
    })

    window.innerWidth = 400
    const animation = new GameAnimation(game, team1, team2)
    animation._applyPlayerSize()
    animation._loadPlayerImages()

    expect(animation._playerSize).toBe(34)
    expect(renderPlayerImage).toHaveBeenCalledWith(player, team1, 34)
  })
})
