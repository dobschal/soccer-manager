import { query } from '../lib/database.js'

const FREQUENT_TRADES_WINDOW_DAYS = 60
const FREQUENT_TRADES_THRESHOLD = 3
const UNDERVALUED_RATIO = 0.5
const OVERVALUED_RATIO = 2.0
const PRICE_DEVIATION_LOOKBACK_DAYS = 60
const PRICE_DEVIATION_MIN_VALUE = 100_000
const SHARED_IP_LOOKBACK_DAYS = 365
const INSTANT_PICKUP_LOOKBACK_DAYS = 60
const INSTANT_PICKUP_MAX_SECONDS = 300
const INSTANT_PICKUP_MIN_COUNT = 2

/**
 * Approximate market value of a player from level alone, matching
 * {@link getAveragePlanPriceOfPlayer} for an age-22 player (40M at level 100,
 * halving roughly every 10 levels). Used as a fallback when the trade row
 * has no player age data.
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
 * Market-value approximation that mirrors the real pricing curve used by the
 * game ({@link getAveragePlanPriceOfPlayer}): 40M at level 100 age 22,
 * × 0.9330... per level below 100, × 0.85 per year above 22. trade_history
 * only stores `player_level`, so we look up the player's `carrier_start_season`
 * and derive the age at trade time from the trade's own season.
 * @param {number|null} level
 * @param {number|null} tradeSeason
 * @param {number|null} carrierStartSeason
 * @returns {number|null}
 */
function _approxMarketValue (level, tradeSeason, carrierStartSeason) {
  if (level == null) return null
  let price = 40_000_000
  for (let l = 100; l > level; l--) price *= 0.9330329915368074
  const age = (tradeSeason != null && carrierStartSeason != null)
    ? tradeSeason - carrierStartSeason + 16
    : 22
  for (let a = 22; a < age; a++) price *= 0.85
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
 * Detector: pairs of users that have logged in from the same physical device
 * (same persisted device UUID). Stronger signal than shared IP because a
 * device UUID is unique per browser profile / install.
 * @returns {Promise<Array>}
 */
async function _detectSharedDevice () {
  const rows = await query(
    `SELECT ud.device_uuid, ud.user_id, ud.last_seen,
            u.username, t.name AS team_name
     FROM user_device ud
     JOIN user u ON u.id = ud.user_id
     LEFT JOIN team t ON t.user_id = u.id
     WHERE ud.device_uuid IN (
       SELECT device_uuid FROM user_device
       GROUP BY device_uuid HAVING COUNT(DISTINCT user_id) > 1
     )`
  )
  const byUuid = new Map()
  for (const r of rows) {
    if (!byUuid.has(r.device_uuid)) byUuid.set(r.device_uuid, [])
    byUuid.get(r.device_uuid).push(r)
  }
  const events = []
  const seenPair = new Set()
  for (const [, users] of byUuid) {
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        const a = users[i]
        const b = users[j]
        if (a.user_id === b.user_id) continue
        const pairKey = a.user_id < b.user_id ? `${a.user_id}-${b.user_id}` : `${b.user_id}-${a.user_id}`
        if (seenPair.has(pairKey)) continue
        seenPair.add(pairKey)
        const time = new Date(Math.max(
          new Date(a.last_seen).getTime(),
          new Date(b.last_seen).getTime()
        ))
        events.push({
          type: 'shared_device',
          time,
          description_key: 'admin.fraudDescSharedDevice',
          description_params: {},
          user1: { username: a.username, team_name: a.team_name },
          user2: { username: b.username, team_name: b.team_name }
        })
      }
    }
  }
  return events
}

/**
 * Detector: pairs of users that registered the same push token. A push token
 * is issued per app install, so two accounts sharing one is a harder signal
 * than the localStorage device UUID — it survives clearing browser storage and
 * is the only device trace left for native-only players.
 * @returns {Promise<Array>}
 */
async function _detectSharedPushToken () {
  const rows = await query(
    `SELECT dt.token, dt.user_id, dt.platform, dt.updated_at,
            u.username, t.name AS team_name
     FROM device_token dt
     JOIN user u ON u.id = dt.user_id
     LEFT JOIN team t ON t.user_id = u.id
     WHERE dt.token IN (
       SELECT token FROM device_token
       GROUP BY token HAVING COUNT(DISTINCT user_id) > 1
     )`
  )
  const byToken = new Map()
  for (const r of rows) {
    if (!byToken.has(r.token)) byToken.set(r.token, [])
    byToken.get(r.token).push(r)
  }
  const events = []
  const seenPair = new Set()
  for (const [, users] of byToken) {
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        const a = users[i]
        const b = users[j]
        if (a.user_id === b.user_id) continue
        const pairKey = a.user_id < b.user_id ? `${a.user_id}-${b.user_id}` : `${b.user_id}-${a.user_id}`
        if (seenPair.has(pairKey)) continue
        seenPair.add(pairKey)
        const time = new Date(Math.max(
          new Date(a.updated_at).getTime(),
          new Date(b.updated_at).getTime()
        ))
        events.push({
          type: 'shared_push_token',
          time,
          description_key: 'admin.fraudDescSharedPushToken',
          description_params: { platform: a.platform || b.platform || '?' },
          user1: { username: a.username, team_name: a.team_name },
          user2: { username: b.username, team_name: b.team_name }
        })
      }
    }
  }
  return events
}

