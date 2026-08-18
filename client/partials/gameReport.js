import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { renderCollapsibleCard, toggleCollapsibleCard } from '../lib/collapsibleCard.js'
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
    // Like the other cards in the game details overlay the report starts
    // folded; the state has to survive this element's own re-renders, so it
    // lives here and not only as a DOM class.
    /** @type {boolean} */
    this.isCollapsed = true
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
      return this._card(`
            <div class="ui-element-loading-ball-wrapper">
              <div class="ui-element-loading-ball"><img src="assets/ball.svg" alt=""/></div>
              <div class="ui-element-loading-shadow"></div>
            </div>
            <p class="text-muted mb-0 mt-3">${t('gameReport.generating')}</p>
      `, 'card-body text-center game-report-loading')
    }

    if (this.reportText) {
      const paragraphs = this.reportText
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => `<p>${_escapeHtml(p)}</p>`)
        .join('')
      return this._card(`
            ${paragraphs}
            <p class="text-muted small mb-0 game-report-disclaimer">${t('gameReport.disclaimer')}</p>
      `, 'card-body game-report-body')
    }

    return this._card(`
          <p class="text-muted">${t('gameReport.intro')}</p>
          ${this.errorMessage ? `<div class="alert alert-warning py-2">${_escapeHtml(this.errorMessage)}</div>` : ''}
          <button class="btn btn-info game-report-generate">
            <i class="fa fa-magic me-2"></i>${t('gameReport.generate')}
          </button>
    `, 'card-body text-center')
  }

  get events () {
    return {
      // Optional: the hidden placeholder state renders no card at all.
      // Toggling only flips a DOM class, but the flag has to be remembered so
      // a later update() (generation finished) keeps the card open.
      '(optional).collapsible-card-toggle': {
        click: (event) => {
          const collapsed = toggleCollapsibleCard(event)
          if (collapsed !== null) this.isCollapsed = collapsed
        }
      },
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
  /**
   * Wrap one of the three body states into the collapsible report card.
   * @param {string} body
   * @param {string} bodyClass
   * @returns {string}
   */
  _card (body, bodyClass) {
    return renderCollapsibleCard({
      title: t('gameReport.title'),
      icon: 'fa-magic',
      cardClass: 'mb-3 game-report',
      collapsed: this.isCollapsed,
      bodyClass,
      body
    })
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
