import { server } from '../../lib/gateway.js'
import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { goTo, setQueryParams } from '../../lib/router.js'
import { UIElement } from '../../lib/UIElement.js'
import { renderEmblem } from '../../partials/emblem.js'
import { renderPlayerImage } from '../../partials/playerImage.js'
import { Table } from '../../partials/table.js'
import { t } from '../../i18n/index.js'
import { shortenTeamName } from '../../util/team.js'
import { goToTeamPage } from '../../util/gameNavigation.js'
import { showHeadToHeadOverlay } from '../../partials/headToHeadOverlay.js'
import { euroFormat } from '../../lib/currency.js'
import { renderPageNumbers } from '../../partials/pagination.js'
import { wikiInfoIcon } from '../../partials/wikiInfoIcon.js'
import { renderFilterStepper } from '../../partials/filterStepper.js'

const CUP_PAGE_SIZE = 10

export class CupResultsPage extends UIElement {
  /**
   * @param {UIElement} parentPage
   */
  constructor (parentPage) {
    super()
    this.parentPage = parentPage
  }

  async load () {
    const { seasons } = await server.getAvailableCupSeasons()
    this.cupSeasons = seasons

    if (this.cupSeason === null && seasons.length > 0) {
      this.cupSeason = seasons[0]
    }

    if (this.cupSeason === null) {
      this.cupRounds = []
      this.cupResults = []
      this.cupBracket = {}
      return
    }

    const {
      rounds,
      totalRounds
    } = await server.getCupRounds(this.cupSeason)
    this.cupRounds = rounds
    this.cupTotalRounds = totalRounds || 0

    if ((this.cupRound === null || !rounds.some(r => r.round === this.cupRound)) && rounds.length > 0) {
      const lastPlayedRound = [...rounds].reverse().find(r => r.played)
      this.cupRound = lastPlayedRound ? lastPlayedRound.round : rounds[0].round
    }

    if (this.cupRound === null) {
      this.cupResults = []
      this.cupBracket = {}
      return
    }

    const nextUnplayedRound = rounds.find(r => !r.played)
    const isNextRound = nextUnplayedRound && this.cupRound === nextUnplayedRound.round
    const isCurrentSeason = this.cupSeasons.length > 0 && this.cupSeason === this.cupSeasons[0]
    const [{ results }, { suspendedPlayers }, { injuredPlayers }, { bracket }] = await Promise.all([
      server.getCupResults(this.cupSeason, this.cupRound),
      isCurrentSeason && isNextRound ? server.getSuspendedPlayersForCup(this.cupSeason, this.cupRound) : Promise.resolve({ suspendedPlayers: [] }),
      isCurrentSeason && isNextRound ? server.getInjuredPlayersForCup(this.cupSeason, this.cupRound) : Promise.resolve({ injuredPlayers: [] }),
      server.getCupBracket(this.cupSeason)
    ])
    this.cupResults = results
    this.suspendedPlayers = suspendedPlayers
    this.injuredPlayers = injuredPlayers
    this.cupBracket = bracket || {}
    // Reset pagination when the data set changes (different round/season).
    this._cupResultsPage = 0
    this._injuredPlayersPage = 0
  }

