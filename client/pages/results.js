import { server } from '../lib/gateway.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { showGameModal } from '../partials/gameModal.js'
import { UIElement } from '../lib/UIElement.js'
import { el, generateId } from '../lib/html.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { getQueryParams } from '../lib/router.js'
import { t } from '../i18n/index.js'
import { LeagueResultsPage } from './results/league.js'
import { CupResultsPage } from './results/cup.js'
import { FriendlyResultsPage } from './results/friendly.js'

export class ResultsPage extends UIElement {
  subPage = null
  _subPageCache = {}
  _subPageContainerId = generateId()

  get template () {
    const key = this.subPage || 'league'
    const subPage = this._getOrCreateSubPage()
    return `
      <div>
        <nav class="nav nav-pills mb-4">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#results"><i class="fa fa-futbol-o"></i> ${t('results.leagueResults')}</a>
          <a class="nav-link ${this.subPage === 'cup' ? 'active' : ''}" href="#results?sub_page=cup"><i class="fa fa-trophy"></i> ${t('results.cupResults')}</a>
          <a class="nav-link ${this.subPage === 'friendly' ? 'active' : ''}" href="#results?sub_page=friendly"><i class="fa fa-handshake-o"></i> ${t('results.friendlyResults')}</a>
        </nav>

        <div id="${this._subPageContainerId}">
          <div data-subpage="${key}">${subPage}</div>
        </div>
      </div>
    `
  }

  _getOrCreateSubPage () {
    const key = this.subPage || 'league'
    if (!this._subPageCache[key]) {
      this._subPageCache[key] = this._createSubPage(key)
    }
    return this._subPageCache[key]
  }

  _createSubPage (key) {
    switch (key) {
      case 'cup':
        return new CupResultsPage(this)
      case 'friendly':
        return new FriendlyResultsPage(this)
      default:
        return new LeagueResultsPage(this)
    }
  }

  _switchSubPage () {
    const container = el('#' + this._subPageContainerId)
    if (!container) return
    const key = this.subPage || 'league'

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
        ? href === `#results?sub_page=${this.subPage}`
        : href === '#results'
      link.classList.toggle('active', isActive)
    })
  }

  async load () {
    this.info = await server.getMyTeam()
    this.myTeamId = this.info.team.id
  }

  onMounted () {
    void showTutorialIfNeeded('results', this)
    const queryParams = getQueryParams()
    if (queryParams.game_id) {
      void showGameModal(Number(queryParams.game_id))
    }
    if (queryParams.player_id) {
      void showPlayerModal(Number(queryParams.player_id))
    }
  }

  async onQueryChanged (queryParams) {
    if (queryParams.game_id) {
      await showGameModal(Number(queryParams.game_id))
    }
    if (queryParams.player_id) {
      await showPlayerModal(Number(queryParams.player_id))
    }

    const newSubPage = queryParams.sub_page || null

    if (newSubPage !== this.subPage) {
      this.subPage = newSubPage
      this._switchSubPage()
      this._updateNav()
    }

    const key = newSubPage || 'league'
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
