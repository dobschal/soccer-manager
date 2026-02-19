import { UIElement } from '../lib/UIElement.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { t } from '../i18n/index.js'
import { BrowsePlayersPage } from './browse/players.js'
import { BrowseTeamsPage } from './browse/teams.js'
import { BrowseUsersPage } from './browse/users.js'

export class BrowsePage extends UIElement {
  subPage = null
  page = null

  get template () {
    return `
      <div>
        <nav class="nav nav-pills mb-4">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#browse"><i class="fa fa-user"></i> ${t('search.players')}</a>
          <a class="nav-link ${this.subPage === 'teams' ? 'active' : ''}" href="#browse?sub_page=teams"><i class="fa fa-users"></i> ${t('search.teams')}</a>
          <a class="nav-link ${this.subPage === 'users' ? 'active' : ''}" href="#browse?sub_page=users"><i class="fa fa-id-card"></i> ${t('search.users')}</a>
        </nav>

        ${this.page ?? t('common.loading')}
      </div>
    `
  }

  async onQueryChanged (queryParams) {
    if (queryParams.player_id) {
      await showPlayerModal(Number(queryParams.player_id))
    }

    const newSubPage = queryParams.sub_page || null

    if (newSubPage !== this.subPage || this.page === null) {
      this.subPage = newSubPage
      switch (this.subPage) {
        case 'teams':
          this.page = new BrowseTeamsPage(this)
          break
        case 'users':
          this.page = new BrowseUsersPage(this)
          break
        default:
          this.page = new BrowsePlayersPage(this)
      }
    }

    if (this.page && typeof this.page.applyQueryParams === 'function') {
      await this.page.applyQueryParams(queryParams)
    }

    await this.update(true)
  }
}
