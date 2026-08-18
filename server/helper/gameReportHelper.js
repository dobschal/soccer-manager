import { query } from '../lib/database.js'
import { generateText, getLlmModel, isLlmConfigured } from '../lib/openRouter.js'
import { bestCountersTo, formationAdvantage } from './formationMatchupHelper.js'

/**
 * AI match reports.
 *
 * The raw `game.details` log is a pass-by-pass event stream — ~86KB and
 * ~21,500 tokens for an average match, made up almost entirely of
 * `{pass, newPlayer, oldPlayer}` entries carrying numeric player ids and no
 * names. Handing that to a model would be both wasteful and wrong: the model
 * would have to do the aggregation itself and would reliably invent things.
 *
 * So the pipeline is: aggregate in JS (`buildGameFacts`) → render compact
 * labelled facts (`factsToPrompt`, ~800 tokens) → ask the model to interpret
 * them. The model's job is judgement about the tactics, never arithmetic.
 */

const POSITION_GROUPS = {
  GK: 'keeper',
  LD: 'defence',
  CD: 'defence',
  RD: 'defence',
  DM: 'midfield',
  LM: 'midfield',
  CM: 'midfield',
  RM: 'midfield',
  OM: 'midfield',
  LA: 'attack',
  CA: 'attack',
  RA: 'attack'
}

/**
 * @param {string} position
 * @returns {string}
 */
function positionGroup (position) {
  return POSITION_GROUPS[position] || 'unknown'
}

/**
 * A player's level before freshness/captain/star modifiers were applied.
 * `originalLevel` is written by newer matches; older rows only carry the
 * in-game level plus freshness, so derive it the same way the client does.
 * @param {object} player
 * @returns {number}
 */
function defaultLevel (player) {
  if (player.originalLevel != null) return Math.round(player.originalLevel)
  if (player.freshness > 0) return Math.round(player.level / player.freshness)
  return Math.round(player.level)
}

/**
 * Derive the formation shape (e.g. "4-4-2") from the fielded positions.
 * @param {Array<object>} players
 * @returns {string}
 */
function formationShape (players) {
  const counts = { defence: 0, midfield: 0, attack: 0 }
  for (const p of players) {
    const group = positionGroup(p.in_game_position)
    if (counts[group] !== undefined) counts[group]++
  }
  return `${counts.defence}-${counts.midfield}-${counts.attack}`
}

/**
 * @param {number} value
 * @param {number} total
 * @returns {number} percentage rounded to a whole number, 0 when total is 0
 */
function percent (value, total) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

/**
 * @param {Array<number>} values
 * @returns {number}
 */
