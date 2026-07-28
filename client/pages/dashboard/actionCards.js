import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { showOverlay } from '../../partials/overlay.js'
import { showDialog } from '../../partials/dialog.js'
import { PlayerList } from '../../partials/playerList.js'
import { toast } from '../../partials/toast.js'
import { delay } from '../../lib/delay.js'
import { t } from '../../i18n/index.js'
import { wikiInfoIcon } from '../../partials/wikiInfoIcon.js'
import { MiniGame } from './miniGame.js'
import { preloadAllActionCardSvgs, renderActionCardSvg } from '../../lib/actionCardSvg.js'
import { renderPlayerImage } from '../../partials/playerImage.js'
import { renderPositionBadge } from '../../partials/positionBadge.js'
import { generateId, el } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { SERVER_EVENTS } from '../../lib/serverEvents.js'
import { showSpyOverlay } from '../../partials/spyOverlay.js'

const MERGEABLE_ACTIONS = new Set(['LEVEL_UP_PLAYER_40', 'LEVEL_UP_PLAYER_70'])

/**
 * Maximum number of cards a team may hold per action type. Kept in sync with
 * the server constant in server/helper/actionCardHelper.js — the server
 * enforces it on claim; this copy only drives the visible hint / "full" badge.
 * @type {number}
 */
const MAX_ACTION_CARDS_PER_TYPE = 10

/**
 * Render the per-stack count badge. Hidden for single cards; shows the count,
 * and once the per-type limit is reached switches to a "count/max" badge with
 * a "full" style so the limit is visible.
 * @param {number} count
 * @returns {string}
 */
