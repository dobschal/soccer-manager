import { randomBytes, scrypt as _scrypt } from 'crypto'
import { promisify } from 'util'

const scrypt = promisify(_scrypt)
const KEY_LENGTH = 64

/**
 * Hash a plaintext password using scrypt.
 * @param {string} password
 * @returns {Promise<string>} "{salt}:{derivedKeyHex}"
 */
export async function hashPassword (password) {
  const salt = randomBytes(16).toString('hex')
  const derivedKey = await scrypt(password, salt, KEY_LENGTH)
  return `${salt}:${derivedKey.toString('hex')}`
}

/**
 * Verify a password against a stored scrypt hash.
 * @param {string} password
 * @param {string} storedHash - "{salt}:{derivedKeyHex}"
 * @returns {Promise<boolean>}
 */
export async function verifyPassword (password, storedHash) {
  const colonIndex = storedHash.indexOf(':')
  if (colonIndex === -1) return false
  const salt = storedHash.slice(0, colonIndex)
  const key = storedHash.slice(colonIndex + 1)
  const derivedKey = await scrypt(password, salt, KEY_LENGTH)
  return derivedKey.toString('hex') === key
}