function average (values) {
  if (!values.length) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Build an empty per-team accumulator.
 * @returns {object}
 */
function emptyTeamStats () {
  return {
    goals: 0,
    shotsOnTarget: 0,
    saves: 0,
    duelsWon: 0,
    duelsLost: 0,
    recoveries: 0,
    possessionTicks: 0,
    maxStreak: 0,
    turnoversByZone: { keeper: 0, defence: 0, midfield: 0, attack: 0, unknown: 0 },
    recoveriesByZone: { keeper: 0, defence: 0, midfield: 0, attack: 0, unknown: 0 },
    streaksEndingInLoss: [],
    yellowCards: 0,
    redCards: 0,
    scorers: {},
    recoveryLeaders: {}
  }
}

/**
 * The formation pairing of the two teams, as a measured edge in league points
 * per game plus the shapes that would counter each side.
 *
 * Formation is the largest tactical lever in the engine — the counter-position
 * pairing in `_fightsOpponents` swings up to 0.4 points per game — but it is
 * the one thing a manager cannot read off the match statistics, because the
 * duels that never happened (no opponent at the counter position) leave no
 * trace in the log. So it is handed to the model as a fact.
 *
 * Returns null for games that predate stored formations, so the prompt can
 * leave the whole block out rather than assert a neutral matchup.
 *
 * @param {string|null} homeFormation
 * @param {string|null} awayFormation
 * @returns {object|null}
 */
function buildFormationMatchup (homeFormation, awayFormation) {
  if (!homeFormation || !awayFormation) return null
  const homeEdge = formationAdvantage(homeFormation, awayFormation)
  if (homeEdge === null) return null
  return {
    home: homeFormation,
    away: awayFormation,
    homeEdge,
    countersToHome: bestCountersTo(homeFormation),
    countersToAway: bestCountersTo(awayFormation)
  }
}

/**
 * Condense a full match into the handful of facts that actually explain the
 * result. Exported for tests.
 *
 * @param {object} game - Row from the `game` table (goals, ids, names).
 * @param {object} details - Parsed `game.details`.
 * @returns {object} Structured facts, safe to render into a prompt.
 */
export function buildGameFacts (game, details) {
  const playersA = details.playerTeamA || []
  const playersB = details.playerTeamB || []
  const startersA = playersA.filter(p => p.in_game_position)
  const startersB = playersB.filter(p => p.in_game_position)

  /** @type {Map<number, {player: object, isTeamA: boolean}>} */
  const playerIndex = new Map()
  for (const p of playersA) playerIndex.set(p.id, { player: p, isTeamA: true })
  for (const p of playersB) playerIndex.set(p.id, { player: p, isTeamA: false })

  const statsA = emptyTeamStats()
  const statsB = emptyTeamStats()
  const timeline = []

  for (const event of details.log || []) {
    // Passes are pure noise for analysis — the streak counter on duel events
    // already captures how long a team kept the ball.
    if (event.pass || event.kickoff) continue

    const actor = playerIndex.get(event.player)
    if (!actor) continue
    const own = actor.isTeamA ? statsA : statsB
    const other = actor.isTeamA ? statsB : statsA

    if (event.goal) {
      own.goals++
      own.scorers[actor.player.name] = (own.scorers[actor.player.name] || 0) + 1
      own.shotsOnTarget++
      timeline.push({
        minute: event.minute ?? 0,
        type: 'goal',
        player: actor.player.name,
        isTeamA: actor.isTeamA,
        buildUpPasses: event.streak ?? null
      })
      continue
    }

    if (event.keeperHolds) {
      own.shotsOnTarget++
      const keeper = playerIndex.get(event.goalKeeper)
      if (keeper) {
        const keeperStats = keeper.isTeamA ? statsA : statsB
        keeperStats.saves++
      }
      continue
    }

    if (event.yellowCard || event.redCard) {
      if (event.redCard) {
        own.redCards++
        timeline.push({
          minute: event.minute ?? 0,
          type: event.secondYellow ? 'second-yellow' : 'red-card',
          player: actor.player.name,
          isTeamA: actor.isTeamA
        })
      } else {
        own.yellowCards++
      }
      continue
    }

    if (typeof event.lostBall === 'boolean') {
      const zone = positionGroup(actor.player.in_game_position)
      // Possession is attributed the same way the match-details screen does
      // it, so the number the report quotes matches the number on screen.
      if (event.lostBall) {
        own.duelsLost++
        own.turnoversByZone[zone] = (own.turnoversByZone[zone] || 0) + 1
        own.streaksEndingInLoss.push(event.streak ?? 0)
        other.possessionTicks++

        const winner = playerIndex.get(event.oponentPlayer)
        if (winner) {
          const winnerStats = winner.isTeamA ? statsA : statsB
          const winnerZone = positionGroup(winner.player.in_game_position)
          winnerStats.recoveries++
          winnerStats.recoveriesByZone[winnerZone] = (winnerStats.recoveriesByZone[winnerZone] || 0) + 1
          winnerStats.recoveryLeaders[winner.player.name] =
            (winnerStats.recoveryLeaders[winner.player.name] || 0) + 1
        }
      } else {
        own.duelsWon++
        own.possessionTicks++
      }
      own.maxStreak = Math.max(own.maxStreak, event.streak ?? 0)
    }
  }

  const totalPossession = statsA.possessionTicks + statsB.possessionTicks

  /**
   * @param {object} stats
   * @param {object} teamMeta
   * @param {Array<object>} starters
   * @param {number} totalShots
   * @param {number} strength
   * @param {number} teamIndex
   * @returns {object}
   */
  const buildTeam = (stats, teamMeta, starters, totalShots, strength, teamIndex) => ({
    name: teamMeta?.name || (teamIndex === 0 ? game.team1 : game.team2),
    tactics: {
      attackMode: teamMeta?.attack_mode || 'balanced',
      playStyle: teamMeta?.play_style || 'normal',
      passStyle: teamMeta?.pass_style || 'mixed',
      formation: formationShape(starters),
      // The shape alone ("4-4-2") hides the difference that actually decides
      // the duels: 442a fields DM+OM, 442b fields two CMs. Keep the key.
      formationKey: teamMeta?.formation || null,
      motivatingSpeech: Boolean(teamMeta?.motivating_speech_active)
    },
    goals: stats.goals,
    shots: totalShots || stats.shotsOnTarget,
    shotsOnTarget: stats.shotsOnTarget,
    saves: stats.saves,
    possessionPercent: percent(stats.possessionTicks, totalPossession),
    duelsWon: stats.duelsWon,
    duelsLost: stats.duelsLost,
    duelWinPercent: percent(stats.duelsWon, stats.duelsWon + stats.duelsLost),
    recoveries: stats.recoveries,
    recoveriesByZone: stats.recoveriesByZone,
    turnoversByZone: stats.turnoversByZone,
    maxPassStreak: stats.maxStreak,
    avgPassesBeforeLoss: Math.round(average(stats.streaksEndingInLoss) * 10) / 10,
    yellowCards: stats.yellowCards,
    redCards: stats.redCards,
    teamStrength: strength ?? null,
    avgDefaultLevel: Math.round(average(starters.map(defaultLevel))),
    avgInGameLevel: Math.round(average(starters.map(p => p.level))),
    avgFreshnessPercent: Math.round(average(starters.map(p => p.freshness)) * 100),
    scorers: Object.entries(stats.scorers)
      .sort((a, b) => b[1] - a[1])
      .map(([name, goals]) => ({ name, goals })),
    topRecoverers: Object.entries(stats.recoveryLeaders)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, recoveries: count })),
    players: starters.map(p => ({
      name: p.name,
      position: p.in_game_position,
      defaultLevel: defaultLevel(p),
      inGameLevel: Math.round(p.level),
      freshnessPercent: Math.round((p.freshness ?? 0) * 100)
    }))
  })

  const home = buildTeam(
    statsA, details.teamA, startersA, details.shotsTeamA,
    details.effectiveStrengthTeamA ?? details.strengthTeamA, 0
  )
  const away = buildTeam(
    statsB, details.teamB, startersB, details.shotsTeamB,
    details.effectiveStrengthTeamB ?? details.strengthTeamB, 1
  )

  return {
    matchDay: (game.gameDay ?? game.game_day ?? 0) + 1,
    season: game.season,
    decidedBy: details.penaltyShootout ? 'penalty-shootout' : (details.extraTime ? 'extra-time' : 'regular-time'),
    finalScore: {
      home: game.goalsTeam1 ?? game.goals_team_1 ?? statsA.goals,
      away: game.goalsTeam2 ?? game.goals_team_2 ?? statsB.goals
    },
    home,
    away,
    formationMatchup: buildFormationMatchup(home.tactics.formationKey, away.tactics.formationKey),
    timeline: timeline.sort((a, b) => a.minute - b.minute),
    injuries: (details.injuries || []).map(i => ({
      player: i.playerName,
      team: i.teamIndex === 0 ? 'home' : 'away',
      minute: i.minute,
      days: i.injuryDays
    })),
    substitutions: (details.substitutions || []).map(s => ({
      out: s.playerOutName,
      in: s.playerInName,
      team: s.teamIndex === 0 ? 'home' : 'away',
      minute: s.minute,
      reason: s.reason
    }))
  }
}

