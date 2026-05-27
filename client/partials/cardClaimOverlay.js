import { generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { server } from '../lib/gateway.js'
import { fire } from '../lib/event.js'
import { t } from '../i18n/index.js'
import { preloadActionCardSvgs, renderActionCardSvg } from '../lib/actionCardSvg.js'

const ACTION_CARDS_CHANGED_EVENT = 'ACTION_CARDS_CHANGED'

/**
 * @returns {Object.<string, string>}
 */
function getActionCardTitles () {
  return {
    LEVEL_UP_PLAYER_100: t('actionCards.type.legendaryMastery'),
    LEVEL_UP_PLAYER_70: t('actionCards.type.epicAdvancement'),
    LEVEL_UP_PLAYER_40: t('actionCards.type.basicPromotion'),
    NEW_YOUTH_PLAYER: t('actionCards.type.youthProspect'),
    FRESHNESS_5: t('actionCards.type.quickRecovery'),
    FRESHNESS_10: t('actionCards.type.energyBoost'),
    FRESHNESS_20: t('actionCards.type.fullRecovery'),
    BONUS_100K: t('actionCards.type.cashBonus'),
    MOTIVATING_SPEECH: t('actionCards.type.motivatingSpeech')
  }
}

/**
 * Shows a sequential card claim overlay for pending action cards
 * @param {Array} pendingCards - Array of pending action card objects
 * @returns {Promise<void>}
 */
export async function showCardClaimOverlay (pendingCards) {
  await preloadActionCardSvgs(pendingCards.map(c => c.action))
  const state = { skipped: false, claimPromises: [] }
  for (let i = 0; i < pendingCards.length; i++) {
    if (state.skipped) break
    const remainingCards = pendingCards.slice(i)
    await _showSingleCardClaim(pendingCards[i], remainingCards, state, { autoReveal: i > 0 })
  }
  if (state.claimPromises.length > 0) {
    // Wait for the server to flip the cards from pending → received before
    // notifying listeners. Otherwise a refetch right now would still miss the
    // newly-claimed cards because `getActionCards` only returns received ones.
    await Promise.allSettled(state.claimPromises)
    fire(ACTION_CARDS_CHANGED_EVENT, null)
  }
}

/**
 * Shows a single card claim with flip animation
 * @param {Object} card - Pending action card
 * @param {Array} remainingCards - All remaining unclaimed cards (including current)
 * @param {{ skipped: boolean }} state - Shared state for skip signaling
 * @param {{ autoReveal?: boolean }} options - If autoReveal is true, the card flips automatically without waiting for a click
 * @returns {Promise<void>}
 */
function _showSingleCardClaim (card, remainingCards, state, { autoReveal = false } = {}) {
  return new Promise((resolve) => {
    const overlayId = generateId()
    const flipContainerId = generateId()
    const hintId = generateId()
    const titleId = generateId()
    const skipBtnId = generateId()

    const cardTitle = getActionCardTitles()[card.action] || 'Action Card'
    const cardSvg = renderActionCardSvg(card.action)

    const html = `
      <div id="${overlayId}" class="card-claim-overlay">
        <div id="${flipContainerId}" class="card-claim-flip-container">
          <div class="card-claim-flipper">
            <div class="card-claim-front">
              <img src="assets/action-cards/card-back.svg" alt="Card back">
            </div>
            <div class="card-claim-back">
              ${cardSvg}
            </div>
          </div>
        </div>
        <div id="${hintId}" class="card-claim-hint">${t(autoReveal ? 'actionCards.claim.tapToContinue' : 'actionCards.claim.tapToReveal')}</div>
        <div id="${titleId}" class="card-claim-title card-claim-title--hidden">${cardTitle}</div>
        <button id="${skipBtnId}" class="btn btn-secondary card-claim-skip-btn">${t('actionCards.claim.skip')}</button>
      </div>
    `

    document.body.insertAdjacentHTML('beforeend', html)

    let revealed = false
    let dismissed = false

    const reveal = () => {
      if (revealed || dismissed) return
      revealed = true

      const container = document.getElementById(flipContainerId)
      const hint = document.getElementById(hintId)
      const title = document.getElementById(titleId)

      if (container) container.classList.add('flipped')
      if (title) title.classList.remove('card-claim-title--hidden')
      if (hint) hint.textContent = t('actionCards.claim.tapToContinue')

      state.claimPromises.push(
        server.claimActionCard(card.id).catch(e => console.error('Failed to claim card:', e))
      )
    }

    const dismiss = () => {
      if (dismissed) return
      dismissed = true
      document.removeEventListener('keydown', onKeyDown)

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
    }

    const skip = async () => {
      if (dismissed) return
      dismissed = true
      state.skipped = true
      document.removeEventListener('keydown', onKeyDown)

      const skipClaims = remainingCards.map(c =>
        server.claimActionCard(c.id).catch(e => console.error('Failed to claim card:', e))
      )
      state.claimPromises.push(...skipClaims)
      await Promise.all(skipClaims)

      const overlay = document.getElementById(overlayId)
      if (overlay) overlay.remove()
      resolve()
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') skip()
    }
    document.addEventListener('keydown', onKeyDown)

    onClick('#' + skipBtnId, () => skip())

    onClick('#' + flipContainerId, () => {
      if (!revealed) {
        reveal()
      } else {
        dismiss()
      }
    })

    if (autoReveal) {
      // Defer until inserted node is laid out so the flip transition plays
      requestAnimationFrame(() => requestAnimationFrame(() => reveal()))
    }
  })
}
