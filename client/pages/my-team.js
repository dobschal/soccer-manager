import { server } from '../lib/gateway.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { t } from '../i18n/index.js'
import { YouthTeamPage } from './my-team/youthTeam.js'
import { ATeamPage } from './my-team/aTeam.js'
import { TourPage } from './my-team/tour.js'
import { off, on } from '../lib/event.js'
import { ActionCards } from './dashboard/actionCards.js'
import { TabbedPage } from '../lib/TabbedPage.js'
import { SERVER_EVENTS } from '../lib/serverEvents.js'
import { countUnseenActionCards, markActionCardsSeen } from '../lib/actionCardsSeen.js'

export class MyTeamPage extends TabbedPage {
  async load () {
    const [teamData, gamedayData, cardsData] = await Promise.all([
      server.getMyTeam(),
      server.getCurrentGameday(),
      server.getActionCards()
    ])
    this.data = teamData
    this.season = gamedayData.season
    const cards = cardsData.actionCards || []
    if (this.subPage === 'cards') {
      // The user is looking at the tab right now — treat everything as seen.
      markActionCardsSeen(this.data.team.id, cards)
      this.newCardCount = 0
    } else {
      this.newCardCount = countUnseenActionCards(this.data.team.id, cards)
    }
  }
  get template () {
    return `
      <div>
        <nav class="nav nav-pills mb-2">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#my-team"><i class="fa fa-male"></i> ${t('myTeam.aTeam')}</a>
          <a class="nav-link ${this.subPage === 'youth' ? 'active' : ''}" href="#my-team?sub_page=youth"><i class="fa fa-child"></i> ${t('myTeam.youthTeam')}</a>
          <a class="nav-link ${this.subPage === 'cards' ? 'active' : ''}" href="#my-team?sub_page=cards"><i class="fa fa-clone"></i> ${t('dashboard.tabCards')}${this.newCardCount > 0 ? ` <span class="badge bg-danger rounded-pill" style="position: absolute;transform: translateY(-26px) translateX(-5px);padding: 8px;text-align: center;">${this.newCardCount}</span>` : ''}</a>
          <a class="nav-link ${this.subPage === 'tour' ? 'active' : ''}" href="#my-team?sub_page=tour"><i class="fa fa-plane"></i> ${t('tour.tab')}</a>
        </nav>
        ${this.renderSubPageContainer()}
      </div>
    `
  }
  /**
   * Every event here changes the *shape* of the squad, which the lineup and the
   * player picker both derive from `data.players`. The handlers stay registered
   * for the element's whole DOM lifetime, so a page sitting hidden in the
   * router's cache refreshes too and shows the new squad when the user returns.
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      [SERVER_EVENTS.PLAYER_SOLD.name]: () => this.refresh(),
      // Fires after the user buys a player (instant buy or accepted offer)
      // so the lineup picks the new squad member up without a hard reload.
      [SERVER_EVENTS.BUY_OFFER_ACCEPTED.name]: () => this.refresh(),
      [SERVER_EVENTS.PLAYER_HIRED.name]: () => this.refresh(),
      [SERVER_EVENTS.PLAYER_FIRED.name]: () => this.refresh()
    }
  }

  onMounted () {
    void showTutorialIfNeeded('team', this)
    this._youthPlayerPromotedEventId = on('YOUTH_PLAYER_PROMOTED', () => this.refresh())
  }
  async onQueryChanged (params) {
    if (params.player_id) {
      await showPlayerModal(Number(params.player_id))
    }
    const newSubPage = params.sub_page || null
    if (newSubPage === this.subPage) return
    this.subPage = newSubPage
    await this.refresh()
  }
  onDestroy () {
    if (this._youthPlayerPromotedEventId !== undefined) {
      off(this._youthPlayerPromotedEventId)
    }
  }

  /**
   * Refetch the squad and rebuild the sub-pages from it. The sub-page cache has
   * to go: `ATeamPage` hands `data.players` to `Lineup`, which deep-copies the
   * array, so a cached sub-page would keep rendering the old squad.
   * @returns {Promise<void>}
   */
  async refresh () {
    await this.load()
    this._subPageCache = {}
    await this.update()
  }

  get routeName () { return 'my-team' }

  get defaultSubPageKey () { return 'ateam' }

  createSubPage (key) {
    if (key === 'youth') return new YouthTeamPage(this)
    if (key === 'cards') return new ActionCards()
    if (key === 'tour') return new TourPage()
    return new ATeamPage(this)
  }

  newCardCount = 0
}
