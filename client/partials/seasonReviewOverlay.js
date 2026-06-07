import { generateId, el } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { t } from '../i18n/index.js'
import { renderEmblem } from './emblem.js'

const STORAGE_KEY_PREFIX = 'seasonReviewSeen_'

/**
 * Outcome-specific emoji shown at the top of the overlay.
 * @param {string} outcome
 * @param {boolean} userWonCup
 * @returns {string}
 */
function getOutcomeEmoji (outcome, userWonCup) {
  if (userWonCup) return '🏆'
  switch (outcome) {
    case 'champion': return '🏆'
    case 'promoted': return '🎉'
    case 'upperHalf': return '👍'
    case 'lowerHalf': return '😅'
    case 'relegated': return '😢'
    default: return '⚽'
  }
}

/**
 * Outcomes for which the celebratory confetti animation should play.
 * @param {string} outcome
 * @param {boolean} userWonCup
 * @returns {boolean}
 */
function shouldShowConfetti (outcome, userWonCup) {
  return userWonCup || outcome === 'champion' || outcome === 'promoted'
}

/**
 * Pick a random headline text key for the given outcome.
 * @param {string} outcome
 * @returns {string}
 */
function pickHeadlineKey (outcome) {
  const variant = 1 + Math.floor(Math.random() * 3)
  return `seasonReview.outcome.${outcome}.${variant}`
}

/**
 * Should the season review overlay be shown for this season?
 * Returns false once the user has dismissed the overlay for the same season
 * in the current browser session (sessionStorage). This keeps the overlay out
 * of the way after the first viewing while still re-surfacing it if the user
 * comes back in a brand-new session.
 * @param {number} season
 * @returns {boolean}
 */
export function isSeasonReviewDismissed (season) {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY_PREFIX + season) === '1'
  } catch {
    return false
  }
}

function markDismissed (season) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY_PREFIX + season, '1')
  } catch { /* sessionStorage unavailable — overlay will just reappear */ }
}

function renderTeamLine (team) {
  if (!team) return ''
  const emblemHtml = renderEmblem({ name: team.teamName, color: team.color, emblem: team.emblem }, 32)
  const highlight = team.isUser ? ' season-review-fact-team--highlight' : ''
  return `<span class="season-review-fact-team${highlight}">
    <span class="season-review-fact-emblem">${emblemHtml}</span>
    <span class="season-review-fact-team-name">${team.teamName ?? '?'}</span>
  </span>`
}

function renderTopScorerLine (topScorer) {
  if (!topScorer) {
    return `<span class="season-review-fact-empty">${t('seasonReview.noTopScorer')}</span>`
  }
  const team = topScorer.team || {}
  const emblemHtml = team.name
    ? renderEmblem({ name: team.name, color: team.color, emblem: team.emblem }, 32)
    : ''
  const highlight = topScorer.isUserTeam ? ' season-review-fact-team--highlight' : ''
  return `<span class="season-review-fact-team${highlight}">
    ${emblemHtml ? `<span class="season-review-fact-emblem">${emblemHtml}</span>` : ''}
    <span class="season-review-fact-team-name">${topScorer.name}</span>
    <span class="season-review-fact-detail">(${t('seasonReview.goals', { count: topScorer.goals })})</span>
  </span>`
}

function renderRelegatedLine (relegatedTeams) {
  if (!relegatedTeams || relegatedTeams.length === 0) return ''
  return `<div class="season-review-fact-row">
    <span class="season-review-fact-label">${t('seasonReview.relegated')}</span>
    <span class="season-review-fact-stack">
      ${relegatedTeams.map(renderTeamLine).join('')}
    </span>
  </div>`
}

function renderConfetti () {
  // 30 pieces, each with random colour/delay/horizontal position. Values are
  // computed at render time so they cannot be expressed as static CSS classes.
  const colors = ['#ffce4f', '#5fb0ff', '#ff7ad9', '#7dffb6', '#ff6b6b', '#ffffff']
  let pieces = ''
  for (let i = 0; i < 36; i++) {
    const left = Math.random() * 100
    const delay = Math.random() * 1.5
    const duration = 2 + Math.random() * 2
    const rotate = Math.random() * 360
    const color = colors[i % colors.length]
    pieces += `<span class="season-review-confetti-piece" style="left:${left}%;background:${color};animation-delay:${delay}s;animation-duration:${duration}s;transform:rotate(${rotate}deg);"></span>`
  }
  return `<div class="season-review-confetti" aria-hidden="true">${pieces}</div>`
}

