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
