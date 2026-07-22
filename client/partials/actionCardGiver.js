import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { toast } from './toast.js'
import { t } from '../i18n/index.js'
import { delay } from '../lib/delay.js'
import { el } from '../lib/html.js'
import { preloadAllActionCardSvgs, renderActionCardSvg } from '../lib/actionCardSvg.js'

const ELIGIBLE_ACTION_PREFIXES = ['FRESHNESS_', 'LEVEL_UP_PLAYER_']

/**
 * Returns the localized title for an action card type.
 * @returns {Object.<string, string>}
 */
function getActionCardTitles () {
  return {
    LEVEL_UP_PLAYER_100: t('actionCards.type.legendaryMastery'),
    LEVEL_UP_PLAYER_70: t('actionCards.type.epicAdvancement'),
    LEVEL_UP_PLAYER_40: t('actionCards.type.basicPromotion'),
    FRESHNESS_5: t('actionCards.type.quickRecovery'),
    FRESHNESS_10: t('actionCards.type.energyBoost'),
    FRESHNESS_20: t('actionCards.type.fullRecovery')
  }
}

/**
 * Reusable section that lets the user spend FRESHNESS_/LEVEL_UP_PLAYER_ action
 * cards on a single player. Shared by the lineup's SelectPlayerOverlay and the
 * PlayerModal so both look and behave identically.
 */
export class ActionCardGiver extends UIElement {
  /**
   * @param {PlayerType} player - Player the cards are applied to (may be fake/empty)
   */
  constructor (player) {
    super()
    this.player = player
    this.cards = []
    this._processing = false
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    if (!this._canShow()) return
    const response = await server.getActionCards()
    this.cards = (response.actionCards ?? [])
      .filter(c => ELIGIBLE_ACTION_PREFIXES.some(prefix => c.action.startsWith(prefix)))
    if (this.cards.length > 0) await preloadAllActionCardSvgs()
  }

