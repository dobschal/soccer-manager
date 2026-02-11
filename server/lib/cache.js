/**
 * Generic in-memory cache with TTL and request deduplication
 */

// Cache storage: Map<cacheKey, { data: any, timestamp: number }>
const caches = new Map()
// Pending requests: Map<cacheKey, Promise>
const pendingRequests = new Map()

const DEFAULT_TTL_MS = 60 * 1000 // 1 minute

/**
 * Get or compute cached value with request deduplication
 * @param {string} cacheKey - Unique cache key
 * @param {() => Promise<any>} computeFn - Function to compute value if not cached
 * @param {number} [ttlMs] - Time to live in milliseconds (default: 60 seconds)
 * @returns {Promise<any>}
 */
export async function getCached (cacheKey, computeFn, ttlMs = DEFAULT_TTL_MS) {
  // Check cache first
  const cached = caches.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < ttlMs) {
    return cached.data
  }

  // Check if there's already a pending request for this key
  const pending = pendingRequests.get(cacheKey)
  if (pending) {
    return pending
  }

  // Create a new request and store the promise
  const requestPromise = (async () => {
    try {
      const data = await computeFn()
      caches.set(cacheKey, { data, timestamp: Date.now() })
      return data
    } finally {
      pendingRequests.delete(cacheKey)
    }
  })()

  pendingRequests.set(cacheKey, requestPromise)
  return requestPromise
}

/**
 * Clear cache entries matching a prefix
 * @param {string} prefix - Cache key prefix to match
 */
export function clearCacheByPrefix (prefix) {
  for (const key of caches.keys()) {
    if (key.startsWith(prefix)) {
      caches.delete(key)
    }
  }
  for (const key of pendingRequests.keys()) {
    if (key.startsWith(prefix)) {
      pendingRequests.delete(key)
    }
  }
}

/**
 * Clear a specific cache entry
 * @param {string} cacheKey - Exact cache key to clear
 */
export function clearCache (cacheKey) {
  caches.delete(cacheKey)
  pendingRequests.delete(cacheKey)
}

/**
 * Clear all cache entries (for testing)
 */
export function clearAllCache () {
  caches.clear()
  pendingRequests.clear()
}

/**
 * Generate a cache key from multiple parameters
 * @param {string} namespace - Cache namespace (e.g., 'seasonResults')
 * @param  {...any} params - Parameters to include in the key
 * @returns {string}
 */
export function cacheKey (namespace, ...params) {
  return `${namespace}:${params.join(':')}`
}

// Cache namespaces for easy reference
export const CACHE_NAMESPACES = {
  SEASON_RESULTS: 'seasonResults',
  GAME: 'game',
  TEAM: 'team'
}
