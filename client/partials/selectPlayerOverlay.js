import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { PlayerList } from './playerList.js'
import { toast } from './toast.js'
import { t } from '../i18n/index.js'
import { fire } from '../lib/event.js'
import { delay } from '../lib/delay.js'
import { el } from '../lib/html.js'
import { preloadAllActionCardSvgs, renderActionCardSvg } from '../lib/actionCardSvg.js'

const ACTION_CARDS_CHANGED_EVENT = 'ACTION_CARDS_CHANGED'

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

export class SelectPlayerOverlay extends UIElement {
  /**
   * @param {PlayerType} currentPlayer - Player currently in the slot (may be fake/empty)
   * @param {PlayerType[]} availablePlayers - Players whose natural position matches the slot
   * @param {(player: PlayerType) => void} onPlayerSelected - Called when a player from the list is clicked
   * @param {() => void} onActionCardApplied - Called after the action card finished applying
   * @param {PlayerType[]} [allPlayers] - All players the user could field for this slot
   *   (everyone in the squad minus suspended/injured/fake/already-on-pitch). When provided,
   *   the overlay shows a toggle that switches the list between matching-only and all players,
   *   letting the user field someone out of position (at reduced effectiveness).
   */
  constructor (currentPlayer, availablePlayers, onPlayerSelected, onActionCardApplied, allPlayers) {
    super()
    this.currentPlayer = currentPlayer
    this.availablePlayers = availablePlayers
    this.onPlayerSelected = onPlayerSelected
    this.onActionCardApplied = onActionCardApplied
    this.allPlayers = allPlayers ?? null
    this.showAll = false
    this.cards = []
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    if (!this._canShowActionCards()) return
    const response = await server.getActionCards()
    this.cards = (response.actionCards ?? [])
      .filter(c => ELIGIBLE_ACTION_PREFIXES.some(prefix => c.action.startsWith(prefix)))
    if (this.cards.length > 0) await preloadAllActionCardSvgs()
  }

