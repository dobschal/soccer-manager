import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { t } from '../../i18n/index.js'
import { toast } from '../../partials/toast.js'
import { showConfirmDialog } from '../../partials/overlay.js'
import { renderEmblem } from '../../partials/emblem.js'
import { formatLeague } from '../../util/league.js'
import { euroFormat } from '../../lib/currency.js'
import { goTo, setHasTeam } from '../../lib/router.js'

const ALL_LEAGUES = 'all'

/**
 * Inline team-selection block shown on the dashboard for users without a
 * team. Mirrors choose-team.js but lives inside the dashboard layout so the
 * user can still see the global navigation while picking.
 */
export class TeamSelection extends UIElement {
  async load () {
    const { teams } = await server.getAvailableTeams()
    this._teams = teams
  }

  get template () {
    return `
      <div class="team-selection">
        <div class="card card-body bg-info-subtle text-center mb-4">
          <h3 class="mb-2"><i class="fa fa-flag-checkered"></i> ${t('chooseTeam.title')}</h3>
          <p class="text-muted mb-0">${t('chooseTeam.description')}</p>
        </div>
        ${this._renderLeagueFilter()}
        ${this._renderTeamList()}
      </div>
    `
  }

  get events () {
    return {
      '(optional) .team-selection-list': {
        click: (event) => {
          const row = event.target.closest('.team-selection-row')
          if (!row) return
          const teamId = Number(row.dataset.teamId)
          this._onSelect(teamId)
        }
      },
      '(optional) .team-selection-filter-select': {
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
      <div class="team-selection-filter mb-3">
        <label class="form-label" for="team-selection-filter-select">${t('chooseTeam.filterLeague')}</label>
        <select id="team-selection-filter-select" class="form-select team-selection-filter-select">
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
      return `<p class="text-muted text-center">${t('chooseTeam.noTeams')}</p>`
    }
    const filtered = this._getFilteredTeams()
    if (filtered.length === 0) {
      return `<p class="text-muted text-center">${t('chooseTeam.noTeamsInLeague')}</p>`
    }
    return `
      <div class="team-selection-list">
        ${filtered.map(team => this._renderTeamRow(team)).join('')}
      </div>
    `
  }

  _renderTeamRow (team) {
    return `
      <button type="button" class="team-selection-row" data-team-id="${team.id}">
        <span class="team-selection-emblem">${renderEmblem({
    name: team.name,
    color: team.color,
    emblem: team.emblem
  }, 56)}</span>
        <span class="team-selection-name">${team.name}</span>
        <span class="team-selection-league">${formatLeague(team.level, team.league)}</span>
        <span class="team-selection-value">${t('chooseTeam.value')}: <br>${euroFormat.format(team.value)}</span>
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
      window.__hasTeam = true
      window.location.reload()
    } catch (e) {
      toast(e?.message ?? t('landing.somethingWentWrong'), 'error')
      this._isSubmitting = false
      await this.update(true)
    }
    if (!this._isSubmitting) goTo('')
  }
}
