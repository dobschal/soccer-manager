export const config = {
  SECRET: process.env.JWT_SECRET || 'r29t24hg938gh384hh400GH$(hg84',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'Emmo',
  APN_KEY_PATH: process.env.APN_KEY_PATH || '',
  APN_KEY_ID: process.env.APN_KEY_ID || '',
  APN_TEAM_ID: process.env.APN_TEAM_ID || '',
  APN_BUNDLE_ID: process.env.APN_BUNDLE_ID || 'io.soccermanager.app',
  APN_PRODUCTION: process.env.APN_PRODUCTION === 'true',
  FCM_SERVICE_ACCOUNT_PATH: process.env.FCM_SERVICE_ACCOUNT_PATH || '',
  INACTIVE_USER_DAYS: 21,
  // Lowest level a new user is allowed to take over a bot team from.
  // Used both by team-choice (gating which teams appear) and by the
  // season-prep level-opening rule (which counts the bot buffer in the
  // bottom user-pickable levels).
  MIN_CHOOSABLE_LEVEL: 2,
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  EMAIL_FROM: process.env.EMAIL_FROM || 'no-reply@footballmanager.io',
  PUBLIC_URL: process.env.PUBLIC_URL || 'https://footballmanager.io'
}
