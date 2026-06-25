import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { el, generateId } from '../../lib/html.js'
import { t } from '../../i18n/index.js'
import { showConfirmDialog } from '../../partials/overlay.js'
import { wikiImageUrl } from '../wiki.js'

const LOCALES = ['en', 'de']
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export class WikiAdminPage extends UIElement {
  async load () {
    const { entries } = await server.getAllWikiEntries()
    this._entries = entries || []
  }

  get template () {
    return `
      <div>
        <h4>${t('admin.wikiTitle')}</h4>
        <p class="text-muted">${t('admin.wikiDescription')}</p>
        ${this._renderForm()}
        ${this._renderList()}
      </div>
    `
  }

  get events () {
    return {
      [`#${this._saveBtnId}`]: { click: () => this._save() },
      [`(optional)#${this._cancelBtnId}`]: { click: () => this._cancelEdit() },
      '(optional).wiki-edit-btn': { click: (e) => this._edit(Number(e.currentTarget.dataset.id)) },
      '(optional).wiki-delete-btn': { click: (e) => this._delete(Number(e.currentTarget.dataset.id)) },
      // Bound via the events map (re-applied on every update()) so the file
      // input keeps working after the form re-renders when editing (#441).
      [`#${this._fileInputId}`]: { change: (e) => this._onFilesSelected(e) },
      // Delegated remove handler on the (stable) preview container, so it
      // survives surgical innerHTML refreshes of the previews.
      [`#${this._previewId}`]: { click: (e) => this._onPreviewClick(e) }
    }
  }

  _onPreviewClick (e) {
    const btn = e.target.closest('.wiki-img-remove')
    if (!btn) return
    if (btn.dataset.existing) {
      this._currentImages = this._currentImages.filter(f => f !== btn.dataset.existing)
    } else if (btn.dataset.pending != null) {
      this._pendingImages.splice(Number(btn.dataset.pending), 1)
    }
    this._refreshImagePreviews()
  }

  _renderForm () {
    const e = this._editing || {}
    const localeOptions = LOCALES.map(l =>
      `<option value="${l}" ${e.locale === l ? 'selected' : ''}>${l.toUpperCase()}</option>`
    ).join('')
    return `
      <div class="card card-body mb-4">
        <h5>${this._editing ? t('admin.wikiEditEntry') : t('admin.wikiNewEntry')}</h5>
        <div class="row g-2">
          <div class="col-6 col-md-3">
            <label class="form-label">${t('admin.wikiLocale')}</label>
            <select id="${this._localeId}" class="form-control">${localeOptions}</select>
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label">${t('admin.wikiSortOrder')}</label>
            <input type="number" id="${this._sortId}" class="form-control" value="${e.sort_order ?? 0}">
          </div>
          <div class="col-12">
            <label class="form-label">${t('admin.wikiEntryTitle')}</label>
            <input type="text" id="${this._titleId}" class="form-control" value="${(e.title ?? '').replace(/"/g, '&quot;')}" maxlength="255">
          </div>
          <div class="col-12">
            <label class="form-label">${t('admin.wikiSubtitle')}</label>
            <input type="text" id="${this._subtitleId}" class="form-control" value="${(e.subtitle ?? '').replace(/"/g, '&quot;')}" maxlength="255">
          </div>
          <div class="col-12">
            <label class="form-label">${t('admin.wikiText')}</label>
            <textarea id="${this._textId}" class="form-control" rows="8">${e.text ?? ''}</textarea>
          </div>
          <div class="col-12">
            <label class="form-label">${t('admin.wikiImages')}</label>
            <input type="file" id="${this._fileInputId}" class="form-control" accept="image/png,image/jpeg,image/gif,image/webp" multiple>
            <div id="${this._previewId}" class="wiki-image-previews">${this._renderImagePreviews()}</div>
          </div>
        </div>
        <div class="mt-3">
          <button id="${this._saveBtnId}" class="btn btn-info">
            <i class="fa fa-save"></i> ${this._editing ? t('admin.wikiUpdate') : t('admin.wikiCreate')}
          </button>
          ${this._editing ? `<button id="${this._cancelBtnId}" class="btn btn-outline-secondary ms-2">${t('dialog.cancel')}</button>` : ''}
        </div>
      </div>
    `
  }

  _renderImagePreviews () {
    const existing = this._currentImages.map(f => `
      <div class="wiki-image-preview">
        <img src="${wikiImageUrl(f)}" alt="">
        <button type="button" class="wiki-img-remove" data-existing="${this._escape(f)}" aria-label="remove">&times;</button>
      </div>
    `).join('')
    const pending = this._pendingImages.map((img, i) => `
      <div class="wiki-image-preview">
        <img src="${img.data}" alt="">
        <button type="button" class="wiki-img-remove" data-pending="${i}" aria-label="remove">&times;</button>
      </div>
    `).join('')
    return existing + pending
  }

  _refreshImagePreviews () {
    const preview = el(`#${this._previewId}`)
    if (preview) preview.innerHTML = this._renderImagePreviews()
  }

  _onFilesSelected (event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) continue
      const reader = new FileReader()
      reader.onload = () => {
        this._pendingImages.push({ data: reader.result, type: file.type })
        this._refreshImagePreviews()
      }
      reader.readAsDataURL(file)
    }
  }

  _renderList () {
    if (this._entries.length === 0) {
      return `<p class="text-muted">${t('admin.wikiEmpty')}</p>`
    }
    const rows = this._entries.map(e => `
      <tr>
        <td><span class="badge bg-secondary">${(e.locale || '').toUpperCase()}</span></td>
        <td>${e.sort_order}</td>
        <td>${this._escape(e.title)}</td>
        <td>${this._escape(e.subtitle || '')}</td>
        <td class="text-nowrap">
          <button class="btn btn-sm btn-outline-info wiki-edit-btn" data-id="${e.id}"><i class="fa fa-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger wiki-delete-btn" data-id="${e.id}"><i class="fa fa-trash"></i></button>
        </td>
      </tr>
    `).join('')
    return `
      <div class="horizontal-scrollable-table">
        <table class="table table-sm table-hover mb-0">
          <thead><tr>
            <th>${t('admin.wikiLocale')}</th>
            <th>${t('admin.wikiSortOrder')}</th>
            <th>${t('admin.wikiEntryTitle')}</th>
            <th>${t('admin.wikiSubtitle')}</th>
            <th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `
  }

  _escape (text) {
    const div = document.createElement('div')
    div.textContent = text ?? ''
    return div.innerHTML
  }

  _readForm () {
    return {
      locale: document.getElementById(this._localeId).value,
      title: document.getElementById(this._titleId).value,
      subtitle: document.getElementById(this._subtitleId).value,
      text: document.getElementById(this._textId).value,
      sortOrder: Number(document.getElementById(this._sortId).value) || 0
    }
  }

  async _save () {
    const f = this._readForm()
    if (!f.title.trim() || !f.text.trim()) {
      toast(t('admin.wikiMissingFields'), 'error')
      return
    }
    // Existing filenames (kept) + newly uploaded base64 images.
    const images = [...this._currentImages, ...this._pendingImages.map(p => ({ data: p.data, type: p.type }))]
    try {
      if (this._editing) {
        await server.updateWikiEntry(this._editing.id, f.locale, f.title, f.subtitle, f.text, images, f.sortOrder)
        toast(t('admin.wikiUpdated'), 'success')
      } else {
        await server.createWikiEntry(f.locale, f.title, f.subtitle, f.text, images, f.sortOrder)
        toast(t('admin.wikiCreated'), 'success')
      }
      this._resetForm()
      await this.update(true)
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    }
  }

  _edit (id) {
    this._editing = this._entries.find(e => e.id === id) || null
    this._currentImages = Array.isArray(this._editing?.images) ? [...this._editing.images] : []
    this._pendingImages = []
    this.update()
  }

  _cancelEdit () {
    this._resetForm()
    this.update()
  }

  _resetForm () {
    this._editing = null
    this._currentImages = []
    this._pendingImages = []
  }

  async _delete (id) {
    if (!(await showConfirmDialog(t('admin.wikiDeleteConfirm'), t('admin.wikiDelete'), t('dialog.cancel')))) return
    try {
      await server.deleteWikiEntry(id)
      toast(t('admin.wikiDeleted'), 'success')
      if (this._editing?.id === id) this._resetForm()
      await this.update(true)
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    }
  }

  _entries = []
  _editing = null
  _currentImages = []
  _pendingImages = []
  _localeId = generateId()
  _titleId = generateId()
  _subtitleId = generateId()
  _textId = generateId()
  _fileInputId = generateId()
  _previewId = generateId()
  _sortId = generateId()
  _saveBtnId = generateId()
  _cancelBtnId = generateId()
}