/**
 * Render one team's facts as compact labelled lines.
 * @param {object} team
 * @param {string} sideLabel
 * @returns {string}
 */
function renderTeamFacts (team, sideLabel) {
  const zone = (obj) => `defence ${obj.defence || 0}, midfield ${obj.midfield || 0}, attack ${obj.attack || 0}`
  const squad = team.players
    .map(p => `${p.position} ${p.name}: base ${p.defaultLevel}, in-game ${p.inGameLevel}, freshness ${p.freshnessPercent}%`)
    .join('\n    ')
  return `${sideLabel}: ${team.name}
  Tactics: formation ${team.tactics.formationKey ? `${team.tactics.formationKey} (${team.tactics.formation})` : team.tactics.formation}, attack mode ${team.tactics.attackMode}, play style ${team.tactics.playStyle}, pass style ${team.tactics.passStyle}${team.tactics.motivatingSpeech ? ', motivating speech used (+10% strength)' : ''}
  Result: ${team.goals} goals from ${team.shots} shots (${team.shotsOnTarget} on target), ${team.saves} saves made
  Possession: ${team.possessionPercent}%, longest pass streak ${team.maxPassStreak}, average passes before losing the ball ${team.avgPassesBeforeLoss}
  Duels: won ${team.duelsWon}, lost ${team.duelsLost} (${team.duelWinPercent}% win rate)
  Ball recoveries: ${team.recoveries} total — ${zone(team.recoveriesByZone)}
  Ball losses by zone: ${zone(team.turnoversByZone)}
  Team strength: ${team.teamStrength ?? 'n/a'}, average base level ${team.avgDefaultLevel}, average in-game level ${team.avgInGameLevel}, average freshness ${team.avgFreshnessPercent}%
  Cards: ${team.yellowCards} yellow, ${team.redCards} red
  Scorers: ${team.scorers.length ? team.scorers.map(s => `${s.name} (${s.goals})`).join(', ') : 'none'}
  Top ball winners: ${team.topRecoverers.length ? team.topRecoverers.map(r => `${r.name} (${r.recoveries})`).join(', ') : 'none'}
  Squad:
    ${squad}`
}