/**
 * Detector: invite rewards claimed by the inviter themselves. Covers both
 * invite flows:
 *
 * - `link_invite` matches an anonymous click by IP, so an inviter who opens
 *   their own link and registers shows up as an invitee IP that equals one of
 *   the inviter's own last-known IPs.
 * - `referral_invitation` matches by email, so the give-away is the invited
 *   account later logging in from the same IP or device as the inviter.
 *
 * @returns {Promise<Array>}
 */
async function _detectSelfInvite () {
  const linkRows = await query(
    `SELECT li.invitee_ip, li.used_at, li.created_at,
            inviter.username AS inviter_username, it.name AS inviter_team,
            invitee.username AS invitee_username, vt.name AS invitee_team
     FROM link_invite li
     JOIN user inviter ON inviter.id = li.inviter_user_id
     LEFT JOIN team it ON it.user_id = inviter.id
     JOIN user invitee ON invitee.id = li.used_by_user_id
     LEFT JOIN team vt ON vt.user_id = invitee.id
     WHERE li.used_by_user_id IS NOT NULL
       AND li.invitee_ip IN (inviter.last_ip_web, inviter.last_ip_ios, inviter.last_ip_android)`
  )
  const events = linkRows.map(r => ({
    type: 'self_invite_link',
    time: new Date(r.used_at || r.created_at),
    description_key: 'admin.fraudDescSelfInviteLink',
    description_params: { ip: r.invitee_ip },
    user1: { username: r.inviter_username, team_name: r.inviter_team },
    user2: { username: r.invitee_username, team_name: r.invitee_team }
  }))

  // Email referrals: flag when inviter and invitee share an IP or a device.
  const referralRows = await query(
    `SELECT ri.used_at, ri.created_at,
            inviter.username AS inviter_username, it.name AS inviter_team,
            invitee.username AS invitee_username, vt.name AS invitee_team,
            EXISTS (
              SELECT 1 FROM user_device d1
              JOIN user_device d2 ON d2.device_uuid = d1.device_uuid
              WHERE d1.user_id = inviter.id AND d2.user_id = invitee.id
            ) AS same_device,
            (inviter.last_ip_web IS NOT NULL AND inviter.last_ip_web IN
               (invitee.last_ip_web, invitee.last_ip_ios, invitee.last_ip_android)) AS same_ip_web,
            (inviter.last_ip_ios IS NOT NULL AND inviter.last_ip_ios IN
               (invitee.last_ip_web, invitee.last_ip_ios, invitee.last_ip_android)) AS same_ip_ios,
            (inviter.last_ip_android IS NOT NULL AND inviter.last_ip_android IN
               (invitee.last_ip_web, invitee.last_ip_ios, invitee.last_ip_android)) AS same_ip_android
     FROM referral_invitation ri
     JOIN user inviter ON inviter.id = ri.inviter_user_id
     LEFT JOIN team it ON it.user_id = inviter.id
     JOIN user invitee ON invitee.id = ri.used_by_user_id
     LEFT JOIN team vt ON vt.user_id = invitee.id
     WHERE ri.used_by_user_id IS NOT NULL`
  )
  for (const r of referralRows) {
    const sameIp = Boolean(Number(r.same_ip_web) || Number(r.same_ip_ios) || Number(r.same_ip_android))
    const sameDevice = Boolean(Number(r.same_device))
    if (!sameIp && !sameDevice) continue
    events.push({
      type: 'self_referral',
      time: new Date(r.used_at || r.created_at),
      description_key: sameDevice
        ? 'admin.fraudDescSelfReferralDevice'
        : 'admin.fraudDescSelfReferralIp',
      description_params: {},
      user1: { username: r.inviter_username, team_name: r.inviter_team },
      user2: { username: r.invitee_username, team_name: r.invitee_team }
    })
  }
  return events
}

/**
 * Detector: action-card auctions that are consistently won by the same team
 * seconds after being listed. A genuine auction runs for hours, so a pair
 * whose average listing→winning-bid gap is under
 * {@link INSTANT_PICKUP_MAX_SECONDS} is coordinating outside the game — the
 * sharpest collusion signal available, and the only one that covers the
 * action-card economy at all.
 * @returns {Promise<Array>}
 */
