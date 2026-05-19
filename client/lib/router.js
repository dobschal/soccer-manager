import { isAuthenticated } from './auth.js'
import { fire } from './event.js'
import { el } from './html.js'
import { hideNavigation } from '../layouts/gameLayout.js'

let pages, lastKey
/** @type {Object<string, {page: Object, wrapper: HTMLElement}>} */
let _pageCache = {}

/**
 * Build the cache key for a page. Pages can declare a static `cacheKeyParams`
 * array of query-param names that contribute to their identity (e.g. ['id'] on
 * the team page so #team?id=85 and #team?id=86 are cached separately). Query
 * params not listed (e.g. player_id used to open a modal) don't invalidate
 * the cached instance.
 *
 * @param {string} path
 * @param {Object} queryParams
 * @param {*} PageRenderFn
 * @returns {string}
 */
function _getCacheKey (path, queryParams, PageRenderFn) {
  const keyParams = PageRenderFn?.cacheKeyParams ?? []
  if (keyParams.length === 0) return path
  const parts = keyParams.map(k => `${k}=${queryParams[k] ?? ''}`).join('&')
  return `${path}?${parts}`
}

/** Navigation page order for slide transition direction */
const PAGE_ORDER = {
  dashboard: 0,
  '': 0,
  'my-team': 1,
  results: 2,
  club: 3,
  trades: 4
}

/**
 * Open a page under a specific path.
 *
 * @param {string} path
 */
export function goTo (path) {
  window.location.hash = path
}

/**
 * Call this method on application start to resolve the correct page
 * and initialise the router
 *
 * @param {{[path: string]: [() => string, () => string]}} p - pages to be resolved
 */
/**
 * Refresh the currently visible page by calling update(true) on the cached page instance.
 * Used when the app returns from background to reload data without a full page reload.
 */
export function refreshCurrentPage () {
  if (!lastKey) return
  const cached = _pageCache[lastKey]
  if (cached?.page?.update) {
    cached.page.update(true)
  }
}

export function initRouter (p) {
  pages = p
  window.addEventListener('hashchange', _resolvePage)
  _resolvePage().then(() => console.log('⚙️ Router initialised and first page resolved.'))
}

/**
 * Update the query params inside the current hash
 *
 * @param {{[key: string]: string}} newQueryParams
 */
export function setQueryParams (newQueryParams = {}) {
  const [path] = window.location.hash.split('?')
  let queryParams = getQueryParams()
  queryParams = {
    ...queryParams,
    ...newQueryParams
  }
  for (const queryParamsKey in queryParams) {
    if (typeof queryParams[queryParamsKey] === 'undefined' || queryParams[queryParamsKey] === null) delete queryParams[queryParamsKey]
  }
  window.location.hash = path + '?' + Object
    .keys(queryParams)
    .map(key => `${key}=${queryParams[key]}`)
    .join('&')
}

/**
 * Get the search query params from the URL added to the hash
 *
 * @returns {Object}
 */
export function getQueryParams () {
  const [, currentQuery] = window.location.hash.split('?')
  const queryParams = {}
  currentQuery?.split('&').forEach(q => {
    queryParams[q.split('=')[0]] = q.split('=')[1]
  })
  return queryParams
}

let currentLayoutRenderFn
let _pageSettledTimer

/**
 * @param {string|undefined} fromPath
 * @param {string} toPath
 * @returns {'left'|'right'}
 */
function _getDirection (fromPath, toPath) {
  const fromIdx = PAGE_ORDER[fromPath]
  const toIdx = PAGE_ORDER[toPath]
  if (fromIdx == null || toIdx == null) return 'right'
  if (fromIdx === toIdx) return 'right'
  return toIdx > fromIdx ? 'right' : 'left'
}

/**
 * Undo the inline styles that swipeBackNavigation applied to pin the outgoing
 * wrapper absolutely. Used when the back-navigation lands on the same cache
 * key, so the same wrapper must stay visible (e.g. sub_page swap).
 *
 * @param {HTMLElement|undefined} wrapper
 */
