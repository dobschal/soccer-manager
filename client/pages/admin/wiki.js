import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { generateId } from '../../lib/html.js'
import { t } from '../../i18n/index.js'
import { showConfirmDialog } from '../../partials/overlay.js'

const LOCALES = ['en', 'de']

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
      '(optional).wiki-delete-btn': { click: (e) => this._delete(Number(e.currentTarget.dataset.id)) }
    }
  }

  _renderForm () {
    const e = this._editing || {}
    const localeOptions = LOCALES.map(l =>
      `<option value="${l}" ${e.locale === l ? 'selected' : ''}>${l.toUpperCase()}</option>`
    ).join('')
    const images = Array.isArray(e.images) ? e.images.join('\n') : ''
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
            <textarea id="${this._imagesId}" class="form-control" rows="3" placeholder="${t('admin.wikiImagesPlaceholder')}">${images}</textarea>
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
      images: document.getElementById(this._imagesId).value,
      sortOrder: Number(document.getElementById(this._sortId).value) || 0
    }
  }

  async _save () {
    const f = this._readForm()
    if (!f.title.trim() || !f.text.trim()) {
      toast(t('admin.wikiMissingFields'), 'error')
      return
    }
    try {
      if (this._editing) {
        await server.updateWikiEntry(this._editing.id, f.locale, f.title, f.subtitle, f.text, f.images, f.sortOrder)
        toast(t('admin.wikiUpdated'), 'success')
      } else {
        await server.createWikiEntry(f.locale, f.title, f.subtitle, f.text, f.images, f.sortOrder)
        toast(t('admin.wikiCreated'), 'success')
      }
      this._editing = null
      await this.update(true)
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    }
  }

  _edit (id) {
    this._editing = this._entries.find(e => e.id === id) || null
    this.update()
  }

  _cancelEdit () {
    this._editing = null
    this.update()
  }

  async _delete (id) {
    if (!(await showConfirmDialog(t('admin.wikiDeleteConfirm'), t('admin.wikiDelete'), t('dialog.cancel')))) return
    try {
      await server.deleteWikiEntry(id)
      toast(t('admin.wikiDeleted'), 'success')
      if (this._editing?.id === id) this._editing = null
      await this.update(true)
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    }
  }

  _entries = []
  _editing = null
  _localeId = generateId()
  _titleId = generateId()
  _subtitleId = generateId()
  _textId = generateId()
  _imagesId = generateId()
  _sortId = generateId()
  _saveBtnId = generateId()
  _cancelBtnId = generateId()
}
