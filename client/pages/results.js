import { server } from '../lib/gateway.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { showGameModal } from '../partials/gameModal.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { getQueryParams } from '../lib/router.js'
import { t } from '../i18n/index.js'
import { LeagueResultsPage } from './results/league.js'
import { CupResultsPage } from './results/cup.js'
import { FriendlyResultsPage } from './results/friendly.js'
import { HallOfFamePage } from './results/hallOfFame.js'
import { TabbedPage } from '../lib/TabbedPage.js'

export class ResultsPage extends TabbedPage {
  async load () {
    this.info = await server.getMyTeam()
    this.myTeamId = this.info.team.id
  }
  get template () {
    return `
      <div>
        <nav class="nav nav-pills mb-4">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#results"><i class="fa fa-futbol-o"></i> ${t('results.leagueResults')}</a>
          <a class="nav-link ${this.subPage === 'cup' ? 'active' : ''}" href="#results?sub_page=cup"><i class="fa fa-trophy"></i> ${t('results.cupResults')}</a>
          <a class="nav-link ${this.subPage === 'friendly' ? 'active' : ''}" href="#results?sub_page=friendly"><i class="fa fa-handshake-o"></i> ${t('results.friendlyResults')}</a>
          <a class="nav-link ${this.subPage === 'hallOfFame' ? 'active' : ''}" href="#results?sub_page=hallOfFame"><i class="fa fa-star"></i> ${t('results.hallOfFame')}</a>
        </nav>
        ${this.renderSubPageContainer()}
      </div>
    `
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
      void showGameModal(Number(queryParams.game_id))
      return
    }
    if (queryParams.player_id) {
      void showPlayerModal(Number(queryParams.player_id))
      return
    }

    this._handleSubPageChange(queryParams.sub_page)

    const cached = this._getOrCreateSubPage()
    if (typeof cached.applyQueryParams === 'function') {
      await cached.applyQueryParams(queryParams)
      await cached.update(true)
    }
  }
  get routeName () { return 'results' }
  
  get defaultSubPageKey () { return 'league' }
  
  createSubPage (key) {
    switch (key) {
      case 'cup': return new CupResultsPage(this)
      case 'friendly': return new FriendlyResultsPage(this)
      case 'hallOfFame': return new HallOfFamePage(this)
      default: return new LeagueResultsPage(this)
    }
  }
  
}
