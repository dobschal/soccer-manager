import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../lib/openRouter.js', () => ({
  generateText: vi.fn(),
  getLlmModel: vi.fn(() => 'test/model'),
  isLlmConfigured: vi.fn(() => true)
}))

const { query } = await import('../../lib/database.js')
const { generateText, isLlmConfigured } = await import('../../lib/openRouter.js')
const {
  buildGameFacts,
  factsToPrompt,
  generateGameReport,
  getStoredGameReport
} = await import('../../helper/gameReportHelper.js')

/**
 * Minimal but realistic match: 2 players per side plus a keeper each.
 * @returns {{game: object, details: object}}
 */
function buildFixture () {
  const playerTeamA = [
    { id: 1, name: 'Anna Keeper', in_game_position: 'GK', level: 40, originalLevel: 50, freshness: 0.8 },
    { id: 2, name: 'Bea Back', in_game_position: 'CD', level: 45, originalLevel: 50, freshness: 0.9 },
    { id: 3, name: 'Cara Mid', in_game_position: 'CM', level: 60, originalLevel: 60, freshness: 1 },
    { id: 4, name: 'Dora Attack', in_game_position: 'CA', level: 70, originalLevel: 80, freshness: 0.875 }
  ]
  const playerTeamB = [
    { id: 11, name: 'Emil Keeper', in_game_position: 'GK', level: 55, originalLevel: 55, freshness: 1 },
    { id: 12, name: 'Finn Back', in_game_position: 'CD', level: 50, originalLevel: 50, freshness: 1 },
    { id: 13, name: 'Gustav Mid', in_game_position: 'CM', level: 50, originalLevel: 50, freshness: 1 },
    { id: 14, name: 'Hugo Attack', in_game_position: 'CA', level: 50, originalLevel: 50, freshness: 1 }
  ]
  const details = {
    log: [
      { player: 3, kickoff: true },
      // Noise that must never reach the prompt.
      { pass: true, newPlayer: 4, oldPlayer: 3 },
      { pass: true, newPlayer: 3, oldPlayer: 4 },
      // Team A keeps the ball in midfield.
      { player: 3, oponentPlayer: 13, lostBall: false, minute: 5, streak: 4 },
      // Team A loses it in attack; Finn Back wins it for team B.
      { player: 4, oponentPlayer: 12, lostBall: true, minute: 10, streak: 7 },
      // Team B loses it in midfield; Cara Mid wins it back.
      { player: 13, oponentPlayer: 3, lostBall: true, minute: 12, streak: 2 },
      // Goal for team A.
      { goal: true, player: 4, minute: 15, teamA: true, streak: 5 },
      // Shot by team B saved by team A's keeper.
      { player: 14, keeperHolds: true, goalKeeper: 1, minute: 30 },
      { yellowCard: true, player: 12, foulOn: 4, minute: 40 },
      { redCard: true, player: 13, secondYellow: false, foulOn: 3, minute: 70 }
    ],
    playerTeamA,
    playerTeamB,
    teamA: { name: 'Alpha FC', attack_mode: 'offensive', play_style: 'aggressive', pass_style: 'long' },
    teamB: { name: 'Beta United', attack_mode: 'defensive', play_style: 'friendly', pass_style: 'short' },
    strengthTeamA: 215,
    strengthTeamB: 205,
    effectiveStrengthTeamA: 220,
    shotsTeamA: 6,
    shotsTeamB: 3,
    injuries: [
      { playerName: 'Bea Back', teamIndex: 0, minute: 55, injuryDays: 7, injuryType: 'muscle' }
    ],
    substitutions: [
      { playerOutName: 'Bea Back', playerInName: 'Iris Bench', teamIndex: 0, minute: 56, reason: 'injury' }
    ]
  }
  const game = {
    id: 99,
    goalsTeam1: 1,
    goalsTeam2: 0,
    gameDay: 10,
    season: 9,
    team1: 'Alpha FC',
    team2: 'Beta United'
  }
  return { game, details }
}

