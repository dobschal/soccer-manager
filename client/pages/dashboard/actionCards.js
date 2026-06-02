import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { showOverlay } from '../../partials/overlay.js'
import { showDialog } from '../../partials/dialog.js'
import { PlayerList } from '../../partials/playerList.js'
import { toast } from '../../partials/toast.js'
import { delay } from '../../lib/delay.js'
import { t } from '../../i18n/index.js'
import { fire, off, on } from '../../lib/event.js'
import { MiniGame } from './miniGame.js'
import { preloadAllActionCardSvgs, renderActionCardSvg } from '../../lib/actionCardSvg.js'
import { renderPlayerImage } from '../../partials/playerImage.js'
import { renderPositionBadge } from '../../partials/positionBadge.js'
import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'

const ACTION_CARDS_CHANGED_EVENT = 'ACTION_CARDS_CHANGED'

/**
 * @returns {Object.<string, {title: string, description: string}>}
 */
function getActionCardTexts () {
  return {
    LEVEL_UP_PLAYER_100: {
      title: t('actionCards.type.legendaryMastery'),
      description: t('actionCards.type.legendaryMasteryDesc')
    },
    LEVEL_UP_PLAYER_70: {
      title: t('actionCards.type.epicAdvancement'),
      description: t('actionCards.type.epicAdvancementDesc')
    },
    LEVEL_UP_PLAYER_40: {
      title: t('actionCards.type.basicPromotion'),
      description: t('actionCards.type.basicPromotionDesc')
    },
    NEW_YOUTH_PLAYER_1: {
      title: t('actionCards.type.youthProspect1'),
      description: t('actionCards.type.youthProspect1Desc')
    },
    NEW_YOUTH_PLAYER_2: {
      title: t('actionCards.type.youthProspect2'),
      description: t('actionCards.type.youthProspect2Desc')
    },
    NEW_YOUTH_PLAYER_3: {
      title: t('actionCards.type.youthProspect3'),
      description: t('actionCards.type.youthProspect3Desc')
    },
    FRESHNESS_5: {
      title: t('actionCards.type.quickRecovery'),
      description: t('actionCards.type.quickRecoveryDesc')
    },
    FRESHNESS_10: {
      title: t('actionCards.type.energyBoost'),
      description: t('actionCards.type.energyBoostDesc')
    },
    FRESHNESS_20: {
      title: t('actionCards.type.fullRecovery'),
      description: t('actionCards.type.fullRecoveryDesc')
    },
    BONUS_100K: {
      title: t('actionCards.type.cashBonus'),
      description: t('actionCards.type.cashBonusDesc')
    },
    STAR_PLAYER: {
      title: t('actionCards.type.starPlayer'),
      description: t('actionCards.type.starPlayerDesc')
    },
    MOTIVATING_SPEECH: {
      title: t('actionCards.type.motivatingSpeech'),
      description: t('actionCards.type.motivatingSpeechDesc')
    }
  }
}

