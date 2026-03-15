import geoip from 'geoip-lite'

/**
 * Extract client IP and resolve country/region from request.
 * @param {import('express').Request} req
 * @returns {{ ip: string, country: string|null, region: string|null }}
 */
export function getGeoFromRequest (req) {
  // Prefer the leftmost (original client) IP from X-Forwarded-For,
  // then X-Real-IP, then fall back to req.ip / remoteAddress
  const forwarded = req.headers['x-forwarded-for']
  const ip = (forwarded ? forwarded.split(',')[0].trim() : null) ||
    req.headers['x-real-ip'] ||
    req.ip ||
    req.connection?.remoteAddress ||
    'unknown'
  // Strip IPv6-mapped IPv4 prefix
  const cleanIp = ip.replace(/^::ffff:/, '')
  const geo = geoip.lookup(cleanIp)
  return {
    ip: cleanIp,
    country: geo?.country || null,
    region: geo?.region || null
  }
}
