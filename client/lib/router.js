import { isAuthenticated } from './auth.js'
import { fire } from './event.js'
import { el } from './html.js'
import { hideNavigation } from '../layouts/gameLayout.js'

let pages, lastPath
/** @type {Object<string, {page: Object, wrapper: HTMLElement}>} */
let _pageCache = {}

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
    console.log('No animation: ', !oldWrapper ? 'first load' : 'same wrapper')
    for (const child of [...container.children]) {
      child.style.display = child === newWrapper ? '' : 'none'
    }
    return
  }

  // Keep old content visible, hide everything else
  // TODO: Is that needed?
  // for (const child of [...container.children]) {
  //   if (child !== oldWrapper) {
  //     child.style.display = 'none'
  //   }
  // }

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
  const currentPath = window.location.hash.substring(1).split('?')[0] || 'dashboard'
  if (!isAuthenticated() && currentPath !== 'login') {
    return goTo('login')
  }
  if (currentPath === lastPath) {
    fire('query-changed', getQueryParams())
    return
  }
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: 'instant'
  })
  const previousPath = lastPath
  lastPath = currentPath
  const [layoutRenderFn, pageRenderFn] = pages[currentPath] ?? pages['*']
  const layoutChanged = await _renderLayout(layoutRenderFn)

  if (layoutChanged) {
    _pageCache = {}
  }

  hideNavigation()
  const pageElement = el('#page')
  if (!pageElement) throw new Error('Layout has no element with id="page"!!!')

  const direction = _getDirection(previousPath, currentPath)
  const oldWrapper = previousPath != null ? _pageCache[previousPath]?.wrapper : null

  const cached = _pageCache[currentPath]
  if (cached && pageElement.contains(cached.wrapper)) {
    _animateTransition(pageElement, oldWrapper, cached.wrapper, direction)
    _afterPageLoad()
    const queryParams = getQueryParams()
    fire('query-changed', queryParams)
    // Directly call onQueryChanged on cached page — the event-based call may be
    // blocked by _isInsideHiddenContainer during the slide animation.
    if (cached.page?.onQueryChanged) cached.page.onQueryChanged(queryParams)
    if (cached.page?.update) cached.page.update(true)
  } else {
    void _renderNewPage(pageRenderFn, currentPath, pageElement, oldWrapper, direction)
  }
}

/**
 * @param {Function | UIElement} PageUIElement
 * @param {string} currentPath
 * @param {HTMLElement} pageElement
 * @param {HTMLElement|null} oldWrapper
 * @param {'left'|'right'} direction
 * @returns {Promise<void>}
 */
async function _renderNewPage (PageUIElement, currentPath, pageElement, oldWrapper, direction) {
  const wrapper = document.createElement('div')
  wrapper.setAttribute('data-page', currentPath)
  wrapper.style.display = 'none'

  if (PageUIElement.isUIElement) {
    /** @type {UIElement} */
    const page = new PageUIElement()
    wrapper.insertAdjacentHTML('afterbegin', String(page))
    pageElement.appendChild(wrapper)
    _pageCache[currentPath] = {
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
        throw new Error(`Page "${currentPath}" failed to render within ${timeoutMs / 1000} seconds`)
      }
    }, 100)
  } else {
    console.warn('Deprecated: ', currentPath)
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
        console.log('Check that layout is rendered...')
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
