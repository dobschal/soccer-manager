import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { t } from '../i18n/index.js'
import { showOverlay } from './overlay.js'
import { generateId } from '../lib/html.js'
import { toast } from './toast.js'
import { showCardClaimOverlay } from './cardClaimOverlay.js'

/** Icon per milestone reward category, matching the reward keys from the server. */
const MILESTONE_ICONS = {
  recovery: 'fa-bolt',
  training: 'fa-graduation-cap',
  special: 'fa-gift',
  youth: 'fa-star',
  jackpot: 'fa-trophy'
}

/**
 * Compact daily-login streak bar shown above the club emblem on the dashboard
 * (#501). Tapping it opens the overlay with the full cycle breakdown and the
 * streak leaderboard.
 */
export class DailyLoginBar extends UIElement {
  /**
   * @param {boolean} isUpdate - true when triggered by `update(true)`
   * @returns {Promise<void>}
   */
  async load (isUpdate) {
    // A dashboard refresh (app resume, navigating back to #dashboard) rebuilds
    // the start sub-page, which re-renders this bar. Awaiting the status here
    // would leave the card as a zero-height placeholder for the length of a
    // round trip — the card blinks out and everything below it jumps up and
    // back down. So an instance that already has a status renders straight
    // from it and reconciles in the background instead.
    if (this.status && !isUpdate) {
      void this._refreshInBackground()
      return
    }
    try {
      this.status = await server.getDailyLoginStatus()
    } catch {
      // The dashboard must render even if the streak endpoint is unavailable.
      this.status = null
    }
  }

  get template () {
    if (!this.status || !this.status.cycleLength) return '<div></div>'
    const { cycleDay, cycleLength, milestones, claimed } = this.status
    const percentage = Math.max(0, Math.min(100, (cycleDay / cycleLength) * 100))
    return `
      <div class="daily-login-bar card card-body border-info bg-info-subtle u-cursor-pointer mb-3" role="button" tabindex="0"
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
        ${this._renderGift()}
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
      },
      // Sits on top of the bar, so its click must not also open the overlay.
      '(optional).daily-login-gift': {
        click: (e) => {
          e.stopPropagation()
          void this._collectReward()
        },
        keydown: (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          e.stopPropagation()
          void this._collectReward()
        }
      }
    }
  }
  /**
   * Refetch the status without holding up the render and patch the card only
   * when something actually changed (a new day, a gift that became available).
   * The common case — nothing changed — touches the DOM not at all, so no
   * re-render and no flicker. Failures keep the last known state on screen.
   *
   * @returns {Promise<void>}
   */
  async _refreshInBackground () {
    if (this._refreshing) return
    this._refreshing = true
    try {
      const status = await server.getDailyLoginStatus()
      if (JSON.stringify(status) === JSON.stringify(this.status)) return
      this.status = status
      await this.update()
    } catch {
      // Keep showing what we have.
    } finally {
      this._refreshing = false
    }
  }

  /**
   * The gift lying on top of the bar whenever a milestone is waiting to be
   * collected. Nothing is granted until the user taps it (#501).
   * @returns {string}
   */
  _renderGift () {
    const available = this.status?.availableRewards ?? []
    if (available.length === 0) return ''
    return `
      <div class="daily-login-gift" role="button" tabindex="0" aria-label="${t('dailyLogin.collect')}">
        <span class="daily-login-gift-emoji" aria-hidden="true">🎁</span>
        <span class="daily-login-gift-label">${t('dailyLogin.collect')}</span>
        ${available.length > 1 ? `<span class="badge bg-info daily-login-gift-count">${available.length}</span>` : ''}
      </div>
    `
  }

  /**
   * Ask the server for the cards behind the gift, reveal them in the same flip
   * overlay the mini game uses, then refresh the bar.
   * @returns {Promise<void>}
   */
  async _collectReward () {
    if (this._collecting) return
    this._collecting = true
    try {
      const result = await server.claimDailyLoginReward()
      if (result.cards?.length) {
        await showCardClaimOverlay(result.cards)
      } else if (result.limitReached) {
        toast(t('dailyLogin.cardLimitReached'), 'error')
      }
      // `update()` re-renders from `this.status` without refetching, so the
      // collected state has to be written back first — otherwise the gift keeps
      // sitting on the bar after the cards were handed out. The claim response
      // already carries the new state, so no second round trip is needed.
      if (this.status) {
        this.status.claimed = result.claimed ?? this.status.claimed
        this.status.availableRewards = result.availableRewards ?? []
      }
      await this.update()
    } catch (e) {
      toast(e.message ?? t('dailyLogin.claimError'), 'error')
    } finally {
      this._collecting = false
    }
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
   * One milestone in the overlay's reward list (#501): just the day and its
   * reward category. The individual cards and their draw chances are left out
   * on purpose — the list stays short and scannable.
   * @param {{day: number, key: string}} milestone
   * @param {number[]} claimed
   * @returns {string}
   */
  _renderRewardItem (milestone, claimed) {
    const done = claimed.includes(milestone.day)
    const icon = done ? 'fa-check-circle text-success' : `${MILESTONE_ICONS[milestone.key] || 'fa-gift'} text-info`
    return `
      <li class="daily-login-reward mb-2">
        <div class="d-flex align-items-center gap-2 fw-bold small">
          <i class="fa ${icon}" aria-hidden="true"></i>
          <span>${t('dailyLogin.rewardDay', { day: milestone.day })}</span>
          <span class="text-muted fw-normal">${t('dailyLogin.reward.' + milestone.key)}</span>
        </div>
      </li>
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
    const rewardItems = milestones.map(m => this._renderRewardItem(m, claimed)).join('')
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
        <ul class="list-unstyled mb-0 daily-login-rewards">${rewardItems}</ul>
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
  _collecting = false
  _refreshing = false
}