/**
 * Show the end-of-season review overlay.
 * @param {object} review - Result of getSeasonReview()
 * @returns {Promise<void>} resolves after the user dismisses the overlay
 */
export function showSeasonReviewOverlay (review) {
  return new Promise((resolve) => {
    // Gate on data presence (outcome is only populated when the server has
    // built a real review). `isSeasonEnd` is a separate dashboard-trigger
    // signal, not a render gate — the results page reopens the overlay for
    // older seasons where isSeasonEnd is false.
    if (!review || !review.outcome) {
      resolve()
      return
    }

    const overlayId = generateId()
    const innerId = generateId()
    const closeBtnId = generateId()

    const emoji = getOutcomeEmoji(review.outcome, review.userWonCup)
    const headlineKey = pickHeadlineKey(review.outcome)
    const headline = t(headlineKey, { position: review.position })
    const cupExtra = review.userWonCup && review.outcome !== 'champion'
      ? `<p class="season-review-cup-extra">${t('seasonReview.cupWonExtra')}</p>`
      : ''
    const confetti = shouldShowConfetti(review.outcome, review.userWonCup)
      ? renderConfetti()
      : ''

    const champion = review.leagueChampion
    const champRow = champion
      ? `<div class="season-review-fact-row">
          <span class="season-review-fact-label">${t('seasonReview.leagueChampion')}</span>
          ${renderTeamLine(champion)}
        </div>`
      : ''

    const topScorerRow = `<div class="season-review-fact-row">
      <span class="season-review-fact-label">${t('seasonReview.topScorer')}</span>
      ${renderTopScorerLine(review.topScorer)}
    </div>`

    const cupRow = review.cupWinner
      ? `<div class="season-review-fact-row">
          <span class="season-review-fact-label">${t('seasonReview.cupWinner')}</span>
          ${renderTeamLine(review.cupWinner)}
        </div>`
      : `<div class="season-review-fact-row">
          <span class="season-review-fact-label">${t('seasonReview.cupWinner')}</span>
          <span class="season-review-fact-empty">${t('seasonReview.noCupWinner')}</span>
        </div>`

    const relegatedRow = renderRelegatedLine(review.relegatedTeams)

    const positionLine = review.position > 0
      ? `<p class="season-review-position">${t('seasonReview.position', { position: review.position })}</p>`
      : ''

    const html = `
      <div id="${overlayId}" class="overlay-backdrop season-review-backdrop">
        ${confetti}
        <div id="${innerId}" class="card overlay season-review-card">
          <div class="card-body season-review-body">
            <div class="season-review-emoji" aria-hidden="true">${emoji}</div>
            <h2 class="season-review-title">${t('seasonReview.title')}</h2>
            <div class="season-review-subtitle">${t('seasonReview.subtitle', { season: review.season + 1 })}</div>
            ${positionLine}
            <p class="season-review-headline">${headline}</p>
            ${cupExtra}
            <div class="season-review-facts">
              <h3 class="season-review-facts-header">${t('seasonReview.factsHeader')}</h3>
              ${champRow}
              ${topScorerRow}
              ${cupRow}
              ${relegatedRow}
            </div>
            ${review.isSeasonEnd ? `<p class="season-review-waiting">${t('seasonReview.waitingForNewSeason')}</p>` : ''}
            <button id="${closeBtnId}" class="btn btn-primary season-review-close">${t('seasonReview.close')}</button>
          </div>
        </div>
      </div>
    `

    document.body.insertAdjacentHTML('beforeend', html)

    let dismissed = false
    const dismiss = () => {
      if (dismissed) return
      dismissed = true
      markDismissed(review.season)
      document.removeEventListener('keydown', onKeyDown)
      const overlay = el('#' + overlayId)
      if (!overlay) { resolve(); return }
      overlay.classList.add('fade-out')
      overlay.addEventListener('animationend', () => {
        overlay.remove()
        resolve()
      }, { once: true })
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') dismiss()
    }
    document.addEventListener('keydown', onKeyDown)

    onClick('#' + closeBtnId, () => dismiss())
    onClick('#' + overlayId, (event) => {
      if (event.target.id === overlayId) dismiss()
    })
  })
}
