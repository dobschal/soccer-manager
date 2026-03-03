import { ADMIN_USERNAME } from '../client/util/constants.js'

export const config = {
  SECRET: process.env.JWT_SECRET || 'r29t24hg938gh384hh400GH$(hg84',
  ADMIN_USERNAME,
  APN_KEY_PATH: process.env.APN_KEY_PATH || '',
  APN_KEY_ID: process.env.APN_KEY_ID || '',
  APN_TEAM_ID: process.env.APN_TEAM_ID || '',
  APN_BUNDLE_ID: process.env.APN_BUNDLE_ID || 'io.soccermanager.app',
  APN_PRODUCTION: process.env.APN_PRODUCTION === 'true'
}
