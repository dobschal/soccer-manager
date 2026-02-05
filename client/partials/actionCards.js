import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { showDialog } from './dialog.js'
import { PlayerList } from './playerList.js'
import { toast } from './toast.js'
import { delay } from '../lib/delay.js'

const ACTION_CARD_TEXTS = {
  LEVEL_UP_PLAYER_10: {
    title: 'Legendary Mastery',
    description: 'Level up a player to reach level 10.'
  },
  LEVEL_UP_PLAYER_7: {
    title: 'Epic Advancement',
    description: 'Level up a player to reach level 7.'
  },
  LEVEL_UP_PLAYER_4: {
    title: 'Basic Promotion',
    description: 'Level up a player to reach level 4.'
  },
  CHANGE_PLAYER_POSITION: {
    title: 'Tactical Shift',
    description: 'Change a player\'s position on the field.'
  },
  NEW_YOUTH_PLAYER: {
    title: 'Youth Prospect',
    description: 'Recruit a promising youth player.'
  },
  FRESHNESS_10: {
    title: 'Energy Boost',
    description: 'Restore a player\'s freshness by 10.'
  },
  BONUS_100K: {
    title: 'Cash Bonus',
    description: 'Receive an instant bonus of 100,000€.'
  }
}

const ACTION_CARD_IMAGES = {
  LEVEL_UP_PLAYER_10: 'assets/action-cards/level-up-player-10.svg',
  LEVEL_UP_PLAYER_7: 'assets/action-cards/level-up-player-7.svg',
  LEVEL_UP_PLAYER_4: 'assets/action-cards/level-up-player-4.svg',
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
              title: ACTION_CARD_TEXTS[card.action].title,
              text: 'Do you want to merge two cards into a better one, or use this card now? ',
              buttonText: 'Use Card',
              hasInput: false,
              buttonType: 'success',
              secondaryButtonText: 'Merge Cards',
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
      <div>
        <h3>Action Cards</h3>
        <p style="max-width: 620px">Use the action cards below to improve your team:</p>
        <div class="card card-body bg-dark pt-4 mb-4 action-cards-container">
          ${this.cards.length === 0
      ? '<h4 class="text-muted text-center mt-3 mb-3">No action cards available...</h4>'
      : `<div class="action-cards-scroll">${this._renderGroupedCards()}</div>`}
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
      const canMerge = (actionType === 'LEVEL_UP_PLAYER_4' || actionType === 'LEVEL_UP_PLAYER_7') && cards.length > 1
      const imageSrc = ACTION_CARD_IMAGES[actionType] || 'assets/action-cards/level-up-player-4.svg'
      const cardText = ACTION_CARD_TEXTS[actionType] || { title: 'Unknown Card' }
      const firstCardIdx = cards[0].idx
      const stackOffset = Math.min(cards.length - 1, 4)

      return `
        <div class="action-card-stack" data-action-card="${firstCardIdx}" data-can-merge="${canMerge}">
          ${cards.slice(0, 5).map((_, i) => `
            <div class="action-card-wrapper" style="--stack-index: ${i}; --stack-total: ${stackOffset};">
              <img class="action-card-image" src="${imageSrc}" alt="${cardText.title}">
            </div>
          `).join('')}
          ${canMerge ? '<span class="action-card-merge-badge">Mergeable</span>' : ''}
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

      await server.mergeCards(this.cards[indices[0]], this.cards[indices[1]])
      toast('Merged cards to a better one!', 'success')

      // Determine the new card type
      const newCardType = actionCard.action === 'LEVEL_UP_PLAYER_4' ? 'LEVEL_UP_PLAYER_7' : 'LEVEL_UP_PLAYER_10'
      await this._animateAndRemoveMergedCards(indices[0], indices[1], newCardType)
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
      // Remove the entire stack element
      stackEl.remove()

      // Show empty state if no cards left
      if (this.cards.length === 0) {
        const container = document.querySelector('.action-cards-container')
        if (container) {
          container.innerHTML = '<h4 class="text-muted text-center mt-3 mb-3">No action cards available...</h4>'
        }
      }
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
      const canStillMerge = (actionType === 'LEVEL_UP_PLAYER_4' || actionType === 'LEVEL_UP_PLAYER_7') && remainingOfType > 1
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
   * @returns {Promise<void>}
   */
  async _animateAndRemoveMergedCards (cardIndex1, cardIndex2, newCardType) {
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

    // Add the new merged card to our array
    const newCard = {
      action: newCardType,
      id: Date.now()
    }
    this.cards.push(newCard)

    // Count remaining cards of the OLD type
    const remainingOfType = this.cards.filter(c => c.action === actionType).length

    if (remainingOfType === 0) {
      stackEl.remove()
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

    const canMerge = (actionType === 'LEVEL_UP_PLAYER_4' || actionType === 'LEVEL_UP_PLAYER_7') && cardsOfType.length > 1
    const imageSrc = ACTION_CARD_IMAGES[actionType] || 'assets/action-cards/level-up-player-4.svg'
    const cardText = ACTION_CARD_TEXTS[actionType] || { title: 'Unknown Card' }
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

      const mergeBadge = canMerge ? '<span class="action-card-merge-badge">Mergeable</span>' : ''
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
          ${canMerge ? '<span class="action-card-merge-badge">Mergeable</span>' : ''}
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
        toast('You got a new player!', 'success')
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
        toast('You received 100,000€!', 'success')
        await this._animateAndRemoveCard(cardIndex)
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong...', 'error')
      }
      return
    }
    toast('Not implemented yet...')
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
        toast(`OK. ${player.name} got fitness boost!`, 'success')
        await this._animateAndRemoveCard(cardIndex)
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong...', 'error')
      }
    })
    this._overlay = showOverlay(
      'Select player',
      'Which player should get a fitness boost?',
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
          toast(`OK. ${player.name} plays another position now!`, 'success')
          await this._animateAndRemoveCard(cardIndex)
        } catch (e) {
          console.error(e)
          toast(e.message ?? 'Something went wrong...', 'error')
        }
      })
      this._overlay = showOverlay(
        'Select position',
        'Which position should the player play in the future?',
        `${positionList}`
      )
    })
    this._overlay = showOverlay(
      'Select player',
      'Which player should change his position?',
      `${playerList}`
    )
  }

  /**
   * @param {Function} onClickHandler
   * @returns {string}
   */
  _renderPositionList (onClickHandler) {
    // GK is excluded - players cannot become goalkeepers
    const positions = [
      ['Left Defender', 'LD'],
      ['Central Defender', 'CD'],
      ['Right Defender', 'RD'],
      ['Left Midfielder', 'LM'],
      ['Defensive Midfielder', 'DM'],
      ['Central Midfielder', 'CM'],
      ['Right Midfielder', 'RM'],
      ['Offensive Midfielder', 'OM'],
      ['Left Attacker', 'LA'],
      ['Central Attacker', 'CA'],
      ['Right Attacker', 'RA']
    ]

    const items = positions.map((p) => `
      <li class="list-group-item list-group-item-action" data-position="${p[1]}">${p[0]} (${p[1]})</li>
    `).join('')

    setTimeout(() => {
      positions.forEach(p => {
        const item = document.querySelector(`[data-position="${p[1]}"]`)
        if (item) {
          item.addEventListener('click', () => onClickHandler(p[1]))
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
        toast(`Nice. ${player.name} got a level up!`, 'success')
        await this._animateAndRemoveCard(cardIndex)
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong...', 'error')
      }
    })
    this._overlay = showOverlay(
      'Select player',
      'Which player should get a level up?',
      `${playerList}`
    )
  }
}
