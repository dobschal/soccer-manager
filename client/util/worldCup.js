import { t } from '../i18n/index.js'

/**
 * Build a flag image URL from a flagcdn-compatible country code.
 *
 * @param {string} code - lowercase ISO 3166-1 alpha-2 (or FIFA override e.g. `gb-eng`)
 * @param {number} [width] - one of 20, 40, 80, 160, 320
 * @returns {string}
 */
export function flagUrl (code, width = 80) {
  return `https://flagcdn.com/w${width}/${code}.png`
}

/**
 * @returns {string[]}
 */
export function allStages () {
  return ['group', 'round_of_32', 'round_of_16', 'quarter', 'semi', 'third_place', 'final']
}

/**
 * Translate a stage key for display.
 * @param {string} stage
 * @returns {string}
 */
export function stageLabel (stage) {
  const key = {
    group: 'worldCup.stageGroup',
    round_of_32: 'worldCup.stageRoundOf32',
    round_of_16: 'worldCup.stageRoundOf16',
    quarter: 'worldCup.stageQuarter',
    semi: 'worldCup.stageSemi',
    third_place: 'worldCup.stageThirdPlace',
    final: 'worldCup.stageFinal'
  }[stage]
  return key ? t(key) : stage
}