/**
 * Render the formation pairing as a short labelled block. Empty string when
 * the game has no stored formations.
 * @param {object|null} matchup
 * @param {string} homeName
 * @param {string} awayName
 * @returns {string}
 */
function renderFormationMatchup (matchup, homeName, awayName) {
  if (!matchup) return ''
  const list = (counters) => counters.length
    ? counters.map(c => `${c.formation} (+${c.advantage})`).join(', ')
    : 'none — no other shape is clearly favoured against it'
  const favoured = matchup.homeEdge === 0
    ? 'neither side is favoured by the pairing'
    : `${matchup.homeEdge > 0 ? homeName : awayName} is favoured by ${Math.abs(matchup.homeEdge)} points per game`
  // Both sides in the same shape would otherwise get the identical counter
  // line printed twice.
  const counterLines = matchup.home === matchup.away
    ? `  Formations that fare best against ${matchup.home}: ${list(matchup.countersToHome)}`
    : `  Formations that fare best against ${matchup.home}: ${list(matchup.countersToHome)}
  Formations that fare best against ${matchup.away}: ${list(matchup.countersToAway)}`
  return `

Formation pairing (measured by simulating both formations against each other with identical squads; league points per game):
  ${homeName} ${matchup.home} against ${awayName} ${matchup.away}: ${favoured}.
${counterLines}
  This edge comes from the counter-position pairing (CM against CM, DM against OM, CD against CA): a player whose counter position the opponent does not field advances unopposed, and every extra opponent at that position is another duel to survive.`
}

/**
 * Render the facts object into the user turn of the prompt. Exported for
 * tests so the token budget stays observable.
 * @param {object} facts
 * @returns {string}
 */
export function factsToPrompt (facts) {
  const timeline = facts.timeline.length
    ? facts.timeline.map(e => {
      const side = e.isTeamA ? 'home' : 'away'
      if (e.type === 'goal') {
        const buildUp = e.buildUpPasses != null ? `, ${e.buildUpPasses} passes in the build-up` : ''
        return `  ${e.minute}' GOAL ${e.player} (${side})${buildUp}`
      }
      return `  ${e.minute}' ${e.type.toUpperCase()} ${e.player} (${side})`
    }).join('\n')
    : '  no goals or red cards'

  const injuries = facts.injuries.length
    ? facts.injuries.map(i => `  ${i.minute}' ${i.player} (${i.team}), out for ${i.days} days`).join('\n')
    : '  none'

  const substitutions = facts.substitutions.length
    ? facts.substitutions.map(s => `  ${s.minute}' ${s.team}: ${s.out} off, ${s.in} on (${s.reason})`).join('\n')
    : '  none'

  return `Match day ${facts.matchDay}, season ${facts.season}. Final score ${facts.finalScore.home}:${facts.finalScore.away} (${facts.decidedBy}).

${renderTeamFacts(facts.home, 'HOME')}

${renderTeamFacts(facts.away, 'AWAY')}

Key moments:
${timeline}

Injuries:
${injuries}

Substitutions:
${substitutions}${renderFormationMatchup(facts.formationMatchup, facts.home.name, facts.away.name)}`
}

