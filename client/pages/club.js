import { t } from '../i18n/index.js'
import { StadiumSubPage } from './club/stadium.js'
import { BuildingsPage } from './club/buildings.js'
import { FinancesPage } from './club/finances.js'
import { ClubInfoPage } from './club/clubInfo.js'
import { TabbedPage } from '../lib/TabbedPage.js'

export class ClubPage extends TabbedPage {
  get template () {
    return `
      <div>
        <nav class="nav nav-pills mb-2">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#club">${t('stadium.tabStadium')}</a>
          <a class="nav-link ${this.subPage === 'info' ? 'active' : ''}" href="#club?sub_page=info">${t('stadium.tabClubInfo')}</a>
          <a class="nav-link ${this.subPage === 'buildings' ? 'active' : ''}" href="#club?sub_page=buildings">${t('stadium.tabBuildings')}</a>
          <a class="nav-link ${this.subPage === 'finances' ? 'active' : ''}" href="#club?sub_page=finances">${t('stadium.tabFinances')}</a>
        </nav>
        ${this.renderSubPageContainer()}
      </div>
    `
  }
  onDestroy () {
    this._subPageCache.stadium?.onDestroy()
  }
  get routeName () { return 'club' }

  get defaultSubPageKey () { return 'stadium' }

  createSubPage (key) {
    switch (key) {
      case 'info': return new ClubInfoPage()
      case 'buildings': return new BuildingsPage(this)
      case 'finances': return new FinancesPage()
      default: return new StadiumSubPage()
    }
  }

  _shouldRecreateSubPage (key) {
    return key === 'stadium'
  }

  _onBeforeSubPageLeave (fromKey) {
    if (fromKey === 'stadium') {
      this._subPageCache.stadium?.onDestroy()
    }
  }
}
