export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail (email) {
  return typeof email === 'string' && email.length <= 255 && EMAIL_REGEX.test(email.trim())
}
