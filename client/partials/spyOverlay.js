import { server } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { renderEmblem } from './emblem.js'
import { Lineup } from './lineup.js'
import { toast } from './toast.js'
import { t } from '../i18n/index.js'
import { generateId, el } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { delay } from '../lib/delay.js'

const REVEAL_DELAY_MS = 2000

/**
 * Spy ("Spion") action-card overlay. Lets the user pick a team (searchable
 * list, next opponent preselected), confirms, plays a ~2s magnifier loader,
 * then reveals the target team's tactics and lineup.
 *
 * `onConfirm(teamId)` is invoked once the user commits to a team; it should
 * consume the action card server-side (and may throw to abort). It must resolve
 * with the frozen spy snapshot `{ report: { team, players } }` captured server-
 * side when the card is played (#513). The returned promise resolves with `true`
 * when a team was successfully spied (the card was consumed), or `false` if the
 * user closed the overlay beforehand.
 *
 * @param {{ onConfirm: (teamId: number) => Promise<{report: {team: Object, players: Array}}> }} options
 * @returns {Promise<boolean>}
 */
export function showSpyOverlay ({ onConfirm }) {
  return new Promise((resolve) => {
    const bodyId = generateId()
    let consumed = false

    const overlay = showOverlay(
      t('spy.title'),
      t('spy.subtitle'),
      `<div id="${bodyId}" class="spy-overlay"></div>`
    )
    overlay.onClose(() => resolve(consumed))

    const setBody = (html) => {
      const container = el('#' + bodyId)
      if (container) container.innerHTML = html
    }

    /**
     * Render one selectable team row.
     * @param {Object} team
     * @param {number|null} selectedId
     * @returns {string}
     */
    const renderTeamRow = (team, selectedId) => `
      <button type="button" class="spy-team-row${team.id === selectedId ? ' spy-team-row--selected' : ''}" data-spy-team-id="${team.id}">
        ${renderEmblem(team, 32)}
        <span class="spy-team-row__name">${team.name}</span>
      </button>
    `

    // --- Phase 1: team picker ---------------------------------------------
    const showPicker = async () => {
      let opponent = null
      try {
        const res = await server.getNextGame()
        opponent = res?.opponent ?? null
      } catch { /* no next game — start with an empty list */ }

      let selectedId = opponent?.id ?? null
      let teams = opponent ? [opponent] : []

      const searchId = generateId()
      const listId = generateId()
      const confirmId = generateId()

      // The shell (search field + confirm button) is rendered exactly once.
      // Only the list is swapped on every search — re-rendering the whole body
      // would destroy the focused <input>, which on mobile closes the virtual
      // keyboard and drops the character that triggered the search.
      const renderList = () => {
        const list = el('#' + listId)
        if (list) {
          list.innerHTML = teams.length === 0
            ? `<p class="text-muted mb-0">${t('spy.noTeams')}</p>`
            : teams.map(team => renderTeamRow(team, selectedId)).join('')
        }
        const confirmBtn = el('#' + confirmId)
        if (confirmBtn) confirmBtn.disabled = selectedId == null
      }

      setBody(`
        <input id="${searchId}" type="text" class="form-control mb-3" placeholder="${t('spy.searchPlaceholder')}" autocomplete="off">
        <div id="${listId}" class="spy-team-list"></div>
        <button id="${confirmId}" class="btn btn-info w-100 mt-3" disabled>
          <i class="fa fa-search me-1"></i> ${t('spy.confirm')}
        </button>
      `)
      renderList()

      onClick('#' + listId, (event) => {
        const row = event.target.closest('[data-spy-team-id]')
        if (!row) return
        selectedId = Number(row.dataset.spyTeamId)
        // Update selection highlight + enable confirm without a full rerender.
        el('#' + listId)?.querySelectorAll('.spy-team-row').forEach(r => {
          r.classList.toggle('spy-team-row--selected', Number(r.dataset.spyTeamId) === selectedId)
        })
        const confirmBtn = el('#' + confirmId)
        if (confirmBtn) confirmBtn.disabled = false
      })

      onClick('#' + confirmId, () => {
        if (selectedId != null) void startReveal(selectedId)
      })

      // Debounced search. `requestId` guards against a slow response for an
      // earlier query overwriting the results of a later one.
      let searchTimer = null
      let requestId = 0
      const input = el('#' + searchId)
      input?.addEventListener('input', () => {
        const value = input.value.trim()
        if (searchTimer) clearTimeout(searchTimer)
        const currentRequest = ++requestId
        searchTimer = setTimeout(async () => {
          if (value.length < 3) {
            teams = opponent ? [opponent] : []
            renderList()
            return
          }
          let result
          try {
            const res = await server.searchTeams(value)
            result = res?.teams ?? []
          } catch {
            result = []
          }
          if (currentRequest !== requestId) return
          teams = result
          renderList()
        }, 300)
      })
    }

    // --- Phase 2 + 3: loader then reveal ----------------------------------
    const startReveal = async (teamId) => {
      // Consume the card first so the reveal can never be seen for free. The
      // server returns the frozen snapshot taken at this instant, so the reveal
      // shows exactly what is stored for the "last scout report" card (#513).
      let report
      try {
        const result = await onConfirm(teamId)
        consumed = true
        report = result?.report ?? null
      } catch (e) {
        console.error(e)
        toast(e.message ?? t('spy.failed'), 'error')
        overlay.remove()
        return
      }

      setBody(`
        <div class="spy-loader">
          <i class="fa fa-search spy-loader__glass" aria-hidden="true"></i>
          <p class="text-muted mt-3 mb-0">${t('spy.analyzing')}</p>
        </div>
      `)

      // Fake a minimum analysis time for the reveal animation.
      await delay(REVEAL_DELAY_MS)

      if (!report?.team) {
        toast(t('spy.failed'), 'error')
        overlay.remove()
        return
      }

      showReveal(report.team, report.players ?? [])
    }

    const showReveal = (team, players) => {
      setBody(spyReportBodyHtml(team, players))
    }

    void showPicker()
  })
}

