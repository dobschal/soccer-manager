import { TabbedPage } from '../lib/TabbedPage.js'
import { t } from '../i18n/index.js'
import { MarketingAdminPage } from './admin/marketing.js'
import { UserManagementAdminPage } from './admin/userManagement.js'
import { StatisticsAdminPage } from './admin/statistics.js'
import { GeneralAdminPage } from './admin/general.js'

export class AdminPage extends TabbedPage {
  get template () {
    return `
      <div>
        <h3 class="mb-3">${t('admin.title')}</h3>
        <nav class="nav nav-pills mb-3">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#admin">${t('admin.tabMarketing')}</a>
          <a class="nav-link ${this.subPage === 'user_management' ? 'active' : ''}" href="#admin?sub_page=user_management">${t('admin.tabUserManagement')}</a>
          <a class="nav-link ${this.subPage === 'statistics' ? 'active' : ''}" href="#admin?sub_page=statistics">${t('admin.tabStatistics')}</a>
          <a class="nav-link ${this.subPage === 'general' ? 'active' : ''}" href="#admin?sub_page=general">${t('admin.tabGeneral')}</a>
        </nav>
        ${this.renderSubPageContainer()}
      </div>
    `
  }

  get routeName () { return 'admin' }

  get defaultSubPageKey () { return 'marketing' }

  createSubPage (key) {
    switch (key) {
      case 'user_management': return new UserManagementAdminPage()
      case 'statistics': return new StatisticsAdminPage()
      case 'general': return new GeneralAdminPage()
      default: return new MarketingAdminPage()
    }
  }
}
