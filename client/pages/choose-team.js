import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { t } from '../i18n/index.js'
import { toast } from '../partials/toast.js'
import { renderEmblem } from '../partials/emblem.js'
import { openEmblemEditor } from '../partials/emblemEditor.js'
import { formatLeague } from '../util/league.js'
import { goTo, setHasTeam } from '../lib/router.js'
import { el, generateId, value } from '../lib/html.js'
import { getPromoVideoId, renderPromoVideoEmbed } from '../lib/promoVideo.js'
import { shortenTeamName } from '../util/team.js'

const MAX_NAME_LENGTH = 32
const MAX_SHORT_NAME_LENGTH = 12
const MAX_WORD_LENGTH = 12

/**
 * Post-registration wizard (#453): the user picks a league (not a team), gets a
 * random club assigned, then renames it and designs its emblem before landing
 * on the dashboard.
 */
export class ChooseTeamPage extends UIElement {
  async load () {
    const { leagues } = await server.getAvailableLeagues()
    this._leagues = leagues || []
  }

  get template () {
    return `
      <div class="choose-team-page">
        <div class="choose-team-inner">
          ${this._step === 'league' ? this._renderLeagueStep() : ''}
          ${this._step === 'name' ? this._renderNameStep() : ''}
          ${this._step === 'emblem' ? this._renderEmblemStep() : ''}
        </div>
      </div>
    `
  }

  get events () {
    return {
      '(optional) .choose-league-list': {
        click: (event) => {
          const row = event.target.closest('.choose-league-row')
          if (!row) return
          this._onSelectLeague(Number(row.dataset.level), Number(row.dataset.league))
        }
      },
      '(optional) form[name="rename-team"]': {
        submit: (event) => {
          event.preventDefault()
          this._onSaveName()
        }
      },
      '(optional) [data-open-emblem-editor]': {
        click: () => this._openEmblemEditor()
      },
      '(optional) [data-finish]': {
        click: () => goTo('')
      }
    }
  }

  // ── Step 1: choose a league ────────────────────────────────────────────
  _renderLeagueStep () {
    const isNativeApp = Boolean(window.__nativePlatform)
    const videoId = getPromoVideoId({ isNativeApp })
    return `
      <h1 class="choose-team-title">${t('chooseTeam.welcomeTitle')}</h1>
      <p class="choose-team-description">${t('chooseTeam.welcomeText')}</p>
      <div class="choose-team-video mb-4">
        ${renderPromoVideoEmbed(videoId, t('chooseTeam.welcomeTitle'))}
      </div>
      <h2 class="choose-team-subtitle">${t('chooseTeam.chooseLeagueTitle')}</h2>
      ${this._renderLeagueList()}
    `
  }

  _renderLeagueList () {
    if (!this._leagues || this._leagues.length === 0) {
      return `<p class="choose-team-empty">${t('chooseTeam.noTeams')}</p>`
    }
    return `
      <div class="choose-league-list">
        ${this._leagues.map(l => `
          <button type="button" class="choose-league-row" data-level="${l.level}" data-league="${l.league}">
            <span class="choose-league-name">${formatLeague(l.level, l.league)}</span>
            <span class="choose-league-count">${t('chooseTeam.freeTeamsCount', { count: l.freeTeams })}</span>
          </button>
        `).join('')}
      </div>
    `
  }

  async _onSelectLeague (level, league) {
    if (this._isSubmitting) return
    this._isSubmitting = true
    try {
      const { team } = await server.chooseRandomTeamInLeague(level, league)
      this._team = team
      setHasTeam(true)
      this._step = 'name'
      await this.update()
    } catch (e) {
      toast(e?.message ?? t('landing.somethingWentWrong'), 'error')
    }
    this._isSubmitting = false
  }

  // ── Step 2: rename the assigned club ───────────────────────────────────
  _renderNameStep () {
    const nameInputId = generateId()
    const shortInputId = generateId()
    this._nameInputId = nameInputId
    this._shortInputId = shortInputId
    const escapeHtml = (str) => String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
    const name = escapeHtml(this._team?.name ?? '')
    const shortName = escapeHtml(this._team?.short_name ?? '')
    return `
      <h1 class="choose-team-title">${t('chooseTeam.nameStepTitle')}</h1>
      <p class="choose-team-description">${t('chooseTeam.nameStepText')}</p>
      <div class="choose-team-emblem-preview mb-4">${renderEmblem(this._team, 120)}</div>
      <form name="rename-team" autocomplete="off" class="choose-team-form">
        <div class="form-group mb-3 text-start">
          <label for="${nameInputId}">${t('myTeam.teamName')}</label>
          <input id="${nameInputId}" type="text" class="form-control" value="${name}" maxlength="${MAX_NAME_LENGTH}" autocomplete="off">
        </div>
        <div class="form-group mb-3 text-start">
          <label for="${shortInputId}">${t('myTeam.shortName')}</label>
          <input id="${shortInputId}" type="text" class="form-control" value="${shortName}" maxlength="${MAX_SHORT_NAME_LENGTH}" placeholder="${escapeHtml(shortenTeamName(this._team?.name ?? ''))}" autocomplete="off">
        </div>
        <button type="submit" class="btn btn-info w-100 text-white">${t('chooseTeam.continue')}</button>
      </form>
    `
  }

  _validateName (name) {
    if (!name) return t('myTeam.nameRequired')
    if (name.length > MAX_NAME_LENGTH) return t('myTeam.nameTooLong', { max: MAX_NAME_LENGTH })
    if (name.split(' ').some(w => w.length > MAX_WORD_LENGTH)) {
      return t('myTeam.wordTooLong', { max: MAX_WORD_LENGTH })
    }
    return ''
  }

  async _onSaveName () {
    if (this._isSubmitting) return
    const name = (value('#' + this._nameInputId) || '').replace(/\s+/g, ' ').trim()
    const shortName = (value('#' + this._shortInputId) || '').replace(/\s+/g, ' ').trim()
    const error = this._validateName(name)
    if (error) return toast(error, 'error')
    this._isSubmitting = true
    try {
      await server.updateTeamName(name, shortName)
      this._team.name = name
      this._team.short_name = shortName || null
      this._step = 'emblem'
      await this.update()
      // Open the emblem editor right away — designing the crest is the final
      // step of the flow (#453).
      this._openEmblemEditor()
    } catch (e) {
      toast(e?.message ?? t('landing.somethingWentWrong'), 'error')
    }
    this._isSubmitting = false
  }

  // ── Step 3: design the emblem, then head to the dashboard ──────────────
  _renderEmblemStep () {
    return `
      <h1 class="choose-team-title">${t('chooseTeam.emblemStepTitle')}</h1>
      <p class="choose-team-description">${t('chooseTeam.emblemStepText')}</p>
      <div class="choose-team-emblem-preview mb-4" id="choose-team-emblem">${renderEmblem(this._team, 160)}</div>
      <div class="d-flex flex-column gap-2">
        <button type="button" class="btn btn-outline-info" data-open-emblem-editor>${t('chooseTeam.customizeEmblem')}</button>
        <button type="button" class="btn btn-info text-white" data-finish>${t('chooseTeam.toDashboard')}</button>
      </div>
    `
  }

  _openEmblemEditor () {
    openEmblemEditor(this._team, () => {
      const preview = el('#choose-team-emblem')
      if (preview) preview.innerHTML = renderEmblem(this._team, 160)
    })
  }

  // Wizard step: 'league' | 'name' | 'emblem'
  _step = 'league'
  _team = null
  showLoadingIndicator = true
}
