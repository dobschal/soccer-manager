import { Chart } from 'chart.js/auto'
import { server } from '../../lib/gateway.js'
import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { getQueryParams, goTo, setQueryParams } from '../../lib/router.js'
import { formatLeague } from '../../util/league.js'
import { UIElement } from '../../lib/UIElement.js'
import { calculatePlayerAge } from '../../util/player.js'
import { renderEmblem } from '../../partials/emblem.js'
import { renderPlayerImage } from '../../partials/playerImage.js'
import { showOverlay } from '../../partials/overlay.js'
import { showSeasonReviewOverlay } from '../../partials/seasonReviewOverlay.js'
import { toast } from '../../partials/toast.js'
import { t } from '../../i18n/index.js'
import { wikiInfoIcon } from '../../partials/wikiInfoIcon.js'
import { Table } from '../../partials/table.js'
import { renderFilterStepper } from '../../partials/filterStepper.js'
import { shortenTeamName } from '../../util/team.js'
import { goToTeamPage } from '../../util/gameNavigation.js'
import { shortEuroFormat } from '../../lib/currency.js'

export class LeagueResultsPage extends UIElement {
  /**
   * @param {UIElement} parentPage
   */
  constructor (parentPage) {
    super()
    this.parentPage = parentPage
  }

  // -1 = desc, 1 = asc
  async load () {
    // Pick up level / league / season / match_day from the URL on the first
    // load so a direct link like #results?level=3&league=3 actually shows
    // that league. The parent's onQueryChanged also calls applyQueryParams,
    // but on a freshly-rendered page the query-changed event fires while
    // the wrapper is still display:none (mid slide-in), so UIElement's
    // visibility guard drops it. Reading the params here closes that gap.
    if (typeof this.level === 'undefined' || typeof this.league === 'undefined') {
      const fromUrl = this._getLeagueAndLevel()
      if (typeof fromUrl.level !== 'undefined' && typeof fromUrl.league !== 'undefined') {
        this.level = fromUrl.level
        this.league = fromUrl.league
      } else {
        this.level = this.parentPage.info.team.level
        this.league = this.parentPage.info.team.league
      }
    }
    const currentGameday = await server.getCurrentGameday()
    this._upcomingSeason = currentGameday.season
    if (typeof this.season === 'undefined' || typeof this.matchDay === 'undefined') {
      const seasonFromUrl = await this._getSeasonAndMatchDay()
      if (typeof seasonFromUrl.season !== 'undefined' && typeof seasonFromUrl.matchDay !== 'undefined') {
        this.season = seasonFromUrl.season
        this.matchDay = seasonFromUrl.matchDay
      }
    }
    // After a season transition (new season scheduled, no league game of it
    // played yet) lastPlayedLeagueSeason still points at the *previous* season's
    // final match day. Showing that as the default would surface stale results,
    // so snap to match day 1 of the upcoming season instead (#385).
    const newSeasonNotStarted = typeof currentGameday.lastPlayedLeagueSeason === 'number' &&
      currentGameday.lastPlayedLeagueSeason < currentGameday.season
    if (typeof this.season === 'undefined') {
      this.season = newSeasonNotStarted
        ? currentGameday.season
        : (currentGameday.lastPlayedLeagueSeason ?? currentGameday.season)
    }
    if (typeof this.matchDay === 'undefined') {
      this.matchDay = newSeasonNotStarted
        ? 1
        : (currentGameday.lastPlayedLeagueMatchDay ?? 1)
    }

    let filters = await server.getResultsFilters(this.level, this.league, this.season)
    if (filters.seasons.length > 0 && !filters.seasons.includes(this.season)) {
      this.season = filters.seasons[filters.seasons.length - 1]
      filters = await server.getResultsFilters(this.level, this.league, this.season)
    }
    if (filters.matchDays.length > 0 && !filters.matchDays.includes(this.matchDay)) {
      this.matchDay = filters.matchDays[filters.matchDays.length - 1]
    }
    this.availableLeagues = filters.leagues
    this.availableSeasons = filters.seasons
    this.availableMatchDays = filters.matchDays

    const isMyLeague = this.level === this.parentPage.info.team.level && this.league === this.parentPage.info.team.league
    const lastPlayedLeagueMatchDay = currentGameday.lastPlayedLeagueMatchDay ?? 0
    const isUpcomingGameDay = this.season === this._upcomingSeason &&
      isMyLeague &&
      this.matchDay > lastPlayedLeagueMatchDay

    const promises = [
      server.getResults(this.matchDay, this.season, this.level, this.league),
      server.getStanding(this.matchDay, this.season, this.level, this.league),
      server.getStanding(Math.max(0, this.matchDay - 1), this.season, this.level, this.league),
      server.getTopScorers(this.season, this.level, this.league, 10),
      isUpcomingGameDay && isMyLeague ? server.getSuspendedPlayers(this.level, this.league) : Promise.resolve({ suspendedPlayers: [] }),
      server.getTeamStats(this.matchDay, this.season, this.level, this.league),
      isUpcomingGameDay && isMyLeague ? server.getInjuredPlayers(this.level, this.league) : Promise.resolve({ injuredPlayers: [] }),
      server.getLeagueStadiums(this.level, this.league),
      server.getMatchDayRecap(this.matchDay, this.season, this.level, this.league)
    ]
    const [{
      results,
      isCupGameDay,
      cupRound
    }, standing, yesterday, { topScorers }, { suspendedPlayers }, { teamStats }, { injuredPlayers }, { stadiums }, recapResponse] = await Promise.all(promises)
    this.results = results
    this.isCupGameDay = isCupGameDay
    this.cupRound = cupRound
    // No client-side re-sort: the server already orders both tables by the
    // full DFB tie-break chain (#560) and a coarser comparator here would only
    // risk contradicting it.
    this.yesterdayStanding = yesterday
    this.standing = standing
    this.topScorer = topScorers
    this.suspendedPlayers = suspendedPlayers
    this.injuredPlayers = injuredPlayers
    this.teamStats = teamStats || []
    this.stadiums = stadiums || []
    this.recap = recapResponse?.recap ?? null
    this.recapFeaturedPlayer = recapResponse?.featuredPlayer ?? null
    this.recapFeaturedTeam = recapResponse?.featuredTeam ?? null
    this._recapImage = ''

    // The season review button is only meaningful for fully-completed seasons
    // (all 34 match days played). Strict checks: any season earlier than the
    // user's last played one is by definition done; the current ongoing one
    // counts only when match day 34 has actually been played in the user's
    // home league.
    const lastSeason = currentGameday.lastPlayedLeagueSeason
    if (typeof lastSeason === 'number') {
      this._seasonCompleted = this.season < lastSeason ||
        (this.season === lastSeason && lastPlayedLeagueMatchDay >= 34)
    } else {
      this._seasonCompleted = false
    }

    // Deep link: open the top-scorers overlay once data is ready (#464).
    if (getQueryParams().top_scorers) {
      this._showTopScorersOverlay()
    }
  }