function _restoreSwipeBackWrapper (wrapper) {
  window.__swipeBackInProgress = false
  if (!wrapper) return
  wrapper.style.transition = 'transform 220ms ease-out, opacity 220ms ease-out'
  wrapper.style.transform = 'translateX(0)'
  wrapper.style.opacity = '1'
  setTimeout(() => {
    wrapper.style.position = ''
    wrapper.style.top = ''
    wrapper.style.left = ''
    wrapper.style.right = ''
    wrapper.style.zIndex = ''
    wrapper.style.transition = ''
    wrapper.style.transform = ''
    wrapper.style.opacity = ''
    wrapper.classList.remove('swipe-back-outgoing')
  }, 240)
}

/**
 * Animate the whole #page container: slide it out, swap content, slide it back in.
 * direction 'right' = navigating forward  (container exits left, enters from right).
 * direction 'left'  = navigating backward (container exits right, enters from left).
 *
 * @param {HTMLElement} container  – the #page element
 * @param {HTMLElement|null} oldWrapper
 * @param {HTMLElement} newWrapper
 * @param {'left'|'right'} direction
 */
function _animateTransition (container, oldWrapper, newWrapper, direction) {
  // No animation on first load or same wrapper
  if (!oldWrapper || oldWrapper === newWrapper) {
    for (const child of [...container.children]) {
      child.style.display = child === newWrapper ? '' : 'none'
    }
    return
  }

  // Swipe-back: the outgoing wrapper is already animating off-screen (pinned
  // absolutely by swipeBackNavigation). Just fade the incoming page in here
  // and clean up the outgoing wrapper once its slide completes.
  if (window.__swipeBackInProgress) {
    window.__swipeBackInProgress = false
    container.style.transition = ''
    container.style.transform = ''

    newWrapper.style.display = ''
    newWrapper.style.transition = 'none'
    newWrapper.style.opacity = '0'

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        newWrapper.style.transition = 'opacity 220ms ease-out'
        newWrapper.style.opacity = '1'
      })
    })

    setTimeout(() => {
      oldWrapper.style.display = 'none'
      oldWrapper.style.position = ''
      oldWrapper.style.top = ''
      oldWrapper.style.left = ''
      oldWrapper.style.right = ''
      oldWrapper.style.zIndex = ''
      oldWrapper.style.transition = ''
      oldWrapper.style.transform = ''
      oldWrapper.style.opacity = ''
      oldWrapper.classList.remove('swipe-back-outgoing')
      newWrapper.style.transition = ''
      newWrapper.style.opacity = ''
    }, 260)
    return
  }

  const cleanup = () => {
    oldWrapper.style.display = 'none'
    newWrapper.style.display = ''
    container.style.transition = ''
    container.style.transform = ''
  }

  const startSlideIn = () => {

    // Swap content while off-screen
    oldWrapper.style.display = 'none'
    newWrapper.style.display = ''

    // Jump to the opposite side (no transition)
    container.style.transition = 'none'
    container.style.transform = direction === 'right' ? 'translateX(120%)' : 'translateX(-120%)'

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        container.style.transition = 'transform 0.3s ease-in-out'
        container.style.transform = 'translateX(0)'
        setTimeout(cleanup, 310)
      })
    })
  }

  // Phase 1: slide the whole container out
  container.style.transition = 'transform 0.3s ease-in-out'
  container.style.transform = direction === 'right' ? 'translateX(-120%)' : 'translateX(120%)'
  setTimeout(() => startSlideIn(), 310)
}

/**
 * @returns {Promise<void>}
 */
