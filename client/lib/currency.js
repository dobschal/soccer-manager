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
  { threshold: 1_000_000_000, divisor: 1_000_000_000, unit: 'B' },
  { threshold: 1_000_000, divisor: 1_000_000, unit: 'M' },
  { threshold: 1_000, divisor: 1_000, unit: 'K' }
]

/**
 * Abbreviate a euro amount for tight spots like the info bar (#523). At most
 * three digits and at most one decimal, so the width stays predictable:
 * 706.123 € → "706K €", 9.845 € → "9.8K €", 15.987.654 € → "15.9M €". Amounts
 * below 1.000 stay exact — there the full number is short enough anyway.
 *
 * The abbreviation is deliberately locale-independent: the unit letter is
 * always upper case and the decimal is always a point, because "9.9M €" is how
 * the short form is read in both languages. Only the exact amounts below 1.000
 * follow the German currency format.
 *
 * The decimal is truncated, not rounded, so the shown digits are always digits
 * the player actually has (15.9M never reads as 16M).
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
  // `String` gives the shortest round-trip form, so a whole number stays whole
  // ("10M", not "10.0M") — the same as the old formatter's minimumFractionDigits: 0.
  return `${String(truncated)}${step.unit} €`
}