  get template () {
    return `
      <div>
        <div class="mb-4">
          <div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-2">
            <h2 class="mb-0">${t('results.resultsTitle')} ${wikiInfoIcon('leagues')}</h2>
            ${this._seasonCompleted
    ? `<button id="results-open-season-review-btn" class="btn btn-info btn-sm" type="button">
              <i class="fa fa-trophy me-1"></i> ${t('seasonReview.title')}
            </button>`
    : ''}
          </div>
          <div class="results-filters d-flex flex-column flex-md-row gap-2 gap-md-3">
            ${renderFilterStepper({
    label: t('results.league'),
    selectId: 'results-league-select',
    prevId: 'prev-league-button',
    nextId: 'next-league-button',
    prevLabel: t('common.prev'),
    nextLabel: t('common.next'),
    optionsHtml: this.availableLeagues.map(l => `<option value="${l.level}_${l.league}" ${l.level === this.level && l.league === this.league ? 'selected' : ''}>${formatLeague(l.level, l.league)}</option>`).join('')
  })}
            ${renderFilterStepper({
    label: t('results.season'),
    selectId: 'results-season-select',
    prevId: 'prev-season-button',
    nextId: 'next-season-button',
    prevLabel: t('common.prev'),
    nextLabel: t('common.next'),
    optionsHtml: this.availableSeasons.map(s => `<option value="${s}" ${s === this.season ? 'selected' : ''}>${s + 1}</option>`).join('')
  })}
            ${renderFilterStepper({
    label: t('results.gameDayLabel'),
    selectId: 'results-game-day-select',
    prevId: 'prev-game-day-button',
    nextId: 'next-game-day-button',
    prevLabel: t('common.prev'),
    nextLabel: t('common.next'),
    optionsHtml: this.availableMatchDays.map(d => `<option value="${d}" ${d === this.matchDay ? 'selected' : ''}>${d}</option>`).join('')
  })}
          </div>
        </div>

        <h3>${t('results.games')}</h3>
        ${this.results.length > 0 && this.results[0].created_at && typeof this.results[0].goalsTeam1 === 'number' && typeof this.results[0].goalsTeam2 === 'number'
    ? `<p class="text-muted">${t('results.gamesPlayedAt', {
      date: new Date(this.results[0].created_at).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    })}</p>`
    : ''}
        ${this.results.length === 0 && this.isCupGameDay
    ? `<div class="alert alert-info">
            <i class="fa fa-trophy"></i> ${t('results.cupGameDayNotice')}
            <a href="#results?sub_page=cup&cup_season=${this.season}&cup_round=${this.cupRound}">${t('results.goToCupResults')}</a>
          </div>`
    : ''}
        ${new Table({
    classes: 'results-games-table game-teams-table',
    cols: [
      {
        name: t('results.team1'),
        align: 'right',
        onClick: (result) => goToTeamPage(result.team1Id)
      },
      {
        name: '',
        align: 'center',
        width: '90px'
      },
      {
        name: t('results.team2'),
        onClick: (result) => goToTeamPage(result.team2Id)
      }
    ],
    data: this.results,
    renderRow: (result) => this._renderResultListItem(result),
    onClick: (result) => setQueryParams({ game_id: result.id })
  })}
        ${this._renderRecap()}
        ${this._renderStandingHeading()}
        ${new Table({
    cols: [
      {
        name: '#',
        width: '32px'
      },
      {
        name: '',
        width: '32px'
      },
      { name: t('results.team') },
      { name: t('results.games') },
      { name: 'W/D/L' },
      { name: t('results.goals') },
      { name: t('results.diff') },
      { name: t('results.points') }
    ],
    data: this.standing,
    renderRow: (item, index) => this._renderStandingListItem(item, index),
    onClick: (item) => goTo(`team?id=${item.team.id}`),
    rowClass: (item, index) => {
      const isMyTeam = this.myTeamId === item.team.id
      return [
        isMyTeam ? 'table-info' : '',
        !isMyTeam && index < 2 ? 'table-success' : '',
        !isMyTeam && index > 13 ? 'table-warning' : ''
      ].join(' ')
    }
  })}

        ${this.suspendedPlayers.length > 0 ? `
          <h3>${t('results.suspendedPlayers')}</h3>
          ${new Table({
    cols: [
      { name: '' },
      { name: t('results.name') },
      { name: t('results.team') },
      { name: t('player.cards') }
    ],
    data: this.suspendedPlayers,
    renderRow: (player) => this._renderSuspendedPlayer(player),
    rowClass: (player) => player && player.team && this.myTeamId === player.team.id ? 'table-info' : ''
  })}
        ` : ''}

        ${this.injuredPlayers.length > 0 ? `
          <h3>${t('results.injuredPlayers')}</h3>
          ${new Table({
    cols: [
      { name: '' },
      { name: t('results.name') },
      { name: t('results.team') },
      { name: t('results.injuryType') },
      { name: t('results.daysLeft') }
    ],
    data: this.injuredPlayers,
    renderRow: (player) => this._renderInjuredPlayer(player),
    rowClass: (player) => player && player.team && this.myTeamId === player.team.id ? 'table-info' : ''
  })}
        ` : ''}

        <div class="d-flex flex-column flex-md-row gap-2 mt-4 mb-4">
          <button id="results-open-top-scorers-btn" class="btn btn-outline-primary flex-fill" type="button">
            <i class="fa fa-soccer-ball-o me-1"></i> ${t('results.topScorer')}
          </button>
          <button id="results-open-team-stats-btn" class="btn btn-outline-primary flex-fill" type="button" ${this.teamStats.length === 0 ? 'disabled' : ''}>
            <i class="fa fa-line-chart me-1"></i> ${t('results.teamStats')}
          </button>
          <button id="results-open-stadiums-btn" class="btn btn-outline-primary flex-fill" type="button" ${this.stadiums.length === 0 ? 'disabled' : ''}>
            <i class="fa fa-building me-1"></i> ${t('stadium.stadiumsTitle')}
          </button>
          <button id="results-open-standing-history-btn" class="btn btn-outline-primary flex-fill" type="button">
            <i class="fa fa-area-chart me-1"></i> ${t('results.standingHistory')}
          </button>
        </div>
      </div>
    `
  }

