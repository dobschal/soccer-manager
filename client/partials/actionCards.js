import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { showDialog } from './dialog.js'
import { PlayerList } from './playerList.js'
import { toast } from './toast.js'
import { delay } from '../lib/delay.js'
import { t } from '../i18n/index.js'

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
    CHANGE_PLAYER_POSITION: {
      title: t('actionCards.type.tacticalShift'),
      description: t('actionCards.type.tacticalShiftDesc')
    },
    NEW_YOUTH_PLAYER: {
      title: t('actionCards.type.youthProspect'),
      description: t('actionCards.type.youthProspectDesc')
    },
    FRESHNESS_10: {
      title: t('actionCards.type.energyBoost'),
      description: t('actionCards.type.energyBoostDesc')
    },
    BONUS_100K: {
      title: t('actionCards.type.cashBonus'),
      description: t('actionCards.type.cashBonusDesc')
    }
  }
}

const ACTION_CARD_IMAGES = {
  LEVEL_UP_PLAYER_100: 'assets/action-cards/level-up-player-10.svg',
  LEVEL_UP_PLAYER_70: 'assets/action-cards/level-up-player-7.svg',
  LEVEL_UP_PLAYER_40: 'assets/action-cards/level-up-player-4.svg',
  CHANGE_PLAYER_POSITION: 'assets/action-cards/change-player-position.svg',
  NEW_YOUTH_PLAYER: 'assets/action-cards/new-youth-player.svg',
  FRESHNESS_10: 'assets/action-cards/freshness-10.svg',
  BONUS_100K: 'assets/action-cards/bonus-100k.svg'
}