async function _resolvePage () {
  clearTimeout(_pageSettledTimer)
  const pageEl = el('#page')
  if (pageEl) pageEl.classList.remove('page-settled')

  const currentPath = window.location.hash.substring(1).split('?')[0] || 'dashboard'
  if (!isAuthenticated() && currentPath !== 'login') {
    return goTo('login')
  }
  const [layoutRenderFn, pageRenderFn] = pages[currentPath] ?? pages['*']
  const queryParams = getQueryParams()
  const currentKey = _getCacheKey(currentPath, queryParams, pageRenderFn)
  if (currentKey === lastKey) {
    // Same wrapper stays mounted (e.g. sub_page swap on a TabbedPage). If
    // this hashchange came from a swipe-back gesture, the wrapper has been
    // pinned absolutely and is mid-animation off-screen — restore it so the
    // sub-page content remains visible instead of a blank page.
    if (window.__swipeBackInProgress) {
      _restoreSwipeBackWrapper(_pageCache[currentKey]?.wrapper)
    }
    fire('query-changed', queryParams)
    return
  }
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: 'instant'
  })
  const previousKey = lastKey
  lastKey = currentKey
  const layoutChanged = await _renderLayout(layoutRenderFn)

  if (layoutChanged) {
    _pageCache = {}
  }

  hideNavigation()
  const pageElement = el('#page')
  if (!pageElement) throw new Error('Layout has no element with id="page"!!!')

  const previousPath = previousKey != null ? previousKey.split('?')[0] : undefined
  const direction = _getDirection(previousPath, currentPath)
  const oldWrapper = previousKey != null ? _pageCache[previousKey]?.wrapper : null

  const cached = _pageCache[currentKey]
  if (cached && pageElement.contains(cached.wrapper)) {
    _animateTransition(pageElement, oldWrapper, cached.wrapper, direction)
    _afterPageLoad()
    fire('query-changed', queryParams)
    // Directly call onQueryChanged on cached page — the event-based call may be
    // blocked by _isInsideHiddenContainer during the slide animation.
    if (cached.page?.onQueryChanged) {
      cached.page.onQueryChanged(queryParams)
    } else if (cached.page?.update) {
      cached.page.update(true)
    }
  } else {
    void _renderNewPage(pageRenderFn, currentKey, pageElement, oldWrapper, direction)
  }
}

/**
 * @param {Function | UIElement} PageUIElement
 * @param {string} cacheKey
 * @param {HTMLElement} pageElement
 * @param {HTMLElement|null} oldWrapper
 * @param {'left'|'right'} direction
 * @returns {Promise<void>}
 */
async function _renderNewPage (PageUIElement, cacheKey, pageElement, oldWrapper, direction) {
  const wrapper = document.createElement('div')
  wrapper.setAttribute('data-page', cacheKey)
  wrapper.style.display = 'none'

  if (PageUIElement.isUIElement) {
    /** @type {UIElement} */
    const page = new PageUIElement()
    wrapper.insertAdjacentHTML('afterbegin', String(page))
    pageElement.appendChild(wrapper)
    _pageCache[cacheKey] = {
      page,
      wrapper
    }
    _animateTransition(pageElement, oldWrapper, wrapper, direction)
    const startTime = Date.now()
    const timeoutMs = 60000
    const interval = setInterval(() => {
      if (page.isRendered) {
        clearInterval(interval)
        _afterPageLoad()
        fire('query-changed', getQueryParams())
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval)
        throw new Error(`Page "${cacheKey}" failed to render within ${timeoutMs / 1000} seconds`)
      }
    }, 100)
  } else {
    console.warn('Deprecated: ', cacheKey)
    wrapper.insertAdjacentHTML('afterbegin', await PageUIElement())
    pageElement.appendChild(wrapper)
    _animateTransition(pageElement, oldWrapper, wrapper, direction)
    _afterPageLoad()
  }
}

/**
 * @returns {void}
 */
function _afterPageLoad () {
  fire('page-changed')
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: 'instant'
  })
  clearTimeout(_pageSettledTimer)
  _pageSettledTimer = setTimeout(() => {
    const pageEl = el('#page')
    if (pageEl) pageEl.classList.add('page-settled')
  }, 500)
}

/**
 * @param {typeof UIElement} LayoutElement
 * @returns {Promise<boolean|undefined>}
 */
async function _renderLayout (LayoutElement) {
  if (!currentLayoutRenderFn || currentLayoutRenderFn !== LayoutElement) {
    if (!LayoutElement.isUIElement) {
      throw new Error('Fatal: Layout is no UIElement.')
    }
    const layout = new LayoutElement()
    document.body.innerHTML = layout.toString()
    // Wait for layout to be rendered
    await new Promise(resolve => {
      const interval = setInterval(() => {
        if (layout.isRendered) {
          clearInterval(interval)
          resolve()
        }
      }, 50)
    })
    currentLayoutRenderFn = LayoutElement
    return true
  }
}