  get events () {
    return {
      '#results-league-select': {
        change: (event) => {
          const [level, league] = event.target.value.split('_').map(Number)
          setQueryParams({
            level,
            league,
            season: this.season,
            match_day: this.matchDay
          })
        }
      },
      '#results-season-select': {
        change: (event) => {
          setQueryParams({
            season: Number(event.target.value),
            match_day: this.matchDay
          })
        }
      },
      '#results-game-day-select': {
        change: (event) => {
          setQueryParams({
            season: this.season,
            match_day: Number(event.target.value)
          })
        }
      },
      // Arrows step through the same lists the dropdowns hold, so a neighbouring
      // league / season / match day is one click away (#478).
      '(optional) #prev-league-button': {
        click: () => this._stepLeague(-1)
      },
      '(optional) #next-league-button': {
        click: () => this._stepLeague(1)
      },
      '(optional) #prev-season-button': {
        click: () => this._stepSeason(-1)
      },
      '(optional) #next-season-button': {
        click: () => this._stepSeason(1)
      },
      '(optional) #prev-game-day-button': {
        click: () => this._stepMatchDay(-1)
      },
      '(optional) #next-game-day-button': {
        click: () => this._stepMatchDay(1)
      },
      '#results-open-top-scorers-btn': {
        click: () => setQueryParams({ top_scorers: '1' })
      },
      '#results-open-team-stats-btn': {
        click: () => this._showTeamStatsOverlay()
      },
      '#results-open-stadiums-btn': {
        click: () => this._showStadiumsOverlay()
      },
      '#results-open-standing-history-btn': {
        click: () => this._showStandingHistoryOverlay()
      },
      '(optional) #results-open-season-review-btn': {
        click: () => this._showSeasonReviewOverlay()
      }
    }
  }

