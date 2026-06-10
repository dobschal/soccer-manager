import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { generateId } from '../../lib/html.js'
import { t } from '../../i18n/index.js'

function usageBarClass (percent) {
  if (percent >= 90) return 'bg-danger'
  if (percent >= 75) return 'bg-warning'
  return 'bg-info'
}

function usageBar (percent) {
  const safe = Math.max(0, Math.min(100, Number(percent) || 0))
  const cls = usageBarClass(safe)
  return `
    <div class="progress server-stats__bar">
      <div class="progress-bar ${cls}" role="progressbar" style="width: ${safe}%"
        aria-valuenow="${safe}" aria-valuemin="0" aria-valuemax="100"></div>
    </div>
  `
}

function formatGb (value) {
  const num = Number(value) || 0
  return `${num.toFixed(2)} GB`
}

function formatPercent (value) {
  const num = Number(value) || 0
  return `${num.toFixed(1)}%`
}

export class ServerStatsAdminPage extends UIElement {
  async load () {
    this._stats = await server.getServerStats()
  }

  get template () {
    if (!this._stats) {
      return `<div><p class="text-muted">${t('admin.serverStatsLoading')}</p></div>`
    }
    const { cpu, memory, swap, disks } = this._stats

    return `
      <div>
        <div class="d-flex align-items-center justify-content-between mb-3">
          <h4 class="mb-0">${t('admin.serverStatsTitle')}</h4>
          <button id="${this._refreshBtnId}" class="btn btn-sm btn-outline-info">
            <i class="fa fa-refresh" aria-hidden="true"></i> ${t('admin.serverStatsRefresh')}
          </button>
        </div>

        <div class="mb-4">
          <h5 class="mb-2">${t('admin.serverStatsCpu')}</h5>
          ${cpu.length === 0
    ? `<p class="text-muted">${t('admin.serverStatsEmpty')}</p>`
    : `<div class="row g-2">
                ${cpu.map((c, idx) => `
                  <div class="col-12 col-md-6 col-lg-4">
                    <div class="d-flex justify-content-between">
                      <span>${t('admin.serverStatsCore', { n: idx + 1 })}</span>
                      <span class="text-muted">${formatPercent(c)}</span>
                    </div>
                    ${usageBar(c)}
                  </div>
                `).join('')}
              </div>`}
        </div>

        <div class="mb-4">
          <h5 class="mb-2">${t('admin.serverStatsMemory')}</h5>
          <div class="d-flex justify-content-between">
            <span>${formatGb(memory.usedGb)} / ${formatGb(memory.totalGb)}</span>
            <span class="text-muted">${formatPercent(memory.percent)}</span>
          </div>
          ${usageBar(memory.percent)}
        </div>

        <div class="mb-4">
          <h5 class="mb-2">${t('admin.serverStatsSwap')}</h5>
          ${swap
    ? `<div class="d-flex justify-content-between">
                <span>${formatGb(swap.usedGb)} / ${formatGb(swap.totalGb)}</span>
                <span class="text-muted">${formatPercent(swap.percent)}</span>
              </div>
              ${usageBar(swap.percent)}`
    : `<p class="text-muted">${t('admin.serverStatsSwapUnavailable')}</p>`}
        </div>

        <div class="mb-4">
          <h5 class="mb-2">${t('admin.serverStatsDisks')}</h5>
          ${disks.length === 0
    ? `<p class="text-muted">${t('admin.serverStatsEmpty')}</p>`
    : disks.map(d => `
              <div class="mb-3">
                <div class="d-flex justify-content-between">
                  <span><strong>${d.mount}</strong> <span class="text-muted">(${d.filesystem})</span></span>
                  <span class="text-muted">${formatPercent(d.percent)}</span>
                </div>
                <div class="d-flex justify-content-between text-muted small">
                  <span>${formatGb(d.usedGb)} / ${formatGb(d.totalGb)}</span>
                </div>
                ${usageBar(d.percent)}
              </div>
            `).join('')}
        </div>
      </div>
    `
  }

  get events () {
    return {
      [`(optional)#${this._refreshBtnId}`]: {
        click: () => this._refresh()
      }
    }
  }

  _refreshBtnId = generateId()
  _stats = null

  async _refresh () {
    const btn = document.getElementById(this._refreshBtnId)
    try {
      if (btn) btn.disabled = true
      await this.update(true)
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    } finally {
      const refreshed = document.getElementById(this._refreshBtnId)
      if (refreshed) refreshed.disabled = false
    }
  }
}