export class ActionCards extends UIElement {
  /**
   * @returns {Promise<void>}
   */
  async load () {
    const response = await server.getActionCards()
    this.cards = response.actionCards
    await preloadAllActionCardSvgs()
  }

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div class="mb-5">
        <h3>${t('actionCards.title')}</h3>
        <p class="u-max-w-620">${t('actionCards.subtitle')}</p>
        <div class="mb-4 action-cards-container">
          <div class="row g-4 action-cards-scroll">${this._renderGroupedCards()}</div>
        </div>
        ${this._miniGame}
      </div>
    `
  }

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '.action-cards-container': {
        click: async (event) => {
          const target = event.target
          const actionCardEl = target.closest('[data-action-card]')
          if (!actionCardEl || this._processing) return

          const idx = parseInt(actionCardEl.dataset.actionCard, 10)
          const card = this.cards[idx]
          const canMerge = actionCardEl.dataset.canMerge === 'true'
          this._currentCardElement = actionCardEl

          if (canMerge) {
            const {
              ok,
              value
            } = await showDialog({
              title: getActionCardTexts()[card.action].title,
              text: t('actionCards.mergeOrUsePrompt'),
              buttonText: t('actionCards.useCard'),
              hasInput: false,
              buttonType: 'success',
              secondaryButtonText: t('actionCards.mergeCards'),
              secondaryButtonType: 'info'
            })
            if (ok) {
              void this._useActionCard(card, idx)
            } else if (value === 'secondary') {
              void this._mergeCards(card)
            }
          } else {
            void this._useActionCard(card, idx)
          }
        }
      }
    }
  }
  onMounted () {
    this._actionCardsChangedEventId = on(ACTION_CARDS_CHANGED_EVENT, (senderId) => {
      if (senderId === this._renderId) return
      void this.update(true)
    })
  }

  onDestroy () {
    if (this._actionCardsChangedEventId !== undefined) {
      off(this._actionCardsChangedEventId)
      this._actionCardsChangedEventId = undefined
    }
  }

  _miniGame = new MiniGame()

  _overlay = null
  _currentCardElement = null
  _processing = false
  _actionCardsChangedEventId = undefined
  cards = []

  /**
   * @returns {string}
   */
  _renderGroupedCards () {
    const grouped = {}
    this.cards.forEach((card, idx) => {
      if (!grouped[card.action]) {
        grouped[card.action] = []
      }
      grouped[card.action].push({
        card,
        idx
      })
    })

    const sortedTypes = Object.keys(grouped).sort()

    return sortedTypes.map(actionType => {
      const cards = grouped[actionType]
      const canMerge = (actionType === 'LEVEL_UP_PLAYER_40' || actionType === 'LEVEL_UP_PLAYER_70') && cards.length > 1
      const firstCardIdx = cards[0].idx
      const stackOffset = Math.min(cards.length - 1, 4)

      return `
        <div class="col-6 col-md-4 col-lg-3 col-xl-2">
          <div class="action-card-stack" data-action-card="${firstCardIdx}" data-action-type="${actionType}" data-can-merge="${canMerge}">
            ${cards.slice(0, 5).map((_, i) => `
              <div class="action-card-wrapper" style="--stack-index: ${i}; --stack-total: ${stackOffset};">
                ${renderActionCardSvg(actionType)}
              </div>
            `).join('')}
            ${canMerge ? `<span class="action-card-merge-badge">${t('actionCards.mergeable')}</span>` : ''}
            ${cards.length > 1 ? `<span class="action-card-count">${cards.length}</span>` : ''}
          </div>
        </div>
      `
    }).join('')
  }

  /**
   * @param {Object} actionCard
   * @returns {Promise<void>}
   */
  async _mergeCards (actionCard) {
    this._processing = true
    try {
      // Find indices of cards to merge
      const indices = []
      this.cards.forEach((c, idx) => {
        if (c.action === actionCard.action && indices.length < 2) {
          indices.push(idx)
        }
      })

      const response = await server.mergeCards(this.cards[indices[0]], this.cards[indices[1]])
      toast(t('actionCards.cardsMerged'), 'success')

      // Determine the new card type
      const newCardType = actionCard.action === 'LEVEL_UP_PLAYER_40' ? 'LEVEL_UP_PLAYER_70' : 'LEVEL_UP_PLAYER_100'
      await this._animateAndRemoveMergedCards(indices[0], indices[1], newCardType, response.actionCard)
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong', 'error')
    } finally {
      this._processing = false
    }
  }

  /**
   * @param {number} usedCardIndex - Index of the card that was used
   * @returns {Promise<void>}
   */
  async _animateAndRemoveCard (usedCardIndex) {
    const stackEl = this._currentCardElement
    if (!stackEl) return

    // Get the action type and update array BEFORE animation
    // so that clicking the stack again during animation picks the next card
    const usedCard = this.cards[usedCardIndex]
    const actionType = usedCard.action
    this.cards.splice(usedCardIndex, 1)
    const remainingOfType = this.cards.filter(c => c.action === actionType).length

    // Update all data-action-card indices immediately
    this._updateAllStackIndices()

    const topCard = stackEl.querySelector('.action-card-wrapper')
    if (topCard) {
      topCard.classList.add('card-used')
      await delay(1000)
    }

    if (remainingOfType === 0) {
      const colWrapper = stackEl.closest('.col-6')
      if (colWrapper) {
        colWrapper.remove()
      } else {
        stackEl.remove()
      }
    } else {
      // Remove the top card wrapper from visual stack
      topCard?.remove()

      // If all visual wrappers are gone but cards remain, rebuild the stack
      const remainingWrappers = stackEl.querySelectorAll('.action-card-wrapper')
      if (remainingWrappers.length === 0) {
        this._rebuildStackVisuals(stackEl, actionType, remainingOfType)
      } else {
        // Update count badge
        const countBadge = stackEl.querySelector('.action-card-count')
        if (remainingOfType > 1) {
          if (countBadge) {
            countBadge.textContent = remainingOfType
          }
        } else {
          countBadge?.remove()
        }

        // Update merge badge
        const canStillMerge = (actionType === 'LEVEL_UP_PLAYER_40' || actionType === 'LEVEL_UP_PLAYER_70') && remainingOfType > 1
        if (!canStillMerge) {
          const mergeBadge = stackEl.querySelector('.action-card-merge-badge')
          mergeBadge?.remove()
          stackEl.dataset.canMerge = 'false'
        }
      }
    }

    this._currentCardElement = null
    fire(ACTION_CARDS_CHANGED_EVENT, this._renderId)
  }

  /**
   * @param {number} cardIndex1 - Index of first card to merge
   * @param {number} cardIndex2 - Index of second card to merge
   * @param {string} newCardType - The type of the newly created card
   * @param {Object} serverCard - The new card returned by the server
   * @returns {Promise<void>}
   */
  async _animateAndRemoveMergedCards (cardIndex1, cardIndex2, newCardType, serverCard) {
    const stackEl = this._currentCardElement
    if (!stackEl) return

    // Animate two cards fading out
    const wrappers = stackEl.querySelectorAll('.action-card-wrapper')
    if (wrappers.length >= 2) {
      wrappers[0].classList.add('card-used')
      wrappers[1].classList.add('card-used')
      await delay(1000)
    }

    const actionType = this.cards[cardIndex1].action

    // Remove both cards from array (remove higher index first to preserve lower index)
    const [lower, higher] = cardIndex1 < cardIndex2 ? [cardIndex1, cardIndex2] : [cardIndex2, cardIndex1]
    this.cards.splice(higher, 1)
    this.cards.splice(lower, 1)

    // Add the new merged card to our array using the server-provided card
    this.cards.push(serverCard)

    // Count remaining cards of the OLD type
    const remainingOfType = this.cards.filter(c => c.action === actionType).length

    if (remainingOfType === 0) {
      const colWrapper = stackEl.closest('.col-6')
      if (colWrapper) {
        colWrapper.remove()
      } else {
        stackEl.remove()
      }
    } else {
      // Remove two card wrappers
      wrappers[0]?.remove()
      wrappers[1]?.remove()

      // Update count badge
      const countBadge = stackEl.querySelector('.action-card-count')
      if (remainingOfType > 1) {
        if (countBadge) {
          countBadge.textContent = remainingOfType
        }
      } else {
        countBadge?.remove()
      }

      // Update merge badge
      const canStillMerge = remainingOfType > 1
      if (!canStillMerge) {
        const mergeBadge = stackEl.querySelector('.action-card-merge-badge')
        mergeBadge?.remove()
        stackEl.dataset.canMerge = 'false'
      }
    }

    // Update or create stack for the NEW card type
    this._updateOrCreateStack(newCardType)

    // Update all data-action-card indices
    this._updateAllStackIndices()

    this._currentCardElement = null
    fire(ACTION_CARDS_CHANGED_EVENT, this._renderId)
  }

  /**
   * Updates or creates a stack for a given card type
   * @param {string} actionType
   */
  _updateOrCreateStack (actionType) {
    const root = document.querySelector(this._elementQuery)
    const container = root?.querySelector('.action-cards-scroll')
    if (!container) return

    const cardsOfType = this.cards.filter(c => c.action === actionType)
    if (cardsOfType.length === 0) return

    const existingStack = container.querySelector(`.action-card-stack[data-action-type="${actionType}"]`)

    const canMerge = (actionType === 'LEVEL_UP_PLAYER_40' || actionType === 'LEVEL_UP_PLAYER_70') && cardsOfType.length > 1
    const firstCardIdx = this.cards.findIndex(c => c.action === actionType)
    const stackOffset = Math.min(cardsOfType.length - 1, 4)

    if (existingStack) {
      // Update existing stack
      existingStack.dataset.canMerge = canMerge
      existingStack.dataset.actionCard = firstCardIdx

      // Rebuild card wrappers
      const wrappersHtml = cardsOfType.slice(0, 5).map((_, i) => `
        <div class="action-card-wrapper" style="--stack-index: ${i}; --stack-total: ${stackOffset};">
          ${renderActionCardSvg(actionType)}
        </div>
      `).join('')

      const mergeBadge = canMerge ? `<span class="action-card-merge-badge">${t('actionCards.mergeable')}</span>` : ''
      const countBadge = cardsOfType.length > 1 ? `<span class="action-card-count">${cardsOfType.length}</span>` : ''

      existingStack.innerHTML = wrappersHtml + mergeBadge + countBadge
    } else {
      // Create new stack wrapped in Bootstrap col
      const newStackHtml = `
        <div class="col-6 col-sm-4 col-lg-3 col-xl-2">
          <div class="action-card-stack" data-action-card="${firstCardIdx}" data-action-type="${actionType}" data-can-merge="${canMerge}">
            ${cardsOfType.slice(0, 5).map((_, i) => `
              <div class="action-card-wrapper" style="--stack-index: ${i}; --stack-total: ${stackOffset};">
                ${renderActionCardSvg(actionType)}
              </div>
            `).join('')}
            ${canMerge ? `<span class="action-card-merge-badge">${t('actionCards.mergeable')}</span>` : ''}
            ${cardsOfType.length > 1 ? `<span class="action-card-count">${cardsOfType.length}</span>` : ''}
          </div>
        </div>
      `
      container.insertAdjacentHTML('beforeend', newStackHtml)
    }
  }

  /**
   * Rebuilds the visual wrappers and badges for a stack element
   * @param {Element} stackEl
   * @param {string} actionType
   * @param {number} count
   */
  _rebuildStackVisuals (stackEl, actionType, count) {
    const stackOffset = Math.min(count - 1, 4)
    const canMerge = (actionType === 'LEVEL_UP_PLAYER_40' || actionType === 'LEVEL_UP_PLAYER_70') && count > 1

    const wrappersHtml = Array.from({ length: Math.min(count, 5) }, (_, i) => `
      <div class="action-card-wrapper" style="--stack-index: ${i}; --stack-total: ${stackOffset};">
        ${renderActionCardSvg(actionType)}
      </div>
    `).join('')

    const mergeBadge = canMerge ? `<span class="action-card-merge-badge">${t('actionCards.mergeable')}</span>` : ''
    const countBadge = count > 1 ? `<span class="action-card-count">${count}</span>` : ''

    stackEl.innerHTML = wrappersHtml + mergeBadge + countBadge
    stackEl.dataset.canMerge = canMerge
  }

  /**
   * Updates all data-action-card indices after array modifications
   */
  _updateAllStackIndices () {
    const root = document.querySelector(this._elementQuery)
    const container = root?.querySelector('.action-cards-scroll')
    if (!container) return

    container.querySelectorAll('.action-card-stack').forEach(stack => {
      const actionType = stack.dataset.actionType
      if (!actionType) return

      const newIdx = this.cards.findIndex(c => c.action === actionType)
      if (newIdx >= 0) {
        stack.dataset.actionCard = newIdx
      }
    })
  }

  /**
   * @param {Object} actionCard
   * @param {number} cardIndex
   * @returns {Promise<void>}
   */
  async _useActionCard (actionCard, cardIndex) {
    this._processing = true
    try {
      await this._dispatchActionCard(actionCard, cardIndex)
    } finally {
      this._processing = false
    }
  }

  /**
   * @param {Object} actionCard
   * @param {number} cardIndex
   * @returns {Promise<void>}
   */
  async _dispatchActionCard (actionCard, cardIndex) {
    if (actionCard.action.startsWith('FRESHNESS_')) {
      await this._handleFitnessCard(actionCard, cardIndex)
      return
    }
    if (actionCard.action.startsWith('LEVEL_UP_PLAYER_')) {
      await this._handleLevelUpCard(actionCard, cardIndex)
      return
    }
    if (actionCard.action === 'NEW_YOUTH_PLAYER_1' || actionCard.action === 'NEW_YOUTH_PLAYER_2' || actionCard.action === 'NEW_YOUTH_PLAYER_3') {
      await this._handleYouthPlayerCard(actionCard, cardIndex)
      return
    }
    if (actionCard.action === 'STAR_PLAYER') {
      await this._handleStarPlayerCard(actionCard, cardIndex)
      return
    }
    if (actionCard.action === 'BONUS_100K') {
      try {
        await server.useActionCard(actionCard, null, null)
        toast(t('actionCards.bonusReceived'), 'success')
        await this._animateAndRemoveCard(cardIndex)
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong...', 'error')
      }
      return
    }
    if (actionCard.action === 'MOTIVATING_SPEECH') {
      try {
        await server.useActionCard(actionCard, null, null)
        toast(t('actionCards.motivatingSpeechSuccess'), 'success')
        await this._animateAndRemoveCard(cardIndex)
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong...', 'error')
      }
      return
    }
    toast(t('actionCards.notImplemented'))
  }

  /**
   * @param {Object} actionCard
   * @param {number} cardIndex
   * @returns {Promise<void>}
   */
  async _handleFitnessCard (actionCard, cardIndex) {
    const data = await server.getMyTeam()
    const playerList = new PlayerList(data.players, false, async player => {
      try {
        await server.useActionCard(actionCard, player, null)
        this._overlay?.remove()
        toast(t('actionCards.fitnessBoost', { playerName: player.name }), 'success')
        await this._animateAndRemoveCard(cardIndex)
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong...', 'error')
      }
    })
    this._overlay = showOverlay(
      t('actionCards.selectPlayer'),
      t('actionCards.whichPlayerFitness'),
      `${playerList}`
    )
  }

  /**
   * @param {Object} actionCard
   * @param {number} cardIndex
   * @returns {Promise<void>}
   */
  async _handleLevelUpCard (actionCard, cardIndex) {
    const data = await server.getMyTeam()
    const playerList = new PlayerList(data.players, false, async player => {
      try {
        await server.useActionCard(actionCard, player, null)
        this._overlay?.remove()
        toast(t('actionCards.levelUpSuccess', { playerName: player.name }), 'success')
        await this._animateAndRemoveCard(cardIndex)
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong...', 'error')
      }
    })
    this._overlay = showOverlay(
      t('actionCards.selectPlayer'),
      t('actionCards.whichPlayerLevelUp'),
      `${playerList}`
    )
  }

  /**
   * @param {Object} actionCard
   * @param {number} cardIndex
   * @returns {Promise<void>}
   */
  async _handleStarPlayerCard (actionCard, cardIndex) {
    const data = await server.getMyTeam()
    const eligiblePlayers = data.players.filter(p => !p.is_star_player)
    const playerList = new PlayerList(eligiblePlayers, false, async player => {
      try {
        await server.useActionCard(actionCard, player, null)
        this._overlay?.remove()
        toast(t('actionCards.starPlayerSuccess', { playerName: player.name }), 'success')
        await this._animateAndRemoveCard(cardIndex)
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong...', 'error')
      }
    })
    this._overlay = showOverlay(
      t('actionCards.selectPlayer'),
      t('actionCards.whichPlayerStar'),
      `${playerList}`
    )
  }

  /**
   * Show 3 youth player options and let the user pick one.
   * @param {Object} actionCard
   * @param {number} cardIndex
   * @returns {Promise<void>}
   */
  async _handleYouthPlayerCard (actionCard, cardIndex) {
    let response
    try {
      response = await server.getYouthPlayerOptions(actionCard.id)
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong...', 'error')
      return
    }
    const options = response.options || []
    const renderedImages = await Promise.all(options.map((opt, idx) =>
      renderPlayerImage({ id: idx + 1, hair_color: opt.hair_color, skin_color: opt.skin_color }, null, 140)
    ))
    const buttonIds = options.map(() => generateId())
    options.forEach((option, idx) => {
      onClick(buttonIds[idx], async () => {
        try {
          await server.useActionCard(actionCard, option, null)
          this._overlay?.remove()
          toast(t('actionCards.youthSignedSuccess', { playerName: option.name }), 'success')
          await this._animateAndRemoveCard(cardIndex)
        } catch (e) {
          console.error(e)
          toast(e.message ?? 'Something went wrong...', 'error')
        }
      })
    })

    const cards = options.map((option, idx) => `
      <div class="youth-option-card">
        <div class="youth-option-card__image">${renderedImages[idx]}</div>
        <div class="youth-option-card__name">${option.name}</div>
        <div class="youth-option-card__meta">
          <span>${renderPositionBadge(option.position)}</span>
          <span>${t('actionCards.youthOptionAge', { age: 15 })}</span>
          <span>${t('actionCards.youthOptionLevel', { level: option.level.toFixed(1) })}</span>
        </div>
        <button id="${buttonIds[idx]}" class="btn btn-primary btn-sm mt-2">${t('actionCards.youthOptionSelect')}</button>
      </div>
    `).join('')

    this._overlay = showOverlay(
      t('actionCards.youthOptionsTitle'),
      t('actionCards.youthOptionsText'),
      `<div class="youth-options-grid">${cards}</div>`
    )
  }
}