  get template () {

    return `
      <div>
        <div class="mb-4 d-flex align-items-center gap-4">
          <div>
            <h2>${t('cup.results')} ${wikiInfoIcon('cup')}</h2>
            <div class="results-filters d-flex flex-column flex-md-row gap-2 gap-md-3">
              ${renderFilterStepper({
    label: t('results.season'),
    selectId: 'cup-season-select',
    prevId: 'prev-cup-season-button',
    nextId: 'next-cup-season-button',
    prevLabel: t('common.prev'),
    nextLabel: t('common.next'),
    optionsHtml: this.cupSeasons.map(season => `<option value="${season}" ${season === this.cupSeason ? 'selected' : ''}>${season + 1}</option>`).join('')
  })}
              ${renderFilterStepper({
    label: t('cup.round'),
    selectId: 'cup-round-select',
    prevId: 'prev-cup-round-button',
    nextId: 'next-cup-round-button',
    prevLabel: t('common.prev'),
    nextLabel: t('common.next'),
    optionsHtml: this.cupRounds.map(r => `<option value="${r.round}" ${r.round === this.cupRound ? 'selected' : ''}>${this._getCupRoundName(r.round)}</option>`).join('')
  })}
            </div>
          </div>
          <div class="cup-trophy-icon">🏆</div>
        </div>

        <div class="alert alert-info mb-4">
          <i class="fa fa-info-circle me-1"></i>
          <b>${t('cup.infoTitle')}</b><br>
          ${t('cup.infoFormat', { totalRounds: this.cupTotalRounds })}
          ${t('cup.infoPrize', {
    basePrize: euroFormat.format(25000),
    winnerPrize: euroFormat.format(2000000)
  })}
        </div>

        <h3>${t('results.games')}</h3>
        ${this.cupResults.length === 0
    ? `<p class="text-muted">${t('cup.noGames')}</p>`
    : `
      ${new Table({
    cols: [
      {
        name: t('results.team1'),
        align: 'right',
        onClick: (result) => goToTeamPage(result.team1Id)
      },
      {
        name: '',
        align: 'center'
      },
      {
        name: t('results.team2'),
        onClick: (result) => goToTeamPage(result.team2Id)
      }
    ],
    classes: 'mb-2 game-teams-table',
    renderRow: (result) => this._renderCupResultItem(result),
    data: this._getPagedCupResults(),
    onClick: (result) => this._handleCupResultClick(result)
  })}
      <div class="cup-results-pagination mb-4">${this._renderPagination(this.cupResults.length, this._cupResultsPage, 'cup-results')}</div>
    `
}

        ${this.suspendedPlayers.length > 0 ? `
          <h3>${t('results.suspendedPlayers')}</h3>
          ${new Table({
    cols: [
      { name: '' },
      { name: t('results.name') },
      { name: t('results.team') },
      { name: t('player.cards') }
    ],
    classes: 'mb-4',
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
    classes: 'mb-2',
    data: this._getPagedInjuredPlayers(),
    renderRow: (player) => this._renderInjuredPlayer(player),
    rowClass: (player) => player && player.team && this.myTeamId === player.team.id ? 'table-info' : ''
  })}
          <div class="cup-injured-pagination mb-4">${this._renderPagination(this.injuredPlayers.length, this._injuredPlayersPage, 'cup-injured')}</div>
        ` : ''}

        ${this._renderCupBracket()}
      </div>
    `
  }

  get events () {
    return {
      '#prev-cup-round-button': {
        click: () => this._navigateCupRound(-1)
      },
      '#next-cup-round-button': {
        click: () => this._navigateCupRound(1)
      },
      '#prev-cup-season-button': {
        click: () => this._navigateCupSeason(-1)
      },
      '#next-cup-season-button': {
        click: () => this._navigateCupSeason(1)
      },
      // Dropdowns next to the arrows so a distant season/round is one click
      // away, matching the league page (#478).
      '(optional) #cup-season-select': {
        change: (event) => setQueryParams({
          sub_page: 'cup',
          cup_season: Number(event.target.value),
          cup_round: null
        })
      },
      '(optional) #cup-round-select': {
        change: (event) => setQueryParams({
          sub_page: 'cup',
          cup_season: this.cupSeason,
          cup_round: Number(event.target.value)
        })
      },
      '(optional) .cup-bracket': {
        mouseover: (e) => this._handleBracketTeamHover(e, true),
        mouseout: (e) => this._handleBracketTeamHover(e, false)
      },
      '(optional).cup-results-pagination': {
        click: (e) => this._handlePaginationClick(e, 'cupResults')
      },
      '(optional).cup-injured-pagination': {
        click: (e) => this._handlePaginationClick(e, 'injuredPlayers')
      }
    }
  }

  onMounted () {
    this._loadSuspendedPlayerImages()
  }

  _handleBracketTeamHover (event, enter) {
    const teamEl = event.target.closest('.cup-bracket-team[data-team-id]')
    if (!teamEl) return
    const teamId = teamEl.dataset.teamId
    const root = document.querySelector(this._elementQuery)
    if (!root) return
    const matches = root.querySelectorAll(`.cup-bracket-team[data-team-id="${teamId}"]`)
    matches.forEach(el => el.classList.toggle('cup-bracket-team--highlight', enter))
  }

