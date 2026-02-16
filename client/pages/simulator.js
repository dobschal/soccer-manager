import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { el } from '../lib/html.js'
import { toast } from '../partials/toast.js'
import { Formation } from '../util/formation.js'

const FORMATIONS = Object.values(Formation)
const PLAY_STYLES = ['aggressive', 'normal', 'friendly']
const PASS_STYLES = ['short', 'mixed', 'long']

export class SimulatorPage extends UIElement {
  results = null
  isSimulating = false

  get template () {
    return `
      <div>
        <h2><i class="fa fa-flask"></i> Game Simulator</h2>
        <p class="text-muted">Configure two teams and simulate matches to analyze the game engine.</p>
        <form id="simulator-form">
          <div class="row">
            ${this._renderTeamForm('A')}
            ${this._renderTeamForm('B')}
          </div>
          <div class="row mt-3">
            <div class="col-12 col-md-4">
              <div class="form-group">
                <label>Number of Games</label>
                <div class="input-group">
                  <input id="num-games" class="form-control" type="number" value="100" min="1" max="10000">
                  <div class="input-group-append">
                    <button type="button" class="btn btn-outline-secondary" data-random="num-games">
                      <i class="fa fa-random"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="col-12 col-md-4 d-flex align-items-end">
              <button type="submit" class="btn btn-primary btn-block mb-3" id="simulate-btn">
                <i class="fa fa-play"></i> Simulate
              </button>
            </div>
            <div class="col-12 col-md-4 d-flex align-items-end">
              <button type="button" class="btn btn-outline-secondary btn-block mb-3" id="random-all-btn">
                <i class="fa fa-random"></i> Randomize All
              </button>
            </div>
          </div>
        </form>
        <div id="results-container">
          ${this.results ? this._renderResults() : ''}
        </div>
      </div>
    `
  }

  get events () {
    return {
      '#simulator-form': {
        submit: this._onSubmit,
        click: this._onFormClick
      },
      '#random-all-btn': {
        click: this._onRandomAll
      }
    }
  }

