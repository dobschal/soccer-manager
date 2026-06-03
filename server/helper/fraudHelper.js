import { query } from '../lib/database.js'

const FREQUENT_TRADES_WINDOW_DAYS = 60
const FREQUENT_TRADES_THRESHOLD = 3
const UNDERVALUED_RATIO = 0.5
const OVERVALUED_RATIO = 2.0
const PRICE_DEVIATION_LOOKBACK_DAYS = 60
const PRICE_DEVIATION_MIN_VALUE = 100_000
const SHARED_IP_LOOKBACK_DAYS = 365

/**
 * Approximate market value of a player from level alone, matching
 * {@link getAveragePlanPriceOfPlayer} for an age-22 player (40M at level 100,
 * halving roughly every 10 levels). trade_history only stores the player's
 * level at trade time, so we can't apply the age penalty here. This is a
 * conservative upper bound on value, which means the "under value" detector
 * may miss some fishy trades for older players, while the "over value"
 * detector won't fire spuriously on aged players.
 * @param {number|null} level
 * @returns {number|null}
 */
function _approxMarketValueByLevel (level) {
  if (level == null) return null
  let price = 40_000_000
  for (let l = 100; l > level; l--) price *= 0.9330329915368074
  return Math.floor(price)
}

/**
 * Detector: pairs of user accounts that have logged in from the same IP.
 * Catches the most obvious multi-account fraud pattern.
 * @returns {Promise<Array>}
 */
