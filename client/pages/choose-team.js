import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { t } from '../i18n/index.js'
import { toast } from '../partials/toast.js'
import { showConfirmDialog } from '../partials/overlay.js'
import { renderEmblem } from '../partials/emblem.js'
import { formatLeague } from '../util/league.js'
import { euroFormat } from '../lib/currency.js'
import { goTo, setHasTeam } from '../lib/router.js'

const ALL_LEAGUES = 'all'

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
          ${this._renderLeagueFilter()}
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
      },
      '(optional) .choose-team-filter-select': {
        change: (event) => {
          this._selectedLeagueKey = event.target.value
          this.update(false)
        }
      }
    }
  }
  _selectedLeagueKey = ALL_LEAGUES

  showLoadingIndicator = true

  _renderLeagueFilter () {
    if (!this._teams || this._teams.length === 0) return ''
    const leagues = this._getUniqueLeagues()
    if (leagues.length <= 1) return ''
    return `
      <div class="choose-team-filter">
        <label class="choose-team-filter-label" for="choose-team-filter-select">${t('chooseTeam.filterLeague')}</label>
        <select id="choose-team-filter-select" class="choose-team-filter-select">
          <option value="${ALL_LEAGUES}"${this._selectedLeagueKey === ALL_LEAGUES ? ' selected' : ''}>${t('chooseTeam.filterAll')}</option>
          ${leagues.map(l => `
            <option value="${l.key}"${this._selectedLeagueKey === l.key ? ' selected' : ''}>${l.label}</option>
          `).join('')}
        </select>
      </div>
    `
  }

  _getUniqueLeagues () {
    const seen = new Set()
    const result = []
    for (const team of this._teams) {
      const key = `${team.level}-${team.league}`
      if (seen.has(key)) continue
      seen.add(key)
      result.push({
        key,
        level: team.level,
        league: team.league,
        label: formatLeague(team.level, team.league)
      })
    }
    return result.sort((a, b) => a.level - b.level || a.league - b.league)
  }

  _getFilteredTeams () {
    if (!this._teams) return []
    if (this._selectedLeagueKey === ALL_LEAGUES) return this._teams
    return this._teams.filter(team => `${team.level}-${team.league}` === this._selectedLeagueKey)
  }

  _renderTeamList () {
    if (!this._teams || this._teams.length === 0) {
      return `<p class="choose-team-empty">${t('chooseTeam.noTeams')}</p>`
    }
    const filtered = this._getFilteredTeams()
    if (filtered.length === 0) {
      return `<p class="choose-team-empty">${t('chooseTeam.noTeamsInLeague')}</p>`
    }
    return `
      <div class="choose-team-list">
        ${filtered.map(team => this._renderTeamRow(team)).join('')}
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
