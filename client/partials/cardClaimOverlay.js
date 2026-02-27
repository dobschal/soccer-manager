import { generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { server } from '../lib/gateway.js'
import { delay } from '../lib/delay.js'
import { t } from '../i18n/index.js'

const ACTION_CARD_IMAGES = {
  LEVEL_UP_PLAYER_100: 'assets/action-cards/level-up-player-10.svg',
  LEVEL_UP_PLAYER_70: 'assets/action-cards/level-up-player-7.svg',
  LEVEL_UP_PLAYER_40: 'assets/action-cards/level-up-player-4.svg',
  CHANGE_PLAYER_POSITION: 'assets/action-cards/change-player-position.svg',
  NEW_YOUTH_PLAYER: 'assets/action-cards/new-youth-player.svg',
  FRESHNESS_5: 'assets/action-cards/freshness-5.svg',
  FRESHNESS_10: 'assets/action-cards/freshness-10.svg',
  FRESHNESS_20: 'assets/action-cards/freshness-20.svg',
  BONUS_100K: 'assets/action-cards/bonus-100k.svg'
}

/**
 * @returns {Object.<string, string>}
 */
function getActionCardTitles () {
  return {
    LEVEL_UP_PLAYER_100: t('actionCards.type.legendaryMastery'),
    LEVEL_UP_PLAYER_70: t('actionCards.type.epicAdvancement'),
    LEVEL_UP_PLAYER_40: t('actionCards.type.basicPromotion'),
    CHANGE_PLAYER_POSITION: t('actionCards.type.tacticalShift'),
    NEW_YOUTH_PLAYER: t('actionCards.type.youthProspect'),
    FRESHNESS_5: t('actionCards.type.quickRecovery'),
    FRESHNESS_10: t('actionCards.type.energyBoost'),
    FRESHNESS_20: t('actionCards.type.fullRecovery'),
    BONUS_100K: t('actionCards.type.cashBonus')
  }
}

/**
 * Shows a sequential card claim overlay for pending action cards
 * @param {Array} pendingCards - Array of pending action card objects
 * @returns {Promise<void>}
 */
export async function showCardClaimOverlay (pendingCards) {
  const state = { skipped: false }
  for (let i = 0; i < pendingCards.length; i++) {
    if (state.skipped) break
    const remainingCards = pendingCards.slice(i)
    await _showSingleCardClaim(pendingCards[i], remainingCards, state)
  }
}

/**
 * Shows a single card claim with flip animation
 * @param {Object} card - Pending action card
 * @param {Array} remainingCards - All remaining unclaimed cards (including current)
 * @param {{ skipped: boolean }} state - Shared state for skip signaling
 * @returns {Promise<void>}
 */
function _showSingleCardClaim (card, remainingCards, state) {
  return new Promise((resolve) => {
    const overlayId = generateId()
    const flipContainerId = generateId()
    const hintId = generateId()
    const titleId = generateId()
    const skipBtnId = generateId()

    const cardImage = ACTION_CARD_IMAGES[card.action] || 'assets/action-cards/level-up-player-4.svg'
    const cardTitle = getActionCardTitles()[card.action] || 'Action Card'

    const html = `
      <div id="${overlayId}" class="card-claim-overlay">
        <div id="${flipContainerId}" class="card-claim-flip-container">
          <div class="card-claim-flipper">
            <div class="card-claim-front">
              <img src="assets/action-cards/card-back.svg" alt="Card back">
            </div>
            <div class="card-claim-back">
              <img src="${cardImage}" alt="${cardTitle}">
            </div>
          </div>
        </div>
        <div id="${hintId}" class="card-claim-hint">${t('actionCards.claim.tapToReveal')}</div>
        <div id="${titleId}" class="card-claim-title" style="display: none;">${cardTitle}</div>
        <button id="${skipBtnId}" class="card-claim-skip-btn">${t('actionCards.claim.skip')}</button>
      </div>
    `

    document.body.insertAdjacentHTML('beforeend', html)

    let claimed = false

    onClick('#' + skipBtnId, async () => {
      if (claimed) return
      claimed = true
      state.skipped = true

      // Claim all remaining cards at once
      await Promise.all(remainingCards.map(c =>
        server.claimActionCard(c.id).catch(e => console.error('Failed to claim card:', e))
      ))

      const overlay = document.getElementById(overlayId)
      if (overlay) overlay.remove()
      resolve()
    })

    onClick('#' + flipContainerId, async () => {
      if (claimed) return
      claimed = true

      try {
        await server.claimActionCard(card.id)
      } catch (e) {
        console.error('Failed to claim card:', e)
      }

      const container = document.getElementById(flipContainerId)
      const hint = document.getElementById(hintId)
      const title = document.getElementById(titleId)

      if (container) container.classList.add('flipped')
      if (hint) hint.classList.add('hidden')
      if (title) title.style.display = ''

      await delay(2000)

      const overlay = document.getElementById(overlayId)
      if (overlay) {
        overlay.classList.add('fade-out')
        overlay.addEventListener('animationend', () => {
          overlay.remove()
          resolve()
        }, { once: true })
      } else {
        resolve()
      }
    })
  })
}
