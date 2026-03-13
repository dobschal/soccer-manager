import { showPlayerModal } from '../partials/playerModal.js'
import { getQueryParams, setQueryParams } from '../lib/router.js'
import { t } from '../i18n/index.js'
import { BrowsePlayersPage } from './browse/players.js'
import { BrowseTeamsPage } from './browse/teams.js'
import { BrowseUsersPage } from './browse/users.js'
import { TabbedPage } from '../lib/TabbedPage.js'

export class BrowsePage extends TabbedPage {
  get template () {
    const searchQuery = getQueryParams().search_query || ''
    return `
      <div>
        <nav class="nav nav-pills mb-4">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#browse"><i class="fa fa-user"></i> ${t('search.players')}</a>
          <a class="nav-link ${this.subPage === 'teams' ? 'active' : ''}" href="#browse?sub_page=teams"><i class="fa fa-users"></i> ${t('search.teams')}</a>
          <a class="nav-link ${this.subPage === 'users' ? 'active' : ''}" href="#browse?sub_page=users"><i class="fa fa-id-card"></i> ${t('search.users')}</a>
        </nav>

        <div class="mb-3">
          <input
            type="text"
            id="browse-search-input"
            class="form-control"
            placeholder="${t('search.placeholder')}"
            value="${searchQuery}"
          >
        </div>

        ${this.renderSubPageContainer()}
      </div>
    `
  }
  get events () {
    return {
      '#browse-search-input': {
        input: (e) => {
          clearTimeout(this._debounce)
          this._debounce = setTimeout(() => {
            setQueryParams({ search_query: e.target.value.trim() || null, page: null })
          }, 300)
        }
      }
    }
  }
  async onQueryChanged (queryParams) {
    if (queryParams.player_id) {
      await showPlayerModal(Number(queryParams.player_id))
    }

    const changed = this._handleSubPageChange(queryParams.sub_page)
    if (changed) {
      this._syncSearchInput(queryParams.search_query || '')
    }

    const cached = this._getOrCreateSubPage()
    if (typeof cached.applyQueryParams === 'function') {
      await cached.applyQueryParams(queryParams)
      await cached.update(true)
    }
  }
  get routeName () { return 'browse' }
  
  get defaultSubPageKey () { return 'players' }
  
  createSubPage (key) {
    switch (key) {
      case 'teams': return new BrowseTeamsPage(this)
      case 'users': return new BrowseUsersPage(this)
      default: return new BrowsePlayersPage(this)
    }
  }

  _debounce = null

  _syncSearchInput (value) {
    const input = document.querySelector(`${this._elementQuery} #browse-search-input`)
    if (input && input !== document.activeElement) {
      input.value = value
    }
  }
}
