import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { showOverlay } from '../partials/overlay.js'
import { showDialog } from '../partials/dialog.js'
import { PlayerList } from '../partials/playerList.js'
import { toast } from '../partials/toast.js'
import { formatDate } from '../lib/date.js'
import { News } from '../partials/news.js'
import { renderEmblem } from '../partials/emblem.js'
import { showPlayerModal } from '../partials/playerModal.js'

const pageIndex = 0
const pageSize = 10

const actionCardTexts = {
  LEVEL_UP_PLAYER_10: {
    title: 'Legendary Mastery',
    description: 'Level up a player to reach level 10.'
  },
  LEVEL_UP_PLAYER_7: {
    title: 'Epic Advancement',
    description: 'Level up a player to reach level 7.'
  },
  LEVEL_UP_PLAYER_4: {
    title: 'Basic Promotion',
    description: 'Level up a player to reach level 4.'
  },
  CHANGE_PLAYER_POSITION: {
    title: 'Tactical Shift',
    description: 'Change a player\'s position on the field.'
  },
  NEW_YOUTH_PLAYER: {
    title: 'Youth Prospect',
    description: 'Recruit a promising youth player.'
  },
  FRESHNESS_10: {
    title: 'Energy Boost',
    description: 'Restore a player\'s freshness by 10.'
  }
}

const actionCardImages = {
  LEVEL_UP_PLAYER_10: 'assets/action-cards/level-up-player-10.svg',
  LEVEL_UP_PLAYER_7: 'assets/action-cards/level-up-player-7.svg',
  LEVEL_UP_PLAYER_4: 'assets/action-cards/level-up-player-4.svg',
  CHANGE_PLAYER_POSITION: 'assets/action-cards/change-player-position.svg',
  NEW_YOUTH_PLAYER: 'assets/action-cards/new-youth-player.svg',
  FRESHNESS_10: 'assets/action-cards/freshness-10.svg'
}

