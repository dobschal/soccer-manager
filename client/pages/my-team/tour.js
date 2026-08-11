import { UIElement } from '../../lib/UIElement.js'
import { server, showServerError } from '../../lib/gateway.js'
import { el, generateId } from '../../lib/html.js'
import { t } from '../../i18n/index.js'
import { toast } from '../../partials/toast.js'
import { showConfirmDialog, showOverlay } from '../../partials/overlay.js'
import { renderPositionBadge } from '../../partials/positionBadge.js'
import { renderLevelBadge } from '../../partials/levelBadge.js'
import { actionCardLabel } from '../../lib/actionCardLabels.js'
import { wikiInfoIcon } from '../../partials/wikiInfoIcon.js'
import { showTutorialIfNeeded } from '../../partials/tutorialOverlay.js'

/** Illustration per destination, matching the artwork from the ticket (#535). */
const TOUR_IMAGES = {
  south_america: 'assets/tour/south_america.jpg',
  asia: 'assets/tour/asia.jpg',
  europe: 'assets/tour/europe.jpg'
}

/**
 * The "On Tour" page: pick a destination, send up to three players away for a
 * few match days and fill the progress bar to earn that destination's cards
 * (#535).
 */
export class TourPage extends UIElement {
  async load () {
    this.data = await server.getMyTour()
  }

  get template () {
    if (!this.data) return '<div></div>'
    return `
      <div class="tour-page">
        <h3>${t('tour.title')} ${wikiInfoIcon('on-tour')}</h3>
        <p class="text-muted">${t('tour.intro', { max: this.data.maxPlayers, target: this.data.target })}</p>
        ${this._renderProgress()}
        ${this._renderDestinations()}
        ${this._renderSquad()}
      </div>
    `
  }
  get events () {
    return {
      '(optional) .tour-destination': {
        click: (event) => this._chooseDestination(event.currentTarget.dataset.tourKey)
      },
      '(optional) .tour-send-btn': {
        click: () => this._showSendOverlay()
      }
    }
  }
  onMounted () {
    void showTutorialIfNeeded('tour', this)
  }

  /**
   * The bar, plus who is currently away and for how much longer.
   * @returns {string}
   */
  _renderProgress () {
    const { progress, target } = this.data
    const percentage = Math.max(0, Math.min(100, (progress / target) * 100))
    const away = this.data.players.filter(p => p.tourDaysLeft > 0)
    const perGameDay = away.reduce((sum, p) => sum + p.progressPerGameDay, 0)
    return `
      <div class="card card-body bg-dark text-white tour-progress-card mb-4">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <strong>${t('tour.progressTitle')}</strong>
          <span class="text-muted small">${progress.toFixed(1)} / ${target}</span>
        </div>
        <div class="progress tour-progress mb-3">
          <div class="progress-bar bg-info" role="progressbar" style="width: ${percentage}%"
               aria-valuenow="${Math.round(percentage)}" aria-valuemin="0" aria-valuemax="100"></div>
        </div>
        ${away.length === 0
    ? `<p class="text-muted small mb-0">${t('tour.nobodyAway')}</p>`
    : `<ul class="list-unstyled mb-0 small">
               ${away.map(p => `
                 <li class="d-flex align-items-center gap-2 mb-1">
                   <span>✈️</span>
                   ${renderPositionBadge(p.position)}
                   <strong>${p.name}</strong>
                   <span class="text-muted">${t('tour.daysLeft', { days: p.tourDaysLeft })}</span>
                 </li>`).join('')}
               <li class="text-muted mt-2">${t('tour.perGameDay', { points: perGameDay.toFixed(1) })}</li>
             </ul>`}
      </div>
    `
  }

