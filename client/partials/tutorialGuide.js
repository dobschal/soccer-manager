import { server, showServerError } from '../lib/gateway.js'
import { t } from '../i18n/index.js'
import { on } from '../lib/event.js'
import { onServerEvent } from '../lib/websocket.js'

/**
 * Per-step config: text shown in the bottom bar plus a CSS selector that
 * identifies the element the user should interact with next. The arrow is
 * positioned next to the first matching element on the page; if there's no
 * match we still show the bar so the user knows what to do.
 *
 * Step values match the server-side TUTORIAL_STEPS enum.
 */
const STEP_CONFIG = {
  0: {
    textKey: 'tutorial.step0.text',
    targetSelectors: ['.team-selection-row', '.choose-team-row']
  },
  1: {
    textKey: 'tutorial.step1.text',
    hash: 'my-team',
    targetSelectors: ['#my-team', 'a[href="#my-team"]', '.native-tab-item[href="#my-team"]']
  },
  2: {
    textKey: 'tutorial.step2.text',
    hash: 'dashboard?sub_page=cards',
    targetSelectors: ['a[href="#dashboard?sub_page=cards"]', '.action-card .btn-info']
  },
  3: {
    textKey: 'tutorial.step3.text',
    hash: 'club?sub_page=buildings',
    targetSelectors: ['[data-building-type="youth_academy"] .building-upgrade-btn', 'a[href="#club?sub_page=buildings"]']
  },
  4: {
    textKey: 'tutorial.step4.text',
    hash: 'dashboard?sub_page=cards',
    targetSelectors: ['a[href="#dashboard?sub_page=cards"]', '.action-card .btn-info']
  },
  5: {
    textKey: 'tutorial.step5.text',
    hash: 'trades',
    targetSelectors: ['a[href="#trades"]', '.trade-instant-buy-btn']
  },
  6: {
    textKey: 'tutorial.step6.text',
    hash: 'club',
    targetSelectors: ['a[href="#club"]', '.stadium-price-input', '.stadium-prices-save']
  },
  7: {
    textKey: 'tutorial.step7.text',
    hash: 'club?sub_page=finances',
    targetSelectors: ['a[href="#club?sub_page=finances"]', '.sponsor-choose-btn']
  }
}

let _initialized = false
let _currentStep = 99

/**
 * Initialise the tutorial guide. Idempotent — safe to call from both browser
 * and native entry points. Renders a fixed bottom bar and an absolute-
 * positioned arrow into <body>, both hidden until a non-completed step is
 * fetched from the server.
 */
export async function initTutorialGuide () {
  if (_initialized) return
  _initialized = true
  if (!window.localStorage.getItem('auth-token')) return

  _injectDom()
  on('page-changed', () => {
    _refreshArrowAndBar()
  })

  // Recompute on resize and after layout shifts.
  window.addEventListener('resize', _refreshArrowAndBar)
  window.addEventListener('scroll', _refreshArrowAndBar, { passive: true })

  // Periodically refresh: when the user clicks something, the next step's
  // target element may appear without a page-changed event.
  setInterval(_refreshArrowAndBar, 1500)

  // Pull initial state and listen for server-pushed advances.
  await _fetchAndApply()
  onServerEvent('TUTORIAL_STEP_CHANGED', (data) => {
    if (typeof data?.tutorialStep === 'number') {
      _currentStep = data.tutorialStep
      _refreshArrowAndBar()
    }
  })
}

async function _fetchAndApply () {
  try {
    const { tutorialStep } = await server.getTutorialStep()
    _currentStep = tutorialStep
    _refreshArrowAndBar()
  } catch (e) {
    // Best-effort — if the server doesn't have the route yet (e.g. very old
    // client cache), keep the tutorial UI hidden.
    console.warn('Tutorial state unavailable:', e?.message || e)
  }
}

function _injectDom () {
  if (document.getElementById('tutorial-guide-bar')) return
  const bar = document.createElement('div')
  bar.id = 'tutorial-guide-bar'
  bar.className = 'tutorial-guide-bar hidden'
  bar.innerHTML = `
    <div class="tutorial-guide-bar-inner">
      <div class="tutorial-guide-step-label" id="tutorial-guide-step-label"></div>
      <div class="tutorial-guide-step-text" id="tutorial-guide-step-text"></div>
      <button type="button" id="tutorial-guide-skip" class="btn btn-sm btn-outline-light">${t('tutorial.skip')}</button>
    </div>
  `
  document.body.appendChild(bar)
  const arrow = document.createElement('div')
  arrow.id = 'tutorial-guide-arrow'
  arrow.className = 'tutorial-guide-arrow hidden'
  arrow.innerHTML = '<i class="fa fa-arrow-down"></i>'
  document.body.appendChild(arrow)

  document.getElementById('tutorial-guide-skip').addEventListener('click', async () => {
    try {
      await server.skipTutorial()
      _currentStep = 99
      _refreshArrowAndBar()
    } catch (e) {
      showServerError(e)
    }
  })
}

function _refreshArrowAndBar () {
  const bar = document.getElementById('tutorial-guide-bar')
  const arrow = document.getElementById('tutorial-guide-arrow')
  if (!bar || !arrow) return

  const config = STEP_CONFIG[_currentStep]
  if (!config) {
    bar.classList.add('hidden')
    arrow.classList.add('hidden')
    return
  }

  bar.classList.remove('hidden')
  const label = document.getElementById('tutorial-guide-step-label')
  const textEl = document.getElementById('tutorial-guide-step-text')
  if (label) label.textContent = t('tutorial.stepLabel', { step: _currentStep + 1, total: 8 })
  if (textEl) textEl.textContent = t(config.textKey)

  // Resolve the first existing target element on the page.
  let targetEl = null
  for (const selector of config.targetSelectors) {
    targetEl = document.querySelector(selector)
    if (targetEl) break
  }

  if (!targetEl) {
    arrow.classList.add('hidden')
    return
  }

  const rect = targetEl.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    arrow.classList.add('hidden')
    return
  }

  arrow.classList.remove('hidden')
  // Position the arrow just above the target's center, with a small offset
  // to leave room for the bouncing animation.
  const left = Math.round(rect.left + rect.width / 2 - 24)
  const top = Math.round(Math.max(8, rect.top - 56))
  arrow.style.transform = `translate(${left}px, ${top}px)`
}
