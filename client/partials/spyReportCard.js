import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { t } from '../i18n/index.js'
import { generateId, el } from '../lib/html.js'
import { spyReportBodyHtml } from './spyOverlay.js'

const COLLAPSE_STORAGE_KEY = 'spyReport.collapsed'
const TICK_INTERVAL_MS = 1000
const REFETCH_INTERVAL_MS = 60_000

/**
 * Collapsable card shown at the end of the Taktik section on #my-team. Displays
 * the most recent team the user spied on with a SPY action card — its tactics
 * and lineup — using the same layout as the spy overlay's reveal. Renders an
 * empty (hidden) node when the user has never spied on anyone.
 *
 * While the spy is still active (until the next game day) the card counts down
 * how long that is and refetches the report once a minute, so tactic or lineup
 * changes the spied team makes before kick-off show up without a reload. Once
 * the spy runs out the report freezes at the last state it saw.
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
      <div class="card card-body mb-4 spy-report-card bg-warning-subtle">
        <div class="d-flex justify-content-between align-items-center gap-2">
          <div>
            <h5 class="mb-0">
              <i class="fa fa-search me-1"></i> ${t('spy.lastReportTitle')}
            </h5>
            <small id="${this._statusId}" class="${this._report.active ? 'text-info' : 'text-muted'}">${this._statusText}</small>
          </div>
          <button id="${this._collapseBtnId}" type="button" class="btn btn-sm btn-outline-info">
            <i class="fa ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i>
          </button>
        </div>
        <div id="${this._bodyId}" class="${isCollapsed ? '' : 'mt-3'}">
          ${isCollapsed ? '' : spyReportBodyHtml(team, players ?? [])}
        </div>
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

  onMounted () {
    this._startTimers()
  }

  onUpdate () {
    this._startTimers()
  }

  onDestroy () {
    this._stopTimers()
  }

  _collapseBtnId = generateId()
  _statusId = generateId()
  _bodyId = generateId()
  _report = null
  /** @type {ReturnType<typeof setInterval>|null} */
  _tickInterval = null
  /** @type {ReturnType<typeof setInterval>|null} */
  _refetchInterval = null

  /**
   * Collapsed unless the user has explicitly expanded it before — the report is
   * a bulky lineup grid that would otherwise push the rest of the Taktik
   * section off-screen on every visit.
   * @returns {boolean}
   */
  get _isCollapsed () {
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) !== '0'
  }

  /**
   * Line below the heading: how much longer the spy reports live, or that the
   * report has frozen.
   * @returns {string}
   */
  get _statusText () {
    if (!this._report) return ''
    if (!this._report.active) return t('spy.expired')
    return t('spy.activeFor', { time: this._formatRemaining(this._remainingMs) })
  }

  /**
   * @returns {number} milliseconds until the spy stops reporting (0 when over)
   */
  get _remainingMs () {
    if (!this._report?.expiresAt) return 0
    return Math.max(0, new Date(this._report.expiresAt).getTime() - Date.now())
  }

  /**
   * Coarse duration in the shape the countdown is read at a glance: "9h 23min".
   * @param {number} ms
   * @returns {string}
   */
  _formatRemaining (ms) {
    const totalMinutes = Math.floor(ms / 60_000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (hours > 0) return `${hours}h ${minutes}min`
    if (minutes > 0) return `${minutes}min`
    return `${Math.floor(ms / 1000)}s`
  }

  /**
   * Countdown tick plus a slower refetch loop — both only run while the spy is
   * actually active, so an expired report costs nothing.
   * @returns {void}
   */
  _startTimers () {
    this._stopTimers()
    if (!this._report?.active) return
    this._tickInterval = setInterval(() => this._tick(), TICK_INTERVAL_MS)
    this._refetchInterval = setInterval(() => void this._refetch(), REFETCH_INTERVAL_MS)
  }

  /**
   * @returns {void}
   */
  _stopTimers () {
    if (this._tickInterval) clearInterval(this._tickInterval)
    if (this._refetchInterval) clearInterval(this._refetchInterval)
    this._tickInterval = null
    this._refetchInterval = null
  }

  /**
   * Rewrite only the countdown line. When the spy has run out, reload once so
   * the card switches over to the frozen report.
   * @returns {void}
   */
  _tick () {
    if (this._remainingMs <= 0) {
      this._stopTimers()
      void this.update(true)
      return
    }
    const statusEl = el(this._statusId)
    if (statusEl) statusEl.textContent = this._statusText
  }

  /**
   * Pull a fresh report and swap the body in place — re-rendering the whole
   * card would re-create the nested `Lineup` and flicker. The body is only
   * touched when something actually changed.
   * @returns {Promise<void>}
   */
  async _refetch () {
    const previous = this._signature
    await this.load()
    if (!this._report) return this.update(false)
    if (!this._report.active || this._signature !== previous) {
      if (!this._report.active) this._stopTimers()
      const bodyEl = el(this._bodyId)
      if (bodyEl && !this._isCollapsed) {
        bodyEl.innerHTML = spyReportBodyHtml(this._report.team, this._report.players ?? [])
      }
      const statusEl = el(this._statusId)
      if (statusEl) {
        statusEl.textContent = this._statusText
        statusEl.className = this._report.active ? 'text-info' : 'text-muted'
      }
    }
  }

  /**
   * Everything the report body renders, flattened — used to skip DOM work when
   * a refetch brought nothing new.
   * @returns {string}
   */
  get _signature () {
    if (!this._report) return ''
    const team = this._report.team ?? {}
    return JSON.stringify([
      team.formation,
      team.attack_mode,
      team.play_style,
      team.pass_style,
      !!team.motivating_speech_active,
      (this._report.players ?? []).map(player => [
        player.id, player.in_game_position, player.position, player.level, player.freshness, player.is_injured
      ])
    ])
  }

  async _toggleCollapse () {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, this._isCollapsed ? '0' : '1')
    await this.update(false)
  }
}
