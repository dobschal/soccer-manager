import { onClick } from '../lib/htmlEventHandlers.js'
import { el, generateId } from '../lib/html.js'
import { server, showServerError } from '../lib/gateway.js'
import { t } from '../i18n/index.js'

/**
 * Get tutorial content for each page (translated)
 * @returns {Object}
 */
function getTutorials () {
  return {
    results: {
      title: t('tutorial.results.title'),
      subtitle: t('tutorial.results.subtitle'),
      items: [
        t('tutorial.results.item1'),
        t('tutorial.results.item2'),
        t('tutorial.results.item3'),
        t('tutorial.results.item4')
      ]
    },
    team: {
      title: t('tutorial.teamPage.title'),
      subtitle: t('tutorial.teamPage.subtitle'),
      items: [
        t('tutorial.teamPage.item1'),
        t('tutorial.teamPage.item2'),
        t('tutorial.teamPage.item3'),
        t('tutorial.teamPage.item4'),
        t('tutorial.teamPage.item5')
      ]
    },
    trades: {
      title: t('tutorial.trades.title'),
      subtitle: t('tutorial.trades.subtitle'),
      items: [
        t('tutorial.trades.item1'),
        t('tutorial.trades.item2'),
        t('tutorial.trades.item3'),
        t('tutorial.trades.item4')
      ]
    },
    dashboard: {
      title: t('tutorial.dashboardPage.title'),
      subtitle: t('tutorial.dashboardPage.subtitle'),
      items: [
        t('tutorial.dashboardPage.item1'),
        t('tutorial.dashboardPage.item2'),
        t('tutorial.dashboardPage.item3'),
        t('tutorial.dashboardPage.item4'),
        t('tutorial.dashboardPage.item5')
      ]
    },
    stadium: {
      title: t('tutorial.stadiumPage.title'),
      subtitle: t('tutorial.stadiumPage.subtitle'),
      items: [
        t('tutorial.stadiumPage.item1'),
        t('tutorial.stadiumPage.item2'),
        t('tutorial.stadiumPage.item3'),
        t('tutorial.stadiumPage.item4')
      ]
    },
    finances: {
      title: t('tutorial.financesPage.title'),
      subtitle: t('tutorial.financesPage.subtitle'),
      items: [
        t('tutorial.financesPage.item1'),
        t('tutorial.financesPage.item2'),
        t('tutorial.financesPage.item3'),
        t('tutorial.financesPage.item4')
      ]
    },
    youth: {
      title: t('tutorial.youthPage.title'),
      subtitle: t('tutorial.youthPage.subtitle'),
      items: [
        t('tutorial.youthPage.item1'),
        t('tutorial.youthPage.item2'),
        t('tutorial.youthPage.item3'),
        t('tutorial.youthPage.item4'),
        t('tutorial.youthPage.item5')
      ]
    },
    buildings: {
      title: t('tutorial.buildingsPage.title'),
      subtitle: t('tutorial.buildingsPage.subtitle'),
      items: [
        t('tutorial.buildingsPage.item1'),
        t('tutorial.buildingsPage.item2'),
        t('tutorial.buildingsPage.item3'),
        t('tutorial.buildingsPage.item4'),
        t('tutorial.buildingsPage.item5')
      ]
    }
  }
}

/**
 * Shows the tutorial overlay if not already completed
 * @param {string} tutorialKey
 * @param {import('../lib/UIElement.js').UIElement} [component] - Optional component to check if still mounted
 * @returns {Promise<void>}
 */
export async function showTutorialIfNeeded (tutorialKey, component = null) {
  try {
    const { tutorialCompleted } = await server.getTutorialStatus()
    if (tutorialCompleted[tutorialKey]) {
      return
    }
    setTimeout(() => {
      // Don't show tutorial if component was unmounted (user navigated away)
      if (component && !component._isMounted) {
        return
      }
      showTutorialOverlay(tutorialKey)
    }, 1500)
  } catch (e) {
    console.error('Failed to check tutorial status:', e)
  }
}

/**
 * Shows the tutorial overlay
 * @param {string} tutorialKey
 */
function showTutorialOverlay (tutorialKey) {
  const tutorials = getTutorials()
  const tutorial = tutorials[tutorialKey]
  if (!tutorial) return

  const overlayId = generateId()
  const overlayInnerId = generateId()
  const closeButtonId = generateId()
  const checkboxId = generateId()
  const gotItButtonId = generateId()

  const itemsHtml = tutorial.items.map(item => `<li>${item}</li>`).join('')

  const cardBodyStyle = ``

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
              ${t('tutorial.doNotShowAgain')}
            </label>
          </div>
          <button id="${gotItButtonId}" class="btn btn-info w-100">${t('tutorial.gotIt')}</button>
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

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', onKeyDown)
      closeOverlay()
    }
  }
  document.addEventListener('keydown', onKeyDown)
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