  /**
   * The three destination cards. The active one is highlighted; picking a
   * different one costs the progress, so it asks first.
   * @returns {string}
   */
  _renderDestinations () {
    return `
      <div class="row g-3 mb-4">
        ${this.data.tours.map(tour => `
          <div class="col-12 col-md-4">
            <div class="card h-100 tour-destination ${tour.key === this.data.mode ? 'tour-destination--active' : ''}"
                 data-tour-key="${tour.key}" role="button" tabindex="0">
              <img class="tour-destination__image" src="${TOUR_IMAGES[tour.key]}" alt="${t('tour.' + tour.key)}">
              <div class="card-body">
                <h5 class="card-title mb-2">
                  ${t('tour.' + tour.key)}
                  ${tour.key === this.data.mode ? `<span class="badge bg-info text-dark">${t('tour.active')}</span>` : ''}
                </h5>
                <p class="text-muted small mb-0">
                  ${tour.reward.map(r => `${r.amount}× ${actionCardLabel(r.action)}`).join('<br>')}
                </p>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `
  }

  /**
   * The button that opens the send overlay, plus the hint explaining how the
   * per-game-day yield is measured.
   * @returns {string}
   */
  _renderSquad () {
    const selectable = this.data.players.filter(p => this._isSelectable(p))
    return `
      <div class="mb-2">
        <button type="button" class="btn btn-info tour-send-btn" ${this.data.freeSlots === 0 || selectable.length === 0 ? 'disabled' : ''}>
          <i class="fa fa-plane" aria-hidden="true"></i> ${t('tour.sendPlayers', { free: this.data.freeSlots })}
        </button>
      </div>
      <p class="text-muted small">${t('tour.squadHint')}</p>
    `
  }

  /**
   * A player can be sent when they are fit, not suspended and not already away.
   * @param {object} player
   * @returns {boolean}
   */
  _isSelectable (player) {
    return !player.isInjured && !player.isSuspended && player.tourDaysLeft === 0
  }

  /**
   * Switch destination, warning first that the progress is lost (#535).
   * @param {string} key
   * @returns {Promise<void>}
   */
  async _chooseDestination (key) {
    if (!key || key === this.data.mode) return
    if (this.data.progress > 0) {
      const confirmed = await showConfirmDialog(
        t('tour.switchWarning', { progress: this.data.progress.toFixed(1) }),
        t('tour.switchConfirm'),
        t('common.cancel')
      )
      if (!confirmed) return
    }
    try {
      await server.setMyTourMode(key)
      toast(t('tour.switched', { tour: t('tour.' + key) }), 'success')
      await this.update(true)
    } catch (e) {
      showServerError(e)
    }
  }

  /**
   * Overlay to pick players and a duration, then send them off.
   * @returns {void}
   */
  _showSendOverlay () {
    const listId = generateId()
    const daysId = generateId()
    const submitId = generateId()
    const selectable = this.data.players
      .filter(p => this._isSelectable(p))
      .sort((a, b) => b.level - a.level)

    const dayOptions = []
    for (let day = this.data.minDays; day <= this.data.maxDays; day++) {
      dayOptions.push(`<option value="${day}">${t('tour.daysOption', { days: day })}</option>`)
    }

    const overlay = showOverlay(
      t('tour.sendTitle'),
      t('tour.sendSubtitle', { free: this.data.freeSlots }),
      `
        <div id="${listId}" class="tour-select-list mb-3">
          ${selectable.map(p => `
            <label class="tour-select-row">
              <input type="checkbox" class="form-check-input me-2" value="${p.id}">
              ${renderPositionBadge(p.position)}
              <span class="tour-select-name">${p.name}</span>
              ${renderLevelBadge(p.level)}
              <span class="text-muted small ms-auto">+${p.progressPerGameDay.toFixed(2)} / ${t('tour.gameDayShort')}</span>
            </label>
          `).join('')}
        </div>
        <label class="form-label" for="${daysId}">${t('tour.durationLabel')}</label>
        <select id="${daysId}" class="form-select mb-3">${dayOptions.join('')}</select>
        <button id="${submitId}" class="btn btn-info w-100">
          <i class="fa fa-plane" aria-hidden="true"></i> ${t('tour.sendConfirm')}
        </button>
      `
    )

    setTimeout(() => {
      const list = el('#' + listId)
      const boxes = () => Array.from(list?.querySelectorAll('input[type="checkbox"]') ?? [])
      // Stop the user selecting more than the free slots allow — the server
      // would reject it anyway, but silently disabling is friendlier.
      list?.addEventListener('change', () => {
        const checked = boxes().filter(b => b.checked)
        for (const box of boxes()) {
          box.disabled = !box.checked && checked.length >= this.data.freeSlots
        }
      })
      el('#' + submitId)?.addEventListener('click', async () => {
        const ids = boxes().filter(b => b.checked).map(b => Number(b.value))
        if (ids.length === 0) {
          toast(t('tour.selectAtLeastOne'), 'error')
          return
        }
        const days = Number(el('#' + daysId)?.value)
        overlay.remove()
        try {
          await server.sendPlayersOnTour(ids, days)
          toast(t('tour.sent', { count: ids.length, days }), 'success')
          await this.update(true)
        } catch (e) {
          showServerError(e)
        }
      })
    }, 0)
  }

  data = null
}