  _renderCupBracket () {
    const allBracketRounds = Object.keys(this.cupBracket || {})
      .map(Number)
      .sort((a, b) => b - a)

    if (allBracketRounds.length === 0) return ''

    const isRoundPlayed = (round) => {
      const games = this.cupBracket[round]?.games || []
      if (games.length === 0) return false
      return games.every(g => g.played === 1 || (!g.team2 && !g.team2Id))
    }

    const playedIndices = []
    let nextUnplayedIndex = -1
    for (let i = 0; i < allBracketRounds.length; i++) {
      if (isRoundPlayed(allBracketRounds[i])) {
        playedIndices.push(i)
      } else if (nextUnplayedIndex === -1) {
        nextUnplayedIndex = i
      }
    }

    const defaultVisibleSet = new Set(playedIndices.slice(-2))
    if (nextUnplayedIndex !== -1) defaultVisibleSet.add(nextUnplayedIndex)
    if (defaultVisibleSet.size === 0) defaultVisibleSet.add(0)

    const canExpand = defaultVisibleSet.size < allBracketRounds.length
    const showAll = this.bracketShowAll === true

    const visibleRounds = showAll || !canExpand
      ? allBracketRounds
      : allBracketRounds.filter((_, i) => defaultVisibleSet.has(i))

    const toggleButtonId = generateId()
    onClick(toggleButtonId, () => {
      this.bracketShowAll = !showAll
      this.update()
    })

    const columns = visibleRounds.map((round) => {
      const roundData = this.cupBracket[round]
      const games = roundData?.games || []
      const matches = games.map(g => this._renderBracketMatch(g)).join('')
      return `
        <div class="cup-bracket-round">
          <div class="cup-bracket-round-title">
            <span>${this._getCupRoundName(round)}</span>
          </div>
          <div class="cup-bracket-matches">${matches}</div>
        </div>
      `
    }).join('')

    const toggleButton = canExpand
      ? `<button id="${toggleButtonId}" type="button" class="btn btn-sm btn-outline-secondary cup-bracket-toggle">${showAll ? t('cup.bracketShowLess') : t('cup.bracketShowAll')}</button>`
      : ''

    return `
      <h3 class="mt-4 d-flex align-items-center gap-2 flex-wrap">
        <span>${t('cup.bracketTitle')}</span>
        ${toggleButton}
      </h3>
      <div class="cup-bracket-scroll">
        <div class="cup-bracket">${columns}</div>
      </div>
    `
  }

  _renderBracketMatch (game) {
    const isPlayed = game.played === 1
    const isBye = !game.team2 && !game.team2Id
    const hasResult = isPlayed && typeof game.goalsTeam1 === 'number' && typeof game.goalsTeam2 === 'number'
    const team1Won = hasResult && game.goalsTeam1 > game.goalsTeam2
    const team2Won = hasResult && game.goalsTeam2 > game.goalsTeam1

    const matchId = generateId()
    onClick(matchId, (e) => this._handleBracketMatchClick(e, game, isBye))

    const team1Row = this._renderBracketTeamRow({
      name: game.team1,
      shortName: game.team1Short,
      color: game.team1Color,
      emblem: game.team1Emblem,
      teamId: game.team1Id,
      isMyTeam: this.myTeamId === game.team1Id,
      goals: hasResult ? game.goalsTeam1 : null,
      won: team1Won,
      isPlayed
    })

    const team2Row = isBye
      ? `<div class="cup-bracket-team cup-bracket-team--bye"><span class="cup-bracket-bye">${t('cup.bye')}</span></div>`
      : this._renderBracketTeamRow({
        name: game.team2,
        shortName: game.team2Short,
        color: game.team2Color,
        emblem: game.team2Emblem,
        teamId: game.team2Id,
        isMyTeam: this.myTeamId === game.team2Id,
        goals: hasResult ? game.goalsTeam2 : null,
        won: team2Won,
        isPlayed
      })

    const clickableClass = !isBye ? 'u-cursor-pointer' : ''
    return `
      <div id="${matchId}" class="cup-bracket-match ${clickableClass}">
        ${team1Row}
        ${team2Row}
      </div>
    `
  }

  /**
   * Click on a bracket match. Clicks on a team link navigate to that team
   * (handled natively by the anchor), so bail out here. Otherwise open the
   * game-details modal (played) or the head-to-head overlay (upcoming).
   * @param {Event} e
   * @param {Object} game
   * @param {boolean} isBye
   */
  _handleBracketMatchClick (e, game, isBye) {
    if (e.target.closest('a.cup-bracket-team-link')) return
    if (isBye) return
    if (game.played === 1) {
      setQueryParams({ game_id: game.id })
    } else if (game.team1Id && game.team2Id) {
      void showHeadToHeadOverlay(game.team1Id, game.team2Id)
    }
  }

