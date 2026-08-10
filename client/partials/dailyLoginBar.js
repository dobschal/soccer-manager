import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { t } from '../i18n/index.js'
import { showOverlay } from './overlay.js'
import { generateId } from '../lib/html.js'
import { toast } from './toast.js'
import { actionCardLabel } from '../lib/actionCardLabels.js'

/** Icon per milestone reward category, matching the reward keys from the server. */
const MILESTONE_ICONS = {
  recovery: 'fa-bolt',
  training: 'fa-graduation-cap',
  special: 'fa-gift',
  youth: 'fa-star'
}

/**
 * Compact daily-login streak bar shown above the club emblem on the dashboard
 * (#501). Tapping it opens the overlay with the full cycle breakdown and the
 * streak leaderboard.
 */
export class DailyLoginBar extends UIElement {
  async load () {
    try {
      this.status = await server.getDailyLoginStatus()
    } catch {
      // The dashboard must render even if the streak endpoint is unavailable.
      this.status = null
    }
  }

  get template () {
    if (!this.status || !this.status.cycleLength) return '<div></div>'
    const { cycleDay, cycleLength, streak, milestones, claimed } = this.status
    const percentage = Math.max(0, Math.min(100, (cycleDay / cycleLength) * 100))
    return `
      <div class="daily-login-bar u-cursor-pointer mb-3" role="button" tabindex="0"
           aria-label="${t('dailyLogin.title')}">
        <div class="d-flex align-items-center justify-content-between mb-1">
          <span class="small fw-bold"><i class="fa fa-fire text-danger" aria-hidden="true"></i> ${t('dailyLogin.title')}</span>
          <span class="small text-muted">${t('dailyLogin.progress', { day: cycleDay, total: cycleLength })}</span>
        </div>
        <div class="daily-login-track">
          <div class="daily-login-fill" style="width: ${percentage}%"></div>
          ${milestones.map(m => this._renderMarker(m, cycleDay, cycleLength, claimed)).join('')}
        </div>
        <div class="daily-login-labels">
          ${milestones.map(m => `
            <span class="daily-login-label ${cycleDay >= m.day ? 'daily-login-label--reached' : ''}"
                  style="left: ${(m.day / cycleLength) * 100}%">${m.day}</span>
          `).join('')}
        </div>
        <div class="small text-muted mt-1">${this._renderStreakLine(streak)}</div>
      </div>
    `
  }