const SYSTEM_PROMPTS = {
  en: `You are a football analyst writing a short tactical verdict for the managers of the two teams in an online football manager game.

You will receive aggregated statistics from a simulated match. Write exactly 2 short paragraphs in English, 120 words in total at most:
1. Which tactical choices worked and which did not. Reason from the numbers: the formation pairing shows whether a side was beaten by its shape before kick-off, possession and pass streaks show whether the pass style fitted the squad, ball losses by zone show whether the attack mode was too risky, duel win rate and cards show whether the play style paid off, freshness and in-game vs base levels show whether the squad was fit enough.
2. A concrete recommendation for the next match for each team, naming the tactic setting you would change. When the formation pairing cost a side more than 0.1 points per game, name one of the listed counter formations instead.

Rules:
- Never retell the match and never summarise the result. Both managers have just watched it and can see the score, the scorers and the statistics right next to your text — start straight with the tactical judgement.
- Only use the numbers you are given. Never invent players, minutes, or events.
- Refer to teams and players by name.
- Be specific and quote the numbers that support your judgement.
- Plain prose, no headings, no bullet lists, no markdown.`,

  de: `Du bist ein Fußball-Analyst und schreibst ein kurzes Taktik-Fazit für die Manager der beiden Mannschaften in einem Online-Fußballmanager.

Du bekommst aggregierte Statistiken eines simulierten Spiels. Schreibe genau 2 kurze Absätze auf Deutsch, insgesamt höchstens 120 Wörter:
1. Welche taktischen Entscheidungen funktioniert haben und welche nicht. Argumentiere mit den Zahlen: die Formations-Paarung zeigt, ob eine Mannschaft schon vor dem Anpfiff durch ihre Grundordnung im Nachteil war, Ballbesitz und Passstafetten zeigen, ob der Passstil zum Kader passte, Ballverluste nach Zone zeigen, ob der Angriffsmodus zu riskant war, Zweikampfquote und Karten zeigen, ob sich der Spielstil ausgezahlt hat, Frische sowie In-Game- gegenüber Grundstärke zeigen, ob der Kader fit genug war.
2. Eine konkrete Empfehlung für das nächste Spiel je Mannschaft, mit Nennung der Taktik-Einstellung, die du ändern würdest. Hat die Formations-Paarung eine Mannschaft mehr als 0,1 Punkte pro Spiel gekostet, nenne eine der aufgeführten Konter-Formationen.

Regeln:
- Erzähle das Spiel niemals nach und fasse das Ergebnis niemals zusammen. Beide Manager haben es gerade gesehen und finden Spielstand, Torschützen und Statistik direkt neben deinem Text — steig sofort mit der taktischen Bewertung ein.
- Nutze ausschließlich die genannten Zahlen. Erfinde niemals Spieler, Minuten oder Ereignisse.
- Nenne Mannschaften und Spieler beim Namen.
- Sei konkret und belege deine Einschätzung mit den Zahlen.
- Fließtext, keine Überschriften, keine Aufzählungen, kein Markdown.`
}

/**
 * @param {string} locale
 * @returns {string}
 */
function systemPromptFor (locale) {
  return SYSTEM_PROMPTS[locale] || SYSTEM_PROMPTS.en
}

/**
 * Look up an already-generated report.
 * @param {number} gameId
 * @param {string} locale
 * @returns {Promise<{text: string, model: string, createdAt: Date}|null>}
 */
export async function getStoredGameReport (gameId, locale) {
  const [row] = await query(
    'SELECT text, model, created_at AS createdAt FROM game_report WHERE game_id=? AND locale=? LIMIT 1',
    [gameId, locale]
  )
  return row || null
}

/**
 * Generate (or return the cached) AI match report for a game.
 *
 * Reports are immutable once written: a match never changes, so the first
 * generation is the only one we ever pay for per game and locale.
 *
 * @param {number} gameId
 * @param {string} locale
 * @returns {Promise<{text: string, model: string, cached: boolean}>}
 * @throws {Error} When the game has no playable details or the LLM call fails.
 */
export async function generateGameReport (gameId, locale) {
  const cached = await getStoredGameReport(gameId, locale)
  if (cached) return { text: cached.text, model: cached.model, cached: true }

  if (!isLlmConfigured()) throw new Error('OPENROUTER_API_KEY is not configured')

  const [game] = await query(`
      SELECT g.id            AS id,
             g.goals_team_1  AS goalsTeam1,
             g.goals_team_2  AS goalsTeam2,
             g.game_day      AS gameDay,
             g.season        AS season,
             g.details       AS details,
             g.is_forfeit    AS isForfeit,
             t1.name         AS team1,
             t2.name         AS team2
      FROM game g
               JOIN team t1 ON t1.id = g.team_1_id
               JOIN team t2 ON t2.id = g.team_2_id
      WHERE g.id = ?
  `, [gameId])

  if (!game) throw new Error('Game not found')
  if (game.isForfeit) throw new Error('Game was forfeited, no match data to analyse')

  let details
  try {
    details = JSON.parse(game.details || '{}')
  } catch {
    throw new Error('Game details could not be parsed')
  }
  if (!details.log || !details.log.length) throw new Error('Game has not been played yet')

  const facts = buildGameFacts(game, details)
  const text = await generateText({
    system: systemPromptFor(locale),
    prompt: factsToPrompt(facts),
    // The verdict is capped at ~120 words; 400 tokens leaves plenty of room
    // for a long-winded model without paying for a full-page essay.
    maxTokens: 400
  })
  const model = getLlmModel()

  // Two managers opening the same match at once would both generate; the
  // unique key makes the second write a no-op rather than a duplicate row.
  await query(
    `INSERT INTO game_report (game_id, locale, text, model) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE text=VALUES(text), model=VALUES(model)`,
    [gameId, locale, text, model]
  )

  return { text, model, cached: false }
}
