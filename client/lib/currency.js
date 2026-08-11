import { getLocale } from '../i18n/index.js'

export const euroFormat = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0
})

/**
 * Scale steps for `shortEuroFormat`, largest first. Amounts below the smallest
 * threshold are shown in full. The units are the same in every language.
 * @type {Array<{threshold: number, divisor: number, unit: string}>}
 */
const SHORT_STEPS = [
  { threshold: 1_000_000_000, divisor: 1_000_000_000, unit: 'b' },
  { threshold: 1_000_000, divisor: 1_000_000, unit: 'm' },
  { threshold: 1_000, divisor: 1_000, unit: 'k' }
]

/** Cached per locale, because `Intl.NumberFormat` is expensive to construct. */
const shortNumberFormats = {}

/**
 * @param {number} decimals
 * @returns {Intl.NumberFormat}
 */
function shortNumberFormat (decimals) {
  // German writes 9,8k — English 9.8k.
  const locale = getLocale() === 'de' ? 'de-DE' : 'en-US'
  const key = `${locale}-${decimals}`
  shortNumberFormats[key] ??= new Intl.NumberFormat(locale, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0
  })
  return shortNumberFormats[key]
}

/**
 * Abbreviate a euro amount for tight spots like the info bar (#523). At most
 * three digits and at most one decimal, so the width stays predictable:
 * 706.123 € → "706k €", 9.845 € → "9,8k €", 15.987.654 € → "15,9m €". Amounts
 * below 1.000 stay exact — there the full number is short enough anyway.
 *
 * The decimal is truncated, not rounded, so the shown digits are always digits
 * the player actually has (15,9m never reads as 16m).
 * @param {number} amount
 * @returns {string}
 */
export function shortEuroFormat (amount) {
  const value = Number(amount) || 0
  const step = SHORT_STEPS.find(s => Math.abs(value) >= s.threshold)
  if (!step) return euroFormat.format(value)
  const scaled = value / step.divisor
  // Three digits total: 706 has no room left for a decimal, 15.9 does.
  const decimals = Math.abs(scaled) >= 100 ? 0 : 1
  const factor = 10 ** decimals
  const truncated = Math.trunc(scaled * factor) / factor
  return `${shortNumberFormat(decimals).format(truncated)}${step.unit} €`
}
