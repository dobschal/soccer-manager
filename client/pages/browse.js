import { UIElement } from '../lib/UIElement.js'
import { el, generateId } from '../lib/html.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { t } from '../i18n/index.js'
import { BrowsePlayersPage } from './browse/players.js'
import { BrowseTeamsPage } from './browse/teams.js'
import { BrowseUsersPage } from './browse/users.js'

export class BrowsePage extends UIElement {
  subPage = null
  _subPageCache = {}
  _subPageContainerId = generateId()

  get template () {
    const key = this.subPage || 'players'
    const subPage = this._getOrCreateSubPage()
    return `
      <div>
        <nav class="nav nav-pills mb-4">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#browse"><i class="fa fa-user"></i> ${t('search.players')}</a>
          <a class="nav-link ${this.subPage === 'teams' ? 'active' : ''}" href="#browse?sub_page=teams"><i class="fa fa-users"></i> ${t('search.teams')}</a>
          <a class="nav-link ${this.subPage === 'users' ? 'active' : ''}" href="#browse?sub_page=users"><i class="fa fa-id-card"></i> ${t('search.users')}</a>
        </nav>

        <div id="${this._subPageContainerId}">
          <div data-subpage="${key}">${subPage}</div>
        </div>
      </div>
    `
  }

  _getOrCreateSubPage () {
    const key = this.subPage || 'players'
    if (!this._subPageCache[key]) {
      this._subPageCache[key] = this._createSubPage(key)
    }
    return this._subPageCache[key]
  }

  _createSubPage (key) {
    switch (key) {
      case 'teams':
        return new BrowseTeamsPage(this)
      case 'users':
        return new BrowseUsersPage(this)
      default:
        return new BrowsePlayersPage(this)
    }
  }

  _switchSubPage () {
    const container = el('#' + this._subPageContainerId)
    if (!container) return
    const key = this.subPage || 'players'

    container.querySelectorAll('[data-subpage]').forEach(w => {
      w.style.display = 'none'
    })

    const existing = container.querySelector(`[data-subpage="${key}"]`)
    if (existing) {
      existing.style.display = ''
      const cached = this._subPageCache[key]
      if (cached?.update) cached.update()
      return
    }

    const subPage = this._getOrCreateSubPage()
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-subpage', key)
    wrapper.insertAdjacentHTML('afterbegin', String(subPage))
    container.appendChild(wrapper)
  }

  _updateNav () {
    const root = document.querySelector(this._elementQuery)
    if (!root) return
    root.querySelectorAll('.nav-link').forEach(link => {
      const href = link.getAttribute('href')
      const isActive = this.subPage
        ? href === `#browse?sub_page=${this.subPage}`
        : href === '#browse'
      link.classList.toggle('active', isActive)
    })
  }

  async onQueryChanged (queryParams) {
    if (queryParams.player_id) {
      await showPlayerModal(Number(queryParams.player_id))
    }

    const newSubPage = queryParams.sub_page || null

    if (newSubPage !== this.subPage) {
      this.subPage = newSubPage
      this._switchSubPage()
      this._updateNav()
    }

    const key = newSubPage || 'players'
    if (!this._subPageCache[key]) {
      this._subPageCache[key] = this._createSubPage(key)
    }
    const cached = this._subPageCache[key]
    if (cached && typeof cached.applyQueryParams === 'function') {
      await cached.applyQueryParams(queryParams)
      await cached.update(true)
    }
  }
}
