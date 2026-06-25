import { server, showServerError } from '../lib/gateway.js'
import { UIElement } from '../lib/UIElement.js'
import { getLocale, t } from '../i18n/index.js'
import { el, generateId } from '../lib/html.js'
import { linkifyHtml } from '../lib/linkify.js'

function escapeHtml (text) {
  const div = document.createElement('div')
  div.textContent = text ?? ''
  return div.innerHTML
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
 * entry (with a search filter); selecting one shows its detail on the right.
 * The selected entry is carried in the `id` query param so it is linkable.
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
    this._selectedId = idParam ? Number(idParam) : (this._entries[0]?.id ?? null)
    await this._loadEntry(this._selectedId)
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
          <div class="col-12 col-md-8 col-lg-9">
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
      // Delegated on the stable content container so it survives surgical
      // innerHTML refreshes — open the clicked image in a lightbox (#441).
      '.wiki-content': {
        click: (e) => {
          const img = e.target.closest('img.wiki-image')
          if (!img) return
          const overlay = el(`${this._elementQuery} #${this._imageOverlayId}`)
          const overlayImg = el(`${this._elementQuery} #${this._overlayImgId}`)
          if (overlay && overlayImg) {
            overlayImg.src = img.src
            overlay.hidden = false
          }
        }
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
  }
  showLoadingIndicator = true
  
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

  _renderContent () {
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
        <h3 class="mb-1">${escapeHtml(entry.title)}</h3>
        ${entry.subtitle ? `<p class="text-muted">${escapeHtml(entry.subtitle)}</p>` : ''}
        ${images ? `<div class="wiki-images mb-3">${images}</div>` : ''}
        <div class="wiki-text">${body}</div>
      </article>
    `
  }

  _entries = []
  _entry = null
  _selectedId = null
  _filter = ''
  _imageOverlayId = generateId()
  _overlayImgId = generateId()
}