function countBadgeHtml (count) {
  if (count <= 1) return ''
  const isFull = count >= MAX_ACTION_CARDS_PER_TYPE
  const label = isFull ? `${count}/${MAX_ACTION_CARDS_PER_TYPE}` : String(count)
  return `<span class="action-card-count${isFull ? ' action-card-count--full' : ''}" title="${isFull ? t('actionCards.stackFull') : ''}">${label}</span>`
}

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
    },
    SPY: {
      title: t('actionCards.type.spy'),
      description: t('actionCards.type.spyDesc')
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
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <h3 class="mb-0">${t('actionCards.title')} ${wikiInfoIcon('action-cards')}</h3>
          <a class="btn btn-outline-info btn-sm" href="#dashboard?sub_page=card_market">
            <i class="fa fa-exchange me-1"></i> ${t('cardMarket.title')}
          </a>
        </div>
        <p class="u-max-w-620">${t('actionCards.subtitle')} <span class="text-muted">${t('actionCards.limitHint', { max: MAX_ACTION_CARDS_PER_TYPE })}</span></p>
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

  /**
   * The dashboard card view is the only consumer that needs the full inventory
   * up to date — every embedded ActionCardGiver drops its own consumed card
   * locally, so a broadcast to peers is unnecessary. The server emits
   * ACTION_CARDS_CHANGED after every claim / play / merge; on that we refetch.
   * We deliberately skip the update while `_processing` is true so the card-use
   * animation this view drives itself isn't clobbered by a mid-flight refetch.
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      [SERVER_EVENTS.ACTION_CARDS_CHANGED.name]: () => {
        if (this._processing) return
        void this.update(true)
      }
    }
  }

  _miniGame = new MiniGame()

  _overlay = null
  _currentCardElement = null
  _processing = false
  cards = []

  /**
   * Renders one `.action-card-stack` per action type. Every card in the group
   * gets its own `.action-card-wrapper` — the stack grows backwards without a
   * cap, matching `ActionCardGiver`. Only `--stack-index` is used (the CSS
   * spaces wrappers by 4px per slot); there is no `--stack-total`.
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
      const canMerge = MERGEABLE_ACTIONS.has(actionType) && cards.length > 1
      const firstCardIdx = cards[0].idx

      return `
        <div class="col-6 col-md-4 col-lg-3 col-xl-2">
          <div class="action-card-stack" data-action-card="${firstCardIdx}" data-action-type="${actionType}" data-can-merge="${canMerge}">
            ${cards.map((_, i) => `
              <div class="action-card-wrapper" style="--stack-index: ${i};">
                ${renderActionCardSvg(actionType)}
              </div>
            `).join('')}
            ${canMerge ? `<span class="action-card-merge-badge">${t('actionCards.mergeable')}</span>` : ''}
            ${countBadgeHtml(cards.length)}
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

    const usedCard = this.cards[usedCardIndex]
    const actionType = usedCard.action

    const topCard = stackEl.querySelector('.action-card-wrapper')
    if (topCard) {
      topCard.style.setProperty('--stack-index', '-1')
      topCard.classList.add('card-used')
      // Slide every remaining card in this stack one slot forward while the
      // used card fades out — the CSS transition on top/left animates the
      // shift, so no full re-render (which would tear peer stacks down too).
      this._slideRemainingWrappers(stackEl)
      await delay(500)
    }

    // Drop the consumed card from the local list. Player stat changes reach
    // every consumer via PLAYER_UPDATED; ACTION_CARDS_CHANGED from the server
    // refetches the inventory when the animation-blocking `_processing` flag
    // drops — surgical updates below keep peer stacks stable in the meantime.
    this.cards.splice(usedCardIndex, 1)
    const remainingOfType = this.cards.filter(c => c.action === actionType).length

    if (remainingOfType === 0) {
      // Bootstrap's grid handles reflow on its own once the column is gone.
      const colWrapper = stackEl.closest('.col-6, .col-sm-4, .col-md-4, .col-lg-3, .col-xl-2')
      if (colWrapper) colWrapper.remove()
      else stackEl.remove()
    } else {
      // Drop the faded wrapper and patch just this stack: count badge, merge
      // badge, and `data-action-card` on every stack (the splice shifted
      // positions in `this.cards`).
      topCard?.remove()
      this._patchCountBadge(stackEl, remainingOfType)
      this._patchMergeBadge(stackEl, actionType, remainingOfType)
      this._recomputeStackClickTargets()
    }

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

    const actionType = this.cards[cardIndex1].action

    // Animate the top two wrappers fading out and slide every survivor two
    // slots forward. Same shape as the single-use path above.
    const wrappers = stackEl.querySelectorAll('.action-card-wrapper')
    const wrapperA = wrappers[0]
    const wrapperB = wrappers[1]
    if (wrapperA && wrapperB) {
      wrapperA.style.setProperty('--stack-index', '-1')
      wrapperB.style.setProperty('--stack-index', '-1')
      wrapperA.classList.add('card-used')
      wrapperB.classList.add('card-used')
      this._slideRemainingWrappers(stackEl, 2)
      await delay(500)
    }

    // Remove both cards from array (higher index first so the lower stays put).
    const [lower, higher] = cardIndex1 < cardIndex2 ? [cardIndex1, cardIndex2] : [cardIndex2, cardIndex1]
    this.cards.splice(higher, 1)
    this.cards.splice(lower, 1)

    // Add the new merged card to our array using the server-provided card.
    this.cards.push(serverCard)

    const remainingOfType = this.cards.filter(c => c.action === actionType).length

    if (remainingOfType === 0) {
      const colWrapper = stackEl.closest('.col-6, .col-sm-4, .col-md-4, .col-lg-3, .col-xl-2')
      if (colWrapper) colWrapper.remove()
      else stackEl.remove()
    } else {
      wrapperA?.remove()
      wrapperB?.remove()
      this._patchCountBadge(stackEl, remainingOfType)
      this._patchMergeBadge(stackEl, actionType, remainingOfType)
    }

    // Update or create stack for the NEW card type.
    this._updateOrCreateStack(newCardType)

    // The splice(s) shifted every position after the removed cards; retarget
    // every stack's click index against the (now-current) array.
    this._recomputeStackClickTargets()

    this._currentCardElement = null
  }

  /**
   * Updates or creates a stack for a given card type. Called after a merge
   * lands a new card of `actionType`. Renders every card in the group — same
   * shape as `_renderGroupedCards`.
   * @param {string} actionType
   * @returns {void}
   */
  _updateOrCreateStack (actionType) {
    const root = document.querySelector(this._elementQuery)
    const container = root?.querySelector('.action-cards-scroll')
    if (!container) return

    const cardsOfType = this.cards.filter(c => c.action === actionType)
    if (cardsOfType.length === 0) return

    const existingStack = container.querySelector(`.action-card-stack[data-action-type="${actionType}"]`)
    const canMerge = MERGEABLE_ACTIONS.has(actionType) && cardsOfType.length > 1
    const firstCardIdx = this.cards.findIndex(c => c.action === actionType)

    const wrappersHtml = cardsOfType.map((_, i) => `
      <div class="action-card-wrapper" style="--stack-index: ${i};">
        ${renderActionCardSvg(actionType)}
      </div>
    `).join('')
    const mergeBadge = canMerge ? `<span class="action-card-merge-badge">${t('actionCards.mergeable')}</span>` : ''
    const countBadge = countBadgeHtml(cardsOfType.length)

    if (existingStack) {
      existingStack.dataset.canMerge = canMerge
      existingStack.dataset.actionCard = firstCardIdx
      existingStack.innerHTML = wrappersHtml + mergeBadge + countBadge
    } else {
      const newStackHtml = `
        <div class="col-6 col-sm-4 col-lg-3 col-xl-2">
          <div class="action-card-stack" data-action-card="${firstCardIdx}" data-action-type="${actionType}" data-can-merge="${canMerge}">
            ${wrappersHtml}${mergeBadge}${countBadge}
          </div>
        </div>
      `
      container.insertAdjacentHTML('beforeend', newStackHtml)
    }
  }

  /**
   * Decrement `--stack-index` on every wrapper in this stack that isn't being
   * consumed. The used wrappers' own top/left don't matter (their `card-used`
   * animation replaces them with a scale/translate transform), so skipping
   * them avoids fighting that animation.
   * @param {HTMLElement} stackEl
   * @param {number} [step=1] - How many slots to shift forward (2 for a merge).
   * @returns {void}
   */
  _slideRemainingWrappers (stackEl, step = 1) {
    stackEl.querySelectorAll('.action-card-wrapper:not(.card-used)').forEach(w => {
      const current = Number(w.style.getPropertyValue('--stack-index')) || 0
      w.style.setProperty('--stack-index', String(Math.max(0, current - step)))
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
    // Rebuild the badge via the shared helper so the "full" style / "count/max"
    // label stays consistent with the initial render.
    stackEl.querySelector('.action-card-count')?.remove()
    const html = countBadgeHtml(count)
    if (html) stackEl.insertAdjacentHTML('beforeend', html)
  }

  /**
   * Merge badge only shows for `LEVEL_UP_PLAYER_40/70` stacks with 2+ cards.
   * When the stack shrinks below that, drop the badge and flip the dataset
   * so a future click doesn't trigger the merge dialog.
   * @param {HTMLElement} stackEl
   * @param {string} actionType
   * @param {number} count
   * @returns {void}
   */
  _patchMergeBadge (stackEl, actionType, count) {
    const canMerge = MERGEABLE_ACTIONS.has(actionType) && count > 1
    stackEl.dataset.canMerge = String(canMerge)
    const badge = stackEl.querySelector('.action-card-merge-badge')
    if (canMerge) {
      if (!badge) stackEl.insertAdjacentHTML('beforeend', `<span class="action-card-merge-badge">${t('actionCards.mergeable')}</span>`)
    } else {
      badge?.remove()
    }
  }

  /**
   * Every `data-action-card` on a live stack has to point at the first card
   * of that action type in `this.cards`. Splicing above shifted positions,
   * so recompute from the (now-current) array instead of tracking deltas.
   * @returns {void}
   */
  _recomputeStackClickTargets () {
    const root = el(this._elementQuery)
    if (!root) return
    root.querySelectorAll('.action-card-stack').forEach(s => {
      const actionType = s.dataset.actionType
      if (!actionType) return
      const newIdx = this.cards.findIndex(c => c.action === actionType)
      if (newIdx >= 0) s.dataset.actionCard = String(newIdx)
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
    if (actionCard.action === 'SPY') {
      await this._handleSpyCard(actionCard, cardIndex)
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
      // Re-arm `_processing` here — `_useActionCard` released it as soon as
      // this handler opened the overlay and returned. Without the re-arm the
      // ACTION_CARDS_CHANGED server event emitted by `useActionCard` below
      // would trigger a full `update(true)` and wipe the surgical stack diff.
      this._processing = true
      try {
        await server.useActionCard(actionCard, player, null)
        this._overlay?.remove()
        toast(t('actionCards.fitnessBoost', { playerName: player.name }), 'success')
        await this._animateAndRemoveCard(cardIndex)
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong...', 'error')
      } finally {
        this._processing = false
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
      this._processing = true
      try {
        await server.useActionCard(actionCard, player, null)
        this._overlay?.remove()
        toast(t('actionCards.levelUpSuccess', { playerName: player.name }), 'success')
        await this._animateAndRemoveCard(cardIndex)
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong...', 'error')
      } finally {
        this._processing = false
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
      this._processing = true
      try {
        await server.useActionCard(actionCard, player, null)
        this._overlay?.remove()
        toast(t('actionCards.starPlayerSuccess', { playerName: player.name }), 'success')
        await this._animateAndRemoveCard(cardIndex)
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong...', 'error')
      } finally {
        this._processing = false
      }
    })
    this._overlay = showOverlay(
      t('actionCards.selectPlayer'),
      t('actionCards.whichPlayerStar'),
      `${playerList}`
    )
  }

  /**
   * Spy card: open the target-team picker overlay, which consumes the card and
   * reveals the opponent's tactics + lineup. Only remove the card locally once
   * the overlay confirms it was actually spent.
   * @param {Object} actionCard
   * @param {number} cardIndex
   * @returns {Promise<void>}
   */
  async _handleSpyCard (actionCard, cardIndex) {
    const consumed = await showSpyOverlay({
      onConfirm: async () => {
        // Block the ACTION_CARDS_CHANGED refetch until the local animation runs.
        this._processing = true
        await server.useActionCard(actionCard, null, null)
      }
    })
    if (consumed) {
      await this._animateAndRemoveCard(cardIndex)
    }
    this._processing = false
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
        this._processing = true
        try {
          await server.useActionCard(actionCard, option, null)
          this._overlay?.remove()
          toast(t('actionCards.youthSignedSuccess', { playerName: option.name }), 'success')
          await this._animateAndRemoveCard(cardIndex)
        } catch (e) {
          console.error(e)
          toast(e.message ?? 'Something went wrong...', 'error')
        } finally {
          this._processing = false
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