  _renderBracketTeamRow ({
    name,
    shortName,
    color,
    emblem,
    teamId,
    isMyTeam,
    goals,
    won,
    isPlayed
  }) {
    const emblemHtml = `<span class="emblem-thumb cup-bracket-emblem">${renderEmblem({
      name,
      color,
      emblem
    }, 20)}</span>`
    const nameClasses = ['cup-bracket-team-name']
    if (won) nameClasses.push('cup-bracket-team-name--won')
    if (isMyTeam) nameClasses.push('text-info')
    const goalsHtml = goals !== null
      ? `<span class="cup-bracket-team-score">${goals}</span>`
      : (isPlayed ? '' : `<span class="cup-bracket-team-score cup-bracket-team-score--upcoming">-</span>`)
    const inner = `
      ${emblemHtml}
      <span class="${nameClasses.join(' ')}">${shortenTeamName(name, shortName) || ''}</span>
      ${goalsHtml}
    `
    // When the team is known, render the row as a link to its team page.
    // The hover-highlight and match-click handlers key off the
    // `.cup-bracket-team[data-team-id]` selector, which matches the anchor too.
    if (teamId != null) {
      return `
        <a class="cup-bracket-team cup-bracket-team-link" data-team-id="${teamId}" href="#team?id=${teamId}">
          ${inner}
        </a>
      `
    }
    return `
      <div class="cup-bracket-team">
        ${inner}
      </div>
    `
  }

  cupSeason = null

  cupRound = null
  cupRounds = []
  cupResults = []
  cupSeasons = []
  cupTotalRounds = 0
  suspendedPlayers = []
  injuredPlayers = []
  cupBracket = {}
  bracketShowAll = false
  _cupResultsPage = 0
  _injuredPlayersPage = 0

  get myTeamId () {
    return this.parentPage.myTeamId
  }

  _getCupRoundName (round) {
    if (round === 1) return t('cup.final')
    if (round === 2) return t('cup.semiFinal')
    if (round === 4) return t('cup.quarterFinal')
    if (round === 8) return t('cup.roundOf16')
    const sequentialNumber = this.cupTotalRounds - Math.log2(round)
    return t('cup.roundNumber', { number: sequentialNumber })
  }

  _navigateCupRound (direction) {
    const currentIndex = this.cupRounds.findIndex(r => r.round === this.cupRound)
    const newIndex = currentIndex + direction

    if (newIndex >= 0 && newIndex < this.cupRounds.length) {
      setQueryParams({
        sub_page: 'cup',
        cup_season: this.cupSeason,
        cup_round: this.cupRounds[newIndex].round
      })
    }
  }

  _navigateCupSeason (direction) {
    const currentIndex = this.cupSeasons.indexOf(this.cupSeason)
    const newIndex = currentIndex - direction

    if (newIndex >= 0 && newIndex < this.cupSeasons.length) {
      setQueryParams({
        sub_page: 'cup',
        cup_season: this.cupSeasons[newIndex]
      })
    }
  }

  _getPagedCupResults () {
    const start = this._cupResultsPage * CUP_PAGE_SIZE
    return this.cupResults.slice(start, start + CUP_PAGE_SIZE)
  }

  _getPagedInjuredPlayers () {
    const start = this._injuredPlayersPage * CUP_PAGE_SIZE
    return this.injuredPlayers.slice(start, start + CUP_PAGE_SIZE)
  }

  /**
   * @param {number} totalItems
   * @param {number} currentPage
   * @param {string} prevNextClassPrefix - e.g. 'cup-results' to namespace the prev/next CSS hooks
   * @returns {string}
   */
  _renderPagination (totalItems, currentPage, prevNextClassPrefix) {
    const totalPages = Math.ceil(totalItems / CUP_PAGE_SIZE)
    if (totalPages <= 1) return ''
    const hasPrev = currentPage > 0
    const hasNext = currentPage < totalPages - 1
    return `
      <nav>
        <ul class="pagination pagination-sm justify-content-center flex-wrap">
          <li class="page-item ${hasPrev ? '' : 'disabled'}">
            <span class="page-link ${prevNextClassPrefix}-prev u-cursor-pointer">${t('common.prev')}</span>
          </li>
          ${renderPageNumbers(totalPages, currentPage)}
          <li class="page-item ${hasNext ? '' : 'disabled'}">
            <span class="page-link ${prevNextClassPrefix}-next u-cursor-pointer">${t('common.next')}</span>
          </li>
        </ul>
      </nav>
    `
  }

