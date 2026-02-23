import { GameSlider } from '../../partials/gameSlider.js'
import { renderEmblem } from '../../partials/emblem.js'
import { formatLeague } from '../../util/league.js'
import { generateId } from '../../lib/html.js'
import { goTo } from '../../lib/router.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { t } from '../../i18n/index.js'

export class StartPage {
  /**
   * @param {object} options
   * @param {Array} options.sliderGames
   * @param {number} options.initialSlideIndex
   * @param {object} options.team
   * @param {Array} options.cupGames
   * @param {boolean} options.cupResultAlreadySeen
   * @param {Array} options.friendlyGames
   * @param {Array} options.standing
   * @param {number} options.teamPosition
   * @param {Array} options.urgencies
   */
  constructor ({
    sliderGames,
    initialSlideIndex,
    team,
    cupGames,
    cupResultAlreadySeen,
    friendlyGames,
    standing,
    teamPosition,
    urgencies
  }) {
    this._sliderGames = sliderGames
    this._initialSlideIndex = initialSlideIndex
    this.team = team
    this._cupGames = cupGames
    this._cupResultAlreadySeen = cupResultAlreadySeen
    this._friendlyGames = friendlyGames
    this.standing = standing
    this.teamPosition = teamPosition
    this._urgencies = urgencies
  }

  /**
   * @returns {string}
   */
  toString () {
    const leagueCardId = generateId()
    const cupCardId = generateId()
    const friendlyCardId = generateId()
    const gameSliderArgs = {
      games: this._sliderGames,
      teamId: this.team.id,
      initialIndex: this._initialSlideIndex,
      cardId: leagueCardId
    }
    return `
      <div class="d-flex flex-column flex-lg-row align-items-start u-gap-md">
        <div class="flex-grow-1 order-2 order-lg-1 w-100">
            <div id="${leagueCardId}" class="card card-body mb-2 bg-dark">
            <h5 class="mb-2 text-center text-white"><i class="fa fa-futbol-o"></i> ${formatLeague(this.team.level, this.team.league)}</h5>
            ${new GameSlider(gameSliderArgs)}
          </div>
          <div id="${cupCardId}" class="card card-body mb-2 bg-dark">
            <h5 class="mb-2 text-center text-white"><i class="fa fa-trophy"></i> ${t('cup.title')}</h5>
            ${this._renderCupGames(cupCardId)}
          </div>
          <div id="${friendlyCardId}" class="card card-body mb-2 bg-dark">
            <h5 class="mb-2 text-center text-white"><i class="fa fa-handshake-o"></i> ${t('friendly.title')}</h5>
            ${this._renderFriendlyGames(friendlyCardId)}
          </div>
        </div>
        <div class="u-w-lg-33 u-w-100 flex-shrink-0 text-center order-1 order-lg-2 mb-3 mb-lg-0">
          ${renderEmblem(this.team, 160)}
          <h2 class="mb-4">${this.team.name}</h2>
          ${this._renderMiniStanding()}
          <a href="#results" class="d-block mt-2 text-info border-0 text-end w-100 mb-3">
              <small>...${t('dashboard.standingLink')}</small>
          </a>
          <h5 class="mb-2 text-start"><i class="fa fa-clipboard"></i> ${t('dashboard.urgencyTitle')}</h5>
          ${this._renderUrgencyChecklist()}
        </div>
      </div>
    `
  }

  /**
   * Render the urgency checklist with checkmarks or exclamation marks
   * @returns {string}
   */
  _renderUrgencyChecklist () {
    const urgencyTypes = this._urgencies.map(u => u.type)

    const checks = [
      {
        type: 'INCOMPLETE_LINEUP',
        text: 'dashboard.urgencyLineup',
        okText: 'dashboard.urgencyOk.lineup',
        link: '#my-team'
      },
      {
        type: 'LOW_FRESHNESS',
        text: 'dashboard.urgencyFreshness',
        okText: 'dashboard.urgencyOk.freshness',
        link: '#my-team'
      },
      {
        type: 'YOUTH_LOW_STATS',
        text: 'dashboard.urgencyYouth',
        okText: 'dashboard.urgencyOk.youth',
        link: '#my-team?sub_page=youth'
      },
      {
        type: 'INCOMING_OFFERS',
        text: 'dashboard.urgencyOffers',
        okText: 'dashboard.urgencyOk.offers',
        link: '#trades?tab=incoming'
      },
      {
        type: 'NO_SPONSOR',
        text: 'dashboard.urgencySponsor',
        okText: 'dashboard.urgencyOk.sponsor',
        link: '#stadium?sub_page=finances'
      }
    ]

    const items = checks.map(check => {
      const urgency = this._urgencies.find(u => u.type === check.type)
      const isOk = !urgencyTypes.includes(check.type)

      if (isOk) {
        return `
          <li class="list-group-item d-flex align-items-center py-2 px-3 border-0">
            <i class="fa fa-check-circle text-success me-2"></i>
            <span class="text-muted small">${t(check.okText)}</span>
          </li>
        `
      }

      const message = t(check.text, { count: urgency?.count || 0 })
      return `
        <li class="list-group-item d-flex align-items-center py-2 px-3 border-0 ">
          <a href="${check.link}" class="text-decoration-none text-start">
            <i class="fa fa-exclamation-circle text-warning me-2"></i>
            <span class="text-warning small">${message}</span>
          </a>
        </li>
      `
    }).join('')

    return `<ul class="list-group list-group-flush">${items}</ul>`
  }

