import { query } from '../lib/database.js'
import { sendToUser } from '../lib/websocket.js'

/**
 * Tutorial step indices. The user moves through them in order.
 *
 * 0  → no team yet, awaiting team selection
 * 1  → team chosen, awaiting formation save
 * 2  → formation saved, awaiting a level-up action card play
 * 3  → level-up card played, awaiting a youth academy upgrade
 * 4  → academy upgraded, awaiting a NEW_YOUTH_PLAYER card play
 * 5  → youth card played, awaiting a player buy from IOC
 * 6  → player bought, awaiting a stadium price update
 * 7  → stadium prices updated, awaiting a sponsor choice
 * 99 → tutorial completed (or skipped)
 */
export const TUTORIAL_STEPS = {
  NOT_STARTED: 0,
  PICK_FORMATION: 1,
  PLAY_LEVEL_UP_CARD: 2,
  UPGRADE_YOUTH_ACADEMY: 3,
  PLAY_NEW_YOUTH_CARD: 4,
  BUY_PLAYER: 5,
  UPDATE_STADIUM_PRICES: 6,
  CHOOSE_SPONSOR: 7,
  COMPLETED: 99
}

const VALID_STEPS = new Set(Object.values(TUTORIAL_STEPS))

/**
 * Look up the user's current tutorial step.
 * @param {number} userId
 * @returns {Promise<number>}
 */
export async function getTutorialStep (userId) {
  if (!userId) return TUTORIAL_STEPS.COMPLETED
  const [row] = await query('SELECT tutorial_step FROM user WHERE id=? LIMIT 1', [userId])
  if (!row) return TUTORIAL_STEPS.COMPLETED
  return row.tutorial_step
}

/**
 * Set the user's tutorial step. No-op outside the valid range.
 * @param {number} userId
 * @param {number} step
 * @returns {Promise<void>}
 */
export async function setTutorialStep (userId, step) {
  if (!userId) return
  if (!VALID_STEPS.has(step)) return
  await query('UPDATE user SET tutorial_step=? WHERE id=?', [step, userId])
  sendToUser(userId, 'TUTORIAL_STEP_CHANGED', { tutorialStep: step })
}

/**
 * Advance the user's tutorial step *only if* their current step matches the
 * expected `currentStep`. Lets call sites be idempotent: e.g. saving the
 * lineup advances step 1 → 2, but calling saveLineup again later (after the
 * user has moved past step 2) leaves the tutorial state untouched.
 * @param {number} userId
 * @param {number} currentStep - the step the user must currently be on
 * @param {number} nextStep - the step to advance them to
 * @returns {Promise<boolean>} true if the advance happened
 */
export async function advanceTutorialIfStep (userId, currentStep, nextStep) {
  if (!userId) return false
  if (!VALID_STEPS.has(nextStep)) return false
  const result = await query(
    'UPDATE user SET tutorial_step=? WHERE id=? AND tutorial_step=?',
    [nextStep, userId, currentStep]
  )
  if (result?.affectedRows > 0) {
    sendToUser(userId, 'TUTORIAL_STEP_CHANGED', { tutorialStep: nextStep })
    return true
  }
  return false
}