export class ActionCards extends UIElement {
  _overlay = null
  _currentCardElement = null
  cards = []

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '.action-cards-container': {
        click: async (event) => {
          const target = event.target
          const actionCardEl = target.closest('[data-action-card]')
          if (!actionCardEl) return

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

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div class="mb-5">
        <h3>${t('actionCards.title')}</h3>
        <p style="max-width: 620px">${t('actionCards.subtitle')}</p>
        <div class="mb-4 action-cards-container">
          <div class="action-cards-scroll">${this._renderCardsWithPlaceholders()}</div>
        </div>
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const response = await server.getActionCards()
    this.cards = response.actionCards
  }

  /**
   * @returns {string}
   */
  _renderCardsWithPlaceholders () {
    const groupedCards = this._renderGroupedCards()
    const cardCount = this._getGroupedCardCount()
    const minSlots = 5
    const placeholdersNeeded = Math.max(0, minSlots - cardCount)

    const placeholders = Array(placeholdersNeeded).fill(0).map(() => `
      <div class="action-card-stack action-card-placeholder">
        <div class="action-card-wrapper" style="--stack-index: 0; --stack-total: 0;">
          <div class="action-card-image action-card-empty"></div>
        </div>
      </div>
    `).join('')

    return groupedCards + placeholders
  }

  /**
   * @returns {number}
   */
  _getGroupedCardCount () {
    const grouped = {}
    this.cards.forEach((card) => {
      if (!grouped[card.action]) {
        grouped[card.action] = true
      }
    })
    return Object.keys(grouped).length
  }

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
      const imageSrc = ACTION_CARD_IMAGES[actionType] || 'assets/action-cards/level-up-player-4.svg'
      const cardText = getActionCardTexts()[actionType] || { title: 'Unknown Card' }
      const firstCardIdx = cards[0].idx
      const stackOffset = Math.min(cards.length - 1, 4)

      return `
        <div class="action-card-stack" data-action-card="${firstCardIdx}" data-can-merge="${canMerge}">
          ${cards.slice(0, 5).map((_, i) => `
            <div class="action-card-wrapper" style="--stack-index: ${i}; --stack-total: ${stackOffset};">
              <img class="action-card-image" src="${imageSrc}" alt="${cardText.title}">
            </div>
          `).join('')}
          ${canMerge ? `<span class="action-card-merge-badge">${t('actionCards.mergeable')}</span>` : ''}
          ${cards.length > 1 ? `<span class="action-card-count">${cards.length}</span>` : ''}
        </div>
      `
    }).join('')
  }

  /**
   * @param {Object} actionCard
   * @returns {Promise<void>}
   */
  async _mergeCards (actionCard) {
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
    }
  }

  /**
   * @param {number} usedCardIndex - Index of the card that was used
   * @returns {Promise<void>}
   */
  async _animateAndRemoveCard (usedCardIndex) {
    const stackEl = this._currentCardElement
    if (!stackEl) return

    const topCard = stackEl.querySelector('.action-card-wrapper')
    if (topCard) {
      topCard.classList.add('card-used')
      await delay(1000)
    }

    // Get the action type before removing from array
    const usedCard = this.cards[usedCardIndex]
    const actionType = usedCard.action

    // Remove the card from internal array
    this.cards.splice(usedCardIndex, 1)

    // Count remaining cards of this type
    const remainingOfType = this.cards.filter(c => c.action === actionType).length

    if (remainingOfType === 0) {
      // Convert the stack to a placeholder
      this._convertToPlaceholder(stackEl)
    } else {
      // Remove the top card wrapper from visual stack
      topCard?.remove()

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

    // Update all data-action-card indices since array positions changed
    this._updateAllStackIndices()

    this._currentCardElement = null
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
      // Convert the stack to a placeholder
      this._convertToPlaceholder(stackEl)
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
  }

  /**
   * Updates or creates a stack for a given card type
   * @param {string} actionType
   */
  _updateOrCreateStack (actionType) {
    const container = document.querySelector('.action-cards-scroll')
    if (!container) return

    const cardsOfType = this.cards.filter(c => c.action === actionType)
    if (cardsOfType.length === 0) return

    // Find existing stack for this type by matching image src (reliable identifier)
    const expectedImageSrc = ACTION_CARD_IMAGES[actionType]
    let existingStack = null
    container.querySelectorAll('.action-card-stack').forEach(stack => {
      const img = stack.querySelector('.action-card-image')
      if (img && img.getAttribute('src') === expectedImageSrc) {
        existingStack = stack
      }
    })

    const canMerge = (actionType === 'LEVEL_UP_PLAYER_40' || actionType === 'LEVEL_UP_PLAYER_70') && cardsOfType.length > 1
    const imageSrc = ACTION_CARD_IMAGES[actionType] || 'assets/action-cards/level-up-player-4.svg'
    const cardText = getActionCardTexts()[actionType] || { title: 'Unknown Card' }
    const firstCardIdx = this.cards.findIndex(c => c.action === actionType)
    const stackOffset = Math.min(cardsOfType.length - 1, 4)

    if (existingStack) {
      // Update existing stack
      existingStack.dataset.canMerge = canMerge
      existingStack.dataset.actionCard = firstCardIdx

      // Rebuild card wrappers
      const wrappersHtml = cardsOfType.slice(0, 5).map((_, i) => `
        <div class="action-card-wrapper" style="--stack-index: ${i}; --stack-total: ${stackOffset};">
          <img class="action-card-image" src="${imageSrc}" alt="${cardText.title}">
        </div>
      `).join('')

      const mergeBadge = canMerge ? `<span class="action-card-merge-badge">${t('actionCards.mergeable')}</span>` : ''
      const countBadge = cardsOfType.length > 1 ? `<span class="action-card-count">${cardsOfType.length}</span>` : ''

      existingStack.innerHTML = wrappersHtml + mergeBadge + countBadge
    } else {
      // Create new stack
      const newStackHtml = `
        <div class="action-card-stack" data-action-card="${firstCardIdx}" data-can-merge="${canMerge}">
          ${cardsOfType.slice(0, 5).map((_, i) => `
            <div class="action-card-wrapper" style="--stack-index: ${i}; --stack-total: ${stackOffset};">
              <img class="action-card-image" src="${imageSrc}" alt="${cardText.title}">
            </div>
          `).join('')}
          ${canMerge ? `<span class="action-card-merge-badge">${t('actionCards.mergeable')}</span>` : ''}
          ${cardsOfType.length > 1 ? `<span class="action-card-count">${cardsOfType.length}</span>` : ''}
        </div>
      `
      container.insertAdjacentHTML('beforeend', newStackHtml)
    }
  }

  /**
   * Updates all data-action-card indices after array modifications
   */
  _updateAllStackIndices () {
    const container = document.querySelector('.action-cards-scroll')
    if (!container) return

    container.querySelectorAll('.action-card-stack').forEach(stack => {
      // Find which action type this stack represents from the image
      const img = stack.querySelector('.action-card-image')
      if (!img) return

      const src = img.getAttribute('src')
      const actionType = Object.entries(ACTION_CARD_IMAGES).find(([_, path]) => path === src)?.[0]
      if (!actionType) return

      // Always find the correct index for this action type
      const newIdx = this.cards.findIndex(c => c.action === actionType)
      if (newIdx >= 0) {
        stack.dataset.actionCard = newIdx
      }
    })
  }

  /**
   * Converts a card stack element into a placeholder
   * @param {HTMLElement} stackEl - The stack element to convert
   */
  _convertToPlaceholder (stackEl) {
    stackEl.classList.add('action-card-placeholder')
    delete stackEl.dataset.actionCard
    delete stackEl.dataset.canMerge
    stackEl.innerHTML = `
      <div class="action-card-wrapper" style="--stack-index: 0; --stack-total: 0;">
        <div class="action-card-image action-card-empty"></div>
      </div>
    `
  }

  /**
   * @param {Object} actionCard
   * @param {number} cardIndex
   * @returns {Promise<void>}
   */
  async _useActionCard (actionCard, cardIndex) {
    if (actionCard.action.startsWith('FRESHNESS_')) {
      await this._handleFitnessCard(actionCard, cardIndex)
      return
    }
    if (actionCard.action.startsWith('LEVEL_UP_PLAYER_')) {
      await this._handleLevelUpCard(actionCard, cardIndex)
      return
    }
    if (actionCard.action === 'CHANGE_PLAYER_POSITION') {
      await this._handleChangePositionCard(actionCard, cardIndex)
      return
    }
    if (actionCard.action === 'NEW_YOUTH_PLAYER') {
      try {
        await server.useActionCard(actionCard, null, null)
        toast(t('actionCards.newPlayer'), 'success')
        await this._animateAndRemoveCard(cardIndex)
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong...', 'error')
      }
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
  async _handleChangePositionCard (actionCard, cardIndex) {
    const data = await server.getMyTeam()
    // Filter out goalkeepers - they cannot change position
    const eligiblePlayers = data.players.filter(p => p.position !== 'GK')
    const playerList = new PlayerList(eligiblePlayers, false, async player => {
      this._overlay?.remove()
      const positionList = this._renderPositionList(async (position) => {
        try {
          await server.useActionCard(actionCard, player, position)
          this._overlay?.remove()
          toast(t('actionCards.positionChanged', { playerName: player.name }), 'success')
          await this._animateAndRemoveCard(cardIndex)
        } catch (e) {
          console.error(e)
          toast(e.message ?? 'Something went wrong...', 'error')
        }
      })
      this._overlay = showOverlay(
        t('actionCards.selectPosition'),
        t('actionCards.whichPosition'),
        `${positionList}`
      )
    })
    this._overlay = showOverlay(
      t('actionCards.selectPlayer'),
      t('actionCards.whichPlayerPosition'),
      `${playerList}`
    )
  }

  /**
   * @param {Function} onClickHandler
   * @returns {string}
   */
  _renderPositionList (onClickHandler) {
    // GK is excluded - players cannot become goalkeepers
    const positions = ['LD', 'CD', 'RD', 'LM', 'DM', 'CM', 'RM', 'OM', 'LA', 'CA', 'RA']

    const items = positions.map((pos) => `
      <li class="list-group-item list-group-item-action" data-position="${pos}">${t('actionCards.position.' + pos)}</li>
    `).join('')

    setTimeout(() => {
      positions.forEach(pos => {
        const item = document.querySelector(`[data-position="${pos}"]`)
        if (item) {
          item.addEventListener('click', () => onClickHandler(pos))
        }
      })
    })

    return `<ul class="list-group">${items}</ul>`
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
}