  onMounted () {
    this._loadPlayerImages()
    this._loadRecapImage()
  }
  async _showSeasonReviewOverlay () {
    let review
    try {
      review = await server.getSeasonReview(this.season)
    } catch {
      toast(t('seasonReview.notAvailable'), 'warning')
      return
    }
    if (!review?.outcome) {
      toast(t('seasonReview.notAvailable'), 'warning')
      return
    }
    await showSeasonReviewOverlay(review)
  }

  suspendedPlayers = []

  injuredPlayers = []

  teamStats = []

  availableLeagues = []
  availableSeasons = []
  availableMatchDays = []

  /**
   * Move one entry along a filter list. Clamped rather than wrapping: running
   * off either end should feel like a dead button, not jump to the far side.
   * @param {Array} list
   * @param {number} currentIndex
   * @param {number} direction - -1 or 1
   * @returns {*|null} the neighbouring entry, or null when there is none
   * @private
   */
  _neighbour (list, currentIndex, direction) {
    const next = currentIndex + direction
    if (currentIndex < 0 || next < 0 || next >= list.length) return null
    return list[next]
  }

  /**
   * @param {number} direction
   * @private
   */
  _stepLeague (direction) {
    const index = this.availableLeagues.findIndex(l => l.level === this.level && l.league === this.league)
    const target = this._neighbour(this.availableLeagues, index, direction)
    if (!target) return
    setQueryParams({
      level: target.level,
      league: target.league,
      season: this.season,
      match_day: this.matchDay
    })
  }

  /**
   * @param {number} direction
   * @private
   */
  _stepSeason (direction) {
    const index = this.availableSeasons.indexOf(this.season)
    const target = this._neighbour(this.availableSeasons, index, direction)
    if (target === null) return
    setQueryParams({ season: target, match_day: this.matchDay })
  }

  /**
   * @param {number} direction
   * @private
   */
  _stepMatchDay (direction) {
    const index = this.availableMatchDays.indexOf(this.matchDay)
    const target = this._neighbour(this.availableMatchDays, index, direction)
    if (target === null) return
    setQueryParams({ season: this.season, match_day: target })
  }
  _seasonCompleted = false

  recap = null
  recapFeaturedPlayer = null
  recapFeaturedTeam = null

  _teamStatsSortCol = 'squad_value'
  _teamStatsSortDir = -1

  get myTeamId () {
    return this.parentPage.myTeamId
  }

  async update (reloadData = false) {
    await super.update(reloadData)
    this._loadPlayerImages()
    this._loadRecapImage()
  }

  _attachTeamStatsHeaderHandler () {
    const thead = document.querySelector('.team-stats-thead')
    if (!thead) return
    thead.addEventListener('click', (e) => {
      const th = e.target.closest('[data-col]')
      if (!th) return
      const col = th.dataset.col
      if (this._teamStatsSortCol === col) {
        this._teamStatsSortDir *= -1
      } else {
        this._teamStatsSortCol = col
        this._teamStatsSortDir = col === 'name' ? 1 : -1
      }
      this._updateTeamStatsTable()
    })
  }

  _updateTeamStatsTable () {
    const tbody = document.getElementById('team-stats-tbody')
    if (tbody) {
      tbody.innerHTML = this._getSortedTeamStats().map(this._renderTeamStatsRow.bind(this)).join('')
    }
    document.querySelectorAll('.ts-sort-icon').forEach(el => {
      const col = el.dataset.sortCol
      if (col) el.innerHTML = this._sortIcon(col)
    })
  }

  _loadPlayerImages () {
    if (this.suspendedPlayers) {
      this.suspendedPlayers.forEach((player) => {
        if (!player || !player.team) return
        renderPlayerImage(player, player.team, 48).then(image => {
          const imageEl = document.querySelector(`${this._elementQuery} .suspended-image[data-suspended-id="${player.id}"]`)
          if (imageEl) {
            imageEl.innerHTML = image
          }
        })
      })
    }

    if (this.injuredPlayers) {
      this.injuredPlayers.forEach((player) => {
        if (!player || !player.team) return
        renderPlayerImage(player, player.team, 48).then(image => {
          const imageEl = document.querySelector(`${this._elementQuery} .injured-image[data-injured-id="${player.id}"]`)
          if (imageEl) {
            imageEl.innerHTML = image
          }
        })
      })
    }
  }

