import { generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { server } from '../lib/gateway.js'
import { t } from '../i18n/index.js'
import { toast } from './toast.js'
import { preloadActionCardSvgs, renderActionCardSvg } from '../lib/actionCardSvg.js'
import { actionCardLabel } from '../lib/actionCardLabels.js'

/**
 * Shows a sequential card claim overlay for pending action cards
 * @param {Array} pendingCards - Array of pending action card objects
 * @returns {Promise<void>}
 */
export async function showCardClaimOverlay (pendingCards) {
  await preloadActionCardSvgs(pendingCards.map(c => c.action))
  const state = { skipped: false, claimPromises: [], claimedIds: new Set() }
  for (let i = 0; i < pendingCards.length; i++) {
    if (state.skipped) break
    const remainingCards = pendingCards.slice(i)
    await _showSingleCardClaim(pendingCards[i], remainingCards, state, { autoReveal: i > 0 })
  }
  if (state.claimPromises.length > 0) {
    // Wait for the server to flip the cards from pending → received before
    // returning. Each `claimActionCard` call emits ACTION_CARDS_CHANGED itself,
    // so the dashboard ActionCards view will already have refetched by the
    // time this resolves — no client-side broadcast needed here.
    await Promise.allSettled(state.claimPromises)
  }
}

/**
 * Shows a single card claim with flip animation
 * @param {Object} card - Pending action card
 * @param {Array} remainingCards - All remaining unclaimed cards (including current)
 * @param {{ skipped: boolean, claimPromises: Array, claimedIds: Set<number> }} state - Shared state for skip signaling and claim bookkeeping
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

    const cardTitle = actionCardLabel(card.action)
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

      state.claimedIds.add(card.id)
      state.claimPromises.push(
        server.claimActionCard(card.id).catch(e => {
          // A rejected claim is usually the per-type hold limit being reached;
          // surface the server message so the user knows the card wasn't added.
          console.error('Failed to claim card:', e)
          toast(e.message ?? t('actionCards.claim.failed'), 'error')
        })
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

      const skipErrors = new Set()
      // The currently shown card may already be revealed (and therefore
      // claimed). Re-claiming it would fail with "already claimed" and show a
      // bogus error toast, so only claim what is still pending.
      const unclaimedCards = remainingCards.filter(c => !state.claimedIds.has(c.id))
      unclaimedCards.forEach(c => state.claimedIds.add(c.id))
      const skipClaims = unclaimedCards.map(c =>
        server.claimActionCard(c.id).catch(e => {
          console.error('Failed to claim card:', e)
          skipErrors.add(e.message ?? t('actionCards.claim.failed'))
        })
      )
      state.claimPromises.push(...skipClaims)
      await Promise.all(skipClaims)
      // Show each distinct failure once (e.g. the per-type limit message)
      // rather than one toast per rejected card.
      skipErrors.forEach(message => toast(message, 'error'))

      const overlay = document.getElementById(overlayId)
      if (overlay) overlay.remove()
      resolve()
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') skip()
    }
    document.addEventListener('keydown', onKeyDown)

    onClick('#' + skipBtnId, () => skip())

    // The whole overlay is the click target so tapping next to the card works
    // too — only the skip button keeps its own behaviour.
    onClick('#' + overlayId, (event) => {
      if (event?.target?.closest?.('.card-claim-skip-btn')) return
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