async function _detectSharedIp () {
  const rows = await query(
    `SELECT u.id AS user_id, u.username, u.last_login,
            t.name AS team_name,
            u.last_ip_web AS ip_web, u.last_ip_ios AS ip_ios, u.last_ip_android AS ip_android
     FROM user u
     LEFT JOIN team t ON t.user_id = u.id
     WHERE (u.last_ip_web IS NOT NULL OR u.last_ip_ios IS NOT NULL OR u.last_ip_android IS NOT NULL)
       AND u.last_login IS NOT NULL
       AND u.last_login > DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [SHARED_IP_LOOKBACK_DAYS]
  )
  const ipToUsers = new Map()
  for (const r of rows) {
    const ips = [r.ip_web, r.ip_ios, r.ip_android].filter(Boolean)
    const seen = new Set()
    for (const ip of ips) {
      if (seen.has(ip)) continue
      seen.add(ip)
      if (!ipToUsers.has(ip)) ipToUsers.set(ip, [])
      ipToUsers.get(ip).push(r)
    }
  }
  const events = []
  const seenPair = new Set()
  for (const [ip, users] of ipToUsers) {
    if (users.length < 2) continue
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        const a = users[i]
        const b = users[j]
        if (a.user_id === b.user_id) continue
        const pairKey = a.user_id < b.user_id ? `${a.user_id}-${b.user_id}` : `${b.user_id}-${a.user_id}`
        if (seenPair.has(pairKey)) continue
        seenPair.add(pairKey)
        const time = new Date(Math.max(
          new Date(a.last_login).getTime(),
          new Date(b.last_login).getTime()
        ))
        events.push({
          type: 'shared_ip',
          time,
          description_key: 'admin.fraudDescSharedIp',
          description_params: { ip },
          user1: { username: a.username, team_name: a.team_name },
          user2: { username: b.username, team_name: b.team_name }
        })
      }
    }
  }
  return events
}

/**
 * Detector: pairs of user-owned teams that traded with each other unusually
 * often. Group is direction-agnostic — A→B and B→A count together.
 * @returns {Promise<Array>}
 */
async function _detectFrequentTrades () {
  const rows = await query(
    `SELECT
        LEAST(th.from_team_id, th.to_team_id) AS team_a_id,
        GREATEST(th.from_team_id, th.to_team_id) AS team_b_id,
        COUNT(*) AS trade_count,
        MAX(th.created_at) AS last_trade
     FROM trade_history th
     JOIN team t1 ON t1.id = th.from_team_id
     JOIN team t2 ON t2.id = th.to_team_id
     WHERE th.created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
       AND t1.user_id IS NOT NULL AND t2.user_id IS NOT NULL
       AND (t1.is_system_team = 0 OR t1.is_system_team IS NULL)
       AND (t2.is_system_team = 0 OR t2.is_system_team IS NULL)
     GROUP BY LEAST(th.from_team_id, th.to_team_id), GREATEST(th.from_team_id, th.to_team_id)
     HAVING COUNT(*) >= ?`,
    [FREQUENT_TRADES_WINDOW_DAYS, FREQUENT_TRADES_THRESHOLD]
  )
  if (rows.length === 0) return []
  const teamIds = [...new Set(rows.flatMap(r => [r.team_a_id, r.team_b_id]))]
  const placeholders = teamIds.map(() => '?').join(',')
  const teams = await query(
    `SELECT t.id, t.name, u.username
     FROM team t LEFT JOIN user u ON u.id = t.user_id
     WHERE t.id IN (${placeholders})`,
    teamIds
  )
  const teamById = new Map(teams.map(t => [t.id, t]))
  return rows.map(r => {
    const a = teamById.get(r.team_a_id) || {}
    const b = teamById.get(r.team_b_id) || {}
    return {
      type: 'frequent_trades',
      time: new Date(r.last_trade),
      description_key: 'admin.fraudDescFrequentTrades',
      description_params: { count: Number(r.trade_count), days: FREQUENT_TRADES_WINDOW_DAYS },
      user1: { username: a.username, team_name: a.name },
      user2: { username: b.username, team_name: b.name }
    }
  })
}

/**
 * Detector: trades whose price deviates significantly from the player's
 * estimated market value at that level. Only flags trades that involve at
 * least one human user (i.e. ignores bot-to-bot or IOC-to-bot trades).
 * @returns {Promise<Array>}
 */
async function _detectPriceDeviation () {
  const rows = await query(
    `SELECT
        th.price, th.player_level, th.created_at,
        t1.name AS from_team_name, t1.user_id AS from_user_id, u1.username AS from_username,
        t2.name AS to_team_name, t2.user_id AS to_user_id, u2.username AS to_username
     FROM trade_history th
     JOIN team t1 ON t1.id = th.from_team_id
     JOIN team t2 ON t2.id = th.to_team_id
     LEFT JOIN user u1 ON u1.id = t1.user_id
     LEFT JOIN user u2 ON u2.id = t2.user_id
     WHERE th.created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
       AND th.player_level IS NOT NULL
       AND (t1.user_id IS NOT NULL OR t2.user_id IS NOT NULL)`,
    [PRICE_DEVIATION_LOOKBACK_DAYS]
  )
  const events = []
  for (const r of rows) {
    const value = _approxMarketValueByLevel(r.player_level)
    if (!value || value < PRICE_DEVIATION_MIN_VALUE) continue
    const ratio = r.price / value
    let type, key
    if (ratio < UNDERVALUED_RATIO) {
      type = 'undervalued_trade'
      key = 'admin.fraudDescUndervaluedTrade'
    } else if (ratio > OVERVALUED_RATIO) {
      type = 'overvalued_trade'
      key = 'admin.fraudDescOvervaluedTrade'
    } else {
      continue
    }
    events.push({
      type,
      time: new Date(r.created_at),
      description_key: key,
      description_params: { price: r.price, value, percent: Math.round(ratio * 100) },
      user1: { username: r.from_username, team_name: r.from_team_name },
      user2: { username: r.to_username, team_name: r.to_team_name }
    })
  }
  return events
}

/**
 * Aggregate suspicious actions across all detectors, sort by time DESC and
 * paginate. Total is the count across all detectors, not just the current
 * page. Returned `time` is an ISO string.
 * @param {{limit?: number, offset?: number}} [opts]
 * @returns {Promise<{rows: Array, total: number}>}
 */
export async function getSuspiciousActions ({ limit = 10, offset = 0 } = {}) {
  const [sharedIp, frequentTrades, priceDeviation] = await Promise.all([
    _detectSharedIp(),
    _detectFrequentTrades(),
    _detectPriceDeviation()
  ])
  const all = [...sharedIp, ...frequentTrades, ...priceDeviation]
  all.sort((a, b) => b.time.getTime() - a.time.getTime())
  const total = all.length
  const rows = all.slice(offset, offset + limit).map(e => ({
    ...e,
    time: e.time.toISOString()
  }))
  return { rows, total }
}

export const __testing = {
  _approxMarketValueByLevel,
  _detectSharedIp,
  _detectFrequentTrades,
  _detectPriceDeviation,
  FREQUENT_TRADES_WINDOW_DAYS,
  FREQUENT_TRADES_THRESHOLD,
  UNDERVALUED_RATIO,
  OVERVALUED_RATIO,
  PRICE_DEVIATION_MIN_VALUE
}
