/**
 * Training mode catalog shared by the youth-team page and its per-row UIElement.
 * The effect numbers here are display-only (rendered inside the mode cards);
 * the real training math lives server-side.
 */
export const TRAINING_MODES = [
  {
    key: 'training',
    icon: 'fa-bolt',
    effects: {
      level: 2,
      fitness: 1,
      moral: -1
    }
  },
  {
    key: 'friendly_match',
    icon: 'fa-futbol-o',
    effects: {
      level: 1,
      fitness: -1,
      moral: 1
    }
  },
  {
    key: 'rest',
    icon: 'fa-bed',
    effects: {
      level: 0,
      fitness: 2,
      moral: 1
    }
  }
]

export const MAX_SLOTS_PER_MODE = 4

/**
 * Every youth player is always in one of the three modes: a player without an
 * explicit `training_mode` rests (that is what the server's training run does
 * with them too), so there is no "unassigned" state in the UI.
 */
export const DEFAULT_TRAINING_MODE = 'rest'

/**
 * The mode a youth player is effectively in — their own, or the default.
 * @param {{training_mode?: string|null}} player
 * @returns {string}
 */
export function effectiveTrainingMode (player) {
  return player?.training_mode || DEFAULT_TRAINING_MODE
}