describe('buildGameFacts', () => {
  it('derives the score, match day and tactics for both teams', () => {
    const { game, details } = buildFixture()
    const facts = buildGameFacts(game, details)

    expect(facts.finalScore).toEqual({ home: 1, away: 0 })
    expect(facts.matchDay).toBe(11)
    expect(facts.season).toBe(9)
    expect(facts.decidedBy).toBe('regular-time')
    expect(facts.home.name).toBe('Alpha FC')
    expect(facts.home.tactics).toMatchObject({
      attackMode: 'offensive',
      playStyle: 'aggressive',
      passStyle: 'long',
      formation: '1-1-1'
    })
    expect(facts.away.tactics.attackMode).toBe('defensive')
  })

  it('counts goals, shots on target and saves on the right side', () => {
    const { game, details } = buildFixture()
    const facts = buildGameFacts(game, details)

    expect(facts.home.goals).toBe(1)
    expect(facts.home.shots).toBe(6)
    expect(facts.home.shotsOnTarget).toBe(1)
    expect(facts.home.scorers).toEqual([{ name: 'Dora Attack', goals: 1 }])
    // The save is credited to team A's keeper, the shot to team B.
    expect(facts.home.saves).toBe(1)
    expect(facts.away.shotsOnTarget).toBe(1)
    expect(facts.away.saves).toBe(0)
  })

  it('attributes ball recoveries to the player who won the duel', () => {
    const { game, details } = buildFixture()
    const facts = buildGameFacts(game, details)

    // Team B won the ball once (Finn Back, a defender).
    expect(facts.away.recoveries).toBe(1)
    expect(facts.away.recoveriesByZone.defence).toBe(1)
    expect(facts.away.topRecoverers).toEqual([{ name: 'Finn Back', recoveries: 1 }])

    // Team A won the ball once (Cara Mid, a midfielder).
    expect(facts.home.recoveries).toBe(1)
    expect(facts.home.recoveriesByZone.midfield).toBe(1)
  })

  it('records where each team lost the ball, so risky attack modes show up', () => {
    const { game, details } = buildFixture()
    const facts = buildGameFacts(game, details)

    expect(facts.home.turnoversByZone.attack).toBe(1)
    expect(facts.home.turnoversByZone.midfield).toBe(0)
    expect(facts.away.turnoversByZone.midfield).toBe(1)
  })

  it('computes duel and possession numbers', () => {
    const { game, details } = buildFixture()
    const facts = buildGameFacts(game, details)

    // Team A: 1 duel won, 1 lost. Team B: 0 won, 1 lost.
    expect(facts.home.duelsWon).toBe(1)
    expect(facts.home.duelsLost).toBe(1)
    expect(facts.home.duelWinPercent).toBe(50)
    expect(facts.away.duelsLost).toBe(1)
    // Possession ticks: A gets 1 (duel won) + 1 (B's loss) = 2, B gets 1.
    expect(facts.home.possessionPercent).toBe(67)
    expect(facts.away.possessionPercent).toBe(33)
    expect(facts.home.maxPassStreak).toBe(7)
    expect(facts.home.avgPassesBeforeLoss).toBe(7)
  })

  it('reports in-game strength against base strength and freshness', () => {
    const { game, details } = buildFixture()
    const facts = buildGameFacts(game, details)

    expect(facts.home.avgDefaultLevel).toBe(60)
    expect(facts.home.avgInGameLevel).toBe(54)
    expect(facts.home.avgFreshnessPercent).toBe(89)
    expect(facts.home.teamStrength).toBe(220)
    // Falls back to strengthTeamB when no effective strength was recorded.
    expect(facts.away.teamStrength).toBe(205)

    const dora = facts.home.players.find(p => p.name === 'Dora Attack')
    expect(dora).toMatchObject({ defaultLevel: 80, inGameLevel: 70, freshnessPercent: 88 })
  })

  it('derives the base level from freshness when originalLevel is missing', () => {
    const { game, details } = buildFixture()
    delete details.playerTeamA[3].originalLevel
    const facts = buildGameFacts(game, details)
    // level 70 at 87.5% freshness → base 80
    expect(facts.home.players.find(p => p.name === 'Dora Attack').defaultLevel).toBe(80)
  })

  it('builds a timeline of goals and red cards only', () => {
    const { game, details } = buildFixture()
    const facts = buildGameFacts(game, details)

    expect(facts.timeline).toEqual([
      { minute: 15, type: 'goal', player: 'Dora Attack', isTeamA: true, buildUpPasses: 5 },
      { minute: 70, type: 'red-card', player: 'Gustav Mid', isTeamA: false }
    ])
    expect(facts.away.yellowCards).toBe(1)
    expect(facts.away.redCards).toBe(1)
  })

  it('carries injuries and substitutions with the correct side', () => {
    const { game, details } = buildFixture()
    const facts = buildGameFacts(game, details)

    expect(facts.injuries).toEqual([{ player: 'Bea Back', team: 'home', minute: 55, days: 7 }])
    expect(facts.substitutions).toEqual([
      { out: 'Bea Back', in: 'Iris Bench', team: 'home', minute: 56, reason: 'injury' }
    ])
  })

  it('marks matches decided after regular time', () => {
    const { game, details } = buildFixture()
    expect(buildGameFacts(game, { ...details, extraTime: true }).decidedBy).toBe('extra-time')
    expect(buildGameFacts(game, { ...details, penaltyShootout: { goalsTeamA: 4, goalsTeamB: 3 } }).decidedBy)
      .toBe('penalty-shootout')
  })

  it('survives a log that references unknown player ids', () => {
    const { game, details } = buildFixture()
    details.log.push({ goal: true, player: 9999, minute: 80, teamA: true })
    expect(() => buildGameFacts(game, details)).not.toThrow()
    expect(buildGameFacts(game, details).home.goals).toBe(1)
  })
})

