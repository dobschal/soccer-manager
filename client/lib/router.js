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
  _resolvePage()
}

/**
 * Call this method on application start to resolve the correct page
 * and initialise the router
 *
 * @param {{[path: string]: [() => string, () => string]}}} p - pages to be resolved
 */
export function initRouter (p) {
  pages = p
  window.addEventListener('hashchange', _resolvePage)
  _resolvePage()
}

/**
 * Update the query params inside the current hash
 *
 * @param {{[key: string]: string}} newQueryParams
 */
export function setQueryParams (newQueryParams = {}) {
  const [path] = window.location.hash.split('?')
  let queryParams = getQueryParams
  queryParams = {
    ...queryParams,
    ...newQueryParams
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

let currentLayoutRenderFn, lastAnimationTimeout

async function _resolvePage () {
  const currentPath = window.location.hash.substring(1).split('?')[0]
  if (!isAuthenticated() && currentPath !== 'login') {
    return goTo('login')
  }
  const [layoutRenderFn, pageRenderFn] = pages[currentPath] ?? pages['*']
  let isFirstRender = false
  if (!currentLayoutRenderFn || currentLayoutRenderFn !== layoutRenderFn) {
    render('body', await layoutRenderFn())
    currentLayoutRenderFn = layoutRenderFn
    isFirstRender = true
  }
  document.body.insertAdjacentHTML('beforeend', `
    <div id="loading-indicator"></div>
  `)
  hideNavigation()
  const pageElement = el('#page')
  if (!pageElement) throw new Error('Layout has no element with id="page"!!!')
  if (!isFirstRender && lastPath !== currentPath) {
    pageElement.style.transform = 'translateX(100vw)'
  }
  lastPath = currentPath
  setTimeout(async () => {
    const t1 = Date.now()
    render('#page', await pageRenderFn())
    const diff = Date.now() - t1
    console.log(`Got ${currentPath} in ${diff}ms`)
    el('#loading-indicator')?.remove()
    fire('page-changed')
    if (lastAnimationTimeout) clearTimeout(lastAnimationTimeout)
    lastAnimationTimeout = setTimeout(() => {
      pageElement.style.transform = 'translateX(0vw)'
    }, Math.max(0, 300 - diff))
  }, 300)
}
