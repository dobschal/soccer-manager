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
    const subPageValue = this.subPage || ''
    return `
      <div>
        <nav class="nav nav-pills mb-4">
          <a class="nav-link" href="#dashboard"><i class="fa fa-home"></i> ${t('dashboard.tabStart')}</a>
          <a class="nav-link" href="#dashboard?sub_page=cards"><i class="fa fa-clone"></i> ${t('dashboard.tabCards')}</a>
          <a class="nav-link" href="#dashboard?sub_page=news"><i class="fa fa-newspaper-o"></i> ${t('dashboard.tabNews')}</a>
          <a class="nav-link" href="#dashboard?sub_page=messages"><i class="fa fa-envelope"></i> ${t('dashboard.tabMessages')}</a>
          <a class="nav-link" href="#forum"><i class="fa fa-comments"></i> ${t('forum.title')}</a>
          <a class="nav-link active" href="#browse"><i class="fa fa-search"></i> ${t('search.title')}</a>
        </nav>

        <div class="mb-3">
          <select id="browse-subpage-select" class="form-select">
            <option value="" ${subPageValue === '' ? 'selected' : ''}>${t('search.players')}</option>
            <option value="teams" ${subPageValue === 'teams' ? 'selected' : ''}>${t('search.teams')}</option>
            <option value="users" ${subPageValue === 'users' ? 'selected' : ''}>${t('search.users')}</option>
          </select>
        </div>

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
      },
      '#browse-subpage-select': {
        change: (e) => {
          setQueryParams({ sub_page: e.target.value || null, page: null })
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
  _updateNav () {
    const select = document.querySelector(`${this._elementQuery} #browse-subpage-select`)
    if (select) select.value = this.subPage || ''
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
