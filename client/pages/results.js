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
import { SchedulePage } from './results/schedule.js'
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
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#results"><i class="fa fa-diamond"></i> ${t('results.leagueResults')}</a>
          <a class="nav-link ${this.subPage === 'cup' ? 'active' : ''}" href="#results?sub_page=cup"><i class="fa fa-trophy"></i> ${t('results.cupResults')}</a>
          <a class="nav-link ${this.subPage === 'schedule' ? 'active' : ''}" href="#results?sub_page=schedule"><i class="fa fa-calendar"></i> ${t('schedule.tab')}</a>
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
    if (queryParams.top_scorers) {
      this._openTopScorersOverlay()
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
    if (queryParams.top_scorers) {
      this._openTopScorersOverlay()
      return
    }

    this._handleSubPageChange(queryParams.sub_page)

    const cached = this._getOrCreateSubPage()
    if (typeof cached.applyQueryParams === 'function') {
      await cached.applyQueryParams(queryParams)
      await cached.update(true)
    }
  }
  /**
   * Open the top-scorers overlay on the league sub-page (#464). Only the league
   * sub-page provides the list, so this is a no-op elsewhere.
   */
  _openTopScorersOverlay () {
    const page = this._getOrCreateSubPage()
    if (page && typeof page._showTopScorersOverlay === 'function') {
      page._showTopScorersOverlay()
    }
  }

  get routeName () { return 'results' }
  
  get defaultSubPageKey () { return 'league' }
  
  createSubPage (key) {
    switch (key) {
      case 'cup': return new CupResultsPage(this)
      case 'schedule': return new SchedulePage(this)
      case 'friendly': return new FriendlyResultsPage(this)
      case 'hallOfFame': return new HallOfFamePage(this)
      default: return new LeagueResultsPage(this)
    }
  }
  
}