  /**
   * @returns {string}
   */
  get template () {
    return `<div class="action-card-giver">${this._canShow() ? this._renderInner() : ''}</div>`
  }

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '.action-card-giver': {
        click: async (event) => {
          const stackEl = event.target.closest('[data-action-card-idx]')
          if (!stackEl || this._processing) return
          const idx = Number(stackEl.dataset.actionCardIdx)
          const card = this.cards[idx]
          if (!card) return
          await this._useActionCard(card, idx, stackEl)
        }
      }
    }
  }

  /**
   * @returns {boolean}
   */
  _canShow () {
    return Boolean(this.player && !this.player.fake)
  }

  /**
   * @returns {string}
   */
  _renderInner () {
    const heading = `<p class="select-player-action-card-prompt">${t('selectPlayer.giveActionCard', { playerName: this.player.name })}</p>`
    if (this.cards.length === 0) {
      return `${heading}<p class="text-muted">${t('selectPlayer.noActionCards')}</p>`
    }
    return `
      ${heading}
      <div class="select-player-action-cards">
        ${this._renderGroupedCards()}
      </div>
    `
  }

  /**
   * @returns {string}
   */
  _renderGroupedCards () {
    const grouped = {}
    this.cards.forEach((card, idx) => {
      if (!grouped[card.action]) grouped[card.action] = []
      grouped[card.action].push({ card, idx })
    })
    const titles = getActionCardTitles()
    return Object.keys(grouped).sort().map(actionType => {
      const entries = grouped[actionType]
      const firstIdx = entries[0].idx
      const title = titles[actionType] || ''
      // Front-most card is at DOM index 0 (topmost = highest z-index). Each
      // subsequent card sits one slot behind the previous, so the stack grows
      // backwards without a cap — a 20-card stack renders all 20 wrappers.
      return `
        <div class="select-player-action-card-item">
          <div class="action-card-stack" data-action-card-idx="${firstIdx}" data-action-type="${actionType}">
            ${entries.map((_, i) => `
              <div class="action-card-wrapper" style="--stack-index: ${i};">
                ${renderActionCardSvg(actionType)}
              </div>
            `).join('')}
            ${entries.length > 1 ? `<span class="action-card-count">${entries.length}</span>` : ''}
          </div>
          <div class="text-center small mt-2">${title}</div>
        </div>
      `
    }).join('')
  }

  /**
   * @param {Object} card
   * @param {number} cardIndex
   * @param {HTMLElement} stackEl
   * @returns {Promise<void>}
   */
  async _useActionCard (card, cardIndex, stackEl) {
    this._processing = true
    try {
      await server.useActionCard(card, this.player, null)
      const topCard = stackEl.querySelector('.action-card-wrapper')
      if (topCard) {
        topCard.style.setProperty('--stack-index', '-1')
        topCard.classList.add('card-used')
        // Slide every remaining card in this stack one slot forward while the
        // used card fades out — the CSS transition on top/left animates the
        // shift, so no re-render (which would tear down peer stacks too).
        this._slideRemainingWrappers(stackEl)
        await delay(1000)
      }
      const message = card.action.startsWith('FRESHNESS_')
        ? t('actionCards.fitnessBoost', { playerName: this.player.name })
        : t('actionCards.levelUpSuccess', { playerName: this.player.name })
      toast(message, 'success')
      // Drop the consumed card from the local list. Player stat changes reach
      // every consumer via PLAYER_UPDATED; the dashboard ActionCards view
      // refetches off the ACTION_CARDS_CHANGED server event — the section
      // itself stays open so the user can chain more cards onto the player.
      this.cards.splice(cardIndex, 1)
      const remainingOfType = this.cards.filter(c => c.action === card.action).length
      if (remainingOfType === 0) {
        // The whole stack item vanishes — a full refresh lets the remaining
        // stacks reflow into the freed space.
        this._refreshDOM()
      } else {
        // Drop the faded wrapper and patch just this stack: count badge for
        // the new size, `data-action-card-idx` on every stack (the splice
        // shifted positions in `this.cards`).
        topCard?.remove()
        this._patchCountBadge(stackEl, remainingOfType)
        this._recomputeStackClickTargets()
      }
    } catch (e) {
      console.error(e)
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    } finally {
      this._processing = false
    }
  }

  /**
   * Decrement `--stack-index` on every wrapper in this stack that isn't the
   * one being consumed. The used wrapper's own top/left don't change (its
   * `card-used` animation replaces them with a scale/translate transform), so
   * skipping it avoids fighting that animation.
   * @param {HTMLElement} stackEl
   * @returns {void}
   */
  _slideRemainingWrappers (stackEl) {
    stackEl.querySelectorAll('.action-card-wrapper:not(.card-used)').forEach(w => {
      const current = Number(w.style.getPropertyValue('--stack-index')) || 0
      w.style.setProperty('--stack-index', String(Math.max(0, current - 1)))
    })
  }

  /**
   * Keep the "N cards" badge in sync with the new stack size — remove it once
   * only one card is left, or update / create it otherwise.
   * @param {HTMLElement} stackEl
   * @param {number} count
   * @returns {void}
   */
  _patchCountBadge (stackEl, count) {
    const badge = stackEl.querySelector('.action-card-count')
    if (count > 1) {
      if (badge) badge.textContent = count
      else stackEl.insertAdjacentHTML('beforeend', `<span class="action-card-count">${count}</span>`)
    } else {
      badge?.remove()
    }
  }

  /**
   * `data-action-card-idx` on each stack has to point at the first card of
   * that action type in `this.cards`. The splice above shifted every position
   * after `cardIndex` down by 1, so we recompute from the (now-current)
   * array instead of trying to reason about deltas.
   * @returns {void}
   */
  _recomputeStackClickTargets () {
    const root = el(this._elementQuery)
    if (!root) return
    root.querySelectorAll('.action-card-stack').forEach(s => {
      const actionType = s.dataset.actionType
      if (!actionType) return
      const newIdx = this.cards.findIndex(c => c.action === actionType)
      if (newIdx >= 0) s.dataset.actionCardIdx = String(newIdx)
    })
  }

  /**
   * Swap this section's inner markup in place. Used only when the whole stack
   * item disappears (all cards of one type consumed) so the remaining stacks
   * reflow. The root `.action-card-giver` element — which carries the
   * delegated click handler — is kept intact.
   * @returns {void}
   */
  _refreshDOM () {
    const root = el(this._elementQuery)
    if (!root) return
    root.innerHTML = this._canShow() ? this._renderInner() : ''
  }
}
