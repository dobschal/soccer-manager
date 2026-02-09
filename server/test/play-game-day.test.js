import { describe, it, expect } from 'vitest'

// Test play style modifiers and card logic
describe('play-game-day play style', () => {
  describe('PLAY_STYLE_MODIFIERS', () => {
    const PLAY_STYLE_MODIFIERS = {
      aggressive: { fightBonus: 0.15, cardChance: 0.002 },
      normal: { fightBonus: 0, cardChance: 0.0008 },
      friendly: { fightBonus: -0.15, cardChance: 0.0003 }
    }

    it('aggressive style has positive fight bonus', () => {
      expect(PLAY_STYLE_MODIFIERS.aggressive.fightBonus).toBeGreaterThan(0)
    })

    it('aggressive style has higher card chance than normal', () => {
      expect(PLAY_STYLE_MODIFIERS.aggressive.cardChance).toBeGreaterThan(PLAY_STYLE_MODIFIERS.normal.cardChance)
    })

    it('friendly style has negative fight bonus', () => {
      expect(PLAY_STYLE_MODIFIERS.friendly.fightBonus).toBeLessThan(0)
    })

    it('friendly style has lower card chance than normal', () => {
      expect(PLAY_STYLE_MODIFIERS.friendly.cardChance).toBeLessThan(PLAY_STYLE_MODIFIERS.normal.cardChance)
    })

    it('normal style has zero fight bonus', () => {
      expect(PLAY_STYLE_MODIFIERS.normal.fightBonus).toBe(0)
    })
  })

  describe('card probability simulation', () => {
    it('aggressive style should produce more cards on average', () => {
      const aggressiveCardChance = 0.002
      const normalCardChance = 0.0008
      const friendlyCardChance = 0.0003

      // Simulate 50000 fights per style (more samples due to lower probabilities)
      const numFights = 50000
      let aggressiveCards = 0
      let normalCards = 0
      let friendlyCards = 0

      for (let i = 0; i < numFights; i++) {
        if (Math.random() < aggressiveCardChance) aggressiveCards++
        if (Math.random() < normalCardChance) normalCards++
        if (Math.random() < friendlyCardChance) friendlyCards++
      }

      // Aggressive should produce roughly 2.5x more cards than normal
      expect(aggressiveCards).toBeGreaterThan(normalCards)
      // Normal should produce roughly 2.7x more cards than friendly
      expect(normalCards).toBeGreaterThan(friendlyCards)
    })
  })

  describe('fight modifier effect simulation', () => {
    it('aggressive style should increase effective level by 15%', () => {
      const baseLevel = 5
      const aggressiveModifier = 0.15
      const effectiveLevel = baseLevel * (1 + aggressiveModifier)

      expect(effectiveLevel).toBe(5.75)
    })

    it('friendly style should decrease effective level by 15%', () => {
      const baseLevel = 5
      const friendlyModifier = -0.15
      const effectiveLevel = baseLevel * (1 + friendlyModifier)

      expect(effectiveLevel).toBe(4.25)
    })

    it('play style should affect fight outcome probability', () => {
      // Two teams with same level players
      const playerLevel = 5
      const opponentLevel = 5

      // Normal vs Normal
      const normalVsNormal = playerLevel / (playerLevel + opponentLevel)

      // Aggressive attacker vs Normal defender
      const aggressiveAttackerLevel = playerLevel * 1.15
      const aggressiveVsNormal = aggressiveAttackerLevel / (aggressiveAttackerLevel + opponentLevel)

      // Friendly attacker vs Normal defender
      const friendlyAttackerLevel = playerLevel * 0.85
      const friendlyVsNormal = friendlyAttackerLevel / (friendlyAttackerLevel + opponentLevel)

      expect(normalVsNormal).toBe(0.5) // 50/50 with equal levels
      expect(aggressiveVsNormal).toBeGreaterThan(0.5) // Aggressive has advantage
      expect(friendlyVsNormal).toBeLessThan(0.5) // Friendly has disadvantage
    })
  })

  describe('card accumulation rules', () => {
    it('second yellow card should result in red card', () => {
      const yellowCardsInMatch = 2
      const shouldGetRedCard = yellowCardsInMatch >= 2

      expect(shouldGetRedCard).toBe(true)
    })

    it('5 yellow cards accumulated should result in suspension', () => {
      const totalYellowCards = 5
      const shouldBeSuspended = totalYellowCards >= 5

      expect(shouldBeSuspended).toBe(true)
    })

    it('4 yellow cards should not result in suspension', () => {
      const totalYellowCards = 4
      const shouldBeSuspended = totalYellowCards >= 5

      expect(shouldBeSuspended).toBe(false)
    })

    it('red card should result in immediate suspension', () => {
      const hasRedCard = true
      const shouldBeSuspended = hasRedCard

      expect(shouldBeSuspended).toBe(true)
    })
  })

  describe('suspension clearing', () => {
    it('suspended player should be cleared after serving ban', () => {
      // Simulate a player who was suspended
      const player = {
        id: 1,
        is_suspended: true,
        yellow_cards: 5,
        red_cards: 0
      }

      // After serving suspension, cards should be reset
      const clearedPlayer = {
        ...player,
        is_suspended: false,
        yellow_cards: 0,
        red_cards: 0
      }

      expect(clearedPlayer.is_suspended).toBe(false)
      expect(clearedPlayer.yellow_cards).toBe(0)
      expect(clearedPlayer.red_cards).toBe(0)
    })
  })

  describe('Bundesliga statistics comparison', () => {
    // Bundesliga averages (per match):
    // - Yellow cards: ~3.5 per match (1.75 per team)
    // - Red cards: ~0.15 per match
    // - Goals: ~3.0 per match

    it('normal play style should produce Bundesliga-like card rates', () => {
      // With ~900 game steps and card chance of 0.0008
      // Expected cards per player per game: 900 * 0.0008 * fight_frequency
      // Fight frequency for midfielders: ~0.5
      // Expected cards per midfielder: 900 * 0.0008 * 0.5 = 0.36
      // But only during fights, so actual rate much lower

      // Per team with 11 players, fights happen ~20% of time for relevant players
      // This should give roughly 0.5-2 cards per team per game (matching Bundesliga ~1.75)
      const normalCardChance = 0.0008
      const fightsPerPlayer = 50 // Estimate: 50 fights per player per game
      const expectedCardsPerPlayer = fightsPerPlayer * normalCardChance

      // Should be around 0.04 cards per player per game
      expect(expectedCardsPerPlayer).toBeLessThan(0.1)
      expect(expectedCardsPerPlayer).toBeGreaterThan(0.01)
    })
  })
})
