import { UIElement } from '../lib/UIElement.js'
import { el, generateId } from '../lib/html.js'
import { showPlayerModal } from './playerModal.js'
import { getQueryParams, setQueryParams } from '../lib/router.js'
import { t } from '../i18n/index.js'
import { BrowsePlayersPage } from '../pages/browse/players.js'
import { BrowseTeamsPage } from '../pages/browse/teams.js'
import { BrowseUsersPage } from '../pages/browse/users.js'

/**
 * Reusable search/browse widget: a select to switch between users/players/teams,
 * a search input, and the active sub-page below. Driven by the `search_tab`
 * URL param so it can be embedded under any parent page without clashing with
 * the parent's own `sub_page` param.
 */
export class SearchPanel extends UIElement {
  constructor () {
    super()
    this.searchTab = getQueryParams().search_tab || 'users'
  }

  get template () {
    const searchQuery = getQueryParams().search_query || ''
    const tabValue = (this.searchTab && this.searchTab !== 'users') ? this.searchTab : ''
    const innerPage = this._getOrCreateInnerPage()
    return `
      <div>
        <div class="mb-3">
          <select id="search-panel-select" class="form-select form-select-sm">
            <option value="" ${tabValue === '' ? 'selected' : ''}>${t('search.users')}</option>
            <option value="players" ${tabValue === 'players' ? 'selected' : ''}>${t('search.players')}</option>
            <option value="teams" ${tabValue === 'teams' ? 'selected' : ''}>${t('search.teams')}</option>
          </select>
        </div>

        <div class="mb-3">
          <input
            type="text"
            id="search-panel-input"
            class="form-control"
            placeholder="${t('search.placeholder')}"
            value="${searchQuery}"
          >
        </div>

        <div id="${this._containerId}" class="mb-3">
          <div data-search-tab="${this.searchTab}">${innerPage}</div>
        </div>
      </div>
    `
  }

  get events () {
    return {
      '#search-panel-input': {
        input: (e) => {
          clearTimeout(this._debounce)
          this._debounce = setTimeout(() => {
            setQueryParams({
              search_query: e.target.value.trim() || null,
              page: null
            })
          }, 300)
        }
      },
      '#search-panel-select': {
        change: (e) => {
          setQueryParams({
            search_tab: e.target.value || null,
            page: null
          })
        }
      }
    }
  }

  /**
   * Imperative entry point: parent pages call this from their onQueryChanged
   * to push the latest URL params into the panel and its active inner page.
   * @param {Record<string, string>} params
   */
  async applyQueryParams (params) {
    if (params.player_id) {
      await showPlayerModal(Number(params.player_id))
    }

    const newTab = params.search_tab || 'users'
    if (newTab !== this.searchTab) {
      this.searchTab = newTab
      this._switchInnerPage()
      this._syncSearchInput(params.search_query || '')
      this._syncSelect()
    }

    const inner = this._getOrCreateInnerPage()
    if (typeof inner.applyQueryParams === 'function') {
      await inner.applyQueryParams(params)
      if (typeof inner.update === 'function') {
        await inner.update(true)
      }
    }
  }

  _innerCache = {}
  _containerId = generateId()
  _debounce = null

  _getOrCreateInnerPage () {
    const key = this.searchTab || 'users'
    if (!this._innerCache[key]) {
      this._innerCache[key] = this._createInnerPage(key)
    }
    return this._innerCache[key]
  }

  _createInnerPage (key) {
    if (key === 'players') return new BrowsePlayersPage(this)
    if (key === 'teams') return new BrowseTeamsPage(this)
    return new BrowseUsersPage(this)
  }

  _switchInnerPage () {
    const container = el('#' + this._containerId)
    if (!container) return
    const key = this.searchTab || 'users'

    container.querySelectorAll('[data-search-tab]').forEach(w => {
      w.style.display = 'none'
    })

    let target = container.querySelector(`[data-search-tab="${key}"]`)
    if (!target) {
      const innerPage = this._getOrCreateInnerPage()
      target = document.createElement('div')
      target.setAttribute('data-search-tab', key)
      target.insertAdjacentHTML('afterbegin', String(innerPage))
      container.appendChild(target)
    }
    this._fadeIn(target)
  }

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

  _syncSearchInput (value) {
    const input = el('#search-panel-input')
    if (input && input !== document.activeElement) {
      input.value = value
    }
  }

  _syncSelect () {
    const select = el('#search-panel-select')
    if (select) {
      select.value = (this.searchTab && this.searchTab !== 'users') ? this.searchTab : ''
    }
  }
}
