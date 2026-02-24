import { server } from '../lib/gateway.js'
import { el, generateId } from '../lib/html.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { lineUpData } from '../partials/lineup.js'
import { toast } from '../partials/toast.js'
import { UIElement } from '../lib/UIElement.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { t } from '../i18n/index.js'
import { YouthTeamPage } from './my-team/youthTeam.js'
import { ATeamPage } from './my-team/aTeam.js'
import { off, on } from '../lib/event.js'
import { initDragDrop } from '../lib/dragDrop.js'

export class MyTeamPage extends UIElement {
  _subPageCache = {}
  _subPageContainerId = generateId()

  /**
   * @returns {string}
   */
  get template () {
    const key = this.subPage || 'ateam'
    const subPage = this._getOrCreateSubPage()
    return `
      <div>
        <nav class="nav nav-pills mb-2">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#my-team">${t('myTeam.aTeam')}</a>
          <a class="nav-link ${this.subPage === 'youth' ? 'active' : ''}" href="#my-team?sub_page=youth">${t('myTeam.youthTeam')}</a>
        </nav>
        <div id="${this._subPageContainerId}">
          <div data-subpage="${key}">${subPage}</div>
        </div>
      </div>
    `
  }

  _getOrCreateSubPage () {
    const key = this.subPage || 'ateam'
    if (key === 'youth') {
      if (!this._subPageCache.youth) {
        this._subPageCache.youth = new YouthTeamPage(this)
      }
      return this._subPageCache.youth
    }
    if (!this._subPageCache.ateam) {
      this._subPageCache.ateam = new ATeamPage(this)
    }
    return this._subPageCache.ateam
  }

  _switchSubPage () {
    const container = el('#' + this._subPageContainerId)
    if (!container) return
    const key = this.subPage || 'ateam'

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
        ? href === `#my-team?sub_page=${this.subPage}`
        : href === '#my-team'
      link.classList.toggle('active', isActive)
    })
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const [teamData, gamedayData] = await Promise.all([
      server.getMyTeam(),
      server.getCurrentGameday()
    ])
    this.data = teamData
    this.season = gamedayData.season
    lineUpData.squadDataChanged = false
  }

  /**
   * @param {Object} params
   * @param {string} params.player_id
   * @param {string} params.sub_page
   * @returns {Promise<void>}
   */
  async onQueryChanged ({
    player_id: playerId,
    sub_page: subPage
  }) {
    if (playerId) {
      await showPlayerModal(Number(playerId))
    }

    // Handle tab switching
    const newSubPage = subPage || null
    if (newSubPage !== this.subPage) {
      this.subPage = newSubPage
      this._switchSubPage()
      this._updateNav()
      if (!newSubPage) this._initDragDrop()
    }
  }

  /**
   * @returns {void}
   */
  onMounted () {
    void showTutorialIfNeeded('team', this)
    this._youthPlayerPromotedEventId = on('YOUTH_PLAYER_PROMOTED', async () => {
      await this.load()
      this._subPageCache = {}
      await this.update()
      if (!this.subPage) this._initDragDrop()
    })
    this._onPlayerFired = async () => {
      await this.load()
      this._subPageCache = {}
      await this.update()
      if (!this.subPage) this._initDragDrop()
    }
    window.addEventListener('player-fired', this._onPlayerFired)
    if (!this.subPage) {
      this._initDragDrop()
    }
  }

  /**
   * @returns {void}
   */
  onDestroy () {
    if (this._youthPlayerPromotedEventId !== undefined) {
      off(this._youthPlayerPromotedEventId)
    }
    if (this._onPlayerFired) {
      window.removeEventListener('player-fired', this._onPlayerFired)
    }
    this._dragDropCleanup?.destroy()
  }

  /**
   * Initialize drag-and-drop connections between player list and pitch
   * @returns {void}
   */
  _initDragDrop () {
    this._dragDropCleanup?.destroy()
    setTimeout(() => {
      const tableBody = document.querySelector(`${this._elementQuery} #player-list-container tbody`)
      const squadEl = document.querySelector(`${this._elementQuery} #squad .squad`)
      const benchEl = document.querySelector(`${this._elementQuery} #squad .bench`)
      if (!tableBody || !squadEl) return

      this._dragDropCleanup = initDragDrop({
        tableBodyEl: tableBody,
        squadEl,
        benchEl,
        players: this.data.players,
        team: this.data.team,
        onLineupChange: async (playersToSave, formation) => {
          try {
            await server.saveLineup(playersToSave, formation)
            toast('Lineup saved.', 'success')
            lineUpData.squadDataChanged = false
            await this.load()
            await this.update()
            this._initDragDrop()
          } catch (e) {
            console.error(e)
            toast(e.message ?? 'Something went wrong...', 'error')
          }
        },
        onSortChanged: async (sortData) => {
          try {
            await server.saveBenchSortOrder(sortData)
            await this.load()
            await this.update()
            this._initDragDrop()
          } catch (e) {
            console.error(e)
            toast(e.message ?? 'Something went wrong...', 'error')
          }
        }
      })
    }, 200)
  }
}
