import { server } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { StadiumCanvas } from './stadiumCanvas.js'
import { el, generateId } from '../lib/html.js'
import { euroFormat } from '../lib/currency.js'
import { toast } from './toast.js'
import { t } from '../i18n/index.js'

const STANDS = ['north', 'south', 'east', 'west', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw']

/**
 * Expand-stadium dialog.
 *
 * The user edits stand sizes / roofs and then explicitly asks for a
 * calculation. Only if the plan is valid does the overlay show a 3D preview of
 * the planned stadium together with price and construction time, plus the
 * button that actually commissions the build. Editing an input invalidates the
 * preview again, so price and animation always match what is in the form.
 *
 * @param {StadiumType} stadium - the current stadium
 * @param {TeamType} team
 * @param {Object} [constructionInfo] - per-stand construction state from `getStadium`
 * @param {() => void} [onConstructionStarted] - called after a build was commissioned
 * @returns {{onClose: (callback: () => void) => void, remove: () => void}}
 */
export function showStadiumExpandModal (stadium, team, constructionInfo = {}, onConstructionStarted) {
  const plan = { ...stadium }
  const formId = generateId()
  const calculateBtnId = generateId()
  const previewId = generateId()
  const buildBtnId = generateId()

  /** @type {StadiumCanvas|null} */
  let previewCanvas = null

  const overlay = showOverlay(
    t('stadium.expandStadium'),
    t('stadium.expandDesc'),
    `
      <form id="${formId}">
        <div class="row">
          ${STANDS.map(name => _renderStandFields(name, stadium, constructionInfo)).join('')}
        </div>
      </form>
      <p class="small text-muted">${t('stadium.roofCostHint')}</p>
      <button type="button" id="${calculateBtnId}" class="btn btn-outline-info w-100">
        ${t('stadium.calculateStadium')}
      </button>
      <div id="${previewId}" class="mt-3"></div>
    `
  )

  /**
   * Drop the preview (3D scene included) so a stale plan is never shown.
   */
  function clearPreview () {
    if (previewCanvas) {
      previewCanvas.onDestroy()
      previewCanvas = null
    }
    const previewEl = el('#' + previewId)
    if (previewEl) previewEl.innerHTML = ''
  }

  const formEl = el('#' + formId)
  formEl?.addEventListener('input', (event) => {
    const sizeInput = event.target.closest('[data-size-input]')
    const roofInput = event.target.closest('[data-roof-input]')
    if (sizeInput) {
      plan[sizeInput.dataset.sizeInput + '_stand_size'] = Number(sizeInput.value)
    } else if (roofInput) {
      plan[roofInput.dataset.roofInput + '_stand_roof'] = roofInput.checked ? 1 : 0
    } else {
      return
    }
    clearPreview()
  })

  el('#' + calculateBtnId)?.addEventListener('click', async () => {
    clearPreview()
    const previewEl = el('#' + previewId)
    if (!previewEl) return
    try {
      const { totalPrice, constructionTimes } = await server.calculateStadiumPrice(plan)
      const changes = Object.entries(constructionTimes ?? {}).filter(([, info]) => info && !info.blocked)
      const blocked = Object.entries(constructionTimes ?? {}).find(([, info]) => info?.blocked)
      if (blocked) {
        toast(blocked[1].message ?? t('stadium.makeChangesFirst'), 'error')
        return
      }
      if (changes.length === 0) {
        toast(t('stadium.makeChangesFirst'), 'error')
        return
      }
      // The preview is a showcase, not a toy: no user controls, the camera
      // orbits the planned stadium on its own.
      previewCanvas = new StadiumCanvas(plan, team, 'stadium-expand-canvas', {
        interactive: false,
        autoRotate: true
      })
      previewEl.innerHTML = `
        <div class="stadium-expand-preview">
          ${previewCanvas}
        </div>
        <p class="mt-3 mb-2">
          ${t('stadium.stadiumDesc', { seats: previewCanvas.calculateTotalSeats() })}
        </p>
        <p class="mb-2">
          ${t('stadium.totalPrice')} <strong>${euroFormat.format(totalPrice)}</strong>
        </p>
        <div class="alert alert-info">
          <strong>${t('stadium.constructionTimeEstimate')}</strong>
          <ul class="mb-0">${changes.map(([stand, info]) => _renderConstructionTime(stand, info)).join('')}</ul>
        </div>
        <button type="button" id="${buildBtnId}" class="btn btn-info w-100">
          ${t('stadium.commissionConstruction')}
        </button>
      `
      el('#' + buildBtnId)?.addEventListener('click', async () => {
        try {
          await server.buildStadium(plan)
          toast(t('stadium.constructionStarted'), 'success')
          overlay.remove()
          onConstructionStarted?.()
        } catch (e) {
          toast(e.message ?? t('toast.somethingWentWrong'), 'error')
        }
      })
    } catch (e) {
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    }
  })

  overlay.onClose(() => {
    if (previewCanvas) {
      previewCanvas.onDestroy()
      previewCanvas = null
    }
  })

  return overlay
}

/**
 * @param {string} name - stand key, e.g. 'corner_ne'
 * @param {StadiumType} stadium
 * @param {Object} constructionInfo
 * @returns {string}
 */
function _renderStandFields (name, stadium, constructionInfo) {
  const standInfo = constructionInfo?.[name]
  const underConstruction = standInfo?.underConstruction
  const remaining = standInfo?.remainingGameDays
  const targetSize = standInfo?.targetSize
  const disabledAttr = underConstruction ? 'disabled' : ''

  const targetLine = targetSize != null
    ? `<br><small>${t('stadium.constructionTargetSize', { seats: targetSize.toLocaleString() })}</small>`
    : ''

  const constructionBadge = underConstruction
    ? `<div class="alert alert-warning mt-2 py-2">
         <small>${remaining > 0 ? t('stadium.constructionRemaining', { days: remaining }) : t('stadium.constructionCompletesToday')}</small>${targetLine}
       </div>`
    : ''

  return `
    <div class="col-6 col-sm-3 mb-4">
      <div class="form-group">
        <label>${t('stadium.seatsOnStand', { stand: t('stadium.' + name) })}</label>
        <input data-size-input="${name}"
               class="form-control"
               type="number"
               value="${stadium[name + '_stand_size']}"
               ${disabledAttr}>
        <small class="form-text text-muted">${t('stadium.changeSeatsHint')}</small>
      </div>
      <div class="form-check">
        <label class="form-check-label">
          <input class="form-check-input"
                 data-roof-input="${name}"
                 type="checkbox"
                 ${stadium[name + '_stand_roof'] ? 'checked' : ''}
                 ${disabledAttr}>
              ${t('stadium.roofOnStand', { stand: t('stadium.' + name) })}
        </label>
      </div>
      ${constructionBadge}
    </div>
  `
}

/**
 * @param {string} stand
 * @param {{days: number, addingRoof?: boolean, extendingRoof?: boolean, removingRoof?: boolean}} info
 * @returns {string}
 */
function _renderConstructionTime (stand, info) {
  let details = info.days === 1
    ? t('stadium.gameDaysSingle', { days: info.days })
    : t('stadium.gameDaysPlural', { days: info.days })
  if (info.addingRoof) details += ' ' + t('stadium.includesRoof')
  else if (info.extendingRoof) details += ' ' + t('stadium.includesRoofExtension')
  else if (info.removingRoof) details += ' ' + t('stadium.includesRoofRemoval')
  return `<li><strong>${t('stadium.' + stand)}</strong>: ${details}</li>`
}
