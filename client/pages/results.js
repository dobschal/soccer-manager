import { server } from '../lib/gateway.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { showGameModal } from '../partials/gameModal.js'
import { UIElement } from '../lib/UIElement.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { t } from '../i18n/index.js'
import { LeagueResultsPage } from './results/league.js'
import { CupResultsPage } from './results/cup.js'
import { FriendlyResultsPage } from './results/friendly.js'

export class ResultsPage extends UIElement {
  subPage = null
  page = null

  get events () {
    return super.events
  }

  get template () {
    return `
      <div>
        <nav class="nav nav-pills mb-4">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#results"><i class="fa fa-futbol-o"></i> ${t('results.leagueResults')}</a>
          <a class="nav-link ${this.subPage === 'cup' ? 'active' : ''}" href="#results?sub_page=cup"><i class="fa fa-trophy"></i> ${t('results.cupResults')}</a>
          <a class="nav-link ${this.subPage === 'friendly' ? 'active' : ''}" href="#results?sub_page=friendly"><i class="fa fa-handshake-o"></i> ${t('results.friendlyResults')}</a>
        </nav>

        ${this.page ?? t('common.loading')}
      </div>
    `
  }

  async load () {
    this.info = await server.getMyTeam()
    this.myTeamId = this.info.team.id
  }

  onMounted () {
    void showTutorialIfNeeded('results', this)
  }

  async onQueryChanged (queryParams) {
    if (queryParams.game_id) {
      await showGameModal(Number(queryParams.game_id))
    }
    if (queryParams.player_id) {
      await showPlayerModal(Number(queryParams.player_id))
    }

    const newSubPage = queryParams.sub_page || null

    // Switch sub-page if changed or not yet created
    if (newSubPage !== this.subPage || this.page === null) {
      this.subPage = newSubPage
      switch (this.subPage) {
        case 'cup':
          this.page = new CupResultsPage(this)
          break
        case 'friendly':
          this.page = new FriendlyResultsPage(this)
          break
        default:
          this.page = new LeagueResultsPage(this)
      }
    }

    // Let the sub-page apply query params before update
    if (this.page && typeof this.page.applyQueryParams === 'function') {
      await this.page.applyQueryParams(queryParams)
    }

    await this.update(true)
  }
}
