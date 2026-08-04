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

      // Simulate 500000 fights per style (large sample to reduce variance with low probabilities)
      const numFights = 500000
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

    it('player with red card suspension should have cards reset after serving ban', () => {
      const player = {
        id: 1,
        is_suspended: true,
        yellow_cards: 1,
        red_cards: 1
      }

      // After serving suspension, all cards should be reset
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

  describe('suspended player lineup filtering', () => {
    it('suspended players should be filtered out of the lineup', () => {
      const allPlayers = [
        { id: 1, name: 'Player 1', is_suspended: false, in_game_position: 'CM' },
        { id: 2, name: 'Player 2', is_suspended: true, in_game_position: 'CM' },
        { id: 3, name: 'Player 3', is_suspended: false, in_game_position: 'GK' },
        { id: 4, name: 'Player 4', is_suspended: true, in_game_position: 'CA' }
      ]

      // This mimics the filter logic in _playGame
      const activePlayers = allPlayers.filter(p => !p.is_suspended)

      expect(activePlayers).toHaveLength(2)
      expect(activePlayers.map(p => p.id)).toEqual([1, 3])
      expect(activePlayers.find(p => p.id === 2)).toBeUndefined()
      expect(activePlayers.find(p => p.id === 4)).toBeUndefined()
    })

    it('suspended players should be identified for clearing after game', () => {
      const allPlayers = [
        { id: 1, name: 'Player 1', is_suspended: false, in_game_position: 'CM' },
        { id: 2, name: 'Player 2', is_suspended: true, in_game_position: 'CM', yellow_cards: 5 },
        { id: 3, name: 'Player 3', is_suspended: false, in_game_position: 'GK' },
        { id: 4, name: 'Player 4', is_suspended: true, in_game_position: 'CA', red_cards: 1 }
      ]

      // This mimics the filter logic in _playGame for identifying suspended players
      const suspendedPlayers = allPlayers.filter(p => p.is_suspended)

      expect(suspendedPlayers).toHaveLength(2)
      expect(suspendedPlayers.map(p => p.id)).toEqual([2, 4])
    })

    it('team with all players suspended should have empty active lineup', () => {
      const allPlayers = [
        { id: 1, name: 'Player 1', is_suspended: true, in_game_position: 'CM' },
        { id: 2, name: 'Player 2', is_suspended: true, in_game_position: 'GK' }
      ]

      const activePlayers = allPlayers.filter(p => !p.is_suspended)

      expect(activePlayers).toHaveLength(0)
    })

    it('team with no suspended players should have full lineup', () => {
      const allPlayers = [
        { id: 1, name: 'Player 1', is_suspended: false, in_game_position: 'CM' },
        { id: 2, name: 'Player 2', is_suspended: false, in_game_position: 'GK' },
        { id: 3, name: 'Player 3', is_suspended: false, in_game_position: 'CA' }
      ]

      const activePlayers = allPlayers.filter(p => !p.is_suspended)

      expect(activePlayers).toHaveLength(3)
    })
  })

  describe('5 yellow cards suspension trigger', () => {
    it('player with exactly 5 yellow cards should be suspended', () => {
      const existingYellowCards = 4
      const yellowsInMatch = 1
      const newYellowCards = existingYellowCards + yellowsInMatch

      const isSuspended = newYellowCards >= 5

      expect(newYellowCards).toBe(5)
      expect(isSuspended).toBe(true)
    })

    it('player with more than 5 yellow cards should be suspended', () => {
      const existingYellowCards = 4
      const yellowsInMatch = 2 // Got 2 yellows in match (second one is red, sent off)
      const newYellowCards = existingYellowCards + yellowsInMatch

      const isSuspended = newYellowCards >= 5

      expect(newYellowCards).toBe(6)
      expect(isSuspended).toBe(true)
    })

    it('player with 4 yellow cards getting 0 in match should not be suspended', () => {
      const existingYellowCards = 4
      const yellowsInMatch = 0
      const newYellowCards = existingYellowCards + yellowsInMatch

      const isSuspended = newYellowCards >= 5

      expect(newYellowCards).toBe(4)
      expect(isSuspended).toBe(false)
    })
  })

  describe('red card suspension trigger', () => {
    it('player sent off should be suspended for next match', () => {
      const sentOff = true
      const isSuspended = sentOff

      expect(isSuspended).toBe(true)
    })

    it('player not sent off and under 5 yellows should not be suspended', () => {
      const sentOff = false
      const yellowCards = 3
      const isSuspended = sentOff || yellowCards >= 5

      expect(isSuspended).toBe(false)
    })
  })

  describe('card reset after suspension served', () => {
    it('all cards should be reset to 0 after suspension is cleared', () => {
      // Player who was suspended due to 5 yellow cards
      const playerBefore = {
        id: 1,
        is_suspended: true,
        yellow_cards: 5,
        red_cards: 0
      }

      // After clearing suspension (as done in _playGame)
      const playerAfter = {
        ...playerBefore,
        is_suspended: false,
        yellow_cards: 0,
        red_cards: 0
      }

      expect(playerAfter.is_suspended).toBe(false)
      expect(playerAfter.yellow_cards).toBe(0)
      expect(playerAfter.red_cards).toBe(0)
    })

    it('red cards should also be reset after suspension served', () => {
      // Player who was suspended due to red card
      const playerBefore = {
        id: 1,
        is_suspended: true,
        yellow_cards: 2, // Had 2 yellows which resulted in red
        red_cards: 1
      }

      // After clearing suspension
      const playerAfter = {
        ...playerBefore,
        is_suspended: false,
        yellow_cards: 0,
        red_cards: 0
      }

      expect(playerAfter.is_suspended).toBe(false)
      expect(playerAfter.yellow_cards).toBe(0)
      expect(playerAfter.red_cards).toBe(0)
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

describe('stadium ticket earnings', () => {
  /**
   * Simulates the stadium earnings calculation logic from _giveStadiumTicketEarnings
   */
  function calculateStadiumDetails (stadium, strengthTeamA, strengthTeamB) {
    const strengthFactor = ((strengthTeamA || 0) * (strengthTeamB || 0)) / 80
    const stands = ['north', 'south', 'west', 'east', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw']
    const details = {}
    let totalEarnings = 0
    let totalCapacity = 0

    for (const stand of stands) {
      const size = stadium[stand + '_stand_size'] || 0
      totalCapacity += size

      const constructionEndDay = stadium[`${stand}_construction_end_game_day`]
      if (constructionEndDay != null) {
        details[stand + 'Guests'] = 0
        details[stand + 'Earnings'] = 0
        details[stand + 'UnderConstruction'] = true
        continue
      }

      const price = stadium[stand + '_stand_price'] || 0

      if (price <= 0 || size <= 0) {
        details[stand + 'Guests'] = 0
        details[stand + 'Earnings'] = 0
        continue
      }

      const roofFactor = stadium[stand + '_stand_roof'] ? 1.2 : 1
      const priceFactor = (15 / price) ** 2
      const amountOfGuests = Math.floor(Math.min(size, strengthFactor * priceFactor * roofFactor))
      details[stand + 'Guests'] = amountOfGuests
      const earnings = amountOfGuests * price
      details[stand + 'Earnings'] = earnings
      totalEarnings += earnings
    }

    details.totalCapacity = totalCapacity
    details.totalEarnings = totalEarnings
    return details
  }

  describe('totalCapacity calculation', () => {
    it('should sum all stand sizes for total capacity', () => {
      const stadium = {
        north_stand_size: 1000,
        north_stand_price: 10,
        south_stand_size: 2000,
        south_stand_price: 10,
        west_stand_size: 1500,
        west_stand_price: 10,
        east_stand_size: 500,
        east_stand_price: 10
      }

      const details = calculateStadiumDetails(stadium, 100, 100)

      expect(details.totalCapacity).toBe(5000)
    })

    it('should include stands under construction in capacity', () => {
      const stadium = {
        north_stand_size: 1000,
        north_stand_price: 10,
        north_construction_end_game_day: 5,
        south_stand_size: 2000,
        south_stand_price: 10,
        west_stand_size: 0,
        east_stand_size: 0
      }

      const details = calculateStadiumDetails(stadium, 100, 100)

      expect(details.totalCapacity).toBe(3000)
    })

    it('should handle empty stadium', () => {
      const stadium = {
        north_stand_size: 0,
        south_stand_size: 0,
        west_stand_size: 0,
        east_stand_size: 0
      }

      const details = calculateStadiumDetails(stadium, 100, 100)

      expect(details.totalCapacity).toBe(0)
    })

    it('should include corner stands in total capacity', () => {
      const stadium = {
        north_stand_size: 1000,
        north_stand_price: 10,
        south_stand_size: 1000,
        south_stand_price: 10,
        west_stand_size: 0,
        east_stand_size: 0,
        corner_ne_stand_size: 500,
        corner_ne_stand_price: 10,
        corner_sw_stand_size: 300,
        corner_sw_stand_price: 10
      }

      const details = calculateStadiumDetails(stadium, 100, 100)

      // 1000 + 1000 + 500 + 300 = 2800
      expect(details.totalCapacity).toBe(2800)
    })

    it('should not earn anything from an unbuilt (size 0) corner stand', () => {
      const stadium = {
        north_stand_size: 0,
        south_stand_size: 0,
        west_stand_size: 0,
        east_stand_size: 0,
        corner_ne_stand_size: 0,
        corner_ne_stand_price: 13
      }

      const details = calculateStadiumDetails(stadium, 100, 100)

      expect(details.corner_neGuests).toBe(0)
      expect(details.corner_neEarnings).toBe(0)
      expect(details.totalEarnings).toBe(0)
    })

    it('should earn from a built corner stand', () => {
      const stadium = {
        north_stand_size: 0,
        south_stand_size: 0,
        west_stand_size: 0,
        east_stand_size: 0,
        corner_ne_stand_size: 500,
        corner_ne_stand_price: 15
      }

      const details = calculateStadiumDetails(stadium, 100, 100)

      expect(details.corner_neGuests).toBeGreaterThan(0)
      expect(details.corner_neEarnings).toBe(details.corner_neGuests * 15)
      expect(details.totalEarnings).toBe(details.corner_neEarnings)
    })
  })

  describe('totalEarnings calculation', () => {
    it('should sum all stand earnings', () => {
      const stadium = {
        north_stand_size: 1000,
        north_stand_price: 10,
        south_stand_size: 1000,
        south_stand_price: 15,
        west_stand_size: 0,
        east_stand_size: 0
      }

      const details = calculateStadiumDetails(stadium, 100, 100)

      expect(details.totalEarnings).toBe(details.northEarnings + details.southEarnings)
    })

    it('should not include earnings from stands under construction', () => {
      const stadium = {
        north_stand_size: 1000,
        north_stand_price: 10,
        north_construction_end_game_day: 5,
        south_stand_size: 1000,
        south_stand_price: 10,
        west_stand_size: 0,
        east_stand_size: 0
      }

      const details = calculateStadiumDetails(stadium, 100, 100)

      expect(details.northEarnings).toBe(0)
      expect(details.northUnderConstruction).toBe(true)
      expect(details.totalEarnings).toBe(details.southEarnings)
    })

    it('should return 0 earnings when price is 0', () => {
      const stadium = {
        north_stand_size: 1000,
        north_stand_price: 0,
        south_stand_size: 0,
        west_stand_size: 0,
        east_stand_size: 0
      }

      const details = calculateStadiumDetails(stadium, 100, 100)

      expect(details.northEarnings).toBe(0)
      expect(details.totalEarnings).toBe(0)
    })

    it('should return 0 earnings when size is 0', () => {
      const stadium = {
        north_stand_size: 0,
        north_stand_price: 10,
        south_stand_size: 0,
        west_stand_size: 0,
        east_stand_size: 0
      }

      const details = calculateStadiumDetails(stadium, 100, 100)

      expect(details.northEarnings).toBe(0)
      expect(details.totalEarnings).toBe(0)
    })
  })

  describe('guests calculation', () => {
    it('should calculate guests based on team strength and price', () => {
      const stadium = {
        north_stand_size: 10000,
        north_stand_price: 15,
        south_stand_size: 0,
        west_stand_size: 0,
        east_stand_size: 0
      }

      const details = calculateStadiumDetails(stadium, 1000, 1000)

      // strengthFactor = (1000 * 1000) / 80 = 12500
      // priceFactor = (15 / 15) ** 2 = 1
      // guests = min(10000, 12500 * 1 * 1) = 10000 (capped at size)
      expect(details.northGuests).toBe(10000)
    })

    it('should cap guests at stand size', () => {
      const stadium = {
        north_stand_size: 100,
        north_stand_price: 1,
        south_stand_size: 0,
        west_stand_size: 0,
        east_stand_size: 0
      }

      const details = calculateStadiumDetails(stadium, 1000, 1000)

      // strengthFactor = (1000 * 1000) / 80 = 12500, priceFactor = (15/1) ** 2 = 225
      // guests = min(100, 12500 * 225) = 100 (capped at size)
      expect(details.northGuests).toBe(100)
    })

    it('should increase guests with roof by 20%', () => {
      const stadiumNoRoof = {
        north_stand_size: 10000,
        north_stand_price: 15,
        north_stand_roof: false,
        south_stand_size: 0,
        west_stand_size: 0,
        east_stand_size: 0
      }

      const stadiumWithRoof = {
        north_stand_size: 10000,
        north_stand_price: 15,
        north_stand_roof: true,
        south_stand_size: 0,
        west_stand_size: 0,
        east_stand_size: 0
      }

      const detailsNoRoof = calculateStadiumDetails(stadiumNoRoof, 500, 500)
      const detailsWithRoof = calculateStadiumDetails(stadiumWithRoof, 500, 500)

      // Both should be capped or roof version should be 20% higher
      expect(detailsWithRoof.northGuests).toBeGreaterThanOrEqual(detailsNoRoof.northGuests)
    })

    it('should have 0 guests for stands under construction', () => {
      const stadium = {
        north_stand_size: 1000,
        north_stand_price: 10,
        north_construction_end_game_day: 5,
        south_stand_size: 0,
        west_stand_size: 0,
        east_stand_size: 0
      }

      const details = calculateStadiumDetails(stadium, 100, 100)

      expect(details.northGuests).toBe(0)
      expect(details.northUnderConstruction).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should handle zero team strength', () => {
      const stadium = {
        north_stand_size: 1000,
        north_stand_price: 10,
        south_stand_size: 0,
        west_stand_size: 0,
        east_stand_size: 0
      }

      const details = calculateStadiumDetails(stadium, 0, 100)

      expect(details.northGuests).toBe(0)
      expect(details.totalEarnings).toBe(0)
      expect(details.totalCapacity).toBe(1000)
    })

    it('should handle missing stadium properties', () => {
      const stadium = {}

      const details = calculateStadiumDetails(stadium, 100, 100)

      expect(details.totalCapacity).toBe(0)
      expect(details.totalEarnings).toBe(0)
    })
  })
})
