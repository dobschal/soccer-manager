import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { generateId } from '../../lib/html.js'
import { t } from '../../i18n/index.js'
import { ActiveUsersChart } from '../../partials/activeUsersChart.js'

const STATISTICS_PAGE_SIZE = 20

export class StatisticsAdminPage extends UIElement {
  async load () {
    const [statisticsRes, topCountriesRes, pageViewsRes] = await Promise.all([
      server.getStatistics(this._statisticsPage, STATISTICS_PAGE_SIZE),
      server.getTopCountries(),
      server.getPageViewStats(this._pageViewDays)
    ])
    this._statistics = statisticsRes.rows
    this._statisticsTotal = statisticsRes.total
    this._statisticsPageSize = statisticsRes.pageSize
    this._topCountries = topCountriesRes.rows
    this._pageViews = pageViewsRes
  }

  get template () {
    const totalPages = Math.max(1, Math.ceil(this._statisticsTotal / this._statisticsPageSize))
    const currentPage = Math.min(this._statisticsPage, totalPages)
    const isFirstPage = currentPage <= 1
    const isLastPage = currentPage >= totalPages

    const statisticsRows = this._statistics.map(s => `
      <tr>
        <td>${new Date(s.created_at).toLocaleString()}</td>
        <td>${s.daily_active_users}</td>
        <td>${s.weekly_active_users ?? 0}</td>
        <td>${s.monthly_active_users ?? 0}</td>
        <td>${s.total_user_count ?? 0}</td>
        <td>${s.new_user_count ?? 0}</td>
        <td>${this._formatMoney(s.in_game_money)}</td>
        <td>${s.player_count}</td>
        <td>${Number(s.avg_player_level).toFixed(2)}</td>
        <td>${Number(s.avg_player_age).toFixed(2)}</td>
        <td>${s.action_card_count}</td>
      </tr>
    `).join('')

    return `
      <div>
        <div class="mb-4">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <h4 class="mb-0">${t('admin.statistics')} (${this._statisticsTotal})</h4>
            <button id="${this._collectBtnId}" class="btn btn-sm btn-outline-primary">
              <i class="fa fa-refresh" aria-hidden="true"></i> ${t('admin.statisticsCollectNow')}
            </button>
          </div>
          ${this._statistics.length > 0 ? `
          <h5 class="mb-2">${t('admin.statisticsActiveUsersChartTitle')}</h5>
          ${new ActiveUsersChart(this._statistics)}
          <div class="horizontal-scrollable-table">
            <table class="table table-sm table-hover mb-0">
              <thead>
                <tr>
                  <th>${t('admin.statisticsCreatedAt')}</th>
                  <th>${t('admin.statisticsDailyActiveUsers')}</th>
                  <th>${t('admin.statisticsWeeklyActiveUsers')}</th>
                  <th>${t('admin.statisticsMonthlyActiveUsers')}</th>
                  <th>${t('admin.statisticsTotalUserCount')}</th>
                  <th>${t('admin.statisticsNewUsers')}</th>
                  <th>${t('admin.statisticsInGameMoney')}</th>
                  <th>${t('admin.statisticsPlayerCount')}</th>
                  <th>${t('admin.statisticsAvgPlayerLevel')}</th>
                  <th>${t('admin.statisticsAvgPlayerAge')}</th>
                  <th>${t('admin.statisticsActionCardCount')}</th>
                </tr>
              </thead>
              <tbody>${statisticsRows}</tbody>
            </table>
          </div>
          <div class="d-flex align-items-center justify-content-between mt-3">
            <button id="${this._prevBtnId}" class="btn btn-sm btn-outline-secondary" ${isFirstPage ? 'disabled' : ''}>
              <i class="fa fa-chevron-left" aria-hidden="true"></i> ${t('admin.paginationPrev')}
            </button>
            <span class="text-muted">${t('admin.paginationPage', {
    page: currentPage,
    total: totalPages
  })}</span>
            <button id="${this._nextBtnId}" class="btn btn-sm btn-outline-secondary" ${isLastPage ? 'disabled' : ''}>
              ${t('admin.paginationNext')} <i class="fa fa-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
          ` : `<p class="text-muted">${t('admin.statisticsEmpty')}</p>`}
        </div>

        ${this._renderPageViews()}

        <div class="mb-4">
          <h4>${t('admin.topCountriesTitle')}</h4>
          ${this._topCountries.length > 0 ? `
            <table class="table table-sm mb-0">
              <thead>
                <tr>
                  <th>${t('admin.topCountriesCountry')}</th>
                  <th>${t('admin.topCountriesCount')}</th>
                </tr>
              </thead>
              <tbody>
                ${this._topCountries.map(c => `
                  <tr>
                    <td>${this._countryName(c.country)}</td>
                    <td>${c.count}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `<p class="text-muted">${t('admin.topCountriesEmpty')}</p>`}
        </div>
      </div>
    `
  }

  get events () {
    return {
      [`(optional)#${this._collectBtnId}`]: {
        click: () => this._collectStatistics()
      },
      [`(optional)#${this._prevBtnId}`]: {
        click: () => this._goToPage(this._statisticsPage - 1)
      },
      [`(optional)#${this._nextBtnId}`]: {
        click: () => this._goToPage(this._statisticsPage + 1)
      }
    }
  }

  _collectBtnId = generateId()
  _prevBtnId = generateId()
  _nextBtnId = generateId()
  _statistics = []
  _statisticsTotal = 0
  _statisticsPage = 1
  _statisticsPageSize = STATISTICS_PAGE_SIZE
  _topCountries = []
  _pageViews = { pages: [], funnel: [], days: 30 }
  _pageViewDays = 30

  /**
   * Registration/engagement funnel + per-page view counts for the tracked
   * period. The funnel shows distinct clients per key step with drop-off from
   * the first (widest) step.
   * @returns {string}
   */
  _renderPageViews () {
    const { pages = [], funnel = [], days = 30 } = this._pageViews || {}
    if (pages.length === 0) {
      return `
        <div class="mb-4">
          <h4>${t('admin.pageViewsTitle')}</h4>
          <p class="text-muted">${t('admin.pageViewsEmpty')}</p>
        </div>
      `
    }

    const funnelStart = funnel.find(f => f.clients > 0)?.clients ?? 0
    const funnelRows = funnel.map(step => {
      const pct = funnelStart > 0 ? Math.round((step.clients / funnelStart) * 100) : 0
      return `
        <tr>
          <td>${step.page}</td>
          <td>${step.clients}</td>
          <td>
            <div class="progress" style="min-width: 120px;">
              <div class="progress-bar bg-info" role="progressbar" style="width: ${pct}%;">${pct}%</div>
            </div>
          </td>
        </tr>
      `
    }).join('')

    const pageRows = pages.map(p => `
      <tr>
        <td>${p.page}</td>
        <td>${p.views}</td>
        <td>${p.clients}</td>
        <td>${p.users}</td>
      </tr>
    `).join('')

    return `
      <div class="mb-4">
        <h4>${t('admin.pageViewsTitle')} <small class="text-muted">${t('admin.pageViewsPeriod', { days })}</small></h4>

        <h5 class="mb-2">${t('admin.pageViewsFunnelTitle')}</h5>
        <div class="horizontal-scrollable-table mb-3">
          <table class="table table-sm mb-0">
            <thead>
              <tr>
                <th>${t('admin.pageViewsPage')}</th>
                <th>${t('admin.pageViewsClients')}</th>
                <th>${t('admin.pageViewsShare')}</th>
              </tr>
            </thead>
            <tbody>${funnelRows}</tbody>
          </table>
        </div>

        <h5 class="mb-2">${t('admin.pageViewsAllTitle')}</h5>
        <div class="horizontal-scrollable-table">
          <table class="table table-sm table-hover mb-0">
            <thead>
              <tr>
                <th>${t('admin.pageViewsPage')}</th>
                <th>${t('admin.pageViewsViews')}</th>
                <th>${t('admin.pageViewsClients')}</th>
                <th>${t('admin.pageViewsUsers')}</th>
              </tr>
            </thead>
            <tbody>${pageRows}</tbody>
          </table>
        </div>
      </div>
    `
  }

  _countryName (code) {
    if (!code) return '—'
    const upper = String(code).toUpperCase()
    try {
      const locale = (typeof navigator !== 'undefined' && navigator.language) || 'en'
      const name = new Intl.DisplayNames([locale], { type: 'region' }).of(upper)
      return name || upper
    } catch {
      return upper
    }
  }

  _formatMoney (value) {
    const number = Number(value) || 0
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0
      }).format(number)
    } catch {
      return `${number} €`
    }
  }

  async _goToPage (page) {
    const totalPages = Math.max(1, Math.ceil(this._statisticsTotal / this._statisticsPageSize))
    const next = Math.max(1, Math.min(totalPages, page))
    if (next === this._statisticsPage) return
    this._statisticsPage = next
    await this.update(true)
  }

  async _collectStatistics () {
    const btn = document.getElementById(this._collectBtnId)
    try {
      btn.disabled = true
      await server.collectStatisticsNow()
      toast(t('admin.statisticsCollected'), 'success')
      this._statisticsPage = 1
      await this.update(true)
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    } finally {
      const refreshed = document.getElementById(this._collectBtnId)
      if (refreshed) refreshed.disabled = false
    }
  }
}
