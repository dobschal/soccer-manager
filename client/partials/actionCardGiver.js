import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { toast } from './toast.js'
import { t } from '../i18n/index.js'
import { fire } from '../lib/event.js'
import { delay } from '../lib/delay.js'
import { el } from '../lib/html.js'
import { preloadAllActionCardSvgs, renderActionCardSvg } from '../lib/actionCardSvg.js'

export const ACTION_CARDS_CHANGED_EVENT = 'ACTION_CARDS_CHANGED'

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
      const stackOffset = Math.min(entries.length - 1, 4)
      const title = titles[actionType] || ''
      return `
        <div class="select-player-action-card-item">
          <div class="action-card-stack" data-action-card-idx="${firstIdx}" data-action-type="${actionType}">
            ${entries.slice(0, 5).map((_, i) => `
              <div class="action-card-wrapper" style="--stack-index: ${i}; --stack-total: ${stackOffset};">
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
        topCard.classList.add('card-used')
        await delay(1000)
      }
      const message = card.action.startsWith('FRESHNESS_')
        ? t('actionCards.fitnessBoost', { playerName: this.player.name })
        : t('actionCards.levelUpSuccess', { playerName: this.player.name })
      toast(message, 'success')
      fire(ACTION_CARDS_CHANGED_EVENT, this._renderId)
      // Drop the consumed card from the local list so the stack count updates
      // without a server round-trip. The section stays open so the user can
      // chain more cards onto the same player. The player's stat changes
      // (freshness / level / star flag) reach every consumer (list rows,
      // pitch tiles, modal, strength overlay) via the PLAYER_UPDATED server
      // event — no callback needed.
      this.cards.splice(cardIndex, 1)
      // Surgical DOM update instead of this.update(): a full re-render of an
      // embedding overlay re-creates nested UIElements via renderSync(), which
      // briefly shows an empty <template> placeholder and collapses fit-content
      // containers (close/reopen flicker).
      this._refreshDOM()
    } catch (e) {
      console.error(e)
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    } finally {
      this._processing = false
    }
  }

  /**
   * Swap this section's inner markup in place. The root `.action-card-giver`
   * element (which carries the delegated click handler) is kept intact.
   * @returns {void}
   */
  _refreshDOM () {
    const root = el(this._elementQuery)
    if (!root) return
    root.innerHTML = this._canShow() ? this._renderInner() : ''
  }
}
