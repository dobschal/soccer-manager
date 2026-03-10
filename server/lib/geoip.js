import geoip from 'geoip-lite'

/**
 * Extract client IP and resolve country/region from request.
 * @param {import('express').Request} req
 * @returns {{ ip: string, country: string|null, region: string|null }}
 */
export function getGeoFromRequest (req) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown'
  // Strip IPv6-mapped IPv4 prefix
  const cleanIp = ip.replace(/^::ffff:/, '')
  const geo = geoip.lookup(cleanIp)
  return {
    ip: cleanIp,
    country: geo?.country || null,
    region: geo?.region || null
  }
}