  _renderTopScorer (scorer, index) {
    if (!scorer || !scorer.team) return ['', '', '', '', '', '', '']
    const teamId = generateId()
    onClick(teamId, () => goTo(`team?id=${scorer.team.id}`))
    const playerId = generateId()
    onClick(playerId, () => {
      setQueryParams({ player_id: scorer.id + '' })
    })
    return [
      `${index + 1}.`,
      `<div id="${playerId}" class="d-flex align-items-center u-cursor-pointer"><span class="scorer-image me-2" data-scorer-id="${scorer.id}"></span>${scorer.name}</div>`,
      `${scorer.goals}`,
      `<span id="${teamId}" class="u-cursor-pointer"><span class="emblem-thumb">${renderEmblem(scorer.team, 24)}</span>${scorer.team.name}</span>`,
      `<span class="text-muted">${scorer.position}</span>`,
      `<span class="text-muted">${scorer.level}</span>`,
      `<span class="text-muted">${calculatePlayerAge(scorer, this.season)}</span>`
    ]
  }

  _renderSuspendedPlayer (player) {
    if (!player || !player.team) return ['', '', '', '']
    const teamId = generateId()
    onClick(teamId, () => goTo(`team?id=${player.team.id}`))
    const playerId = generateId()
    onClick(playerId, () => {
      setQueryParams({ player_id: player.id + '' })
    })
    const yellowCards = player.yellow_cards || 0
    const redCards = player.red_cards || 0
    return [
      `<span class="suspended-image" data-suspended-id="${player.id}" style="display:inline-block;width:48px;"></span>`,
      `<span id="${playerId}" class="u-cursor-pointer">${player.name}</span>`,
      `<span id="${teamId}" class="u-cursor-pointer">${player.team.name}</span>`,
      `${yellowCards > 0 ? `<span class="text-warning">${yellowCards} <i class="fa fa-square"></i></span>` : ''}${redCards > 0 ? `<span class="text-danger ms-1">${redCards} <i class="fa fa-square"></i></span>` : ''}`
    ]
  }

  _renderInjuredPlayer (player) {
    if (!player || !player.team) return ['', '', '', '', '']
    const teamId = generateId()
    onClick(teamId, () => goTo(`team?id=${player.team.id}`))
    const playerId = generateId()
    onClick(playerId, () => {
      setQueryParams({ player_id: player.id + '' })
    })
    const injuryKey = player.injury_type ? `injury.${player.injury_type}` : ''
    return [
      `<span class="injured-image" data-injured-id="${player.id}" style="display:inline-block;width:48px;"></span>`,
      `<span id="${playerId}" class="u-cursor-pointer">${player.name}</span>`,
      `<span id="${teamId}" class="u-cursor-pointer">${player.team.name}</span>`,
      `<span class="text-danger"><i class="fa fa-medkit"></i> ${t(injuryKey) || player.injury_type || ''}</span>`,
      `${player.injury_days_left || 0}`
    ]
  }

  _getLeagueAndLevel () {
    let {
      level,
      league
    } = getQueryParams()
    if (typeof level === 'undefined' || typeof league === 'undefined') return {}
    level = Number(level)
    league = Number(league)
    if (league < 0) league = 0
    if (level < 0) level = 0
    return {
      level,
      league
    }
  }

  _renderRecap () {
    if (!this.recap) return ''
    const player = this.recapFeaturedPlayer
    const team = this.recapFeaturedTeam
    const linkAttrs = player
      ? `data-recap-player-id="${player.id}"`
      : (team ? `data-recap-team-id="${team.id}"` : '')
    return `
      <div class="match-day-recap card mb-4 mt-3">
        <div class="card-body d-flex flex-column flex-md-row gap-3 align-items-start">
          <div class="match-day-recap-image" ${linkAttrs}></div>
          <div class="flex-grow-1">
            <h4 class="card-title mb-2">${this.recap.title}</h4>
            <p class="mb-0 text-body">${this.recap.text}</p>
          </div>
        </div>
      </div>
    `
  }

  _loadRecapImage () {
    if (!this.recap) return
    const container = document.querySelector(`${this._elementQuery} .match-day-recap-image`)
    if (!container) return
    const player = this.recapFeaturedPlayer
    const team = this.recapFeaturedTeam
    if (player && team) {
      renderPlayerImage(player, team, 120).then(html => {
        container.innerHTML = html
        container.classList.add('u-cursor-pointer')
        container.addEventListener('click', () => setQueryParams({ player_id: player.id }))
      })
    } else if (team) {
      container.innerHTML = renderEmblem(team, 96)
      container.classList.add('u-cursor-pointer')
      container.addEventListener('click', () => goTo(`team?id=${team.id}`))
    }
  }

  _renderStandingHeading () {
    const effectiveMatchDay = (this.standing || []).reduce((max, s) => Math.max(max, s.games || 0), 0)
    const isUpcoming = effectiveMatchDay < this.matchDay
    const heading = effectiveMatchDay > 0
      ? `${t('results.standing')} - ${effectiveMatchDay}. ${t('results.gameDayLabel')}`
      : t('results.standing')
    const note = isUpcoming
      ? `<p class="text-muted mb-3">${t('results.standingNotPlayedYet', { day: this.matchDay })}</p>`
      : ''
    return `<h3>${heading}</h3>${note}`
  }

