import { isAuthenticated } from './auth.js'
import { fire } from './event.js'
import { el } from './html.js'
import { render } from './render.js'
import { hideNavigation } from '../layouts/gameLayout.js'
import { delay } from '../util/delay.js'
import { UIElement } from './UIElement.js'

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
  _resolvePage().then(() => console.log('Router initialised and first page resolved.'))
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

async function _resolvePage () {
  const currentPath = window.location.hash.substring(1).split('?')[0]
  if (!isAuthenticated() && currentPath !== 'login') {
    return goTo('login')
  }
  if (currentPath === lastPath) {
    fire('query-changed', getQueryParams())
    return
  }
  lastPath = currentPath
  const [layoutRenderFn, pageRenderFn] = pages[currentPath] ?? pages['*']
  const layoutChanged = await _renderLayout(layoutRenderFn)
  _showLoadingIndicator()
  hideNavigation()
  const pageElement = el('#page')
  if (!pageElement) throw new Error('Layout has no element with id="page"!!!')
  if (!layoutChanged) {
    pageElement.style.transform = 'translateX(100vw)'
  }
  await delay(300)
  await _renderNewPage(pageRenderFn, currentPath, pageElement)
}

async function _renderNewPage (pageRenderFn, currentPath, pageElement) {
  const t1 = Date.now()
  if (pageRenderFn.isUIElement) {
    const page = new pageRenderFn()
    fire('query-changed', getQueryParams())
    render('#page', page)
  } else {
    render('#page', await pageRenderFn())
  }
  const diff = Date.now() - t1
  console.log(`Got ${currentPath} in ${diff}ms`)
  _hideLoadingIndicator()
  fire('page-changed')
  await delay(Math.max(0, 300 - diff))
  pageElement.style.transform = 'translateX(0vw)'
  await delay(100)
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: 'smooth'
  })
}

function _showLoadingIndicator () {
  const element = el('#loading-indicator')
  if (element) return
  document.body.insertAdjacentHTML(
    'beforeend',
    '<div id="loading-indicator"></div>'
  )
}
function _hideLoadingIndicator () {
  el('#loading-indicator')?.remove()
}

async function _renderLayout (layoutRenderFn) {
  if (!currentLayoutRenderFn || currentLayoutRenderFn !== layoutRenderFn) {
    render('body', await layoutRenderFn())
    currentLayoutRenderFn = layoutRenderFn
    return true
  }
}
