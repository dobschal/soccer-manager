import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { generateId } from '../../lib/html.js'
import { t } from '../../i18n/index.js'
import { showConfirmDialog } from '../../partials/overlay.js'
import { flagUrl, stageLabel, allStages } from '../../util/worldCup.js'

/**
 * Format a UTC datetime string for an <input type="datetime-local"> control
 * using the user's local timezone.
 *
 * @param {string} utc
 * @returns {string}
 */
function toLocalInput (utc) {
  if (!utc) return ''
  const d = new Date(utc)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Read the value of an <input type="datetime-local"> and turn it into a UTC
 * ISO string ready to send to the server.
 *
 * @param {string} local
 * @returns {string|null}
 */
function fromLocalInput (local) {
  if (!local) return null
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export class WorldCupAdminPage extends UIElement {
  async load () {
    const [gamesRes, nationsRes] = await Promise.all([
      server.adminListWorldCupGames(),
      server.getWorldCupNations()
    ])
    this._games = gamesRes.games
    this._nations = nationsRes.nations
    this._editingId = null
  }

  get template () {
    return `
      <div>
        <h4 class="mb-3">${t('admin.worldCupTitle')}</h4>
        <p class="text-muted">${t('admin.worldCupDescription')}</p>

        ${this._renderForm()}

        <h5 class="mt-4 mb-2">${t('admin.worldCupExistingGames')}</h5>
        ${this._renderGamesTable()}

        <div class="mt-4 pt-3 border-top">
          <h5>${t('admin.worldCupConcludeTitle')}</h5>
          <p class="text-muted">${t('admin.worldCupConcludeDescription')}</p>
          <button id="${this._concludeBtnId}" class="btn btn-warning">
            <i class="fa fa-trophy" aria-hidden="true"></i> ${t('admin.worldCupConcludeButton')}
          </button>
        </div>
      </div>
    `
  }

  get events () {
    return {
      [`#${this._saveBtnId}`]: { click: () => this._saveGame() },
      [`(optional)#${this._cancelBtnId}`]: { click: () => this._cancelEdit() },
      [`#${this._concludeBtnId}`]: { click: () => this._concludeWorldCup() },
      '(optional).wc-edit-btn': { click: (e) => this._editGame(Number(e.currentTarget.dataset.gameId)) },
      '(optional).wc-delete-btn': { click: (e) => this._deleteGame(Number(e.currentTarget.dataset.gameId)) }
    }
  }

  _saveBtnId = generateId()
  _cancelBtnId = generateId()
  _concludeBtnId = generateId()
  _team1SelectId = generateId()
  _team2SelectId = generateId()
  _kickoffInputId = generateId()
  _stageSelectId = generateId()
  _goals1InputId = generateId()
  _goals2InputId = generateId()
  _games = []
  _nations = []
  _editingId = null

  _renderForm () {
    const editing = this._editingId
      ? this._games.find(g => g.id === this._editingId)
      : null
    const team1Code = editing?.team1Code || ''
    const team2Code = editing?.team2Code || ''
    const kickoff = editing ? toLocalInput(editing.kickoff) : ''
    const stage = editing?.stage || 'group'
    const goals1 = editing?.goalsTeam1 ?? ''
    const goals2 = editing?.goalsTeam2 ?? ''

    const nationOptions = (selected) => this._nations
      .map(n => `<option value="${n.code}" ${n.code === selected ? 'selected' : ''}>${n.name}</option>`)
      .join('')
    const stageOptions = allStages()
      .map(s => `<option value="${s}" ${s === stage ? 'selected' : ''}>${stageLabel(s)}</option>`)
      .join('')

    return `
      <div class="card card-body bg-dark text-white mb-3">
        <h5 class="mb-3">${editing ? t('admin.worldCupEditGame') : t('admin.worldCupAddGame')}</h5>
        <div class="row g-2">
          <div class="col-md-5">
            <label class="form-label">${t('admin.worldCupTeam1')}</label>
            <select id="${this._team1SelectId}" class="form-control">
              <option value="">—</option>
              ${nationOptions(team1Code)}
            </select>
          </div>
          <div class="col-md-2 d-flex align-items-end justify-content-center">
            <span class="text-muted">${t('admin.worldCupVs')}</span>
          </div>
          <div class="col-md-5">
            <label class="form-label">${t('admin.worldCupTeam2')}</label>
            <select id="${this._team2SelectId}" class="form-control">
              <option value="">—</option>
              ${nationOptions(team2Code)}
            </select>
          </div>
        </div>
        <div class="row g-2 mt-2">
          <div class="col-md-6">
            <label class="form-label">${t('admin.worldCupKickoff')}</label>
            <input type="datetime-local" id="${this._kickoffInputId}" class="form-control" value="${kickoff}">
          </div>
          <div class="col-md-6">
            <label class="form-label">${t('admin.worldCupStage')}</label>
            <select id="${this._stageSelectId}" class="form-control">
              ${stageOptions}
            </select>
          </div>
        </div>
        <div class="row g-2 mt-2">
          <div class="col-md-6">
            <label class="form-label">${t('admin.worldCupGoals1')}</label>
            <input type="number" min="0" max="20" id="${this._goals1InputId}" class="form-control" value="${goals1}" placeholder="—">
          </div>
          <div class="col-md-6">
            <label class="form-label">${t('admin.worldCupGoals2')}</label>
            <input type="number" min="0" max="20" id="${this._goals2InputId}" class="form-control" value="${goals2}" placeholder="—">
          </div>
        </div>
        <div class="mt-3 d-flex gap-2">
          <button id="${this._saveBtnId}" class="btn btn-info">
            <i class="fa fa-save" aria-hidden="true"></i> ${editing ? t('admin.worldCupSaveEdit') : t('admin.worldCupSaveNew')}
          </button>
          ${editing ? `<button id="${this._cancelBtnId}" class="btn btn-outline-light">${t('admin.worldCupCancelEdit')}</button>` : ''}
        </div>
      </div>
    `
  }

  _renderGamesTable () {
    if (this._games.length === 0) {
      return `<p class="text-muted">${t('admin.worldCupNoGames')}</p>`
    }
    const rows = this._games.map(g => {
      const localKickoff = new Date(g.kickoff).toLocaleString()
      const result = g.isPlayed ? `${g.goalsTeam1} : ${g.goalsTeam2}` : '—'
      return `
        <tr>
          <td>
            <img src="${flagUrl(g.team1Code)}" alt="${g.team1Name}" class="wc-flag-thumb">
            ${g.team1Name}
            <span class="text-muted">${t('admin.worldCupVs')}</span>
            <img src="${flagUrl(g.team2Code)}" alt="${g.team2Name}" class="wc-flag-thumb">
            ${g.team2Name}
          </td>
          <td>${stageLabel(g.stage)}</td>
          <td>${localKickoff}</td>
          <td>${result}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-info wc-edit-btn me-1" data-game-id="${g.id}">
              <i class="fa fa-pencil" aria-hidden="true"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger wc-delete-btn" data-game-id="${g.id}">
              <i class="fa fa-trash" aria-hidden="true"></i>
            </button>
          </td>
        </tr>
      `
    }).join('')
    return `
      <div class="table-responsive">
        <table class="table table-sm align-middle">
          <thead>
            <tr>
              <th>${t('admin.worldCupGame')}</th>
              <th>${t('admin.worldCupStage')}</th>
              <th>${t('admin.worldCupKickoff')}</th>
              <th>${t('admin.worldCupResult')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `
  }

  _readForm () {
    const team1Code = document.getElementById(this._team1SelectId).value
    const team2Code = document.getElementById(this._team2SelectId).value
    const kickoff = fromLocalInput(document.getElementById(this._kickoffInputId).value)
    const stage = document.getElementById(this._stageSelectId).value
    const goals1Raw = document.getElementById(this._goals1InputId).value
    const goals2Raw = document.getElementById(this._goals2InputId).value
    const goalsTeam1 = goals1Raw === '' ? null : Number(goals1Raw)
    const goalsTeam2 = goals2Raw === '' ? null : Number(goals2Raw)
    return { team1Code, team2Code, kickoff, stage, goalsTeam1, goalsTeam2 }
  }

  async _saveGame () {
    const payload = this._readForm()
    if (!payload.team1Code || !payload.team2Code) {
      toast(t('admin.worldCupErrorTeams'), 'error')
      return
    }
    if (!payload.kickoff) {
      toast(t('admin.worldCupErrorKickoff'), 'error')
      return
    }
    try {
      if (this._editingId) {
        const res = await server.adminUpdateWorldCupGame({ id: this._editingId, ...payload })
        toast(t('admin.worldCupSaved'), 'success')
        if (res.awarded?.length) {
          toast(t('admin.worldCupAwardedRewards', { count: res.awarded.length }), 'success')
        }
      } else {
        await server.adminCreateWorldCupGame(payload)
        toast(t('admin.worldCupSaved'), 'success')
      }
      this._editingId = null
      await this.update(true)
    } catch (e) {
      toast(e.message || t('toast.somethingWentWrong'), 'error')
    }
  }

  _editGame (id) {
    this._editingId = id
    void this.update(false)
  }

  _cancelEdit () {
    this._editingId = null
    void this.update(false)
  }

  async _deleteGame (id) {
    if (!(await showConfirmDialog(t('admin.worldCupDeleteConfirm'), t('admin.delete'), t('dialog.cancel')))) return
    try {
      await server.adminDeleteWorldCupGame(id)
      toast(t('admin.worldCupDeleted'), 'success')
      await this.update(true)
    } catch (e) {
      toast(e.message || t('toast.somethingWentWrong'), 'error')
    }
  }

  async _concludeWorldCup () {
    if (!(await showConfirmDialog(t('admin.worldCupConcludeConfirm'), t('admin.worldCupConcludeButton'), t('dialog.cancel')))) return
    try {
      const res = await server.adminConcludeWorldCup()
      if (res.alreadyAwarded) {
        toast(t('admin.worldCupAlreadyConcluded'), 'info')
      } else {
        toast(t('admin.worldCupConcluded', { count: res.recipients?.length || 0 }), 'success')
      }
    } catch (e) {
      toast(e.message || t('toast.somethingWentWrong'), 'error')
    }
  }
}