  /**
   * @param {string} team - 'A' or 'B'
   * @returns {string}
   */
  _renderTeamForm (team) {
    const lower = team.toLowerCase()
    return `
      <div class="col-12 col-md-6">
        <div class="card mb-3">
          <div class="card-header"><strong>Team ${team}</strong></div>
          <div class="card-body">
            <div class="form-group">
              <label>Name</label>
              <div class="input-group">
                <input id="${lower}-name" class="form-control" type="text" value="Team ${team}">
                <div class="input-group-append">
                  <button type="button" class="btn btn-outline-secondary" data-random="${lower}-name"><i class="fa fa-random"></i></button>
                </div>
              </div>
            </div>
            <div class="form-group">
              <label>Formation</label>
              <div class="input-group">
                <select id="${lower}-formation" class="form-control">
                  ${FORMATIONS.map(f => `<option value="${f}" ${f === '442a' ? 'selected' : ''}>${f}</option>`).join('')}
                </select>
                <div class="input-group-append">
                  <button type="button" class="btn btn-outline-secondary" data-random="${lower}-formation"><i class="fa fa-random"></i></button>
                </div>
              </div>
            </div>
            <div class="form-group">
              <label>Play Style</label>
              <div class="input-group">
                <select id="${lower}-play-style" class="form-control">
                  ${PLAY_STYLES.map(s => `<option value="${s}" ${s === 'normal' ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
                <div class="input-group-append">
                  <button type="button" class="btn btn-outline-secondary" data-random="${lower}-play-style"><i class="fa fa-random"></i></button>
                </div>
              </div>
            </div>
            <div class="form-group">
              <label>Pass Style</label>
              <div class="input-group">
                <select id="${lower}-pass-style" class="form-control">
                  ${PASS_STYLES.map(s => `<option value="${s}" ${s === 'mixed' ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
                <div class="input-group-append">
                  <button type="button" class="btn btn-outline-secondary" data-random="${lower}-pass-style"><i class="fa fa-random"></i></button>
                </div>
              </div>
            </div>
            <div class="form-group">
              <label>Average Player Level</label>
              <div class="input-group">
                <input id="${lower}-avg-level" class="form-control" type="number" value="5" min="1" max="10" step="0.1">
                <div class="input-group-append">
                  <button type="button" class="btn btn-outline-secondary" data-random="${lower}-avg-level"><i class="fa fa-random"></i></button>
                </div>
              </div>
            </div>
            <div class="form-group">
              <label>Goalkeeper Level</label>
              <div class="input-group">
                <input id="${lower}-gk-level" class="form-control" type="number" value="5" min="1" max="10" step="0.1">
                <div class="input-group-append">
                  <button type="button" class="btn btn-outline-secondary" data-random="${lower}-gk-level"><i class="fa fa-random"></i></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  }

  /**
   * @returns {string}
   */
  _renderResults () {
    if (!this.results) return ''
    const { games, summary } = this.results
    return `
      <hr>
      <h3>Summary</h3>
      <div class="row mb-4">
        <div class="col-md-4">
          <table class="table table-sm table-bordered">
            <thead><tr><th colspan="2">Match Outcomes</th></tr></thead>
            <tbody>
              <tr><td>Wins A</td><td><strong>${summary.winsA}</strong> (${summary.winsAPct}%)</td></tr>
              <tr><td>Draws</td><td><strong>${summary.draws}</strong> (${summary.drawsPct}%)</td></tr>
              <tr><td>Wins B</td><td><strong>${summary.winsB}</strong> (${summary.winsBPct}%)</td></tr>
            </tbody>
          </table>
        </div>
        <div class="col-md-4">
          <table class="table table-sm table-bordered">
            <thead><tr><th colspan="2">Averages per Match</th></tr></thead>
            <tbody>
              <tr><td>Goals (total)</td><td>${summary.avgGoals}</td></tr>
              <tr><td>Goals A</td><td>${summary.avgGoalsA}</td></tr>
              <tr><td>Goals B</td><td>${summary.avgGoalsB}</td></tr>
              <tr><td>Shots A</td><td>${summary.avgShotsA}</td></tr>
              <tr><td>Shots B</td><td>${summary.avgShotsB}</td></tr>
              <tr><td>Yellow Cards</td><td>${summary.avgYellow}</td></tr>
              <tr><td>Red Cards</td><td>${summary.avgRed}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="col-md-4">
          <table class="table table-sm table-bordered">
            <thead><tr><th colspan="2">Goal Difference Distribution</th></tr></thead>
            <tbody>
              <tr><td>Draw (0)</td><td>${summary.goalDiffDistribution.draw}%</td></tr>
              <tr><td>1 goal diff</td><td>${summary.goalDiffDistribution.diff1}%</td></tr>
              <tr><td>2 goals diff</td><td>${summary.goalDiffDistribution.diff2}%</td></tr>
              <tr><td>3 goals diff</td><td>${summary.goalDiffDistribution.diff3}%</td></tr>
              <tr><td>4 goals diff</td><td>${summary.goalDiffDistribution.diff4}%</td></tr>
              <tr><td>5+ goals diff</td><td>${summary.goalDiffDistribution.diff5plus}%</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      ${games.length > 0 ? this._renderGamesTable(games) : '<p class="text-muted">Individual game results hidden for simulations with more than 200 games.</p>'}
    `
  }

  /**
   * @param {object[]} games
   * @returns {string}
   */
  _renderGamesTable (games) {
    const rows = games.map((g, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${g.goalsA} : ${g.goalsB}</strong></td>
        <td>${g.shotsA}</td>
        <td>${g.shotsB}</td>
        <td>${g.yellowCards}</td>
        <td>${g.redCards}</td>
      </tr>
    `).join('')

    return `
      <h3>Individual Results</h3>
      <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
        <table class="table table-sm table-striped">
          <thead><tr>
            <th>#</th>
            <th>Score</th>
            <th>Shots A</th>
            <th>Shots B</th>
            <th>Yellows</th>
            <th>Reds</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `
  }

  /**
   * @param {Event} event
   */
  async _onSubmit (event) {
    event.preventDefault()
    if (this.isSimulating) return

    const root = el(this._elementQuery)
    const getValue = (id) => root.querySelector('#' + id)?.value

    const teamAConfig = {
      name: getValue('a-name'),
      formation: getValue('a-formation'),
      play_style: getValue('a-play-style'),
      pass_style: getValue('a-pass-style'),
      avgLevel: Number(getValue('a-avg-level')),
      gkLevel: Number(getValue('a-gk-level'))
    }

    const teamBConfig = {
      name: getValue('b-name'),
      formation: getValue('b-formation'),
      play_style: getValue('b-play-style'),
      pass_style: getValue('b-pass-style'),
      avgLevel: Number(getValue('b-avg-level')),
      gkLevel: Number(getValue('b-gk-level'))
    }

    const numGames = Number(getValue('num-games')) || 100

    this.isSimulating = true
    const btn = root.querySelector('#simulate-btn')
    if (btn) {
      btn.disabled = true
      btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Simulating...'
    }

    try {
      this.results = await server.simulateGames(teamAConfig, teamBConfig, numGames)
      const container = root.querySelector('#results-container')
      if (container) {
        container.innerHTML = this._renderResults()
      }
    } catch (e) {
      toast(e.message || 'Simulation failed', 'error')
    } finally {
      this.isSimulating = false
      if (btn) {
        btn.disabled = false
        btn.innerHTML = '<i class="fa fa-play"></i> Simulate'
      }
    }
  }

  /**
   * Handle clicks on random buttons within the form
   * @param {Event} event
   */
  _onFormClick (event) {
    const btn = event.target.closest('[data-random]')
    if (!btn) return
    event.preventDefault()
    const targetId = btn.dataset.random
    this._randomizeField(targetId)
  }

  /**
   * Randomize all fields
   */
  _onRandomAll () {
    const fields = [
      'a-name', 'a-formation', 'a-play-style', 'a-pass-style', 'a-avg-level', 'a-gk-level',
      'b-name', 'b-formation', 'b-play-style', 'b-pass-style', 'b-avg-level', 'b-gk-level',
      'num-games'
    ]
    for (const f of fields) {
      this._randomizeField(f)
    }
  }

  /**
   * Randomize a single field by its ID
   * @param {string} fieldId
   */
  _randomizeField (fieldId) {
    const root = el(this._elementQuery)
    const field = root.querySelector('#' + fieldId)
    if (!field) return

    const teamNames = ['FC Bayern', 'BVB Dortmund', 'RB Leipzig', 'Bayer Leverkusen', 'FC Schalke', 'VfB Stuttgart', 'Werder Bremen', 'Eintracht Frankfurt', 'VfL Wolfsburg', 'Borussia Gladbach', 'SC Freiburg', '1. FC Köln', 'Union Berlin', 'Hertha BSC', 'TSG Hoffenheim', 'FSV Mainz 05', 'FC Augsburg', 'Arminia Bielefeld']

    switch (fieldId) {
      case 'a-name':
      case 'b-name':
        field.value = teamNames[Math.floor(Math.random() * teamNames.length)]
        break
      case 'a-formation':
      case 'b-formation':
        field.value = FORMATIONS[Math.floor(Math.random() * FORMATIONS.length)]
        break
      case 'a-play-style':
      case 'b-play-style':
        field.value = PLAY_STYLES[Math.floor(Math.random() * PLAY_STYLES.length)]
        break
      case 'a-pass-style':
      case 'b-pass-style':
        field.value = PASS_STYLES[Math.floor(Math.random() * PASS_STYLES.length)]
        break
      case 'a-avg-level':
      case 'b-avg-level':
        field.value = (Math.random() * 9 + 1).toFixed(1)
        break
      case 'a-gk-level':
      case 'b-gk-level':
        field.value = (Math.random() * 9 + 1).toFixed(1)
        break
      case 'num-games':
        field.value = [10, 50, 100, 500, 1000][Math.floor(Math.random() * 5)]
        break
    }
  }
}
