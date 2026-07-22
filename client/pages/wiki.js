import { server, showServerError } from '../lib/gateway.js'
import { UIElement } from '../lib/UIElement.js'
import { getLocale, t } from '../i18n/index.js'
import { el, generateId } from '../lib/html.js'
import { linkifyHtml } from '../lib/linkify.js'
import { showOverlay } from '../partials/overlay.js'
import { getQueryParams, setQueryParams } from '../lib/router.js'

function escapeHtml (text) {
  const div = document.createElement('div')
  div.textContent = text ?? ''
  return div.innerHTML
}

function isMobileViewport () {
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 767.98px)').matches
}

/**
 * Build the URL for a stored wiki image filename (#441). Uses the native
 * server prefix so images load inside the iOS/Android WebView too.
 * @param {string} filename
 * @returns {string}
 */
export function wikiImageUrl (filename) {
  return `${window.__NATIVE_SERVER_URL || ''}/uploads/wiki/${encodeURIComponent(filename)}`
}

/**
 * Public, multilingual wiki page (#441). A persistent sidebar lists every
 * entry (with a search filter); selecting one shows its detail on the right
 * on desktop, or in the shared showOverlay modal on mobile. The selected
 * entry is carried in the `id` query param so it is linkable.
 */
export class WikiPage extends UIElement {
  async load () {
    this._searchId = this._searchId || generateId()
    try {
      const { entries } = await server.getWikiEntries(getLocale())
      this._entries = entries || []
    } catch (e) {
      showServerError(e)
      this._entries = []
    }
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
    const idParam = params.get('id')
    const mobile = isMobileViewport()
    // Desktop pre-selects the first entry so the right column is populated.
    // Mobile skips pre-selection: the first tap would otherwise be a no-op
    // in onQueryChanged (newId === _selectedId) and never open the overlay.
    this._selectedId = idParam
      ? Number(idParam)
      : (mobile ? null : (this._entries[0]?.id ?? null))
    await this._loadEntry(this._selectedId)
    if (mobile && this._selectedId) this._openDetailOverlay()
  }
  get template () {
    return `
      <div class="wiki-page">
        <h2 class="mb-4">${t('wiki.title')}</h2>
        <div class="row g-4">
          <div class="col-12 col-md-4 col-lg-3">
            <div class="wiki-sidebar">
              <input type="search" id="${this._searchId}" class="form-control form-control-sm mb-3 wiki-search"
                placeholder="${t('wiki.searchPlaceholder')}" value="${escapeHtml(this._filter)}">
              <div class="wiki-list">${this._renderList()}</div>
            </div>
          </div>
          <div class="col-12 col-md-8 col-lg-9 wiki-content-col">
            <div class="wiki-content">${this._renderContent()}</div>
          </div>
        </div>
        <div id="${this._imageOverlayId}" class="wiki-image-overlay" hidden>
          <img id="${this._overlayImgId}" src="" alt="">
        </div>
      </div>
    `
  }
  get events () {
    return {
      [`#${this._searchId}`]: {
        input: (e) => {
          this._filter = e.target.value || ''
          const list = el(`${this._elementQuery} .wiki-list`)
          if (list) list.innerHTML = this._renderList()
        }
      },
      '.wiki-content': {
        click: (e) => this._openImageLightbox(e)
      },
      [`#${this._imageOverlayId}`]: {
        click: () => {
          const overlay = el(`${this._elementQuery} #${this._imageOverlayId}`)
          if (overlay) overlay.hidden = true
        }
      }
    }
  }
  /**
   * @param {{id?: string|number}} params
   * @returns {Promise<void>}
   */
  async onQueryChanged ({ id }) {
    const newId = id ? Number(id) : null
    if (newId === this._selectedId) return
    this._selectedId = newId
    await this._loadEntry(newId)
    const content = el(`${this._elementQuery} .wiki-content`)
    if (content) content.innerHTML = this._renderContent()
    const list = el(`${this._elementQuery} .wiki-list`)
    if (list) list.innerHTML = this._renderList()
    if (!isMobileViewport()) return
    // showOverlay's header is baked in at create time — switching entries
    // means close+reopen. Suppress the URL update on close so the removal
    // doesn't wipe the id we just navigated to.
    this._closeDetailOverlay({ suppressUrlUpdate: true })
    if (newId) this._openDetailOverlay()
  }
  showLoadingIndicator = true