  /**
   * @returns {string}
   */
  get template () {
    // Cache the PlayerList instance: a fresh instance would render an async
    // placeholder via renderSync(), which made the overlay briefly empty (and
    // shrink on its `width: fit-content` card) when we called this.update()
    // after an action card. Reusing the instance lets us update it in place.
    if (!this._playerList) {
      this._playerList = new PlayerList(
        this._currentListPlayers(),
        false,
        (player) => this.onPlayerSelected?.(player),
        false,
        false,
        null,
        null,
        { useUrlSort: false }
      )
    }
    return `
      <div class="select-player-overlay">
        <p>${t('selectPlayer.subtitle')}</p>
        ${this._playerList}
        ${this._renderShowAllToggle()}
        ${this._renderActionCardsSection()}
      </div>
    `
  }

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '(optional).select-player-action-cards': {
        click: async (event) => {
          const stackEl = event.target.closest('[data-action-card-idx]')
          if (!stackEl || this._processing) return
          const idx = Number(stackEl.dataset.actionCardIdx)
          const card = this.cards[idx]
          if (!card) return
          await this._useActionCard(card, idx, stackEl)
        }
      },
      '(optional)[data-toggle-show-all]': {
        click: async () => {
          this.showAll = !this.showAll
          this._refreshShowAllToggleDOM()
          await this._refreshPlayerListDOM()
        }
      }
    }
  }
  /**
   * @returns {PlayerType[]}
   */
  _currentListPlayers () {
    return this.showAll && this.allPlayers ? this.allPlayers : this.availablePlayers
  }

  /**
   * @returns {string}
   */
  _renderShowAllToggle () {
    if (!this.allPlayers) return ''
    const label = this.showAll ? t('selectPlayer.showMatchingOnly') : t('selectPlayer.showAllPlayers')
    const hint = this.showAll
      ? `<small class="text-muted d-block mt-2">${t('selectPlayer.outOfPositionHint')}</small>`
      : ''
    return `
      <div class="select-player-show-all mt-3">
        <button type="button" class="btn btn-outline-info w-100" data-toggle-show-all>
          <i class="fa fa-${this.showAll ? 'filter' : 'users'}" aria-hidden="true"></i>
          ${label}
        </button>
        ${hint}
      </div>
    `
  }

  _processing = false

  /**
   * @returns {boolean}
   */
  _canShowActionCards () {
    return Boolean(this.currentPlayer && !this.currentPlayer.fake)
  }

  /**
   * @returns {string}
   */
  _renderActionCardsSection () {
    if (!this._canShowActionCards()) return ''
    const heading = `<p class="select-player-action-card-prompt">${t('selectPlayer.giveActionCard', { playerName: this.currentPlayer.name })}</p>`
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
      grouped[card.action].push({
        card,
        idx
      })
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
      await server.useActionCard(card, this.currentPlayer, null)
      const topCard = stackEl.querySelector('.action-card-wrapper')
      if (topCard) {
        topCard.classList.add('card-used')
        await delay(1000)
      }
      const message = card.action.startsWith('FRESHNESS_')
        ? t('actionCards.fitnessBoost', { playerName: this.currentPlayer.name })
        : t('actionCards.levelUpSuccess', { playerName: this.currentPlayer.name })
      toast(message, 'success')
      fire(ACTION_CARDS_CHANGED_EVENT, this._renderId)
      // Drop the consumed card from the local list so the overlay's stack count
      // updates without needing a server round-trip. The overlay intentionally
      // stays open so the user can chain more cards onto the same player.
      this.cards.splice(cardIndex, 1)
      const refreshed = await this.onActionCardApplied?.()
      // The card mutated freshness/level on the server. Re-point the overlay's
      // player references at the freshly fetched objects so the player list
      // re-renders from current data.
      if (refreshed?.players) {
        this._applyRefreshedPlayers(refreshed.players)
      }
      // Surgical DOM updates instead of this.update(): a full re-render would
      // re-create the PlayerList via renderSync(), briefly replacing it with
      // an empty <template> placeholder. That made the overlay's fit-content
      // card collapse and re-expand, looking like a close/reopen flicker.
      this._refreshActionCardsDOM()
      await this._refreshPlayerListDOM()
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong...', 'error')
    } finally {
      this._processing = false
    }
  }

  /**
   * Swap the action-cards section in-place without re-rendering the whole
   * overlay. Keeps the container element (and its delegated click handler)
   * intact unless the section needs to flip to the empty-state message.
   * @returns {void}
   */
  _refreshActionCardsDOM () {
    if (!this._canShowActionCards()) return
    const cardsContainer = el(`${this._elementQuery} .select-player-action-cards`)
    if (this.cards.length === 0) {
      if (cardsContainer) {
        cardsContainer.outerHTML = `<p class="text-muted">${t('selectPlayer.noActionCards')}</p>`
      }
      return
    }
    if (cardsContainer) {
      cardsContainer.innerHTML = this._renderGroupedCards()
    }
  }

  /**
   * Update the cached PlayerList's data and trigger its own update(). Avoids
   * the placeholder dance from `${new PlayerList(...)}` in this.template.
   * @returns {Promise<void>}
   */
  async _refreshPlayerListDOM () {
    if (!this._playerList) return
    this._playerList.players = this._currentListPlayers()
    if (this._playerList.isRendered) {
      await this._playerList.update()
    }
  }

  /**
   * Mutate the existing toggle button (and its hint) instead of re-rendering
   * the overlay. The button keeps its listener because the element itself is
   * not replaced.
   * @returns {void}
   */
  _refreshShowAllToggleDOM () {
    const toggleBtn = el(`${this._elementQuery} [data-toggle-show-all]`)
    if (!toggleBtn) return
    const label = this.showAll ? t('selectPlayer.showMatchingOnly') : t('selectPlayer.showAllPlayers')
    toggleBtn.innerHTML = `<i class="fa fa-${this.showAll ? 'filter' : 'users'}" aria-hidden="true"></i> ${label}`
    const wrapper = el(`${this._elementQuery} .select-player-show-all`)
    const existingHint = wrapper?.querySelector('small.text-muted')
    if (this.showAll && !existingHint) {
      toggleBtn.insertAdjacentHTML('afterend', `<small class="text-muted d-block mt-2">${t('selectPlayer.outOfPositionHint')}</small>`)
    } else if (!this.showAll && existingHint) {
      existingHint.remove()
    }
  }

  /**
   * @param {PlayerType[]} freshPlayers - Full team roster returned by the server
   */
  _applyRefreshedPlayers (freshPlayers) {
    const byId = new Map(freshPlayers.map(p => [p.id, p]))
    if (this.currentPlayer?.id != null) {
      this.currentPlayer = byId.get(this.currentPlayer.id) ?? this.currentPlayer
    }
    this.availablePlayers = this.availablePlayers.map(p => byId.get(p.id) ?? p)
    if (this.allPlayers) {
      this.allPlayers = this.allPlayers.map(p => byId.get(p.id) ?? p)
    }
  }
}
