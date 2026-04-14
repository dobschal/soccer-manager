import { server } from '../lib/gateway.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { lineUpData } from '../partials/lineup.js'
import { toast } from '../partials/toast.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { t } from '../i18n/index.js'
import { YouthTeamPage } from './my-team/youthTeam.js'
import { ATeamPage } from './my-team/aTeam.js'
import { off, on } from '../lib/event.js'
import { initDragDrop } from '../lib/dragDrop.js'
import { TabbedPage } from '../lib/TabbedPage.js'

export class MyTeamPage extends TabbedPage {
  async load () {
    const [teamData, gamedayData] = await Promise.all([
      server.getMyTeam(),
      server.getCurrentGameday()
    ])
    this.data = teamData
    this.season = gamedayData.season
    lineUpData.squadDataChanged = false
  }
  get template () {
    return `
      <div>
        <nav class="nav nav-pills mb-2">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#my-team">${t('myTeam.aTeam')}</a>
          <a class="nav-link ${this.subPage === 'youth' ? 'active' : ''}" href="#my-team?sub_page=youth">${t('myTeam.youthTeam')}</a>
        </nav>
        ${this.renderSubPageContainer()}
      </div>
    `
  }
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
  onUpdate () {
    if (!this.subPage) {
      this._initDragDrop()
    }
  }
  async onQueryChanged (params) {
    if (params.player_id) {
      await showPlayerModal(Number(params.player_id))
    }
    const changed = this._handleSubPageChange(params.sub_page)
    if (changed && !this.subPage) {
      this._initDragDrop()
    }
  }
  onDestroy () {
    if (this._youthPlayerPromotedEventId !== undefined) {
      off(this._youthPlayerPromotedEventId)
    }
    if (this._onPlayerFired) {
      window.removeEventListener('player-fired', this._onPlayerFired)
    }
    this._dragDropCleanup?.destroy()
  }
  get routeName () { return 'my-team' }
  
  get defaultSubPageKey () { return 'ateam' }
  
  createSubPage (key) {
    if (key === 'youth') return new YouthTeamPage(this)
    return new ATeamPage(this)
  }

  /**
   * Initialize drag-and-drop connections between player list and pitch
   */
  _initDragDrop () {
    this._dragDropCleanup?.destroy()
    setTimeout(() => {
      const squadEl = document.querySelector(`${this._elementQuery} #squad .squad`)
      const benchEl = document.querySelector(`${this._elementQuery} #squad .bench`)
      if (!squadEl) return

      this._dragDropCleanup = initDragDrop({
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
            this._dragDropCleanup?.unlock()
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
            this._dragDropCleanup?.unlock()
          }
        }
      })
    }, 200)
  }
}
