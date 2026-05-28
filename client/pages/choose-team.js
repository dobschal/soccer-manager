import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { t } from '../i18n/index.js'
import { toast } from '../partials/toast.js'
import { showConfirmDialog } from '../partials/overlay.js'
import { renderEmblem } from '../partials/emblem.js'
import { formatLeague } from '../util/league.js'
import { euroFormat } from '../lib/currency.js'
import { goTo, setHasTeam } from '../lib/router.js'

export class ChooseTeamPage extends UIElement {

  async load () {
    const { teams } = await server.getAvailableTeams()
    this._teams = teams
  }

  get template () {
    return `
      <div class="choose-team-page">
        <div class="choose-team-inner">
          <h1 class="choose-team-title">${t('chooseTeam.title')}</h1>
          <p class="choose-team-description">${t('chooseTeam.description')}</p>
          ${this._renderTeamList()}
        </div>
      </div>
    `
  }

  get events () {
    return {
      '(optional) .choose-team-list': {
        click: (event) => {
          const row = event.target.closest('.choose-team-row')
          if (!row) return
          const teamId = Number(row.dataset.teamId)
          this._onSelect(teamId)
        }
      }
    }
  }

  showLoadingIndicator = true

  _renderTeamList () {
    if (!this._teams || this._teams.length === 0) {
      return `<p class="choose-team-empty">${t('chooseTeam.noTeams')}</p>`
    }
    return `
      <div class="choose-team-list">
        ${this._teams.map(team => this._renderTeamRow(team)).join('')}
      </div>
    `
  }

  _renderTeamRow (team) {
    return `
      <button type="button" class="choose-team-row" data-team-id="${team.id}">
        <span class="choose-team-emblem">${renderEmblem({
    name: team.name,
    color: team.color,
    emblem: team.emblem
  }, 56)}</span>
        <span class="choose-team-name">${team.name}</span>
        <span class="choose-team-league">${formatLeague(team.level, team.league)}</span>
        <span class="choose-team-value">${t('chooseTeam.value')}: <br>${euroFormat.format(team.value)}</span>
      </button>
    `
  }

  async _onSelect (teamId) {
    if (this._isSubmitting) return
    const team = this._teams.find(t => t.id === teamId)
    if (!team) return
    const confirmed = await showConfirmDialog(
      t('chooseTeam.confirm', { teamName: team.name }),
      t('chooseTeam.confirmYes'),
      t('chooseTeam.confirmNo')
    )
    if (!confirmed) return
    this._isSubmitting = true
    try {
      await server.chooseTeam(teamId)
      setHasTeam(true)
      goTo('')
    } catch (e) {
      toast(e?.message ?? t('landing.somethingWentWrong'), 'error')
      this._isSubmitting = false
      await this.update(true)
    }
  }
}
