import { UIElement } from './UIElement.js'
import { getQueryParams } from './router.js'
import { el, generateId } from './html.js'

/**
 * Base class for pages with tabbed sub-page navigation.
 *
 * Subclasses must implement:
 *   - get routeName()          – e.g. 'trades', 'dashboard'
 *   - get defaultSubPageKey()  – cache key when subPage is null, e.g. 'market'
 *   - createSubPage(key)       – factory returning a UIElement for the given key
 *
 * Provides:
 *   - Constructor reads sub_page from query params
 *   - Sub-page caching / switching / nav active-state management
 *   - renderSubPageContainer() helper for use inside template getters
 */
export class TabbedPage extends UIElement {

  constructor () {
    super()
    this.subPage = getQueryParams().sub_page || null
  }

  /**
   * Default onQueryChanged – handles sub_page switching.
   * Override in subclasses for additional param handling; call super or _handleSubPageChange.
   * @param {Record<string, string>} params
   */
  onQueryChanged (params) {
    this._handleSubPageChange(params.sub_page)
  }

  showLoadingIndicator = true

  /**
   * @abstract
   * @returns {string}
   */
  get routeName () {
    throw new Error('TabbedPage subclass must implement routeName')
  }

  /**
   * @abstract
   * @returns {string}
   */
  get defaultSubPageKey () {
    throw new Error('TabbedPage subclass must implement defaultSubPageKey')
  }

  /**
   * @abstract
   * @param {string} key
   * @returns {UIElement}
   */
  createSubPage (key) {
    throw new Error('TabbedPage subclass must implement createSubPage: ' + key)
  }

  /** @returns {string} */
  get subPageKey () {
    return this.subPage || this.defaultSubPageKey
  }

  _subPageCache = {}
  _subPageContainerId = generateId()

  /**
   * Get or create a sub-page for the current subPageKey
   * @returns {UIElement}
   */
  _getOrCreateSubPage () {
    const key = this.subPageKey
    if (!this._subPageCache[key]) {
      const subPage = this.createSubPage(key)
      subPage.showLoadingIndicator = true
      this._subPageCache[key] = subPage
    }
    return this._subPageCache[key]
  }

  /**
   * Render the sub-page container HTML. Use inside your template getter.
   * @returns {string}
   */
  renderSubPageContainer () {
    const subPage = this._getOrCreateSubPage()
    return `<div id="${this._subPageContainerId}"><div data-subpage="${this.subPageKey}">${subPage}</div></div>`
  }

  /**
   * Handle sub_page query param changes.
   * @param {string|undefined} subPageParam
   * @returns {boolean} true if the sub-page actually changed
   */
  _handleSubPageChange (subPageParam) {
    const newSubPage = subPageParam || null
    if (newSubPage === this.subPage) return false
    this.subPage = newSubPage
    this._switchSubPage()
    this._updateNav()
    return true
  }

  /**
   * Called before switching away from the current sub-page.
   * Override for cleanup (e.g. Three.js disposal).
   * @param {string} _fromKey
   */
  _onBeforeSubPageLeave (_fromKey) {
  }

  /**
   * Whether a sub-page's DOM should be removed and recreated every time it
   * becomes active (e.g. Three.js canvas that cannot be reused).
   * @param {string} _key
   * @returns {boolean}
   */
  _shouldRecreateSubPage (_key) {
    return false
  }

  /**
   * Switch the visible sub-page, using cached instances when available.
   */
  _switchSubPage () {
    const container = el('#' + this._subPageContainerId)
    if (!container) return
    const key = this.subPageKey

    this._onBeforeSubPageLeave(this._activeSubPageKey)

    container.querySelectorAll('[data-subpage]').forEach(w => {
      w.style.display = 'none'
    })

    if (this._shouldRecreateSubPage(key)) {
      const oldWrapper = container.querySelector(`[data-subpage="${key}"]`)
      if (oldWrapper) oldWrapper.remove()
      delete this._subPageCache[key]
    }

    let target = container.querySelector(`[data-subpage="${key}"]`)
    if (!target) {
      const subPage = this._getOrCreateSubPage()
      target = document.createElement('div')
      target.setAttribute('data-subpage', key)
      target.insertAdjacentHTML('afterbegin', String(subPage))
      container.appendChild(target)
    }

    this._activeSubPageKey = key
    this._fadeIn(target)
  }

  /** Tracks the currently visible sub-page key for _onBeforeSubPageLeave */
  _activeSubPageKey = null

  /**
   * Fade-in a sub-page wrapper.
   * @param {HTMLElement} wrapper
   */
  _fadeIn (wrapper) {
    wrapper.style.display = ''
    wrapper.style.opacity = '0'
    wrapper.style.transition = 'none'
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        wrapper.style.transition = 'opacity 0.3s ease-in'
        wrapper.style.opacity = '1'
      })
    })
  }

  /**
   * Update nav link active states to match current subPage.
   */
  _updateNav () {
    const root = document.querySelector(this._elementQuery)
    if (!root) return
    root.querySelectorAll('.nav-link').forEach(link => {
      const href = link.getAttribute('href')
      const isActive = this.subPage
        ? href === `#${this.routeName}?sub_page=${this.subPage}`
        : href === `#${this.routeName}`
      link.classList.toggle('active', isActive)
    })
  }
}
