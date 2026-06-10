import { showOverlay } from './overlay.js'
import { server } from '../lib/gateway.js'
import { toast } from './toast.js'
import { t } from '../i18n/index.js'
import { flagUrl } from '../util/worldCup.js'
import { el, generateId } from '../lib/html.js'

/**
 * Open an overlay listing every WM game (group + knockout) chronologically.
 * Includes inline bet buttons so the user can still tip from the expanded view.
 *
 * @returns {Promise<void>}
 */
export async function showWorldCupGroupStageOverlay () {
  let games = []
  try {
    const res = await server.getWorldCupAllGames()
    games = res.games || []
  } catch (e) {
    toast(e.message || t('toast.somethingWentWrong'), 'error')
    return
  }

  const listId = generateId()
  const content = `<div id="${listId}">${games.map(g => renderRow(g)).join('')}</div>`
  const overlay = showOverlay(t('worldCup.allGamesOverlayTitle'), t('worldCup.allGamesOverlaySubtitle'), content)

  await new Promise(resolve => {
    overlay.onClose(resolve)

    // Wire up bet buttons via event delegation; the overlay container is
    // inserted at document.body so we can attach immediately.
    setTimeout(() => {
      const root = el('#' + listId)
      if (!root) return
      root.addEventListener('click', async (e) => {
        const btn = e.target.closest('.wc-overlay-bet-btn')
        if (!btn) return
        const gameId = Number(btn.dataset.gameId)
        const prediction = btn.dataset.prediction
        if (!gameId || !prediction) return
        btn.disabled = true
        try {
          await server.placeWorldCupBet(gameId, prediction)
          toast(t('worldCup.betSaved'), 'success')
          // Visually mark this prediction as active and others as inactive
          const row = btn.closest('.wc-overlay-game')
          row?.querySelectorAll('.wc-overlay-bet-btn').forEach(b => {
            b.classList.toggle('btn-info', b.dataset.prediction === prediction)
            b.classList.toggle('btn-outline-secondary', b.dataset.prediction !== prediction)
          })
        } catch (err) {
          toast(err.message || t('toast.somethingWentWrong'), 'error')
        } finally {
          btn.disabled = false
        }
      })
    }, 0)
  })
}

function renderRow (g) {
  const localKickoff = new Date(g.kickoff).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  const isBettingOpen = !g.hasKickedOff
  const resultText = g.isPlayed ? `${g.goalsTeam1} : ${g.goalsTeam2}` : ''
  const correctness = g.isPlayed && g.myPrediction
    ? (g.myBetCorrect
      ? `<span class="badge bg-success ms-2">${t('worldCup.correct')}</span>`
      : `<span class="badge bg-danger ms-2">${t('worldCup.wrong')}</span>`)
    : ''

  const betBtn = (prediction, label) => {
    const isActive = g.myPrediction === prediction
    return `
      <button type="button"
              class="btn btn-sm wc-overlay-bet-btn ${isActive ? 'btn-info' : 'btn-outline-secondary'}"
              data-game-id="${g.id}"
              data-prediction="${prediction}">${label}</button>
    `
  }

  return `
    <div class="wc-overlay-game border rounded p-2 mb-2">
      <div class="d-flex small text-muted mb-1">
        <span><i class="fa fa-clock-o"></i> ${localKickoff}</span>
      </div>
      <div class="d-flex align-items-center justify-content-between">
        <div class="d-flex align-items-center gap-2">
          <img src="${flagUrl(g.team1Code, 40)}" alt="${g.team1Name}" class="wc-flag-thumb">
          <span class="fw-bold">${g.team1Name}</span>
        </div>
        <div class="fw-bold">
          ${g.isPlayed ? resultText : '<span class="text-muted">vs</span>'}
          ${correctness}
        </div>
        <div class="d-flex align-items-center gap-2">
          <span class="fw-bold">${g.team2Name}</span>
          <img src="${flagUrl(g.team2Code, 40)}" alt="${g.team2Name}" class="wc-flag-thumb">
        </div>
      </div>
      <div class="d-flex gap-2 mt-2">
        ${isBettingOpen
    ? `${betBtn('team_1', t('worldCup.betWin1'))}${betBtn('draw', t('worldCup.betDraw'))}${betBtn('team_2', t('worldCup.betWin2'))}`
    : `<span class="small text-muted">${t('worldCup.bettingClosed')}</span>`}
      </div>
    </div>
  `
}