  _renderStandingListItem (standingItem, index) {
    const hasUser = Boolean(standingItem.team.user_id)
    const diff = this.yesterdayStanding.findIndex(s => s.team.id === standingItem.team.id) - index

    return [
      `${index + 1}.`,
      diff < 0 ? '<i class="fa fa-arrow-down text-danger" aria-hidden="true"></i>' : (diff > 0 ? '<i class="fa fa-arrow-up text-success" aria-hidden="true"></i>' : ''),
      `<span class="emblem-thumb">${renderEmblem(standingItem.team, 24)}</span>${standingItem.team.name} ${hasUser ? '<i class="fa fa-user" aria-hidden="true"></i>' : ''}`,
      `${standingItem.games}`,
      `${standingItem.wins || 0}/${standingItem.draws || 0}/${standingItem.losses || 0}`,
      `${standingItem.goals}:${standingItem.against}`,
      `${standingItem.goals - standingItem.against}`,
      `${standingItem.points}`
    ]
  }

  async _getSeasonAndMatchDay () {
    let {
      season,
      match_day: matchDay
    } = getQueryParams()
    if (typeof season === 'undefined' && typeof matchDay === 'undefined') {
      return {}
    }
    season = Number(season)
    matchDay = Number(matchDay)
    if (matchDay < 1) matchDay = 1
    if (season < 0) season = 0
    return {
      season,
      matchDay
    }
  }

  _renderResultListItem (result) {
    const team1Data = this.standing.find(s => s.team.id === result.team1Id)?.team
    const team2Data = this.standing.find(s => s.team.id === result.team2Id)?.team

    const emblem1 = team1Data ? `<span class="emblem-thumb">${renderEmblem(team1Data, 24)}</span>` : ''
    const emblem2 = team2Data ? `<span class="emblem-thumb">${renderEmblem(team2Data, 24)}</span>` : ''

    const team1HasUser = Boolean(team1Data?.user_id)
    const team2HasUser = Boolean(team2Data?.user_id)
    const hasResult = typeof result.goalsTeam1 === 'number' && typeof result.goalsTeam2 === 'number'
    const team1Won = !result.isForfeit && hasResult && result.goalsTeam1 > result.goalsTeam2
    const team2Won = !result.isForfeit && hasResult && result.goalsTeam2 > result.goalsTeam1

    const userIcon = '<i class="fa fa-user fa-sm ms-1" aria-hidden="true"></i>'

    const team1IsMyTeam = this.myTeamId === result.team1Id
    const team2IsMyTeam = this.myTeamId === result.team2Id

    const team1Name = `${team1Won ? '<b>' : ''}${team1IsMyTeam ? '<span class="text-info">' : ''}${shortenTeamName(result.team1, result.team1Short)} ${team1HasUser ? userIcon : ''}${team1IsMyTeam ? '</span>' : ''}${team1Won ? '</b>' : ''}`
    const team2Name = `${team2Won ? '<b>' : ''}${team2IsMyTeam ? '<span class="text-info">' : ''}${shortenTeamName(result.team2, result.team2Short)} ${team2HasUser ? userIcon : ''}${team2IsMyTeam ? '</span>' : ''}${team2Won ? '</b>' : ''}`

    const forfeitIcon = `<i class="fa fa-exclamation-circle text-warning ms-1" title="${t('results.forfeitIcon')}" aria-label="${t('results.forfeitIcon')}"></i>`
    const score = result.isForfeit
      ? `${result.goalsTeam1 ?? '-'} : ${result.goalsTeam2 ?? '-'}${forfeitIcon}`
      : `${result.goalsTeam1 ?? '-'} : ${result.goalsTeam2 ?? '-'}`

    return [
      `${team1Name}${emblem1}`,
      score,
      `${emblem2}${team2Name}`
    ]
  }

  _sortIcon (col) {
    if (this._teamStatsSortCol !== col) return '<i class="fa fa-sort text-muted"></i>'
    return this._teamStatsSortDir === 1
      ? '<i class="fa fa-sort-up"></i>'
      : '<i class="fa fa-sort-down"></i>'
  }

  _getSortedTeamStats () {
    const col = this._teamStatsSortCol
    const dir = this._teamStatsSortDir
    return [...this.teamStats].sort((a, b) => {
      const av = col === 'name'
        ? (a[col] || '').localeCompare(b[col] || '')
        : Number(a[col]) - Number(b[col])
      return av * dir
    })
  }

