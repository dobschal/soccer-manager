import { server } from '../lib/gateway.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { t } from '../i18n/index.js'
import { YouthTeamPage } from './my-team/youthTeam.js'
import { ATeamPage } from './my-team/aTeam.js'
import { ClubInfoPage } from './club/clubInfo.js'
import { off, on } from '../lib/event.js'
import { ActionCards } from './dashboard/actionCards.js'
import { TabbedPage } from '../lib/TabbedPage.js'
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
        <div class="d-flex align-items-center justify-content-between mb-2">
          <nav class="nav nav-pills">
            <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#my-team"><i class="fa fa-male"></i> ${t('myTeam.aTeam')}</a>
            <a class="nav-link ${this.subPage === 'youth' ? 'active' : ''}" href="#my-team?sub_page=youth"><i class="fa fa-child"></i> ${t('myTeam.youthTeam')}</a>
            <a class="nav-link ${this.subPage === 'cards' ? 'active' : ''}" href="#my-team?sub_page=cards"><i class="fa fa-clone"></i> ${t('dashboard.tabCards')}${this.newCardCount > 0 ? ` <span class="badge bg-danger rounded-pill" style="position: absolute;transform: translateY(-26px) translateX(-5px);padding: 8px;text-align: center;">${this.newCardCount}</span>` : ''}</a>
            <a class="nav-link ${this.subPage === 'info' ? 'active' : ''}" href="#my-team?sub_page=info"><i class="fa fa-info-circle"></i> ${t('stadium.tabClubInfo')}</a>
          </nav>
          <a class="btn btn-sm btn-outline-secondary d-none d-lg-inline-block" href="#team?id=${this.data.team.id}">
            <i class="fa fa-external-link" aria-hidden="true"></i> ${t('myTeam.viewPublicPage')}
          </a>
        </div>
        ${this.renderSubPageContainer()}
      </div>
    `
  }
  get serverEvents () {
    const refresh = async () => {
      await this.load()
      this._subPageCache = {}
      await this.update()
    }
    return {
      PLAYER_SOLD: refresh,
      // Fires after the user buys a player (instant buy or accepted offer)
      // so the lineup picks the new squad member up without a hard reload.
      BUY_OFFER_ACCEPTED: refresh
    }
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
    const newSubPage = params.sub_page || null
    if (newSubPage === this.subPage) return
    this.subPage = newSubPage
    await this.load()
    this._subPageCache = {}
    await this.update()
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
    if (key === 'info') return new ClubInfoPage()
    return new ATeamPage(this)
  }

  newCardCount = 0
}
