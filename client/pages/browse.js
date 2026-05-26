import { UIElement } from '../lib/UIElement.js'
import { t } from '../i18n/index.js'
import { SearchPanel } from '../partials/searchPanel.js'

export class BrowsePage extends UIElement {
  constructor () {
    super()
    this._searchPanel = new SearchPanel()
  }

  get template () {
    return `
      <div>
        <nav class="nav nav-pills mb-4">
          <a class="nav-link" href="#dashboard"><i class="fa fa-home"></i> ${t('dashboard.tabStart')}</a>
          <a class="nav-link" href="#dashboard?sub_page=cards"><i class="fa fa-clone"></i> ${t('dashboard.tabCards')}</a>
          <a class="nav-link" href="#dashboard?sub_page=news"><i class="fa fa-newspaper-o"></i> ${t('dashboard.tabNews')}</a>
          <a class="nav-link" href="#dashboard?sub_page=messages"><i class="fa fa-envelope"></i> ${t('dashboard.tabMessages')}</a>
          <a class="nav-link" href="#forum"><i class="fa fa-comments"></i> ${t('forum.title')}</a>
          <a class="nav-link active" href="#browse"><i class="fa fa-search"></i> ${t('search.title')}</a>
        </nav>
        ${this._searchPanel}
      </div>
    `
  }

  async onQueryChanged (params) {
    await this._searchPanel.applyQueryParams(params)
  }
}
