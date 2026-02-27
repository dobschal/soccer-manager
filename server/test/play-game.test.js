import { describe, expect, it } from 'vitest'
import { kickoff, playGameStep } from '../play-game.js'

/**
 * Helper to create a player for game simulation tests
 */
function createPlayer (overrides = {}) {
  return {
    id: overrides.id ?? 1,
    name: overrides.name ?? 'Test Player',
    position: overrides.position ?? 'CM',
    in_game_position: overrides.in_game_position ?? overrides.position ?? 'CM',
    level: overrides.level ?? 50,
    freshness: overrides.freshness ?? 1.0,
    hasBall: overrides.hasBall ?? false,
    yellowCardsInMatch: overrides.yellowCardsInMatch ?? 0,
    sentOff: overrides.sentOff ?? false,
    yellow_cards: overrides.yellow_cards ?? 0,
    red_cards: overrides.red_cards ?? 0,
    is_suspended: overrides.is_suspended ?? 0,
    ...overrides
  }
}

/**
 * Helper to create a full 11-player team lineup
 */
function createTeam (options = {}) {
  const baseLevel = options.level ?? 50
  const prefix = options.prefix ?? 'A'
  const positions = options.positions ?? ['GK', 'LD', 'CD', 'CD', 'RD', 'LM', 'CM', 'RM', 'LA', 'CA', 'RA']
  return positions.map((pos, i) => createPlayer({
    id: (options.idStart ?? 1) + i,
    name: `${prefix} Player ${i + 1}`,
    position: pos,
    in_game_position: pos,
    level: baseLevel
  }))
}

/**
 * Helper to create game details object
 */
function createGameDetails (overrides = {}) {
  return {
    log: [],
    goalsTeamA: 0,
    goalsTeamB: 0,
    strengthTeamA: 0,
    strengthTeamB: 0,
    stadiumDetails: {},
    playerTeamA: [],
    playerTeamB: [],
    teamA: {
      id: 1,
      name: 'Team A',
      play_style: 'normal',
      attack_mode: 'balanced',
      pass_style: 'mixed',
      ...(overrides.teamA ?? {})
    },
    teamB: {
      id: 2,
      name: 'Team B',
      play_style: 'normal',
      attack_mode: 'balanced',
      pass_style: 'mixed',
      ...(overrides.teamB ?? {})
    },
    streak: 0,
    yellowCardsInMatch: {},
    sentOffPlayerIds: [],
    currentMinute: 45,
    ...overrides
  }
}

/**
 * Run a full game simulation and return the game details
 */
function simulateGame (playerTeamA, playerTeamB, gameDetails) {
  kickoff(playerTeamA, playerTeamB, gameDetails)
  const totalSteps = 900 + Math.floor(Math.random() * 50)
  for (let step = 0; step < totalSteps; step++) {
    gameDetails.currentMinute = step < 900 ? Math.floor(step / 10) : 90 + Math.floor((step - 900) / 10)
    playGameStep(playerTeamA, playerTeamB, gameDetails)
  }
  return gameDetails
}

