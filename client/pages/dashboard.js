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
import { delay } from '../lib/delay.js'

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
  },
  BONUS_100K: {
    title: 'Cash Bonus',
    description: 'Receive an instant bonus of 100,000€.'
  }
}

const actionCardImages = {
  LEVEL_UP_PLAYER_10: 'assets/action-cards/level-up-player-10.svg',
  LEVEL_UP_PLAYER_7: 'assets/action-cards/level-up-player-7.svg',
  LEVEL_UP_PLAYER_4: 'assets/action-cards/level-up-player-4.svg',
  CHANGE_PLAYER_POSITION: 'assets/action-cards/change-player-position.svg',
  NEW_YOUTH_PLAYER: 'assets/action-cards/new-youth-player.svg',
  FRESHNESS_10: 'assets/action-cards/freshness-10.svg',
  BONUS_100K: 'assets/action-cards/bonus-100k.svg'
}

export class DashboardPage extends UIElement {
  _overlay = null
  _currentCardElement = null
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
          this._currentCardElement = actionCardEl

          if (canMerge) {
            const {
              ok,
              value
            } = await showDialog({
              title: actionCardTexts[card.action].title,
              text: 'Do you want to merge two cards into a better one, or use this card now? ',
              buttonText: 'Use Card',
              hasInput: false,
              buttonType: 'success',
              secondaryButtonText: 'Merge Cards',
              secondaryButtonType: 'info'
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
            <div class="col-5 col-sm-5 text-white text-center ${isHomeGame ? 'font-weight-bold' : ''}">
              <div class="d-flex flex-column flex-sm-row align-items-center justify-content-center">
                <div class="order-1 order-sm-0 mb-2 mb-sm-0 me-sm-2">${this.gameTeam1 ? renderEmblem(this.gameTeam1, 80) : ''}</div>
                <h5 class="order-0 order-sm-1 mb-2 mb-sm-0">${this.game.team1 ?? ''}</h5>
              </div>
            </div>
            <div class="col-2 col-sm-2 text-dark text-center"><h3><span class="badge bg-info">${this.game.goalsTeam1 ?? '-'}:${this.game.goalsTeam2 ?? '-'}</span></h3></div>
            <div class="col-5 col-sm-5 text-white text-center ${!isHomeGame ? 'font-weight-bold' : ''}">
              <div class="d-flex flex-column flex-sm-row-reverse align-items-center justify-content-center">
                <div class="order-1 order-sm-0 mb-2 mb-sm-0 ms-sm-2">${this.gameTeam2 ? renderEmblem(this.gameTeam2, 80) : ''}</div>
                <h5 class="order-0 order-sm-1 mb-2 mb-sm-0">${this.game.team2 ?? ''}</h5>
              </div>
            </div>
          </a>
        </div>
        <h3>Action Cards</h3>
        <p style="max-width: 620px">With every game played, you have the chance to earn at least one action card. Some cards of the same type can be merged to a better one (E.g. two Level Up 4 to one Level Up 7 Card). All earned cards are shown here:</p>
        <div class="card card-body bg-dark pt-4 mb-4" id="action-cards">
          ${this.actionCards.length === 0
      ? '<h4 class="text-muted text-center mt-3 mb-3">No action cards available...</h4>'
      : `<div class="action-cards-scroll">${this._renderGroupedActionCards()}</div>`}
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
  /**
   * Groups action cards by type and renders them as stacks
   * @returns {string}
   */
  _renderGroupedActionCards () {
    // Group cards by action type
    const grouped = {}
    this.actionCards.forEach((card, idx) => {
      if (!grouped[card.action]) {
        grouped[card.action] = []
      }
      grouped[card.action].push({
        card,
        idx
      })
    })

    // Sort action types alphabetically for consistent ordering
    const sortedTypes = Object.keys(grouped).sort()

    return sortedTypes.map(actionType => {
      const cards = grouped[actionType]
      const canMerge = (actionType === 'LEVEL_UP_PLAYER_4' || actionType === 'LEVEL_UP_PLAYER_7') && cards.length > 1
      const imageSrc = actionCardImages[actionType] || 'assets/action-cards/level-up-player-4.svg'
      const cardText = actionCardTexts[actionType] || { title: 'Unknown Card' }

      // Render stack - use first card's index for the click handler
      const firstCardIdx = cards[0].idx
      const stackOffset = Math.min(cards.length - 1, 4) // Max 4 cards visible in stack

      return `
        <div class="action-card-stack" data-action-card="${firstCardIdx}" data-can-merge="${canMerge}">
          ${cards.slice(0, 5).map((_, i) => `
            <div class="action-card-wrapper" style="--stack-index: ${i}; --stack-total: ${stackOffset};">
              <img class="action-card-image" src="${imageSrc}" alt="${cardText.title}">
            </div>
          `).join('')}
          ${canMerge ? '<span class="action-card-merge-badge">Mergeable</span>' : ''}
          ${cards.length > 1 ? `<span class="action-card-count">${cards.length}</span>` : ''}
        </div>
      `
    }).join('')
  }

  /**
   * @param {Object} actionCard
   * @returns {Promise<void>}
   */
  async _mergeCards (actionCard) {
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
   * Animates the card being used and waits for animation to complete
   * @returns {Promise<void>}
   */
  async _animateCardUsed () {
    if (!this._currentCardElement) return
    const topCard = this._currentCardElement.querySelector('.action-card-wrapper')
    if (topCard) {
      topCard.classList.add('card-used')
      await delay(1000)
    }
    this._currentCardElement = null
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
        await this._animateCardUsed()
        await this.load()
        await this.update(true)
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong...', 'error')
      }
      return
    }
    if (actionCard.action === 'BONUS_100K') {
      try {
        await server.useActionCard(actionCard, null, null)
        toast('You received 100,000€!', 'success')
        await this._animateCardUsed()
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
        this._overlay?.remove()
        toast(`OK. ${player.name} got fitness boost!`, 'success')
        await this._animateCardUsed()
        await this.load()
        await this.update(true)
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong...', 'error')
      }
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
          await this._animateCardUsed()
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
        await this._animateCardUsed()
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
