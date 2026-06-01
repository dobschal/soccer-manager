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
