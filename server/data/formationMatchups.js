/**
 * Formation-versus-formation edge, in league points per game. Generated file —
 * do not edit by hand, run `node scripts/generate-formation-matchups.mjs`.
 *
 * `FORMATION_MATCHUPS[a][b]` is what a team playing formation `a` gains (or
 * loses) per game against a team playing formation `b`, with both squads
 * otherwise identical. Positive means `a` is favoured. The table is
 * antisymmetric: `[a][b] === -[b][a]`, and the diagonal is 0.
 *
 * 2,000 simulated matches per ordered pairing (200,000 in total),
 * eleven identical players of level 32 per side, all tactics on their defaults.
 * The standard error of a single cell is about 0.019 points, so anything
 * past ±0.06 is real.
 *
 * Where the effect comes from: `_fightsOpponents` in `server/play-game.js`
 * pairs a ball carrier against opponents at the counter position
 * (`determineOponentPosition`: CM↔CM, DM↔OM, CD↔CA, …). If the opponent
 * fields nobody there the carrier advances unopposed, and every extra player
 * at the counter position is one more duel to survive. So a DM/OM shape meets
 * a CM shape with holes on both sides, and a back five puts three CDs in front
 * of a lone CA.
 *
 * Re-run the generator whenever that pairing logic, the duel maths or the
 * available formations change — the numbers are a snapshot of the engine, not
 * a design decision.
 */
export const FORMATION_MATCHUPS = {
  "352": {
    "352": 0,
    "433": 0.29,
    "532": 0.28,
    "541": 0.11,
    "343a": 0.01,
    "343b": 0.18,
    "451a": -0.05,
    "451b": 0.03,
    "442a": 0.07,
    "442b": 0.21
  },
  "433": {
    "352": -0.29,
    "433": 0,
    "532": -0.19,
    "541": 0.04,
    "343a": 0.01,
    "343b": 0.07,
    "451a": -0.1,
    "451b": -0.15,
    "442a": -0.31,
    "442b": -0.13
  },
  "532": {
    "352": -0.28,
    "433": 0.19,
    "532": 0,
    "541": 0.32,
    "343a": 0.13,
    "343b": 0.06,
    "451a": 0.15,
    "451b": 0.17,
    "442a": -0.2,
    "442b": -0.1
  },
  "541": {
    "352": -0.11,
    "433": -0.04,
    "532": -0.32,
    "541": 0,
    "343a": 0.24,
    "343b": 0.09,
    "451a": -0.09,
    "451b": 0.01,
    "442a": -0.36,
    "442b": -0.3
  },
  "343a": {
    "352": -0.01,
    "433": -0.01,
    "532": -0.13,
    "541": -0.24,
    "343a": 0,
    "343b": 0.06,
    "451a": -0.15,
    "451b": -0.09,
    "442a": -0.08,
    "442b": -0.15
  },
  "343b": {
    "352": -0.18,
    "433": -0.07,
    "532": -0.06,
    "541": -0.09,
    "343a": -0.06,
    "343b": 0,
    "451a": -0.31,
    "451b": -0.33,
    "442a": -0.22,
    "442b": -0.1
  },
  "451a": {
    "352": 0.05,
    "433": 0.1,
    "532": -0.15,
    "541": 0.09,
    "343a": 0.15,
    "343b": 0.31,
    "451a": 0,
    "451b": 0.04,
    "442a": -0.15,
    "442b": -0.1
  },
  "451b": {
    "352": -0.03,
    "433": 0.15,
    "532": -0.17,
    "541": -0.01,
    "343a": 0.09,
    "343b": 0.33,
    "451a": -0.04,
    "451b": 0,
    "442a": -0.18,
    "442b": -0.12
  },
  "442a": {
    "352": -0.07,
    "433": 0.31,
    "532": 0.2,
    "541": 0.36,
    "343a": 0.08,
    "343b": 0.22,
    "451a": 0.15,
    "451b": 0.18,
    "442a": 0,
    "442b": 0.06
  },
  "442b": {
    "352": -0.21,
    "433": 0.13,
    "532": 0.1,
    "541": 0.3,
    "343a": 0.15,
    "343b": 0.1,
    "451a": 0.1,
    "451b": 0.12,
    "442a": -0.06,
    "442b": 0
  }
}
