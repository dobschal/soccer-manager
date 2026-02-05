import { onClick } from '../lib/htmlEventHandlers.js'
import { el, generateId } from '../lib/html.js'
import { server, showServerError } from '../lib/gateway.js'

/**
 * Tutorial content for each page
 */
const TUTORIALS = {
  results: {
    title: 'Game Results',
    subtitle: 'Track your progress and standings',
    items: [
      'View match results from each game day',
      'Check the league standings and your position',
      'See top scorers and their statistics',
      'Click on a match to see detailed game events'
    ]
  },
  team: {
    title: 'Your Team',
    subtitle: 'Manage your squad and lineup',
    items: [
      'View all players in your squad with their stats',
      'Check player freshness - tired players perform worse',
      'Set your formation and lineup for matches',
      'Drag players to positions or use the dropdown to assign them'
    ]
  },
  trades: {
    title: 'Player Market',
    subtitle: 'Buy, sell and manage transfers',
    items: [
      'Browse the transfer market for new players',
      'Make offers on players from other teams',
      'View and respond to offers on your players',
      'Check transfer history and free agents'
    ]
  },
  dashboard: {
    title: 'Welcome to SoccerManagerIO!',
    subtitle: 'This is your dashboard that keeps you updated:',
    items: [
      'See your last match result and upcoming game',
      'Use action cards to boost players or earn bonuses',
      'Merge two identical cards into a better one',
      'Read important messages about your team',
      'See latest news from your league and top transfers'
    ]
  },
  stadium: {
    title: 'Stadium Management',
    subtitle: 'Expand and earn revenue',
    items: [
      'Set ticket prices for each stand',
      'Expand stands to increase capacity',
      'Add roofs to improve fan experience',
      'Construction takes time - plan ahead!'
    ]
  },
  finances: {
    title: 'Finances',
    subtitle: 'Manage your club finances',
    items: [
      'View your current balance and transaction history',
      'Sign sponsor contracts for regular income',
      'Track income from ticket sales and sponsors',
      'Monitor expenses like player salaries'
    ]
  }
}

/**
 * Shows the tutorial overlay if not already completed
 * @param {string} tutorialKey
 * @returns {Promise<void>}
 */
export async function showTutorialIfNeeded (tutorialKey) {
  try {
    const { tutorialCompleted } = await server.getTutorialStatus()
    if (tutorialCompleted[tutorialKey]) {
      return
    }
    setTimeout(() => showTutorialOverlay(tutorialKey), 1500)
  } catch (e) {
    console.error('Failed to check tutorial status:', e)
  }
}

/**
 * Shows the tutorial overlay
 * @param {string} tutorialKey
 */
function showTutorialOverlay (tutorialKey) {
  const tutorial = TUTORIALS[tutorialKey]
  if (!tutorial) return

  const overlayId = generateId()
  const overlayInnerId = generateId()
  const closeButtonId = generateId()
  const checkboxId = generateId()
  const gotItButtonId = generateId()

  const itemsHtml = tutorial.items.map(item => `<li>${item}</li>`).join('')

  const cardBodyStyle = `
    background-image: url('/assets/manager.png');
    background-size: auto 100%;
    background-repeat: no-repeat;
    background-position: right -70px top 40px;
  `

  const html = `
    <div id="${overlayId}" class="overlay-backdrop clear-background">
      <div id="${overlayInnerId}" class="card overlay small shadow-lg shadow">
        <div class="card-body" style="${cardBodyStyle}">
          <span id="${closeButtonId}" class="fa fa-close fa-button fa-lg float-end"></span>
          <h5 class="card-title text-info">
            <i class="fa fa-graduation-cap me-2"></i>${tutorial.title}
          </h5>
          <h6 class="card-subtitle mb-3 text-muted">${tutorial.subtitle}</h6>
          <ul class="tutorial-list mb-4">
            ${itemsHtml}
          </ul>
          <div class="form-check mb-3">
            <input class="form-check-input" type="checkbox" id="${checkboxId}">
            <label class="form-check-label" for="${checkboxId}">
              Do not show this again
            </label>
          </div>
          <button id="${gotItButtonId}" class="btn btn-info w-100">Got it!</button>
        </div>
      </div>
    </div>
  `
  document.body.insertAdjacentHTML('beforeend', html)

  const closeOverlay = async () => {
    const checkbox = el('#' + checkboxId)
    if (checkbox && checkbox.checked) {
      try {
        await server.completeTutorial(tutorialKey)
      } catch (e) {
        showServerError(e)
      }
    }
    fadeOutAndRemove(overlayId)
  }

  onClick('#' + closeButtonId, closeOverlay)
  onClick('#' + gotItButtonId, closeOverlay)
  onClick('#' + overlayId, closeOverlay)
  onClick('#' + overlayInnerId, event => {
    event.stopPropagation()
  })
}

/**
 * Applies fadeout animation and removes the overlay
 * @param {string} overlayId
 */
function fadeOutAndRemove (overlayId) {
  const overlayEl = el('#' + overlayId)
  if (!overlayEl) return

  overlayEl.classList.add('fade-out')
  overlayEl.addEventListener('animationend', () => {
    overlayEl.remove()
  }, { once: true })
}