  get events () {
    return {
      '(optional).daily-login-bar': {
        click: () => this._showOverlay(),
        keydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            this._showOverlay()
          }
        }
      }
    }
  }

  onMounted () {
    // Surface a reward the user just unlocked by opening the app today.
    for (const reward of this.status?.newRewards ?? []) {
      toast(t('dailyLogin.rewardEarned', { card: actionCardLabel(reward.action) }), 'success')
    }
  }

  /**
   * @param {number} streak
   * @returns {string}
   */
  _renderStreakLine (streak) {
    if (!streak) return t('dailyLogin.noStreak')
    return t('dailyLogin.streakDays', { days: streak })
  }

  /**
   * A milestone dot on the track: filled once reached, highlighted when it is
   * the next one up.
   * @param {{day: number, key: string}} milestone
   * @param {number} cycleDay
   * @param {number} cycleLength
   * @param {number[]} claimed
   * @returns {string}
   */
  _renderMarker (milestone, cycleDay, cycleLength, claimed) {
    const reached = claimed.includes(milestone.day) || cycleDay >= milestone.day
    const isNext = !reached && !claimed.some(c => c > milestone.day) &&
      milestone.day === this.status.nextMilestone
    const classes = [
      'daily-login-marker',
      reached ? 'daily-login-marker--reached' : '',
      isNext ? 'daily-login-marker--next' : ''
    ].filter(Boolean).join(' ')
    const icon = MILESTONE_ICONS[milestone.key] || 'fa-gift'
    return `
      <span class="${classes}" style="left: ${(milestone.day / cycleLength) * 100}%"
            title="${t('dailyLogin.reward.' + milestone.key)}">
        <i class="fa ${icon}" aria-hidden="true"></i>
      </span>
    `
  }

  /**
   * Open the detail overlay: personal progress, rewards of the cycle, and the
   * streak leaderboard.
   * @returns {Promise<void>}
   */
  async _showOverlay () {
    const bodyId = generateId()
    const overlay = showOverlay(
      t('dailyLogin.title'),
      t('dailyLogin.subtitle'),
      `<div id="${bodyId}" class="text-center text-muted"><i class="fa fa-spinner fa-spin"></i></div>`
    )
    let data
    try {
      data = await server.getLoginStreakLeaderboard(10)
    } catch {
      const body = document.getElementById(bodyId)
      if (body) body.innerHTML = `<p class="text-muted mb-0">${t('dailyLogin.loadError')}</p>`
      return
    }
    const body = document.getElementById(bodyId)
    if (!body) return
    body.classList.remove('text-center', 'text-muted')
    const showAllId = generateId()
    body.innerHTML = this._renderOverlayBody(data, showAllId)
    document.getElementById(showAllId)?.addEventListener('click', async () => {
      try {
        const full = await server.getLoginStreakLeaderboard(100)
        body.innerHTML = this._renderOverlayBody(full, null)
      } catch {
        toast(t('dailyLogin.loadError'), 'error')
      }
    })
    overlay.onClose(() => { /* nothing to clean up */ })
  }

  /**
   * @param {object} data
   * @param {string|null} showAllId - null hides the "view all" button
   * @returns {string}
   */
  _renderOverlayBody (data, showAllId) {
    const { streak, cycleDay, cycleLength, claimed, milestones, top, me, total } = data
    const isMeInTop = top.some(r => r.isMe)
    const rows = top.map(row => `
      <tr class="${row.isMe ? 'daily-login-row--me' : ''}">
        <td class="small">${row.rank}.</td>
        <td class="small">${row.username}</td>
        <td class="small text-end">${t('dailyLogin.streakDays', { days: row.streak })}</td>
      </tr>
    `).join('')
    const meRow = me && !isMeInTop
      ? `<tr class="daily-login-row--me">
           <td class="small">${me.rank}.</td>
           <td class="small">${t('dailyLogin.you')}</td>
           <td class="small text-end">${t('dailyLogin.streakDays', { days: me.streak })}</td>
         </tr>`
      : ''
    const rewardItems = milestones.map(m => {
      const done = claimed.includes(m.day)
      const icon = done ? 'fa-check-circle text-success' : `${MILESTONE_ICONS[m.key] || 'fa-gift'} text-muted`
      return `
        <li class="d-flex align-items-center gap-2 mb-1">
          <i class="fa ${icon}" aria-hidden="true"></i>
          <span class="small ${done ? '' : 'text-muted'}">
            ${t('dailyLogin.rewardLine', { day: m.day, reward: t('dailyLogin.reward.' + m.key) })}
          </span>
        </li>
      `
    }).join('')
    const nextMilestone = milestones.find(m => m.day > cycleDay)
    return `
      <div class="mb-3">
        <p class="mb-1"><strong>${t('dailyLogin.yourStreak', { days: streak })}</strong></p>
        <p class="mb-1 small text-muted">${t('dailyLogin.progress', { day: cycleDay, total: cycleLength })}</p>
        ${nextMilestone
    ? `<p class="mb-0 small">${t('dailyLogin.nextReward', {
      days: nextMilestone.day - cycleDay,
      reward: t('dailyLogin.reward.' + nextMilestone.key)
    })}</p>`
    : `<p class="mb-0 small">${t('dailyLogin.cycleComplete')}</p>`}
      </div>
      <div class="mb-3">
        <h6 class="mb-2">${t('dailyLogin.rewardsTitle')}</h6>
        <ul class="list-unstyled mb-0">${rewardItems}</ul>
      </div>
      <div>
        <h6 class="mb-2"><i class="fa fa-trophy" aria-hidden="true"></i> ${t('dailyLogin.leaderboardTitle')}</h6>
        ${top.length === 0
    ? `<p class="small text-muted mb-0">${t('dailyLogin.leaderboardEmpty')}</p>`
    : `<table class="table table-sm mb-2"><tbody>${rows}${meRow}</tbody></table>`}
        ${showAllId && total > top.length
    ? `<button id="${showAllId}" class="btn btn-sm btn-outline-info w-100">${t('dailyLogin.viewAll')}</button>`
    : ''}
      </div>
    `
  }

  status = null
}
