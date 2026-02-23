import { isAuthenticated } from './auth.js'
import { fire } from './event.js'
import { el } from './html.js'
import { render } from './render.js'
import { hideNavigation } from '../layouts/gameLayout.js'

let pages, lastPath
/** @type {Object<string, {page: Object, wrapper: HTMLElement}>} */
let _pageCache = {}

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
 * @returns {Promise<void>}
 */
async function _resolvePage () {
  const currentPath = window.location.hash.substring(1).split('?')[0]
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
    behavior: 'smooth'
  })
  lastPath = currentPath
  const [layoutRenderFn, pageRenderFn] = pages[currentPath] ?? pages['*']
  const layoutChanged = await _renderLayout(layoutRenderFn)

  if (layoutChanged) {
    _pageCache = {}
  }

  hideNavigation()
  const pageElement = el('#page')
  if (!pageElement) throw new Error('Layout has no element with id="page"!!!')

  // Hide all cached page wrappers
  for (const child of [...pageElement.children]) {
    child.style.display = 'none'
  }

  const cached = _pageCache[currentPath]
  if (cached && pageElement.contains(cached.wrapper)) {
    cached.wrapper.style.display = ''
    _afterPageLoad()
    fire('query-changed', getQueryParams())
    if (cached.page?.update) cached.page.update(true)
  } else {
    void _renderNewPage(pageRenderFn, currentPath, pageElement)
  }
}

/**
 * @param {Function | UIElement} PageUIElement
 * @param {string} currentPath
 * @param {HTMLElement} pageElement
 * @returns {Promise<void>}
 */
async function _renderNewPage (PageUIElement, currentPath, pageElement) {
  const wrapper = document.createElement('div')
  wrapper.setAttribute('data-page', currentPath)

  if (PageUIElement.isUIElement) {
    /** @type {UIElement} */
    const page = new PageUIElement()
    wrapper.insertAdjacentHTML('afterbegin', String(page))
    pageElement.appendChild(wrapper)
    _pageCache[currentPath] = {
      page,
      wrapper
    }
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
    _afterPageLoad()
  }
}

/**
 * @returns {void}
 */
function _afterPageLoad () {
  fire('page-changed')
  window.scrollTo(0, 0)
}

/**
 * @param {Function} LayoutElement
 * @returns {Promise<boolean|undefined>}
 */
async function _renderLayout (LayoutElement) {
  if (!currentLayoutRenderFn || currentLayoutRenderFn !== LayoutElement) {
    // Clean up any scroll-lock state left by overlays before replacing body content
    document.body.classList.remove('overlay-open')
    document.body.style.top = ''
    if (LayoutElement.isUIElement) {
      const layout = new LayoutElement()
      render('body', layout)
      // Wait for layout to be rendered
      await new Promise(resolve => {
        const interval = setInterval(() => {
          if (layout.isRendered) {
            clearInterval(interval)
            resolve()
          }
        }, 50)
      })
    } else {
      // Backwards compatibility for function-based layouts
      render('body', await LayoutElement())
    }
    currentLayoutRenderFn = LayoutElement
    return true
  }
}
