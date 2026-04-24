import { server } from '../lib/gateway.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { lineUpData } from '../partials/lineup.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { t } from '../i18n/index.js'
import { YouthTeamPage } from './my-team/youthTeam.js'
import { ATeamPage } from './my-team/aTeam.js'
import { off, on } from '../lib/event.js'
import { ActionCards } from './dashboard/actionCards.js'
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
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#my-team"><i class="fa fa-male"></i> ${t('myTeam.aTeam')}</a>
          <a class="nav-link ${this.subPage === 'youth' ? 'active' : ''}" href="#my-team?sub_page=youth"><i class="fa fa-child"></i> ${t('myTeam.youthTeam')}</a>
          <a class="nav-link ${this.subPage === 'cards' ? 'active' : ''}" href="#my-team?sub_page=cards"><i class="fa fa-clone"></i> ${t('dashboard.tabCards')}</a>
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
    })
    this._onPlayerFired = async () => {
      await this.load()
      this._subPageCache = {}
      await this.update()
    }
    window.addEventListener('player-fired', this._onPlayerFired)
  }
  async onQueryChanged (params) {
    if (params.player_id) {
      await showPlayerModal(Number(params.player_id))
    }
    this._handleSubPageChange(params.sub_page)
  }
  onDestroy () {
    if (this._youthPlayerPromotedEventId !== undefined) {
      off(this._youthPlayerPromotedEventId)
    }
    if (this._onPlayerFired) {
      window.removeEventListener('player-fired', this._onPlayerFired)
    }
  }
  get routeName () { return 'my-team' }
  
  get defaultSubPageKey () { return 'ateam' }
  
  createSubPage (key) {
    if (key === 'youth') return new YouthTeamPage(this)
    if (key === 'cards') return new ActionCards()
    return new ATeamPage(this)
  }

}