  /**
   * Open the top-scorers overlay. Driven by the `top_scorers` URL query so the
   * list is linkable and closes/reopens cleanly (incl. mobile back-swipe) (#464).
   */
  _showTopScorersOverlay () {
    if (this._topScorersOverlay) return // already open
    let overlay
    if (!this.topScorer || this.topScorer.length === 0) {
      overlay = showOverlay(t('results.topScorer'), '', `<p class="text-muted mb-0">${t('results.noGamesYet')}</p>`)
    } else {
      const content = `${new Table({
        cols: [
          { name: '#' },
          { name: t('results.name') },
          { name: t('results.goals') },
          { name: t('results.team') },
          { name: 'Pos' },
          { name: 'Lvl' },
          { name: 'Age' }
        ],
        data: this.topScorer,
        renderRow: (scorer, index) => this._renderTopScorer(scorer, index),
        rowClass: (scorer) => scorer && scorer.team && this.myTeamId === scorer.team.id ? 'table-info' : ''
      })}`
      overlay = showOverlay(t('results.topScorer'), '', content)
      this._loadTopScorerImagesGlobal()
    }
    this._topScorersOverlay = overlay
    this._closeOverlayOnNavigation(overlay)
    overlay.onClose(() => {
      this._topScorersOverlay = null
      if (getQueryParams().top_scorers) setQueryParams({ top_scorers: null })
    })
  }

  _showTeamStatsOverlay () {
    if (!this.teamStats || this.teamStats.length === 0) return
    const content = `
      <div class="horizontal-scrollable-table">
        <table class="table table-hover wide-on-mobile mb-0">
          <thead class="team-stats-thead">
            <tr>
              <th scope="col"></th>
              <th scope="col" class="u-cursor-pointer text-nowrap" data-col="name">
                ${t('results.team')} <span class="ts-sort-icon" data-sort-col="name">${this._sortIcon('name')}</span>
              </th>
              <th scope="col" class="u-cursor-pointer text-end text-nowrap" data-col="squad_size">
                ${t('results.playerCount')} <span class="ts-sort-icon" data-sort-col="squad_size">${this._sortIcon('squad_size')}</span>
              </th>
              <th scope="col" class="u-cursor-pointer text-end text-nowrap" data-col="avg_strength">
                ${t('results.avgStrength')} <span class="ts-sort-icon" data-sort-col="avg_strength">${this._sortIcon('avg_strength')}</span>
              </th>
              <th scope="col" class="u-cursor-pointer text-end text-nowrap" data-col="total_strength">
                ${t('results.totalStrength')} <span class="ts-sort-icon" data-sort-col="total_strength">${this._sortIcon('total_strength')}</span>
              </th>
              <th scope="col" class="u-cursor-pointer text-end text-nowrap" data-col="squad_size">
                ${t('results.squadSize')} <span class="ts-sort-icon" data-sort-col="squad_size">${this._sortIcon('squad_size')}</span>
              </th>
              <th scope="col" class="u-cursor-pointer text-end text-nowrap" data-col="avg_freshness">
                ${t('results.avgFreshness')} <span class="ts-sort-icon" data-sort-col="avg_freshness">${this._sortIcon('avg_freshness')}</span>
              </th>
              <th scope="col" class="u-cursor-pointer text-end text-nowrap" data-col="squad_value">
                ${t('results.squadValue')} <span class="ts-sort-icon" data-sort-col="squad_value">${this._sortIcon('squad_value')}</span>
              </th>
            </tr>
          </thead>
          <tbody id="team-stats-tbody">
            ${this._getSortedTeamStats().map(this._renderTeamStatsRow.bind(this)).join('')}
          </tbody>
        </table>
      </div>
    `
    const overlay = showOverlay(t('results.teamStats'), '', content)
    this._attachTeamStatsHeaderHandler()
    this._closeOverlayOnNavigation(overlay)
  }

  _showStadiumsOverlay () {
    if (!this.stadiums || this.stadiums.length === 0) return
    const content = `${new Table({
      cols: [
        {
          name: '',
          width: '32px'
        },
        { name: t('results.team') },
        { name: t('stadium.stadiumName') },
        {
          name: t('stadium.size'),
          align: 'right'
        }
      ],
      data: this.stadiums,
      renderRow: (s) => {
        const team = {
          id: s.team_id,
          name: s.team_name,
          emblem: s.emblem,
          color: s.color,
          user_id: s.user_id
        }
        const hasUser = Boolean(s.user_id)
        return [
          `<span class="emblem-thumb">${renderEmblem(team, 24)}</span>`,
          `${s.team_name}${hasUser ? ' <i class="fa fa-user fa-sm" aria-hidden="true"></i>' : ''}`,
          s.stadium_name || '-',
          Number(s.stadium_size || 0).toLocaleString()
        ]
      },
      onClick: (s) => goTo(`team?id=${s.team_id}`),
      rowClass: (s) => this.myTeamId === s.team_id ? 'table-info' : ''
    })}`
    const overlay = showOverlay(t('stadium.stadiumsTitle'), '', content)
    this._closeOverlayOnNavigation(overlay)
  }