/**
 * Render a spy report body: the target team's emblem/name, its four tactics
 * rows and its lineup. Shared by the spy overlay's reveal phase and the
 * "last scout report" card on #my-team.
 *
 * @param {Object} team
 * @param {Array} [players]
 * @returns {string}
 */
export function spyReportBodyHtml (team, players = []) {
  const tacticRow = (label, value) => `
    <div class="spy-tactic">
      <span class="spy-tactic__label">${label}</span>
      <span class="spy-tactic__value">${value}</span>
    </div>
  `

  const formation = team.formation || '—'
  const attackMode = t('myTeam.attackMode.' + (team.attack_mode || 'balanced'))
  const playStyle = t('myTeam.playStyle.' + (team.play_style || 'normal'))
  const passStyle = t('myTeam.passStyle.' + (team.pass_style || 'mixed'))
  // The report is a snapshot, so this reflects whether the opponent had a
  // motivating-speech buff active at the moment they were spied (#513).
  const motivatingSpeechActive = !!team.motivating_speech_active

  return `
    <div class="spy-reveal">
      <div class="spy-reveal__header">
        ${renderEmblem(team, 48)}
        <h4 class="mb-0">${team.name}</h4>
      </div>
      <div class="spy-tactics">
        ${tacticRow(t('myTeam.formation'), formation)}
        ${tacticRow(t('spy.attackMode'), attackMode)}
        ${tacticRow(t('spy.playStyle'), playStyle)}
        ${tacticRow(t('spy.passStyle'), passStyle)}
      </div>
      ${motivatingSpeechActive
    ? `<div class="alert alert-info d-flex align-items-center gap-2 mt-2 mb-0">
            <i class="fa fa-bullhorn" aria-hidden="true"></i>
            <span>${t('spy.motivatingSpeechActive')}</span>
          </div>`
    : ''}
      <div class="spy-lineup">${new Lineup(players, team, undefined, {readOnly: true})}</div>
    </div>
  `
}
