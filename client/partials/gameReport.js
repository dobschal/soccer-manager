import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { t } from '../i18n/index.js'

/**
 * AI-generated match report, shown above the match event ticker in the game
 * details overlay.
 *
 * Generation is opt-in per match: the first manager to press the button pays
 * for it, everyone else reads the stored result. `load()` therefore only asks
 * for an already-stored report and never triggers the model.
 */
export class GameReport extends UIElement {
  /**
   * @param {Object} params
   * @param {number} params.gameId
   */
  constructor (params) {
    super(params)
    /** @type {string|null} */
    this.reportText = null
    /** @type {boolean} */
    this.isGenerating = false
    /** @type {string|null} */
    this.errorMessage = null
    /** @type {boolean} */
    this.isAvailable = true
  }

  /**
   * @param {boolean} _isUpdate
   * @returns {Promise<void>}
   */
  async load (_isUpdate) {
    try {
      const { report, available } = await server.getGameReport(this.gameId)
      this.reportText = report?.text ?? null
      this.isAvailable = available
    } catch {
      // A failed lookup should never break the overlay — fall back to the
      // button and let the user decide whether to try generating.
      this.reportText = null
    }
  }

  get template () {
    // Nothing to show, but a UIElement must always render exactly one root
    // node — an empty string would blow up the render invariant.
    if (!this.isAvailable && !this.reportText) return '<div class="game-report-hidden"></div>'

    if (this.isGenerating) {
      return `
        <div class="card mb-3 game-report">
          <div class="card-header"><i class="fa fa-magic me-2"></i>${t('gameReport.title')}</div>
          <div class="card-body text-center game-report-loading">
            <div class="ui-element-loading-ball-wrapper">
              <div class="ui-element-loading-ball"><img src="assets/ball.svg" alt=""/></div>
              <div class="ui-element-loading-shadow"></div>
            </div>
            <p class="text-muted mb-0 mt-3">${t('gameReport.generating')}</p>
          </div>
        </div>
      `
    }

    if (this.reportText) {
      const paragraphs = this.reportText
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => `<p>${_escapeHtml(p)}</p>`)
        .join('')
      return `
        <div class="card mb-3 game-report">
          <div class="card-header"><i class="fa fa-magic me-2"></i>${t('gameReport.title')}</div>
          <div class="card-body game-report-body">
            ${paragraphs}
            <p class="text-muted small mb-0 game-report-disclaimer">${t('gameReport.disclaimer')}</p>
          </div>
        </div>
      `
    }

    return `
      <div class="card mb-3 game-report">
        <div class="card-header"><i class="fa fa-magic me-2"></i>${t('gameReport.title')}</div>
        <div class="card-body text-center">
          <p class="text-muted">${t('gameReport.intro')}</p>
          ${this.errorMessage ? `<div class="alert alert-warning py-2">${_escapeHtml(this.errorMessage)}</div>` : ''}
          <button class="btn btn-info game-report-generate">
            <i class="fa fa-magic me-2"></i>${t('gameReport.generate')}
          </button>
        </div>
      </div>
    `
  }
  get events () {
    return {
      // Only the initial/error state renders the button — the loading and the
      // finished report state don't, and update() re-applies the handlers.
      '(optional).game-report-generate': {
        click: async () => {
          if (this.isGenerating) return
          this.isGenerating = true
          this.errorMessage = null
          await this.update()
          try {
            const { report } = await server.createGameReport(this.gameId)
            this.reportText = report.text
          } catch (e) {
            this.errorMessage = e?.message || t('gameReport.error')
          } finally {
            this.isGenerating = false
            await this.update()
          }
        }
      }
    }
  }
  
}

/**
 * Model output is untrusted text — it lands in a template literal, so escape
 * it rather than letting a stray angle bracket become markup.
 * @param {string} text
 * @returns {string}
 */
function _escapeHtml (text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
