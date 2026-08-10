import { config } from '../config.js'
import { t } from '../i18n/index.js'

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail (email) {
  return typeof email === 'string' && email.length <= 255 && EMAIL_REGEX.test(email)
}

let cachedTransporter
let transporterLoadAttempted = false

/**
 * Lazily build an SMTP transporter when SMTP is configured.
 * Returns null in dev/sandbox where SMTP is not configured.
 * @returns {Promise<object|null>}
 */
async function getTransporter () {
  if (cachedTransporter || transporterLoadAttempted) return cachedTransporter || null
  transporterLoadAttempted = true
  if (!config.SMTP_HOST) return null
  try {
    const mod = await import('nodemailer')
    const nodemailer = mod.default ?? mod
    cachedTransporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: config.SMTP_USER
        ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
        : undefined
    })
    return cachedTransporter
  } catch (e) {
    console.error('[Email] nodemailer not available, falling back to log-only mode:', e?.message ?? e)
    return null
  }
}

/**
 * Render the verification email HTML.
 * @param {object} args
 * @param {string} args.url - verification URL
 * @param {string} args.locale - 'en' or 'de'
 * @param {string} args.username
 * @returns {string}
 */
function renderVerificationEmailHtml ({ url, locale, username }) {
  const logoUrl = `${config.PUBLIC_URL}/assets/logo.svg`
  const supportUrl = `${config.PUBLIC_URL}/support.html`
  const privacyUrl = `${config.PUBLIC_URL}/imprint.html`
  const appUrl = config.PUBLIC_URL
  return `<!DOCTYPE html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8">
    <title>${t('email.verify.subject', {}, locale)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#222;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
            <tr>
              <td style="padding:32px 32px 16px 32px;text-align:center;border-bottom:1px solid #eee;">
                <img src="${logoUrl}" alt="FootballManager.IO" height="48" style="display:inline-block;vertical-align:middle;">
                <div style="font-size:20px;font-weight:bold;margin-top:8px;color:#111;">FootballManager.IO</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px 0;font-size:16px;">${t('email.verify.greeting', { username }, locale)}</p>
                <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#444;">
                  ${t('email.verify.body', {}, locale)}
                </p>
                <p style="margin:0 0 32px 0;text-align:center;">
                  <a href="${url}" style="display:inline-block;background-color:#17a2b8;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:8px;font-size:16px;">
                    ${t('email.verify.button', {}, locale)}
                  </a>
                </p>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#666;">
                  ${t('email.verify.fallbackLink', {}, locale)}<br>
                  <a href="${url}" style="color:#17a2b8;word-break:break-all;">${url}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 24px 32px;border-top:1px solid #eee;font-size:12px;color:#666;text-align:center;">
                <a href="${privacyUrl}" style="color:#666;text-decoration:underline;margin:0 8px;">${t('email.footer.privacy', {}, locale)}</a>
                <a href="${supportUrl}" style="color:#666;text-decoration:underline;margin:0 8px;">${t('email.footer.support', {}, locale)}</a>
                <a href="${appUrl}" style="color:#666;text-decoration:underline;margin:0 8px;">${t('email.footer.app', {}, locale)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/**
 * Render plain-text fallback for the verification email.
 * @param {object} args
 * @returns {string}
 */
function renderVerificationEmailText ({ url, locale, username }) {
  return [
    t('email.verify.greeting', { username }, locale),
    '',
    t('email.verify.body', {}, locale),
    '',
    t('email.verify.fallbackLink', {}, locale),
    url,
    '',
    `${config.PUBLIC_URL}`
  ].join('\n')
}

/**
 * Send the verification email to a user.
 * Returns the verification URL so callers can log it in dev.
 * @param {object} args
 * @param {string} args.toEmail
 * @param {string} args.token
 * @param {string} args.locale
 * @param {string} args.username
 * @returns {Promise<{ sent: boolean, url: string }>}
 */
export async function sendVerificationEmail ({ toEmail, token, locale, username }) {
  const url = `${config.PUBLIC_URL}/verify-email.html?token=${encodeURIComponent(token)}&lang=${encodeURIComponent(locale)}`
  const html = renderVerificationEmailHtml({ url, locale, username })
  const text = renderVerificationEmailText({ url, locale, username })
  const subject = t('email.verify.subject', {}, locale)

  const transporter = await getTransporter()
  if (!transporter) {
    console.log(`[Email] SMTP not configured, would send verification to ${toEmail}: ${url}`)
    return { sent: false, url }
  }
  try {
    await transporter.sendMail({
      from: config.EMAIL_FROM,
      to: toEmail,
      subject,
      html,
      text
    })
    return { sent: true, url }
  } catch (e) {
    console.error('[Email] Failed to send verification email:', e?.message ?? e)
    return { sent: false, url }
  }
}

/**
 * Render the password reset email HTML.
 * @param {object} args
 * @param {string} args.url
 * @param {string} args.locale
 * @param {string} args.username
 * @returns {string}
 */
function renderPasswordResetEmailHtml ({ url, locale, username }) {
  const logoUrl = `${config.PUBLIC_URL}/assets/logo.svg`
  const supportUrl = `${config.PUBLIC_URL}/support.html`
  const privacyUrl = `${config.PUBLIC_URL}/imprint.html`
  const appUrl = config.PUBLIC_URL
  return `<!DOCTYPE html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8">
    <title>${t('email.passwordReset.subject', {}, locale)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#222;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
            <tr>
              <td style="padding:32px 32px 16px 32px;text-align:center;border-bottom:1px solid #eee;">
                <img src="${logoUrl}" alt="FootballManager.IO" height="48" style="display:inline-block;vertical-align:middle;">
                <div style="font-size:20px;font-weight:bold;margin-top:8px;color:#111;">FootballManager.IO</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px 0;font-size:16px;">${t('email.passwordReset.greeting', { username }, locale)}</p>
                <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#444;">
                  ${t('email.passwordReset.body', {}, locale)}
                </p>
                <p style="margin:0 0 32px 0;text-align:center;">
                  <a href="${url}" style="display:inline-block;background-color:#17a2b8;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:8px;font-size:16px;">
                    ${t('email.passwordReset.button', {}, locale)}
                  </a>
                </p>
                <p style="margin:0 0 16px 0;font-size:12px;line-height:1.6;color:#666;">
                  ${t('email.passwordReset.fallbackLink', {}, locale)}<br>
                  <a href="${url}" style="color:#17a2b8;word-break:break-all;">${url}</a>
                </p>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#666;">
                  ${t('email.passwordReset.ignoreHint', {}, locale)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 24px 32px;border-top:1px solid #eee;font-size:12px;color:#666;text-align:center;">
                <a href="${privacyUrl}" style="color:#666;text-decoration:underline;margin:0 8px;">${t('email.footer.privacy', {}, locale)}</a>
                <a href="${supportUrl}" style="color:#666;text-decoration:underline;margin:0 8px;">${t('email.footer.support', {}, locale)}</a>
                <a href="${appUrl}" style="color:#666;text-decoration:underline;margin:0 8px;">${t('email.footer.app', {}, locale)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/**
 * Render plain-text fallback for the password reset email.
 * @param {object} args
 * @returns {string}
 */
function renderPasswordResetEmailText ({ url, locale, username }) {
  return [
    t('email.passwordReset.greeting', { username }, locale),
    '',
    t('email.passwordReset.body', {}, locale),
    '',
    t('email.passwordReset.fallbackLink', {}, locale),
    url,
    '',
    t('email.passwordReset.ignoreHint', {}, locale),
    '',
    `${config.PUBLIC_URL}`
  ].join('\n')
}

/**
 * Render the admin message email HTML. The greeting, footer and action
 * button are fixed by template; only the body text comes from the admin.
 * @param {object} args
 * @param {string} args.locale
 * @param {string} args.username
 * @param {string} args.bodyText - free text entered by the admin
 * @returns {string}
 */
function renderAdminMessageEmailHtml ({ locale, username, bodyText }) {
  const logoUrl = `${config.PUBLIC_URL}/assets/logo.svg`
  const supportUrl = `${config.PUBLIC_URL}/support.html`
  const privacyUrl = `${config.PUBLIC_URL}/imprint.html`
  const appUrl = config.PUBLIC_URL
  const escapedBody = bodyText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '<br>')
  return `<!DOCTYPE html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8">
    <title>${t('email.adminMessage.subject', {}, locale)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#222;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
            <tr>
              <td style="padding:32px 32px 16px 32px;text-align:center;border-bottom:1px solid #eee;">
                <img src="${logoUrl}" alt="FootballManager.IO" height="48" style="display:inline-block;vertical-align:middle;">
                <div style="font-size:20px;font-weight:bold;margin-top:8px;color:#111;">FootballManager.IO</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px 0;font-size:16px;">${t('email.adminMessage.greeting', { username }, locale)}</p>
                <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#444;">
                  ${escapedBody}
                </p>
                <p style="margin:0 0 24px 0;text-align:center;">
                  <a href="${appUrl}" style="display:inline-block;background-color:#17a2b8;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:8px;font-size:16px;">
                    ${t('email.adminMessage.button', {}, locale)}
                  </a>
                </p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#444;">
                  ${t('email.adminMessage.signature', {}, locale)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 24px 32px;border-top:1px solid #eee;font-size:12px;color:#666;text-align:center;">
                <a href="${privacyUrl}" style="color:#666;text-decoration:underline;margin:0 8px;">${t('email.footer.privacy', {}, locale)}</a>
                <a href="${supportUrl}" style="color:#666;text-decoration:underline;margin:0 8px;">${t('email.footer.support', {}, locale)}</a>
                <a href="${appUrl}" style="color:#666;text-decoration:underline;margin:0 8px;">${t('email.footer.app', {}, locale)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/**
 * Render plain-text fallback for the admin message email.
 * @param {object} args
 * @returns {string}
 */
function renderAdminMessageEmailText ({ locale, username, bodyText }) {
  return [
    t('email.adminMessage.greeting', { username }, locale),
    '',
    bodyText,
    '',
    `${t('email.adminMessage.button', {}, locale)}: ${config.PUBLIC_URL}`,
    '',
    t('email.adminMessage.signature', {}, locale)
  ].join('\n')
}

/**
 * Send a free-form admin message email to a user. The greeting, action
 * button (link to the app) and footer are part of the fixed template;
 * `bodyText` is rendered into the body as the admin entered it.
 * @param {object} args
 * @param {string} args.toEmail
 * @param {string} args.locale
 * @param {string} args.username
 * @param {string} args.bodyText
 * @returns {Promise<{ sent: boolean }>}
 */
export async function sendAdminMessageEmail ({ toEmail, locale, username, bodyText }) {
  const html = renderAdminMessageEmailHtml({ locale, username, bodyText })
  const text = renderAdminMessageEmailText({ locale, username, bodyText })
  const subject = t('email.adminMessage.subject', {}, locale)

  const transporter = await getTransporter()
  if (!transporter) {
    console.log(`[Email] SMTP not configured, would send admin message to ${toEmail}`)
    return { sent: false }
  }
  try {
    await transporter.sendMail({
      from: config.EMAIL_FROM,
      to: toEmail,
      subject,
      html,
      text
    })
    return { sent: true }
  } catch (e) {
    console.error('[Email] Failed to send admin message email:', e?.message ?? e)
    return { sent: false }
  }
}

/**
 * Render the admin notification email HTML — a free-form marketing email
 * with a title, body text and a large image. The image URL is expected to
 * point at the public tracking endpoint so opens can be counted.
 * @param {object} args
 * @param {string} args.locale
 * @param {string} args.username
 * @param {string} args.title
 * @param {string} args.bodyText
 * @param {string} args.imageUrl
 * @returns {string}
 */
function renderNotificationEmailHtml ({ locale, username, title, bodyText, imageUrl }) {
  const logoUrl = `${config.PUBLIC_URL}/assets/logo.svg`
  const supportUrl = `${config.PUBLIC_URL}/support.html`
  const privacyUrl = `${config.PUBLIC_URL}/imprint.html`
  const appUrl = config.PUBLIC_URL
  const escape = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const escapedTitle = escape(title)
  const escapedBody = escape(bodyText)
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '<br>')
  return `<!DOCTYPE html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8">
    <title>${escapedTitle}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#222;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
            <tr>
              <td style="padding:32px 32px 16px 32px;text-align:center;border-bottom:1px solid #eee;">
                <img src="${logoUrl}" alt="FootballManager.IO" height="48" style="display:inline-block;vertical-align:middle;">
                <div style="font-size:20px;font-weight:bold;margin-top:8px;color:#111;">FootballManager.IO</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <p style="margin:0 0 8px 0;font-size:14px;color:#666;">${t('email.adminMessage.greeting', { username }, locale)}</p>
                <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.3;color:#111;">${escapedTitle}</h1>
                <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#444;">
                  ${escapedBody}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px;text-align:center;">
                <img src="${imageUrl}" alt="${escapedTitle}" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:0 auto;">
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px 32px;text-align:center;">
                <a href="${appUrl}" style="display:inline-block;background-color:#17a2b8;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:8px;font-size:16px;">
                  ${t('email.adminMessage.button', {}, locale)}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 24px 32px;border-top:1px solid #eee;font-size:12px;color:#666;text-align:center;">
                <a href="${privacyUrl}" style="color:#666;text-decoration:underline;margin:0 8px;">${t('email.footer.privacy', {}, locale)}</a>
                <a href="${supportUrl}" style="color:#666;text-decoration:underline;margin:0 8px;">${t('email.footer.support', {}, locale)}</a>
                <a href="${appUrl}" style="color:#666;text-decoration:underline;margin:0 8px;">${t('email.footer.app', {}, locale)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/**
 * Render plain-text fallback for the admin notification email.
 * @param {object} args
 * @returns {string}
 */
function renderNotificationEmailText ({ locale, username, title, bodyText, imageUrl }) {
  return [
    t('email.adminMessage.greeting', { username }, locale),
    '',
    title,
    '',
    bodyText,
    '',
    imageUrl,
    '',
    `${t('email.adminMessage.button', {}, locale)}: ${config.PUBLIC_URL}`,
    '',
    t('email.adminMessage.signature', {}, locale)
  ].join('\n')
}

/**
 * Send a marketing-style admin notification email with a title, body text
 * and a large image.
 * @param {object} args
 * @param {string} args.toEmail
 * @param {string} args.locale
 * @param {string} args.username
 * @param {string} args.title
 * @param {string} args.bodyText
 * @param {string} args.imageUrl
 * @returns {Promise<{ sent: boolean }>}
 */
export async function sendNotificationEmail ({ toEmail, locale, username, title, bodyText, imageUrl }) {
  const html = renderNotificationEmailHtml({ locale, username, title, bodyText, imageUrl })
  const text = renderNotificationEmailText({ locale, username, title, bodyText, imageUrl })
  const subject = title

  const transporter = await getTransporter()
  if (!transporter) {
    console.log(`[Email] SMTP not configured, would send notification email "${title}" to ${toEmail}`)
    return { sent: false }
  }
  try {
    await transporter.sendMail({
      from: config.EMAIL_FROM,
      to: toEmail,
      subject,
      html,
      text
    })
    return { sent: true }
  } catch (e) {
    console.error('[Email] Failed to send notification email:', e?.message ?? e)
    return { sent: false }
  }
}

/**
 * Build the landing-page URL that opens the registration form with the
 * invitee's email prefilled. The router is hash-based, so `email` must
 * live in the hash query — a top-level `?email=…` would be wiped by the
 * unauthenticated → `#login` redirect.
 * @param {string} toEmail
 * @returns {string}
 */
export function buildReferralSignupUrl (toEmail) {
  return `${config.PUBLIC_URL}/#login?type=registration&email=${encodeURIComponent(toEmail)}`
}

/**
 * Render the referral invitation email HTML.
 * @param {object} args
 * @param {string} args.locale
 * @param {string} args.inviterUsername
 * @param {string} args.toEmail
 * @returns {string}
 */
function renderReferralEmailHtml ({ locale, inviterUsername, toEmail }) {
  const logoUrl = `${config.PUBLIC_URL}/assets/logo.svg`
  const supportUrl = `${config.PUBLIC_URL}/support.html`
  const privacyUrl = `${config.PUBLIC_URL}/imprint.html`
  const appUrl = config.PUBLIC_URL
  const signupUrl = buildReferralSignupUrl(toEmail)
  const signature = t('email.referral.signature', {}, locale)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
  return `<!DOCTYPE html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8">
    <title>${t('email.referral.subject', { inviter: inviterUsername }, locale)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#222;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
            <tr>
              <td style="padding:32px 32px 16px 32px;text-align:center;border-bottom:1px solid #eee;">
                <img src="${logoUrl}" alt="FootballManager.IO" height="48" style="display:inline-block;vertical-align:middle;">
                <div style="font-size:20px;font-weight:bold;margin-top:8px;color:#111;">FootballManager.IO</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px 0;font-size:16px;">${t('email.referral.greeting', {}, locale)}</p>
                <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#444;">
                  ${t('email.referral.body', { inviter: inviterUsername }, locale)}
                </p>
                <p style="margin:0 0 24px 0;text-align:center;">
                  <a href="${signupUrl}" style="display:inline-block;background-color:#17a2b8;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:8px;font-size:16px;">
                    ${t('email.referral.button', {}, locale)}
                  </a>
                </p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#444;">
                  ${signature}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 24px 32px;border-top:1px solid #eee;font-size:12px;color:#666;text-align:center;">
                <a href="${privacyUrl}" style="color:#666;text-decoration:underline;margin:0 8px;">${t('email.footer.privacy', {}, locale)}</a>
                <a href="${supportUrl}" style="color:#666;text-decoration:underline;margin:0 8px;">${t('email.footer.support', {}, locale)}</a>
                <a href="${appUrl}" style="color:#666;text-decoration:underline;margin:0 8px;">${t('email.footer.app', {}, locale)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/**
 * Render plain-text fallback for the referral invitation email.
 * @param {object} args
 * @returns {string}
 */
function renderReferralEmailText ({ locale, inviterUsername, toEmail }) {
  return [
    t('email.referral.greeting', {}, locale),
    '',
    t('email.referral.body', { inviter: inviterUsername }, locale),
    '',
    `${t('email.referral.button', {}, locale)}: ${buildReferralSignupUrl(toEmail)}`,
    '',
    t('email.referral.signature', {}, locale)
  ].join('\n')
}

/**
 * Send a referral invitation email to a friend on behalf of `inviterUsername`.
 * @param {object} args
 * @param {string} args.toEmail
 * @param {string} args.locale
 * @param {string} args.inviterUsername
 * @returns {Promise<{ sent: boolean }>}
 */
export async function sendReferralEmail ({ toEmail, locale, inviterUsername }) {
  const html = renderReferralEmailHtml({ locale, inviterUsername, toEmail })
  const text = renderReferralEmailText({ locale, inviterUsername, toEmail })
  const subject = t('email.referral.subject', { inviter: inviterUsername }, locale)

  const transporter = await getTransporter()
  if (!transporter) {
    console.log(`[Email] SMTP not configured, would send referral invite from ${inviterUsername} to ${toEmail}`)
    return { sent: false }
  }
  try {
    await transporter.sendMail({
      from: config.EMAIL_FROM,
      to: toEmail,
      subject,
      html,
      text
    })
    return { sent: true }
  } catch (e) {
    console.error('[Email] Failed to send referral invite email:', e?.message ?? e)
    return { sent: false }
  }
}

/**
 * Send the password reset email to a user.
 * Returns the reset URL so callers can log it in dev.
 * @param {object} args
 * @param {string} args.toEmail
 * @param {string} args.token
 * @param {string} args.locale
 * @param {string} args.username
 * @returns {Promise<{ sent: boolean, url: string }>}
 */
export async function sendPasswordResetEmail ({ toEmail, token, locale, username }) {
  const url = `${config.PUBLIC_URL}/reset-password.html?token=${encodeURIComponent(token)}&lang=${encodeURIComponent(locale)}`
  const html = renderPasswordResetEmailHtml({ url, locale, username })
  const text = renderPasswordResetEmailText({ url, locale, username })
  const subject = t('email.passwordReset.subject', {}, locale)

  const transporter = await getTransporter()
  if (!transporter) {
    console.log(`[Email] SMTP not configured, would send password reset to ${toEmail}: ${url}`)
    return { sent: false, url }
  }
  try {
    await transporter.sendMail({
      from: config.EMAIL_FROM,
      to: toEmail,
      subject,
      html,
      text
    })
    return { sent: true, url }
  } catch (e) {
    console.error('[Email] Failed to send password reset email:', e?.message ?? e)
    return { sent: false, url }
  }
}

/**
 * @param {object} args
 * @param {string} args.locale
 * @param {string} args.username
 * @param {number} args.daysRemaining - 1 or 7
 * @returns {string}
 */
function renderInactivityWarningEmailHtml ({ locale, username, daysRemaining }) {
  const logoUrl = `${config.PUBLIC_URL}/assets/logo.svg`
  const supportUrl = `${config.PUBLIC_URL}/support.html`
  const privacyUrl = `${config.PUBLIC_URL}/imprint.html`
  const appUrl = config.PUBLIC_URL
  const subject = t('email.inactivityWarning.subject', { daysRemaining }, locale)
  const body = t('email.inactivityWarning.body', { username, daysRemaining }, locale)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '<br>')
  return `<!DOCTYPE html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8">
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#222;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
            <tr>
              <td style="padding:32px 32px 16px 32px;text-align:center;border-bottom:1px solid #eee;">
                <img src="${logoUrl}" alt="FootballManager.IO" height="48" style="display:inline-block;vertical-align:middle;">
                <div style="font-size:20px;font-weight:bold;margin-top:8px;color:#111;">FootballManager.IO</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px 0;font-size:22px;color:#111;">${subject}</h1>
                <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#444;">
                  ${body}
                </p>
                <p style="margin:0 0 24px 0;text-align:center;">
                  <a href="${appUrl}" style="display:inline-block;background-color:#17a2b8;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:8px;font-size:16px;">
                    ${t('email.inactivityWarning.button', {}, locale)}
                  </a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 24px 32px;border-top:1px solid #eee;font-size:12px;color:#666;text-align:center;">
                <a href="${privacyUrl}" style="color:#666;text-decoration:underline;margin:0 8px;">${t('email.footer.privacy', {}, locale)}</a>
                <a href="${supportUrl}" style="color:#666;text-decoration:underline;margin:0 8px;">${t('email.footer.support', {}, locale)}</a>
                <a href="${appUrl}" style="color:#666;text-decoration:underline;margin:0 8px;">${t('email.footer.app', {}, locale)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/**
 * @param {object} args
 * @returns {string}
 */
function renderInactivityWarningEmailText ({ locale, username, daysRemaining }) {
  return [
    t('email.inactivityWarning.subject', { daysRemaining }, locale),
    '',
    t('email.inactivityWarning.body', { username, daysRemaining }, locale),
    '',
    `${t('email.inactivityWarning.button', {}, locale)}: ${config.PUBLIC_URL}`
  ].join('\n')
}

/**
 * Send an account-deletion warning to a user who has been inactive long
 * enough to be at risk of getting auto-deleted. Sends to whichever email
 * is on file — verified `email` first, falling back to `pending_email`.
 * @param {object} args
 * @param {string} args.toEmail
 * @param {string} args.locale
 * @param {string} args.username
 * @param {number} args.daysRemaining - typically 7 or 1
 * @returns {Promise<{ sent: boolean }>}
 */
export async function sendInactivityWarningEmail ({ toEmail, locale, username, daysRemaining }) {
  const html = renderInactivityWarningEmailHtml({ locale, username, daysRemaining })
  const text = renderInactivityWarningEmailText({ locale, username, daysRemaining })
  const subject = t('email.inactivityWarning.subject', { daysRemaining }, locale)

  const transporter = await getTransporter()
  if (!transporter) {
    console.log(`[Email] SMTP not configured, would send inactivity warning (${daysRemaining}d left) to ${toEmail}`)
    return { sent: false }
  }
  try {
    await transporter.sendMail({
      from: config.EMAIL_FROM,
      to: toEmail,
      subject,
      html,
      text
    })
    return { sent: true }
  } catch (e) {
    console.error('[Email] Failed to send inactivity warning email:', e?.message ?? e)
    return { sent: false }
  }
}

/**
 * Escape the few characters that could break out of an HTML text node.
 * @param {string} value
 * @returns {string}
 */
function escapeHtml (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Render the admin-facing user-report email. Deliberately plain: this goes to
 * the operators, not to players, so it stays in English and shows the raw
 * report record instead of a branded template.
 * @param {object} args
 * @param {string} args.reportedUsername
 * @param {number} args.reportedUserId
 * @param {string} args.reporterUsername
 * @param {number} args.reporterUserId
 * @param {string} args.reason
 * @param {Date} args.reportedAt
 * @returns {string}
 */
function renderUserReportEmailHtml ({ reportedUsername, reportedUserId, reporterUsername, reporterUserId, reason, reportedAt }) {
  const rows = [
    ['Time', reportedAt.toISOString()],
    ['Reported user', `${reportedUsername} (#${reportedUserId})`],
    ['Reported by', `${reporterUsername} (#${reporterUserId})`]
  ].map(([label, value]) => `
              <tr>
                <td style="padding:6px 12px 6px 0;font-weight:bold;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
                <td style="padding:6px 0;">${escapeHtml(value)}</td>
              </tr>`).join('')
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>User reported</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#222;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:12px;padding:24px;">
      <tr>
        <td>
          <h2 style="margin:0 0 16px 0;font-size:18px;">A user has been reported</h2>
          <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;">
            ${rows}
          </table>
          <p style="margin:16px 0 4px 0;font-weight:bold;font-size:14px;">Reason</p>
          <p style="margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(reason)}</p>
          <p style="margin:24px 0 0 0;font-size:13px;color:#666;">
            <a href="${config.PUBLIC_URL}/#admin?sub_page=users">Open user management</a>
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/**
 * Plain-text fallback for the user-report email.
 * @param {object} args
 * @returns {string}
 */
function renderUserReportEmailText ({ reportedUsername, reportedUserId, reporterUsername, reporterUserId, reason, reportedAt }) {
  return [
    'A user has been reported',
    '',
    `Time: ${reportedAt.toISOString()}`,
    `Reported user: ${reportedUsername} (#${reportedUserId})`,
    `Reported by: ${reporterUsername} (#${reporterUserId})`,
    '',
    'Reason:',
    reason,
    '',
    `${config.PUBLIC_URL}/#admin?sub_page=users`
  ].join('\n')
}

/**
 * Notify the admins that a player reported another player (#489). Sent to
 * `config.ADMIN_EMAIL`; failures are swallowed so a broken mailbox can never
 * make the report itself fail.
 * @param {object} args
 * @param {string} args.reportedUsername
 * @param {number} args.reportedUserId
 * @param {string} args.reporterUsername
 * @param {number} args.reporterUserId
 * @param {string} args.reason
 * @param {Date} [args.reportedAt]
 * @returns {Promise<{ sent: boolean }>}
 */
export async function sendUserReportEmail ({
  reportedUsername, reportedUserId, reporterUsername, reporterUserId, reason, reportedAt = new Date()
}) {
  const args = { reportedUsername, reportedUserId, reporterUsername, reporterUserId, reason, reportedAt }
  const toEmail = config.ADMIN_EMAIL
  if (!toEmail) {
    console.log('[Email] ADMIN_EMAIL not configured, skipping user report notification')
    return { sent: false }
  }
  const transporter = await getTransporter()
  if (!transporter) {
    console.log(`[Email] SMTP not configured, would send user report for "${reportedUsername}" to ${toEmail}`)
    return { sent: false }
  }
  try {
    await transporter.sendMail({
      from: config.EMAIL_FROM,
      to: toEmail,
      subject: `[Report] ${reportedUsername} was reported by ${reporterUsername}`,
      html: renderUserReportEmailHtml(args),
      text: renderUserReportEmailText(args)
    })
    return { sent: true }
  } catch (e) {
    console.error('[Email] Failed to send user report email:', e?.message ?? e)
    return { sent: false }
  }
}