describe('factsToPrompt', () => {
  it('renders every tactical dimension the report is supposed to judge', () => {
    const { game, details } = buildFixture()
    const prompt = factsToPrompt(buildGameFacts(game, details))

    expect(prompt).toContain('Final score 1:0')
    expect(prompt).toContain('HOME: Alpha FC')
    expect(prompt).toContain('AWAY: Beta United')
    expect(prompt).toContain('attack mode offensive')
    expect(prompt).toContain('play style aggressive')
    expect(prompt).toContain('pass style long')
    expect(prompt).toContain('formation 1-1-1')
    expect(prompt).toContain('Ball recoveries')
    expect(prompt).toContain('Ball losses by zone')
    expect(prompt).toContain('CA Dora Attack: base 80, in-game 70, freshness 88%')
    expect(prompt).toContain("15' GOAL Dora Attack (home), 5 passes in the build-up")
    expect(prompt).toContain("70' RED-CARD Gustav Mid (away)")
  })

  it('stays far below the raw log in size', () => {
    const { game, details } = buildFixture()
    const prompt = factsToPrompt(buildGameFacts(game, details))
    // The real logs are ~86KB; the digest must stay in the low kilobytes.
    expect(prompt.length).toBeLessThan(4000)
  })

  it('does not leak raw pass events into the prompt', () => {
    const { game, details } = buildFixture()
    const prompt = factsToPrompt(buildGameFacts(game, details))
    expect(prompt).not.toContain('oldPlayer')
    expect(prompt).not.toContain('newPlayer')
  })

  it('renders placeholders when nothing notable happened', () => {
    const { game } = buildFixture()
    const prompt = factsToPrompt(buildGameFacts(game, {
      log: [], playerTeamA: [], playerTeamB: [], teamA: {}, teamB: {}
    }))
    expect(prompt).toContain('no goals or red cards')
    expect(prompt).toContain('Injuries:\n  none')
    expect(prompt).toContain('Substitutions:\n  none')
  })
})

describe('generateGameReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isLlmConfigured.mockReturnValue(true)
  })

  it('returns the stored report without calling the model', async () => {
    query.mockResolvedValueOnce([{ text: 'cached report', model: 'old/model' }])

    const result = await generateGameReport(99, 'de')

    expect(result).toEqual({ text: 'cached report', model: 'old/model', cached: true })
    expect(generateText).not.toHaveBeenCalled()
  })

  it('generates, persists and returns a new report', async () => {
    const { game, details } = buildFixture()
    query
      .mockResolvedValueOnce([]) // no cached report
      .mockResolvedValueOnce([{ ...game, details: JSON.stringify(details), isForfeit: 0 }])
      .mockResolvedValueOnce({}) // insert
    generateText.mockResolvedValueOnce('Alpha FC won because ...')

    const result = await generateGameReport(99, 'de')

    expect(result).toEqual({ text: 'Alpha FC won because ...', model: 'test/model', cached: false })
    // The German system prompt must be used for a German report.
    expect(generateText.mock.calls[0][0].system).toContain('Fußball-Analyst')
    expect(generateText.mock.calls[0][0].prompt).toContain('HOME: Alpha FC')
    const insert = query.mock.calls[2]
    expect(insert[0]).toContain('INSERT INTO game_report')
    expect(insert[1]).toEqual([99, 'de', 'Alpha FC won because ...', 'test/model'])
  })

  it('falls back to the English system prompt for unknown locales', async () => {
    const { game, details } = buildFixture()
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...game, details: JSON.stringify(details), isForfeit: 0 }])
      .mockResolvedValueOnce({})
    generateText.mockResolvedValueOnce('report')

    await generateGameReport(99, 'fr')

    expect(generateText.mock.calls[0][0].system).toContain('football analyst')
  })

  it('refuses when no API key is configured', async () => {
    isLlmConfigured.mockReturnValue(false)
    query.mockResolvedValueOnce([])
    await expect(generateGameReport(99, 'en')).rejects.toThrow('OPENROUTER_API_KEY')
  })

  it('refuses for forfeited games', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 99, isForfeit: 1, details: '{}' }])
    await expect(generateGameReport(99, 'en')).rejects.toThrow('forfeited')
  })

  it('refuses for games that have not been played', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 99, isForfeit: 0, details: '{}' }])
    await expect(generateGameReport(99, 'en')).rejects.toThrow('not been played')
  })

  it('refuses for an unknown game', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    await expect(generateGameReport(99, 'en')).rejects.toThrow('Game not found')
  })
})

describe('getStoredGameReport', () => {
  it('returns null when nothing is stored', async () => {
    vi.clearAllMocks()
    query.mockResolvedValueOnce([])
    expect(await getStoredGameReport(1, 'en')).toBeNull()
  })
})