export class DashboardPage extends UIElement {
  _overlay = null
  actionCards = []
  team = {}
  user = {}
  season = 0
  gameDay = 0
  game = {}
  gameTeam1 = null
  gameTeam2 = null
  messages = []

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '#action-cards': {
        click: async (event) => {
          const target = event.target
          const actionCardEl = target.closest('[data-action-card]')
          if (!actionCardEl) return

          const idx = parseInt(actionCardEl.dataset.actionCard, 10)
          const card = this.actionCards[idx]
          const canMerge = actionCardEl.dataset.canMerge === 'true'

          if (canMerge) {
            const {
              ok,
              value
            } = await showDialog({
              title: actionCardTexts[card.action].title,
              text: 'What do you want to do with this card?',
              buttonText: 'Use Card',
              hasInput: false,
              buttonType: 'success',
              secondaryButtonText: 'Merge Cards',
              secondaryButtonType: 'warning'
            })
            if (ok) {
              void this._useActionCard(card)
            } else if (value === 'secondary') {
              void this._mergeCards(card)
            }
          } else {
            void this._useActionCard(card)
          }
        }
      }
    }
  }

  /**
   * @returns {string}
   */
  get template () {
    const isHomeGame = this.game.team1Id === this.team.id
    const myGoals = isHomeGame ? this.game.goalsTeam1 : this.game.goalsTeam2
    const opponentGoals = isHomeGame ? this.game.goalsTeam2 : this.game.goalsTeam1
    const hasResult = typeof myGoals === 'number' && typeof opponentGoals === 'number'
    const isWin = hasResult && myGoals > opponentGoals
    const isDraw = hasResult && myGoals === opponentGoals
    const resultMessage = !hasResult
      ? 'The result is not yet available.'
      : isWin
        ? 'Congratulations on your victory! Keep up the great work!'
        : isDraw
          ? 'A draw is not a loss. Every point counts in the race for the title!'
          : 'Tough loss, but champions are made by how they respond. Next game is yours!'

    return `
      <div>
        <h2>${this.team.name}</h2>
        <p>
          Nice to see you ${this.user.username}! We hope you are doing well!<br>
          On game day ${this.gameDay} of season ${this.season + 1}, your team faced ${isHomeGame ? this.game.team2 : this.game.team1}.
          ${resultMessage}
        </p>
        <div class="card card-body mb-4 bg-dark">
          <a class="row pt-2 d-flex align-items-center" href="#results?game_id=${this.game.id}">            
            <div class="col-4 col-sm-3 text-white text-center ${isHomeGame ? 'font-weight-bold' : ''}"><h5>${this.game.team1 ?? ''}</h5></div>
            <div class="col-2 col-sm-2 text-center">${this.gameTeam1 ? renderEmblem(this.gameTeam1, 120) : ''}</div>
            <div class="col-12 col-sm-2 text-dark text-center order-first order-sm-0 mb-2 mb-sm-0"><h3><span class="badge bg-info">${this.game.goalsTeam1 ?? '-'}:${this.game.goalsTeam2 ?? '-'}</span></h3></div>
            <div class="col-2 col-sm-2 text-center">${this.gameTeam2 ? renderEmblem(this.gameTeam2, 120) : ''}</div>
            <div class="col-4 col-sm-3 text-white text-center ${!isHomeGame ? 'font-weight-bold' : ''}"><h5>${this.game.team2 ?? ''}</h5></div>            
          </a>
        </div>
        <h3>Action Cards</h3>
        <p style="max-width: 620px">With every game played, you have the chance to earn at least one action card. Some cards of the same type can be merged to a better one (E.g. two Level Up 4 to one Level Up 7 Card). All earned cards are shown here:</p>
        <div class="card card-body bg-dark pt-4 mb-4" id="action-cards">
        <div class="row">
          ${this.actionCards.map((card, idx) => this._renderActionCard(card, idx)).join('')}
          <div class="col ${this.actionCards.length === 0 ? '' : 'hidden'}">
            <h4 class="text-muted text-center mt-5 mb-5">No action cards available...</h4>
          </div>
          </div>
        </div>

        ${new News()}

        <h3>Messages</h3>
        <ul class="list-group">
          ${this.messages.map(m => this._renderLogMessage(m)).join('')}
        </ul>
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const actionCardsResponse = await server.getActionCards()
    this.actionCards = actionCardsResponse.actionCards

    const teamResponse = await server.getMyTeam()
    this.team = teamResponse.team
    this.user = teamResponse.user

    const gamedayResponse = await server.getCurrentGameday()
    this.season = gamedayResponse.season
    this.gameDay = gamedayResponse.gameDay

    const resultsResponse = await server.getResults(this.gameDay - 1, this.season, this.team.level, this.team.league)
    this.game = resultsResponse.results.find(r => r.team1Id === this.team.id || r.team2Id === this.team.id) ?? {}

    // Fetch team data for emblems
    if (this.game.team1Id && this.game.team2Id) {
      const [team1Response, team2Response] = await Promise.all([
        server.getTeamById(this.game.team1Id),
        server.getTeamById(this.game.team2Id)
      ])
      this.gameTeam1 = team1Response
      this.gameTeam2 = team2Response
    }

    this.messages = await server.getLogMessages(pageIndex, pageSize)
  }

  /**
   * @param {{ player_id?: string }} queryParams
   * @returns {Promise<void>}
   */
  async onQueryChanged ({ player_id: playerId }) {
    if (playerId) {
      const id = Number(playerId)
      if (Number.isFinite(id) && id > 0) {
        await showPlayerModal(id)
      } else if (typeof window !== 'undefined' && typeof URL !== 'undefined') {
        // Clear invalid player_id from the URL to avoid repeated invalid calls
        try {
          const url = new URL(window.location.href)
          url.searchParams.delete('player_id')
          window.history.replaceState(window.history.state, document.title, url.toString())
        } catch {
          // Ignore URL manipulation errors
        }
      }
    }
  }

  /**
   * @param {Object} messageItem
   * @returns {string}
   */
  _renderLogMessage (messageItem) {
    const isToday = formatDate('WORDY hh:mm', messageItem.created_at).toLowerCase().includes('today')
    return `
      <li class="list-group-item ${isToday ? 'text-info' : 'text-muted'}">
        <small>${formatDate('WORDY hh:mm', messageItem.created_at)}</small><br>
        <i class="fa fa-chevron-right" aria-hidden="true"></i> ${messageItem.message}
      </li>
    `
  }

  /**
   * @param {Object} actionCard
   * @param {number} index
   * @returns {string}
   */
  _renderActionCard (actionCard, index) {
    const canMerge = (actionCard.action === 'LEVEL_UP_PLAYER_4' && this.actionCards.filter(a => a.action === 'LEVEL_UP_PLAYER_4').length > 1) ||
      (actionCard.action === 'LEVEL_UP_PLAYER_7' && this.actionCards.filter(a => a.action === 'LEVEL_UP_PLAYER_7').length > 1)

    const imageSrc = actionCardImages[actionCard.action] || 'assets/action-cards/level-up-player-4.svg'
    const mergeBadge = canMerge
      ? `<span class="action-card-merge-badge">Mergeable</span>`
      : ''

    return `
      <div class="col-12 col-sm-6 col-md-4 col-lg-3 col-xl-2 mb-4" data-action-card="${index}" data-can-merge="${canMerge}">
        <div class="action-card-wrapper">
          <img class="action-card-image" src="${imageSrc}" alt="${actionCardTexts[actionCard.action].title}">
          ${mergeBadge}
        </div>
      </div>
    `
  }

  /**
   * @param {Object} actionCard
   * @returns {Promise<void>}
   */
  async _mergeCards (actionCard) {
    const upgradeMap = {
      LEVEL_UP_PLAYER_4: 'Level Up (max. 7)',
      LEVEL_UP_PLAYER_7: 'Level Up (max. 10)'
    }
    const upgradeTo = upgradeMap[actionCard.action] ?? 'a better card'

    const { ok } = await showDialog({
      title: 'Merge Cards?',
      text: `Merging combines two identical action cards into a more powerful one.
             You will lose both cards and receive one "${upgradeTo}" card instead.
             This allows you e.g. to level up players to higher levels!`,
      buttonText: 'Merge Cards',
      hasInput: false,
      buttonType: 'warning'
    })

    if (!ok) return

    try {
      const cardsToMerge = this.actionCards.filter(a => a.action === actionCard.action)
      await server.mergeCards(cardsToMerge[0], cardsToMerge[1])
      toast('Merged cards to a better one!', 'success')
      await this.load()
      await this.update(true)
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong', 'error')
    }
  }

  /**
   * @param {Object} actionCard
   * @returns {Promise<void>}
   */
  async _useActionCard (actionCard) {
    if (actionCard.action.startsWith('FRESHNESS_')) {
      await this._handleFitnessActionCard(actionCard)
      return
    }
    if (actionCard.action.startsWith('LEVEL_UP_PLAYER_')) {
      await this._handleLevelUpActionCard(actionCard)
      return
    }
    if (actionCard.action === 'CHANGE_PLAYER_POSITION') {
      await this._handleChangePositionActionCard(actionCard)
      return
    }
    if (actionCard.action === 'NEW_YOUTH_PLAYER') {
      try {
        await server.useActionCard(actionCard, null, null)
        toast('You got a new player!', 'success')
        await this.load()
        await this.update(true)
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong...', 'error')
      }
      return
    }
    toast('Not implemented yet...')
  }

  /**
   * @param {Object} actionCard
   * @returns {Promise<void>}
   */
  async _handleFitnessActionCard (actionCard) {
    const data = await server.getMyTeam()
    const playerList = new PlayerList(data.players, false, async player => {
      try {
        await server.useActionCard(actionCard, player, null)
        toast(`OK. ${player.name} got fitness boost!`, 'success')
        await this.load()
        await this.update(true)
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong...', 'error')
      }
      this._overlay?.remove()
    })
    this._overlay = showOverlay(
      'Select player',
      'Which player should get a fitness boost?',
      `${playerList}`
    )
  }

  /**
   * @param {Object} actionCard
   * @returns {Promise<void>}
   */
  async _handleChangePositionActionCard (actionCard) {
    const data = await server.getMyTeam()
    const playerList = new PlayerList(data.players, false, async player => {
      this._overlay?.remove()
      const positionList = this._renderPositionList(async (position) => {
        try {
          await server.useActionCard(actionCard, player, position)
          this._overlay?.remove()
          toast(`OK. ${player.name} plays another position now!`, 'success')
          await this.load()
          await this.update(true)
        } catch (e) {
          console.error(e)
          toast(e.message ?? 'Something went wrong...', 'error')
        }
      })
      this._overlay = showOverlay(
        'Select position',
        'Which position should the player play in the future?',
        `${positionList}`
      )
    })
    this._overlay = showOverlay(
      'Select player',
      'Which player should change his position?',
      `${playerList}`
    )
  }

  /**
   * @param {Function} onClickHandler
   * @returns {string}
   */
  _renderPositionList (onClickHandler) {
    const positions = [
      ['Goalkeeper', 'GK'],
      ['Left Defender', 'LD'],
      ['Central Defender', 'CD'],
      ['Right Dfender', 'RD'],
      ['Left Midfielder', 'LM'],
      ['Defensive Midfielder', 'DM'],
      ['Central Midfielder', 'CM'],
      ['Right Midfielder', 'RM'],
      ['Offensive Midfielder', 'OM'],
      ['Left Attacker', 'LA'],
      ['Central Attacker', 'CA'],
      ['Right Attacker', 'RA']
    ]

    const items = positions.map((p) => `
      <li class="list-group-item list-group-item-action" data-position="${p[1]}">${p[0]} (${p[1]})</li>
    `).join('')

    setTimeout(() => {
      positions.forEach(p => {
        const item = document.querySelector(`[data-position="${p[1]}"]`)
        if (item) {
          item.addEventListener('click', () => onClickHandler(p[1]))
        }
      })
    })

    return `<ul class="list-group">${items}</ul>`
  }

  /**
   * @param {Object} actionCard
   * @returns {Promise<void>}
   */
  async _handleLevelUpActionCard (actionCard) {
    const data = await server.getMyTeam()
    const playerList = new PlayerList(data.players, false, async player => {
      try {
        await server.useActionCard(actionCard, player, null)
        this._overlay?.remove()
        toast(`Nice. ${player.name} got a level up!`, 'success')
        await this.load()
        await this.update(true)
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong...', 'error')
      }
    })
    this._overlay = showOverlay(
      'Select player',
      'Which player should get a level up?',
      `${playerList}`
    )
  }
}

/**
 * @returns {Promise<string>}
 */
export async function renderDashboardPage () {
  return new DashboardPage().toString()
}