  /**
   * Render cup games section
   * @param {string} cardId - ID of the wrapper card element
   * @returns {GameSlider|string}
   */
  _renderCupGames (cardId) {
    if (this._cupGames.length === 0) {
      return `
        <div class="card bg-light border-0">
          <div class="card-body text-center text-white text-muted py-4">
            <i class="fa fa-trophy fa-2x mb-2 opacity-50"></i>
            <p class="mb-0">${t('cup.noGames')}</p>
          </div>
        </div>
      `
    }

    const cupSliderArgs = {
      games: this._cupGames,
      teamId: this.team.id,
      initialIndex: this._findCupInitialSlideIndex(),
      cardId
    }

    return new GameSlider(cupSliderArgs)
  }

  /**
   * Render friendly games section
   * @param {string} cardId - ID of the wrapper card element
   * @returns {GameSlider|string}
   */
  _renderFriendlyGames (cardId) {
    if (this._friendlyGames.length === 0) {
      return `
        <div class="card bg-transparent border-0">
          <div class="card-body text-center text-muted py-4">
            <i class="fa text-white fa-handshake-o fa-2x mb-2 opacity-50"></i>
            <p class="mb-0 text-white">${t('friendly.noGames')}</p>
          </div>
        </div>
      `
    }

    const friendlySliderArgs = {
      games: this._friendlyGames,
      teamId: this.team.id,
      initialIndex: this._friendlyGames.length - 1,
      cardId
    }

    return new GameSlider(friendlySliderArgs)
  }

  /**
   * @returns {string}
   */
  _renderMiniStanding () {
    if (!this.standing || this.standing.length === 0) {
      return ''
    }

    const pos = this.teamPosition - 1
    let startIndex = Math.max(0, pos - 2)
    const endIndex = Math.min(this.standing.length, startIndex + 5)
    if (endIndex - startIndex < 5) {
      startIndex = Math.max(0, endIndex - 5)
    }

    const teamsToShow = this.standing.slice(startIndex, endIndex)

    const rows = teamsToShow.map((item, idx) => {
      const actualIndex = startIndex + idx
      const hasUser = Boolean(item.team.user_id)
      const id = generateId()
      const isMyTeam = this.team.id === item.team.id

      onClick('#' + id, () => goTo(`team?id=${item.team.id}`))

      const trClasses = [
        isMyTeam ? 'table-info' : '',
        !isMyTeam && actualIndex < 2 ? 'table-success' : '',
        !isMyTeam && actualIndex > 13 ? 'table-warning' : ''
      ]

      return `
        <tr id="${id}" class="${trClasses.join(' ')}">
          <th class="results-rank-cell">${actualIndex + 1}.</th>
          <td class="text-start">
            <span class="emblem-thumb--sm">
              ${renderEmblem(item.team, 20)}
            </span>
            ${item.team.name} ${hasUser ? '<i class="fa fa-user" aria-hidden="true"></i>' : ''}
          </td>
          <td>${item.points}</td>
        </tr>
      `
    }).join('')

    return `
      <table class="table table-hover table-sm mb-0">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">${t('results.team')}</th>
            <th scope="col">${t('results.points')}</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `
  }

  /**
   * Find the initial slide index for the cup game slider.
   * Shows the latest result on first visit, then the next upcoming game on subsequent visits.
   * @returns {number}
   */
  _findCupInitialSlideIndex () {
    const lastPlayedIndex = this._cupGames.reduce((acc, g, i) => g.isPlayed ? i : acc, -1)
    const nextUpcomingIndex = this._cupGames.findIndex(g => !g.isPlayed && g.gameDate)

    if (this._cupResultAlreadySeen && nextUpcomingIndex !== -1) {
      return nextUpcomingIndex
    }

    return Math.max(0, lastPlayedIndex)
  }
}