async function _detectInstantCardPickup () {
  const rows = await query(
    `SELECT ts.name AS seller_team, us.username AS seller_username,
            tb.name AS buyer_team, ub.username AS buyer_username,
            COUNT(*) AS pickup_count,
            SUM(b.money) AS total_money,
            ROUND(AVG(TIMESTAMPDIFF(SECOND, o.created_at, b.created_at))) AS avg_seconds,
            MAX(b.created_at) AS last_pickup
     FROM action_card_bid b
     JOIN action_card_offer o ON o.id = b.offer_id
     JOIN team ts ON ts.id = o.from_team_id
     JOIN team tb ON tb.id = b.bidder_team_id
     JOIN user us ON us.id = ts.user_id
     JOIN user ub ON ub.id = tb.user_id
     WHERE b.status = 'accepted'
       AND o.from_team_id <> b.bidder_team_id
       AND b.created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY o.from_team_id, b.bidder_team_id, ts.name, us.username, tb.name, ub.username
     HAVING COUNT(*) >= ? AND AVG(TIMESTAMPDIFF(SECOND, o.created_at, b.created_at)) <= ?`,
    [INSTANT_PICKUP_LOOKBACK_DAYS, INSTANT_PICKUP_MIN_COUNT, INSTANT_PICKUP_MAX_SECONDS]
  )
  return rows.map(r => ({
    type: 'instant_card_pickup',
    time: new Date(r.last_pickup),
    description_key: 'admin.fraudDescInstantCardPickup',
    description_params: {
      count: Number(r.pickup_count),
      seconds: Number(r.avg_seconds),
      total: Number(r.total_money)
    },
    user1: { username: r.seller_username, team_name: r.seller_team },
    user2: { username: r.buyer_username, team_name: r.buyer_team }
  }))
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
        th.price, th.player_level, th.created_at, th.season AS trade_season,
        p.carrier_start_season AS carrier_start_season,
        t1.name AS from_team_name, t1.user_id AS from_user_id, u1.username AS from_username,
        t2.name AS to_team_name, t2.user_id AS to_user_id, u2.username AS to_username
     FROM trade_history th
     JOIN team t1 ON t1.id = th.from_team_id
     JOIN team t2 ON t2.id = th.to_team_id
     LEFT JOIN player p ON p.id = th.player_id
     LEFT JOIN user u1 ON u1.id = t1.user_id
     LEFT JOIN user u2 ON u2.id = t2.user_id
     WHERE th.created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
       AND th.player_level IS NOT NULL
       AND (t1.user_id IS NOT NULL OR t2.user_id IS NOT NULL)`,
    [PRICE_DEVIATION_LOOKBACK_DAYS]
  )
  const events = []
  for (const r of rows) {
    const value = _approxMarketValue(r.player_level, r.trade_season, r.carrier_start_season)
    if (!value || value < PRICE_DEVIATION_MIN_VALUE) continue
    const ratio = r.price / value
    let type, key, percent
    if (ratio < UNDERVALUED_RATIO) {
      type = 'undervalued_trade'
      key = 'admin.fraudDescUndervaluedTrade'
      percent = Math.round((1 - ratio) * 100)
    } else if (ratio > OVERVALUED_RATIO) {
      type = 'overvalued_trade'
      key = 'admin.fraudDescOvervaluedTrade'
      percent = Math.round((ratio - 1) * 100)
    } else {
      continue
    }
    events.push({
      type,
      time: new Date(r.created_at),
      description_key: key,
      description_params: { price: r.price, value, percent },
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
  // New detectors are appended so the existing four keep their dispatch order.
  const [
    sharedIp, sharedDevice, frequentTrades, priceDeviation,
    sharedPushToken, selfInvite, instantCardPickup
  ] = await Promise.all([
    _detectSharedIp(),
    _detectSharedDevice(),
    _detectFrequentTrades(),
    _detectPriceDeviation(),
    _detectSharedPushToken(),
    _detectSelfInvite(),
    _detectInstantCardPickup()
  ])
  const all = [
    ...sharedIp, ...sharedDevice, ...frequentTrades, ...priceDeviation,
    ...sharedPushToken, ...selfInvite, ...instantCardPickup
  ]
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
  _approxMarketValue,
  _detectSharedIp,
  _detectSharedDevice,
  _detectFrequentTrades,
  _detectPriceDeviation,
  _detectSharedPushToken,
  _detectSelfInvite,
  _detectInstantCardPickup,
  FREQUENT_TRADES_WINDOW_DAYS,
  FREQUENT_TRADES_THRESHOLD,
  UNDERVALUED_RATIO,
  OVERVALUED_RATIO,
  PRICE_DEVIATION_MIN_VALUE,
  INSTANT_PICKUP_MAX_SECONDS,
  INSTANT_PICKUP_MIN_COUNT
}