describe('play-game simulation', () => {
  describe('possession change after goal', () => {
    it('should give possession to the other team after a goal is scored', () => {
      // Run many games and check that after each goal, the other team has the ball
      const teamA = createTeam({
        level: 50,
        prefix: 'A',
        idStart: 1
      })
      const teamB = createTeam({
        level: 50,
        prefix: 'B',
        idStart: 100
      })

      const gameDetails = createGameDetails({
        playerTeamA: teamA,
        playerTeamB: teamB
      })

      simulateGame(teamA, teamB, gameDetails)

      // After each goal event in the log, the next event should NOT be a pass
      // from the scoring team (they should have lost possession)
      const log = gameDetails.log
      const teamAIds = new Set(teamA.map(p => p.id))
      const teamBIds = new Set(teamB.map(p => p.id))

      for (let i = 0; i < log.length - 1; i++) {
        if (log[i].goal) {
          const scoringTeamIsA = log[i].teamA
          const nextEvent = log[i + 1]

          // The next event should not be a pass from the scoring team
          if (nextEvent.pass) {
            const passFromPlayer = nextEvent.oldPlayer
            if (scoringTeamIsA) {
              expect(teamAIds.has(passFromPlayer)).toBe(false)
            } else {
              expect(teamBIds.has(passFromPlayer)).toBe(false)
            }
          }
        }
      }
    })

    it('should not allow multiple goals in the same game step', () => {
      // Run multiple games and verify no two consecutive goals from the same team
      // without any intervening possession change
      let consecutiveGoalsFound = 0
      const numGames = 50

      for (let g = 0; g < numGames; g++) {
        const teamA = createTeam({
          level: 50,
          prefix: 'A',
          idStart: 1
        })
        const teamB = createTeam({
          level: 50,
          prefix: 'B',
          idStart: 100
        })
        const gameDetails = createGameDetails({
          playerTeamA: teamA,
          playerTeamB: teamB
        })

        simulateGame(teamA, teamB, gameDetails)

        const log = gameDetails.log
        for (let i = 0; i < log.length - 1; i++) {
          if (log[i].goal && log[i + 1].goal && log[i].teamA === log[i + 1].teamA) {
            consecutiveGoalsFound++
          }
        }
      }

      // There should be zero consecutive goals from the same team
      expect(consecutiveGoalsFound).toBe(0)
    })

    it('should reset streak to 0 after a goal', () => {
      // We verify this by checking no rapid-fire goal sequences
      // (which were caused by high streaks persisting after goals)
      let maxGoalsInSameMinute = 0
      const numGames = 100

      for (let g = 0; g < numGames; g++) {
        const teamA = createTeam({
          level: 50,
          prefix: 'A',
          idStart: 1
        })
        const teamB = createTeam({
          level: 50,
          prefix: 'B',
          idStart: 100
        })
        const gameDetails = createGameDetails({
          playerTeamA: teamA,
          playerTeamB: teamB
        })

        simulateGame(teamA, teamB, gameDetails)

        // Count goals per minute
        const goalsByMinute = {}
        for (const event of gameDetails.log) {
          if (event.goal) {
            const key = `${event.minute}-${event.teamA}`
            goalsByMinute[key] = (goalsByMinute[key] || 0) + 1
          }
        }

        for (const count of Object.values(goalsByMinute)) {
          maxGoalsInSameMinute = Math.max(maxGoalsInSameMinute, count)
        }
      }

      // After fix: a team should very rarely score more than 1 goal in the same minute
      // It's still theoretically possible (score, opponent loses ball immediately, score again)
      // but the old bug produced 3+ goals in a single minute regularly
      expect(maxGoalsInSameMinute).toBeLessThanOrEqual(2)
    })
  })

  describe('weaker team with fewer players should lose more often', () => {
    it('stronger team (11 players) should consistently beat weaker team (10 players)', () => {
      const numGames = 200
      let strongerTeamWins = 0
      let weakerTeamWins = 0
      let totalGoalDiff = 0

      for (let g = 0; g < numGames; g++) {
        // Stronger team: 11 players, avg level 40
        const teamA = createTeam({
          level: 40,
          prefix: 'A',
          idStart: 1
        })
        // Weaker team: 10 players (missing RA), avg level 30
        const teamB = createTeam({
          level: 30,
          prefix: 'B',
          idStart: 100,
          positions: ['GK', 'LD', 'CD', 'CD', 'RD', 'LM', 'CM', 'RM', 'LA', 'CA']
        })

        const gameDetails = createGameDetails({
          playerTeamA: teamA,
          playerTeamB: teamB
        })

        simulateGame(teamA, teamB, gameDetails)

        if (gameDetails.goalsTeamA > gameDetails.goalsTeamB) {
          strongerTeamWins++
        } else if (gameDetails.goalsTeamB > gameDetails.goalsTeamA) {
          weakerTeamWins++
        }
        totalGoalDiff += gameDetails.goalsTeamA - gameDetails.goalsTeamB
      }

      const strongerWinRate = strongerTeamWins / numGames

      // Stronger team with more players should win majority of games
      expect(strongerWinRate).toBeGreaterThan(0.4)
      // Weaker team should win less than 25% of the time
      expect(weakerTeamWins / numGames).toBeLessThan(0.25)
      // Average goal difference should favor the stronger team
      expect(totalGoalDiff / numGames).toBeGreaterThan(0)
    })

    it('much stronger team should almost never lose to much weaker team with fewer players', () => {
      const numGames = 200
      let weakerTeamWins = 0
      let totalGoalDiffStrong = 0

      for (let g = 0; g < numGames; g++) {
        // Very strong team: 11 players, avg level 50
        const teamA = createTeam({
          level: 50,
          prefix: 'A',
          idStart: 1
        })
        // Very weak team: 9 players (missing RA and RM), avg level 20
        const teamB = createTeam({
          level: 20,
          prefix: 'B',
          idStart: 100,
          positions: ['GK', 'LD', 'CD', 'CD', 'RD', 'LM', 'CM', 'LA', 'CA']
        })

        const gameDetails = createGameDetails({
          playerTeamA: teamA,
          playerTeamB: teamB
        })

        simulateGame(teamA, teamB, gameDetails)

        if (gameDetails.goalsTeamB > gameDetails.goalsTeamA) {
          weakerTeamWins++
        }
        totalGoalDiffStrong += gameDetails.goalsTeamA - gameDetails.goalsTeamB
      }

      // The weaker team with fewer players should win very rarely (< 5%)
      expect(weakerTeamWins / numGames).toBeLessThan(0.05)
      // Average goal difference should strongly favor the stronger team
      expect(totalGoalDiffStrong / numGames).toBeGreaterThan(1.0)
    })

    it('scenario from bug report: 130-point strength difference should favor stronger team', () => {
      // Recreate the bug scenario: Team A strength ~442, Team B strength ~313
      // Team A: 10 players with levels matching the bug report
      const teamA = [
        createPlayer({
          id: 83,
          position: 'GK',
          in_game_position: 'GK',
          level: 40.5
        }),
        createPlayer({
          id: 717,
          position: 'CA',
          in_game_position: 'CA',
          level: 42.35
        }),
        createPlayer({
          id: 1531,
          position: 'LD',
          in_game_position: 'LD',
          level: 36
        }),
        createPlayer({
          id: 1532,
          position: 'CM',
          in_game_position: 'CM',
          level: 20.7
        }),
        createPlayer({
          id: 1535,
          position: 'RA',
          in_game_position: 'RA',
          level: 45.24
        }),
        createPlayer({
          id: 1536,
          position: 'LA',
          in_game_position: 'LA',
          level: 17.76
        }),
        createPlayer({
          id: 1538,
          position: 'CD',
          in_game_position: 'CD',
          level: 40.5
        }),
        createPlayer({
          id: 1542,
          position: 'CD',
          in_game_position: 'CD',
          level: 33.37
        }),
        createPlayer({
          id: 1545,
          position: 'LM',
          in_game_position: 'LM',
          level: 52.36
        }),
        createPlayer({
          id: 2408,
          position: 'RD',
          in_game_position: 'RD',
          level: 14
        })
      ]
      // Team B: 10 players with levels matching the bug report
      const teamB = [
        createPlayer({
          id: 92,
          position: 'CD',
          in_game_position: 'CD',
          level: 18.4
        }),
        createPlayer({
          id: 94,
          position: 'RM',
          in_game_position: 'RM',
          level: 26.88
        }),
        createPlayer({
          id: 95,
          position: 'CM',
          in_game_position: 'CM',
          level: 5.4
        }),
        createPlayer({
          id: 98,
          position: 'GK',
          in_game_position: 'GK',
          level: 7.6
        }),
        createPlayer({
          id: 100,
          position: 'LD',
          in_game_position: 'LD',
          level: 45.44
        }),
        createPlayer({
          id: 101,
          position: 'RD',
          in_game_position: 'RD',
          level: 10.78
        }),
        createPlayer({
          id: 103,
          position: 'CD',
          in_game_position: 'CD',
          level: 19.2
        }),
        createPlayer({
          id: 108,
          position: 'LM',
          in_game_position: 'LM',
          level: 5.7
        }),
        createPlayer({
          id: 1493,
          position: 'LA',
          in_game_position: 'LA',
          level: 31.92
        }),
        createPlayer({
          id: 1588,
          position: 'CM',
          in_game_position: 'CM',
          level: 39.6
        })
      ]

      const numGames = 200
      let teamAWins = 0
      let teamBWins = 0
      let totalGoalDiff = 0

      for (let g = 0; g < numGames; g++) {
        // Reset player states
        const playersA = teamA.map(p => ({
          ...p,
          hasBall: false,
          yellowCardsInMatch: 0,
          sentOff: false
        }))
        const playersB = teamB.map(p => ({
          ...p,
          hasBall: false,
          yellowCardsInMatch: 0,
          sentOff: false
        }))

        const gameDetails = createGameDetails({
          playerTeamA: playersA,
          playerTeamB: playersB,
          teamA: {
            id: 86,
            name: 'Inter Primavera',
            play_style: 'normal',
            attack_mode: 'offensive',
            pass_style: 'mixed'
          },
          teamB: {
            id: 6,
            name: '2. FC Valleverde',
            play_style: 'normal',
            attack_mode: 'offensive',
            pass_style: 'mixed'
          }
        })

        simulateGame(playersA, playersB, gameDetails)

        if (gameDetails.goalsTeamA > gameDetails.goalsTeamB) {
          teamAWins++
        } else if (gameDetails.goalsTeamB > gameDetails.goalsTeamA) teamBWins++
        totalGoalDiff += gameDetails.goalsTeamA - gameDetails.goalsTeamB
      }

      const teamAWinRate = teamAWins / numGames
      const teamBWinRate = teamBWins / numGames

      // Team A (stronger by 130 points) should win more often
      expect(teamAWinRate).toBeGreaterThan(teamBWinRate)
      // Team B should not win more than 30% of games
      expect(teamBWinRate).toBeLessThan(0.30)
      // Average goal difference should favor Team A
      expect(totalGoalDiff / numGames).toBeGreaterThan(0)
    })
  })

  describe('game statistics match Bundesliga averages', () => {
    it('average goals per match should be around 3.16 for equal teams', () => {
      const numGames = 300
      let totalGoals = 0

      for (let g = 0; g < numGames; g++) {
        const teamA = createTeam({
          level: 40,
          prefix: 'A',
          idStart: 1
        })
        const teamB = createTeam({
          level: 40,
          prefix: 'B',
          idStart: 100
        })
        const gameDetails = createGameDetails({
          playerTeamA: teamA,
          playerTeamB: teamB
        })

        simulateGame(teamA, teamB, gameDetails)
        totalGoals += gameDetails.goalsTeamA + gameDetails.goalsTeamB
      }

      const avgGoals = totalGoals / numGames
      // Should be roughly 2-5 goals per game (Bundesliga avg is 3.16)
      expect(avgGoals).toBeGreaterThan(1.5)
      expect(avgGoals).toBeLessThan(5.0)
    })

    it('should have reasonable shot counts per team', () => {
      const numGames = 200
      let totalShotsA = 0
      let totalShotsB = 0

      for (let g = 0; g < numGames; g++) {
        const teamA = createTeam({
          level: 40,
          prefix: 'A',
          idStart: 1
        })
        const teamB = createTeam({
          level: 40,
          prefix: 'B',
          idStart: 100
        })
        const gameDetails = createGameDetails({
          playerTeamA: teamA,
          playerTeamB: teamB
        })

        simulateGame(teamA, teamB, gameDetails)
        totalShotsA += gameDetails.shotsTeamA || 0
        totalShotsB += gameDetails.shotsTeamB || 0
      }

      const avgShotsPerTeam = (totalShotsA + totalShotsB) / (2 * numGames)
      // Bundesliga average is ~13 shots per team per match
      expect(avgShotsPerTeam).toBeGreaterThan(5)
      expect(avgShotsPerTeam).toBeLessThan(30)
    })

    it('draw percentage should be reasonable for equal teams', () => {
      const numGames = 500
      let draws = 0

      for (let g = 0; g < numGames; g++) {
        const teamA = createTeam({
          level: 40,
          prefix: 'A',
          idStart: 1
        })
        const teamB = createTeam({
          level: 40,
          prefix: 'B',
          idStart: 100
        })
        const gameDetails = createGameDetails({
          playerTeamA: teamA,
          playerTeamB: teamB
        })

        simulateGame(teamA, teamB, gameDetails)
        if (gameDetails.goalsTeamA === gameDetails.goalsTeamB) draws++
      }

      const drawRate = draws / numGames
      // Bundesliga draw rate is ~24%
      expect(drawRate).toBeGreaterThan(0.10)
      expect(drawRate).toBeLessThan(0.45)
    })
  })

  describe('incomplete team disadvantage', () => {
    it('team with 8 players should lose more often to full team of same level', () => {
      const numGames = 200
      let fullTeamWins = 0
      let incompleteTeamWins = 0

      for (let g = 0; g < numGames; g++) {
        const teamA = createTeam({
          level: 40,
          prefix: 'A',
          idStart: 1
        })
        const teamB = createTeam({
          level: 40,
          prefix: 'B',
          idStart: 100,
          positions: ['GK', 'LD', 'CD', 'RD', 'LM', 'CM', 'LA', 'CA']
        })

        const gameDetails = createGameDetails({
          playerTeamA: teamA,
          playerTeamB: teamB
        })

        simulateGame(teamA, teamB, gameDetails)
        if (gameDetails.goalsTeamA > gameDetails.goalsTeamB) fullTeamWins++
        if (gameDetails.goalsTeamB > gameDetails.goalsTeamA) incompleteTeamWins++
      }

      // Full team should win more often than the incomplete team
      expect(fullTeamWins).toBeGreaterThanOrEqual(incompleteTeamWins)
    })

    it('team with 7 players should lose to full team of same level most of the time', () => {
      const numGames = 200
      let fullTeamWins = 0

      for (let g = 0; g < numGames; g++) {
        const teamA = createTeam({
          level: 40,
          prefix: 'A',
          idStart: 1
        })
        const teamB = createTeam({
          level: 40,
          prefix: 'B',
          idStart: 100,
          positions: ['GK', 'LD', 'CD', 'RD', 'CM', 'LA', 'CA']
        })

        const gameDetails = createGameDetails({
          playerTeamA: teamA,
          playerTeamB: teamB
        })

        simulateGame(teamA, teamB, gameDetails)
        if (gameDetails.goalsTeamA > gameDetails.goalsTeamB) fullTeamWins++
      }

      // Full team should win majority of games
      expect(fullTeamWins / numGames).toBeGreaterThan(0.5)
    })
  })

  describe('goal difference distribution', () => {
    it('should not produce extreme results (>6 goal diff) frequently for equal teams', () => {
      const numGames = 300
      let extremeResults = 0

      for (let g = 0; g < numGames; g++) {
        const teamA = createTeam({
          level: 40,
          prefix: 'A',
          idStart: 1
        })
        const teamB = createTeam({
          level: 40,
          prefix: 'B',
          idStart: 100
        })
        const gameDetails = createGameDetails({
          playerTeamA: teamA,
          playerTeamB: teamB
        })

        simulateGame(teamA, teamB, gameDetails)
        const diff = Math.abs(gameDetails.goalsTeamA - gameDetails.goalsTeamB)
        if (diff > 6) extremeResults++
      }

      // Extreme results (>6 goal difference) should be very rare (< 3%)
      expect(extremeResults / numGames).toBeLessThan(0.03)
    })
  })

  describe('cup extra time (no draws allowed)', () => {
    /**
     * Simulate a cup game: regular time + extra time if tied
     */
    function simulateCupGame (playerTeamA, playerTeamB, gameDetails) {
      kickoff(playerTeamA, playerTeamB, gameDetails)
      const totalSteps = 900 + Math.floor(Math.random() * 50)
      for (let step = 0; step < totalSteps; step++) {
        gameDetails.currentMinute = step < 900 ? Math.floor(step / 10) : 90 + Math.floor((step - 900) / 10)
        playGameStep(playerTeamA, playerTeamB, gameDetails)
      }

      // Cup extra time: continue until someone scores
      if (gameDetails.goalsTeamA === gameDetails.goalsTeamB) {
        gameDetails.extraTime = true
        let extraStep = 0
        while (gameDetails.goalsTeamA === gameDetails.goalsTeamB) {
          gameDetails.currentMinute = 91 + Math.floor(extraStep / 10)
          playGameStep(playerTeamA, playerTeamB, gameDetails)
          extraStep++
        }
      }
      return gameDetails
    }

    it('cup games should never end in a draw', () => {
      const numGames = 200
      let draws = 0

      for (let g = 0; g < numGames; g++) {
        const teamA = createTeam({ level: 40, prefix: 'A', idStart: 1 })
        const teamB = createTeam({ level: 40, prefix: 'B', idStart: 100 })
        const gameDetails = createGameDetails({ playerTeamA: teamA, playerTeamB: teamB })

        simulateCupGame(teamA, teamB, gameDetails)
        if (gameDetails.goalsTeamA === gameDetails.goalsTeamB) draws++
      }

      expect(draws).toBe(0)
    })

    it('extra time flag should be set when regular time ends in a draw', () => {
      let extraTimeCount = 0
      const numGames = 500

      for (let g = 0; g < numGames; g++) {
        const teamA = createTeam({ level: 40, prefix: 'A', idStart: 1 })
        const teamB = createTeam({ level: 40, prefix: 'B', idStart: 100 })
        const gameDetails = createGameDetails({ playerTeamA: teamA, playerTeamB: teamB })

        simulateCupGame(teamA, teamB, gameDetails)
        if (gameDetails.extraTime) extraTimeCount++
      }

      // Some games should go to extra time (~24% draw rate in regular time)
      expect(extraTimeCount).toBeGreaterThan(0)
      // But not all games should go to extra time
      expect(extraTimeCount).toBeLessThan(numGames)
    })

    it('extra time goal should have minute > 90', () => {
      // Run many games until we find one that goes to extra time
      let foundExtraTimeGoal = false

      for (let g = 0; g < 500 && !foundExtraTimeGoal; g++) {
        const teamA = createTeam({ level: 40, prefix: 'A', idStart: 1 })
        const teamB = createTeam({ level: 40, prefix: 'B', idStart: 100 })
        const gameDetails = createGameDetails({ playerTeamA: teamA, playerTeamB: teamB })

        simulateCupGame(teamA, teamB, gameDetails)

        if (gameDetails.extraTime) {
          // Find the last goal in the log (the deciding goal)
          const goals = gameDetails.log.filter(e => e.goal)
          const lastGoal = goals[goals.length - 1]
          expect(lastGoal.minute).toBeGreaterThanOrEqual(91)
          foundExtraTimeGoal = true
        }
      }

      expect(foundExtraTimeGoal).toBe(true)
    })
  })
})
