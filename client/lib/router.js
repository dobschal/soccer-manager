import { isAuthenticated } from './auth.js'
import { fire } from './event.js'
import { el } from './html.js'
import { render } from './render.js'
import { hideNavigation } from '../layouts/gameLayout.js'

let pages, lastPath

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
  _showLoadingIndicator()
  hideNavigation()
  const pageElement = el('#page')
  if (!pageElement) throw new Error('Layout has no element with id="page"!!!')
  if (!layoutChanged) {
    pageElement.style.opacity = '0'
    pageElement.style.transform = 'translateY(50px)'
  }
  pageElement.innerHTML = ''
  await _renderNewPage(pageRenderFn, currentPath, pageElement)
}

/**
 * @param {Function} PageUIElement
 * @param {string} currentPath
 * @param {HTMLElement} pageElement
 * @returns {Promise<void>}
 */
async function _renderNewPage (PageUIElement, currentPath, pageElement) {
  if (PageUIElement.isUIElement) {
    /** @type {UIElement} */
    const page = new PageUIElement()
    fire('query-changed', getQueryParams())
    render('#page', page)
    const startTime = Date.now()
    const timeoutMs = 60000
    const interval = setInterval(() => {
      if (page.isRendered) {
        clearInterval(interval)
        _afterPageLoad(pageElement)
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval)
        throw new Error(`Page "${currentPath}" failed to render within ${timeoutMs / 1000} seconds`)
      }
    }, 100)
  } else {
    console.warn('Deprecated: ', currentPath)
    render('#page', await PageUIElement())
    _afterPageLoad(pageElement)
  }
}

/**
 * @param {HTMLElement} pageElement
 * @returns {void}
 */
function _afterPageLoad (pageElement) {
  _hideLoadingIndicator()
  fire('page-changed')
  pageElement.style.transform = 'translateY(0)'
  pageElement.style.opacity = '1'
}

/**
 * @returns {void}
 */
function _showLoadingIndicator () {
  const element = el('#loading-indicator')
  if (element) return
  document.body.insertAdjacentHTML(
    'beforeend',
    '<div id="loading-indicator"></div>'
  )
}

/**
 * @returns {void}
 */
function _hideLoadingIndicator () {
  el('#loading-indicator')?.remove()
}

/**
 * @param {Function} LayoutElement
 * @returns {Promise<boolean|undefined>}
 */
async function _renderLayout (LayoutElement) {
  if (!currentLayoutRenderFn || currentLayoutRenderFn !== LayoutElement) {
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