  async _showStandingHistoryOverlay () {
    const canvasId = generateId()
    const content = `
      <div class="standing-history-chart-scroll">
        <div class="standing-history-chart-container">
          <canvas id="${canvasId}"></canvas>
        </div>
      </div>
      <p id="standing-history-empty" class="text-muted mb-0 d-none">${t('results.noGamesYet')}</p>
    `
    const overlay = showOverlay(t('results.standingHistory'), '', content)
    this._closeOverlayOnNavigation(overlay)

    let chart = null
    overlay.onClose(() => {
      if (chart) {
        chart.destroy()
        chart = null
      }
    })

    const history = await server.getLeagueStandingHistory(this.season, this.level, this.league)
    const canvas = document.getElementById(canvasId)
    if (!canvas) return
    if (!history.matchDays || history.matchDays.length === 0) {
      canvas.classList.add('d-none')
      const emptyEl = document.getElementById('standing-history-empty')
      if (emptyEl) emptyEl.classList.remove('d-none')
      return
    }

    const teamCount = history.teams.length
    const datasets = history.teams.map(team => {
      const color = team.color || '#1a5f7a'
      const isMyTeam = this.myTeamId === team.id
      return {
        label: team.name,
        data: team.positions,
        borderColor: color,
        backgroundColor: color,
        borderWidth: isMyTeam ? 4 : 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0.1,
        spanGaps: true
      }
    })

    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: history.matchDays.map(d => `${d}`),
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 14,
              boxHeight: 14
            }
          },
          tooltip: {
            callbacks: {
              title: (items) => `${t('results.gameDayLabel')} ${items[0].label}`,
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}.`
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: t('results.gameDayLabel')
            }
          },
          y: {
            reverse: true,
            min: 1,
            max: Math.max(teamCount, 1),
            ticks: {
              stepSize: 1,
              precision: 0
            },
            title: {
              display: true,
              text: t('results.position')
            }
          }
        }
      }
    })
  }

  /**
   * Loads top scorer images using unscoped selectors so they target the open overlay.
   */
  _loadTopScorerImagesGlobal () {
    if (!this.topScorer) return
    this.topScorer.forEach((scorer) => {
      if (!scorer || !scorer.team) return
      renderPlayerImage(scorer, scorer.team, 48).then(image => {
        const imageEl = document.querySelector(`.scorer-image[data-scorer-id="${scorer.id}"]`)
        if (imageEl) {
          imageEl.innerHTML = image
        }
      })
    })
  }

  /**
   * Closes the overlay when the user navigates to a different page (e.g. clicks a
   * team row that calls goTo). Query-param-only changes — like opening a stacked
   * player modal — are ignored so the underlying overlay stays available.
   * @param {{onClose: (cb: () => void) => void, remove: () => void}} overlay
   */
  _closeOverlayOnNavigation (overlay) {
    const startPath = window.location.hash.split('?')[0]
    const handler = () => {
      if (window.location.hash.split('?')[0] !== startPath) {
        overlay.remove()
      }
    }
    window.addEventListener('hashchange', handler)
    overlay.onClose(() => window.removeEventListener('hashchange', handler))
  }

  _renderTeamStatsRow (stat) {
    const id = generateId()
    onClick('#' + id, () => goTo(`team?id=${stat.team_id}`))
    const isMyTeam = this.myTeamId === stat.team_id
    const team = {
      id: stat.team_id,
      name: stat.name,
      emblem: stat.emblem,
      color: stat.color,
      user_id: stat.user_id
    }
    const hasUser = Boolean(stat.user_id)
    const avgFreshness = Math.round(parseFloat(stat.avg_freshness) * 100)
    const squadValue = shortEuroFormat(Number(stat.squad_value))
    return `
      <tr id="${id}" class="u-cursor-pointer ${isMyTeam ? 'table-info' : ''}">
        <td style="width:32px;"><span class="emblem-thumb">${renderEmblem(team, 24)}</span></td>
        <td>${stat.name}${hasUser ? ' <i class="fa fa-user fa-sm" aria-hidden="true"></i>' : ''}</td>
        <td class="text-end">${stat.squad_size}</td>
        <td class="text-end">${parseFloat(stat.avg_strength).toFixed(1)}</td>
        <td class="text-end">${stat.total_strength}</td>
        <td class="text-end">${stat.squad_size}</td>
        <td class="text-end">${avgFreshness}%</td>
        <td class="text-end">${squadValue}</td>
      </tr>
    `
  }

  /**
   * Called by parent when query params change
   * @param {Object} queryParams
   */
  async applyQueryParams (_queryParams) {
    const {
      level,
      league
    } = this._getLeagueAndLevel()
    if (typeof level !== 'undefined' && typeof league !== 'undefined') {
      this.level = level
      this.league = league
    }
    const {
      season,
      matchDay
    } = await this._getSeasonAndMatchDay()
    if (typeof season !== 'undefined' && typeof matchDay !== 'undefined') {
      this.season = season
      this.matchDay = matchDay
    } else {
      this.season = undefined
      this.matchDay = undefined
    }
  }
}

