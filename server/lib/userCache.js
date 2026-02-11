import { query } from './database.js'

// User cache to avoid database query on every authenticated request
const userCache = new Map()
// Pending requests to prevent cache stampede
const pendingRequests = new Map()
const USER_CACHE_TTL_MS = 60 * 1000 // 1 minute

/**
 * Get user from cache or database
 * @param {number} userId
 * @returns {Promise<object|null>}
 */
export async function getCachedUser (userId) {
  // Check cache first
  const cached = userCache.get(userId)
  if (cached && Date.now() - cached.timestamp < USER_CACHE_TTL_MS) {
    return cached.user
  }

  // Check if there's already a pending request for this user
  const pending = pendingRequests.get(userId)
  if (pending) {
    return pending
  }

  // Create a new request and store the promise
  const requestPromise = (async () => {
    try {
      const [user] = await query('SELECT * FROM user WHERE id=? LIMIT 1', [userId])
      if (user) {
        userCache.set(userId, { user, timestamp: Date.now() })
      }
      return user || null
    } finally {
      // Remove from pending once complete
      pendingRequests.delete(userId)
    }
  })()

  pendingRequests.set(userId, requestPromise)
  return requestPromise
}

/**
 * Clear user from cache (call after user updates)
 * @param {number} userId
 */
export function clearUserCache (userId) {
  userCache.delete(userId)
  pendingRequests.delete(userId)
}

/**
 * Clear entire user cache (for testing)
 */
export function clearAllUserCache () {
  userCache.clear()
  pendingRequests.clear()
}
