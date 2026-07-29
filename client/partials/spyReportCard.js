import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { t } from '../i18n/index.js'
import { generateId } from '../lib/html.js'
import { spyReportBodyHtml } from './spyOverlay.js'

const COLLAPSE_STORAGE_KEY = 'spyReport.collapsed'

/**
 * Collapsable card shown at the end of the Taktik section on #my-team. Displays
 * the most recent team the user spied on with a SPY action card — its tactics
 * and lineup — using the same layout as the spy overlay's reveal. Renders an
 * empty (hidden) node when the user has never spied on anyone.
 */
export class SpyReportCard extends UIElement {
  async load () {
    try {
      const res = await server.getLastSpyReport()
      this._report = res?.report ?? null
    } catch {
      this._report = null
    }
  }

  get template () {
    if (!this._report) return '<div class="d-none"></div>'
    const isCollapsed = this._isCollapsed
    const { team, players } = this._report
    return `
      <div class="card card-body mb-4 spy-report-card">
        <div class="d-flex justify-content-between align-items-center ${isCollapsed ? '' : 'mb-3'}">
          <h5 class="mb-0">
            <i class="fa fa-search me-1"></i> ${t('spy.lastReportTitle')}
          </h5>
          <button id="${this._collapseBtnId}" type="button" class="btn btn-sm btn-outline-info">
            <i class="fa ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i>
          </button>
        </div>
        ${isCollapsed ? '' : spyReportBodyHtml(team, players ?? [])}
      </div>
    `
  }

  get events () {
    // Optional: the null-report placeholder (`<div class="d-none">`) has no
    // collapse button, so the selector legitimately matches nothing then.
    return {
      [`(optional)#${this._collapseBtnId}`]: { click: () => this._toggleCollapse() }
    }
  }

  _collapseBtnId = generateId()
  _report = null

  /**
   * @returns {boolean}
   */
  get _isCollapsed () {
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1'
  }

  async _toggleCollapse () {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, this._isCollapsed ? '0' : '1')
    await this.update(false)
  }
}