  /**
   * @param {Event} event
   * @param {'cupResults'|'injuredPlayers'} list
   */
  _handlePaginationClick (event, list) {
    const target = event.target
    const totalItems = list === 'cupResults' ? this.cupResults.length : this.injuredPlayers.length
    const totalPages = Math.ceil(totalItems / CUP_PAGE_SIZE)
    const pageField = list === 'cupResults' ? '_cupResultsPage' : '_injuredPlayersPage'
    const prevClass = list === 'cupResults' ? '.cup-results-prev' : '.cup-injured-prev'
    const nextClass = list === 'cupResults' ? '.cup-results-next' : '.cup-injured-next'
    let next = this[pageField]
    if (target.closest(prevClass)) {
      next = Math.max(0, next - 1)
    } else if (target.closest(nextClass)) {
      next = Math.min(totalPages - 1, next + 1)
    } else {
      const pageLink = target.closest('[data-page-index]')
      if (!pageLink) return
      next = parseInt(pageLink.dataset.pageIndex, 10)
    }
    if (next === this[pageField]) return
    this[pageField] = next
    void this.update()
  }

  _renderCupResultItem (result) {
    const isPlayed = result.played === 1
    const isBye = !result.team2 && !result.team2Id

    const team1Data = {
      name: result.team1,
      color: result.team1Color,
      emblem: result.team1Emblem
    }
    const team2Data = isBye
      ? null
      : {
        name: result.team2,
        color: result.team2Color,
        emblem: result.team2Emblem
      }

    const emblem1 = `<span class="emblem-thumb">${renderEmblem(team1Data, 24)}</span>`
    const emblem2 = isBye ? '' : `<span class="emblem-thumb">${renderEmblem(team2Data, 24)}</span>`

    const team1HasUser = Boolean(result.team1UserId)
    const team2HasUser = Boolean(result.team2UserId)
    const hasResult = isPlayed && typeof result.goalsTeam1 === 'number' && typeof result.goalsTeam2 === 'number'
    const team1Won = hasResult && result.goalsTeam1 > result.goalsTeam2
    const team2Won = hasResult && result.goalsTeam2 > result.goalsTeam1

    const userIcon = '<i class="fa fa-user fa-sm ms-1" aria-hidden="true"></i>'

    const team1IsMyTeam = this.myTeamId === result.team1Id
    const team2IsMyTeam = this.myTeamId === result.team2Id

    const nameLabel1 = shortenTeamName(result.team1, result.team1Short)
    const nameLabel2 = isBye ? '' : shortenTeamName(result.team2, result.team2Short)

    const team1Name = `${team1Won ? '<b>' : ''}${team1IsMyTeam ? '<span class="text-info">' : ''}${nameLabel1}${team1HasUser ? userIcon : ''}${team1IsMyTeam ? '</span>' : ''}${team1Won ? '</b>' : ''}`

    const team2Name = isBye
      ? `<span class="text-muted">${t('cup.bye')}</span>`
      : `${team2Won ? '<b>' : ''}${team2IsMyTeam ? '<span class="text-info">' : ''}${nameLabel2}${team2HasUser ? userIcon : ''}${team2IsMyTeam ? '</span>' : ''}${team2Won ? '</b>' : ''}`

    return [
      `${team1Name}${emblem1}`,
      `${isBye ? t('cup.bye') : (isPlayed ? `${result.goalsTeam1 ?? '-'} : ${result.goalsTeam2 ?? '-'}` : t('cup.upcoming'))}`,
      `${emblem2}${team2Name}`
    ]
  }

  /**
   * Center/row click on a cup result: open the game-details modal for played
   * games, the head-to-head overlay for upcoming games. Byes have no action.
   * @param {Object} result
   */
  _handleCupResultClick (result) {
    const isBye = !result.team2 && !result.team2Id
    if (isBye) return
    if (result.played === 1) {
      setQueryParams({ game_id: result.id })
    } else if (result.team1Id && result.team2Id) {
      void showHeadToHeadOverlay(result.team1Id, result.team2Id)
    }
  }

  _loadSuspendedPlayerImages () {
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

  /**
   * Called by parent when query params change
   * @param {Object} queryParams
   */
  applyQueryParams (queryParams) {
    if (queryParams.cup_season !== undefined) {
      this.cupSeason = Number(queryParams.cup_season)
    }
    if (queryParams.cup_round !== undefined) {
      this.cupRound = Number(queryParams.cup_round)
    }
  }
}