  /**
   * Open the loaded wiki entry in the shared showOverlay modal.
   * @private
   */
  _openDetailOverlay () {
    if (!this._entry) return
    const bodyId = generateId()
    const overlay = showOverlay(
      escapeHtml(this._entry.title),
      escapeHtml(this._entry.subtitle || ''),
      `<div id="${bodyId}" class="wiki-content wiki-detail-body">${this._renderContent(false)}</div>`
    )
    this._detailOverlay = overlay
    // The standard overlay mounts to document.body, outside _elementQuery,
    // so the page's delegated '.wiki-content' click handler doesn't reach
    // images inside it — bind a dedicated listener on the overlay body.
    const bodyEl = document.getElementById(bodyId)
    if (bodyEl) bodyEl.addEventListener('click', (e) => this._openImageLightbox(e))
    this._closeOverlayOnNavigation(overlay)
    overlay.onClose(() => {
      // A programmatic close (entry switch) nulls _detailOverlay first, so
      // the stale onClose from the old overlay skips the URL update.
      if (this._detailOverlay !== overlay) return
      this._detailOverlay = null
      if (getQueryParams().id) setQueryParams({ id: null })
    })
  }

  /**
   * @param {{suppressUrlUpdate?: boolean}} [opts]
   * @private
   */
  _closeDetailOverlay (opts = {}) {
    const overlay = this._detailOverlay
    if (!overlay) return
    this._detailOverlay = null
    overlay.remove()
    if (!opts.suppressUrlUpdate && getQueryParams().id) setQueryParams({ id: null })
  }

  /**
   * Remove the overlay when the user leaves the wiki page — a pure
   * query-param change on this page keeps the overlay so entry switches
   * animate in place.
   * @param {{onClose: (cb: () => void) => void, remove: () => void}} overlay
   * @private
   */
  _closeOverlayOnNavigation (overlay) {
    const startPath = window.location.hash.split('?')[0]
    const handler = () => {
      if (window.location.hash.split('?')[0] !== startPath) overlay.remove()
    }
    window.addEventListener('hashchange', handler)
    overlay.onClose(() => window.removeEventListener('hashchange', handler))
  }

  /**
   * Open the clicked wiki image in the full-screen lightbox (#441).
   * @param {Event} e
   */
  _openImageLightbox (e) {
    const img = e.target.closest('img.wiki-image')
    if (!img) return
    const overlay = el(`${this._elementQuery} #${this._imageOverlayId}`)
    const overlayImg = el(`${this._elementQuery} #${this._overlayImgId}`)
    if (overlay && overlayImg) {
      overlayImg.src = img.src
      overlay.hidden = false
    }
  }

  async _loadEntry (id) {
    this._entry = null
    if (!id) return
    try {
      const { entry } = await server.getWikiEntry(id)
      this._entry = entry
    } catch (e) {
      showServerError(e)
    }
  }

  _renderList () {
    const filter = (this._filter || '').trim().toLowerCase()
    const filtered = this._entries.filter(e =>
      !filter ||
      (e.title || '').toLowerCase().includes(filter) ||
      (e.subtitle || '').toLowerCase().includes(filter)
    )
    if (filtered.length === 0) {
      return `<p class="text-muted small px-2">${t('wiki.empty')}</p>`
    }
    return filtered.map(e => `
      <a href="#dashboard?sub_page=wiki&id=${e.id}" class="wiki-list-item ${e.id === this._selectedId ? 'active' : ''}">
        <span class="wiki-list-item__title">${escapeHtml(e.title)}</span>
        ${e.subtitle ? `<span class="wiki-list-item__subtitle">${escapeHtml(e.subtitle)}</span>` : ''}
      </a>
    `).join('')
  }

  /**
   * @param {boolean} [includeHeader] - render title/subtitle inside the article. The
   *   overlay path passes false because showOverlay's own header already
   *   shows them and duplicating looks wrong.
   */
  _renderContent (includeHeader = true) {
    if (!this._entries.length) {
      return `<p class="text-muted">${t('wiki.noEntries')}</p>`
    }
    const entry = this._entry
    if (!entry) {
      return `<p class="text-muted">${t('wiki.selectEntry')}</p>`
    }
    const images = (entry.images || []).map(name =>
      `<img src="${wikiImageUrl(name)}" alt="${escapeHtml(entry.title)}" class="wiki-image" loading="lazy">`
    ).join('')
    const body = linkifyHtml(entry.text || '', (escaped) => escaped.replace(/\n/g, '<br>'))
    return `
      <article class="wiki-article">
        ${includeHeader ? `<h3 class="mb-1">${escapeHtml(entry.title)}</h3>` : ''}
        ${includeHeader && entry.subtitle ? `<p class="text-muted">${escapeHtml(entry.subtitle)}</p>` : ''}
        ${images ? `<div class="wiki-images mb-3">${images}</div>` : ''}
        <div class="wiki-text">${body}</div>
      </article>
    `
  }

  _entries = []
  _entry = null
  _selectedId = null
  _filter = ''
  _detailOverlay = null
  _imageOverlayId = generateId()
  _overlayImgId = generateId()
}
