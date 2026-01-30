import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { showOverlay } from '../partials/overlay.js'
import { PlayerList } from '../partials/playerList.js'
import { toast } from '../partials/toast.js'
import { formatDate } from '../lib/date.js'
import { News } from '../partials/news.js'

const pageIndex = 0
const pageSize = 10

const actionCardTexts = {
  LEVEL_UP_PLAYER_9: {
    title: 'Player Level Up ⬆',
    description: 'Choose a player in your team to give him a level up.'
  },
  LEVEL_UP_PLAYER_7: {
    title: 'Player Level Up (max. 7) ⬆',
    description: 'Choose a player in your team to give him a level up. Max Level 7!'
  },
  LEVEL_UP_PLAYER_4: {
    title: 'Player Level Up (max. 4) ⬆',
    description: 'Choose a player in your team to give him a level up. Max Level 4!'
  },
  CHANGE_PLAYER_POSITION: {
    title: 'Change Player Position',
    description: 'Choose a player in your team and change his favorite lineup position.'
  },
  NEW_YOUTH_PLAYER: {
    title: 'New Talent',
    description: 'Get a new player from your youth academy!'
  },
  FRESHNESS_10: {
    title: 'Fitness Boost',
    description: 'Give one of your player a 10% freshness boost.'
  }
}

export class DashboardPage extends UIElement {
  _overlay = null
  actionCards = []
  team = {}
  user = {}
  season = 0
  gameDay = 0
  game = {}
  messages = []

  /**
   * @returns {string}
   */
  get template () {
    const isHomeGame = this.game.team1Id === this.team.id

    return `
      <div>
        <h2>${this.team.name}</h2>
        <p>
          Welcome ${this.user.username}! We hope you are doing well!
        </p>
        <h3>Last Game</h3>
        <p>
          <b>Season: </b> ${this.season + 1}, <b>Game day: </b> ${this.gameDay}
        </p>
        <div class="card card-body mb-4 bg-light">
          <a class="row pt-2 d-flex" href="#results?game_id=${this.game.id}">
            <div class="col-12 col-sm-5 text-dark text-center ${isHomeGame ? 'font-weight-bold' : ''}"><h4>${this.game.team1 ?? ''}</h4></div>
            <div class="col-12 col-sm-2 text-dark text-center"><h4><span class="badge bg-info">${this.game.goalsTeam1 ?? '-'}:${this.game.goalsTeam2 ?? '-'}</span></h4></div>
            <div class="col-12 col-sm-5 text-dark text-center ${!isHomeGame ? 'font-weight-bold' : ''}"><h4>${this.game.team2 ?? ''}</h4></div>
          </a>
        </div>
        <h3>Action Cards</h3>
        <p>With every game played, you have the chance to earn one action card. All earned cards are shown here:</p>
        <div class="row" id="action-cards">
          ${this.actionCards.map((card, idx) => this._renderActionCard(card, idx)).join('')}
          <div class="col ${this.actionCards.length === 0 ? '' : 'hidden'}">
            <h4 class="text-muted text-center mt-5 mb-5">No action cards available...</h4>
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

    this.messages = await server.getLogMessages(pageIndex, pageSize)
  }

  /**
   * @returns {void}
   */
  onMounted () {
    this._attachActionCardHandlers()
  }

  /**
   * @returns {void}
   */
  _attachActionCardHandlers () {
    this.actionCards.forEach((card, idx) => {
      const useBtn = document.querySelector(`${this._elementQuery} [data-action-card="${idx}"] .btn-success`)
      const mergeBtn = document.querySelector(`${this._elementQuery} [data-action-card="${idx}"] .btn-warning`)

      if (useBtn) {
        useBtn.addEventListener('click', () => this._useActionCard(card))
      }
      if (mergeBtn) {
        mergeBtn.addEventListener('click', () => this._mergeCards(card))
      }
    })
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

    const mergeButton = canMerge
      ? `<button type="button" class="btn btn-warning mt-2 w-100">Merge Cards</button>`
      : ''

    return `
      <div class="col-12 col-sm-6 col-md-4 mb-4" data-action-card="${index}">
        <div class="action-card card text-white bg-dark">
          <div class="card-header">
            <i class="fa fa-magic" aria-hidden="true"></i>
            <i>Action Card</i>
          </div>
          <img class="card-img-top" src="assets/stock-image-${(actionCard.id % 4) + 1}.jpg" alt="Football">
          <div class="card-body">
            <h5 class="card-title">${actionCardTexts[actionCard.action].title}</h5>
            <p class="card-text">${actionCardTexts[actionCard.action].description}</p>
            <button type="button" class="btn btn-success w-100">Use now</button>
            ${mergeButton}
          </div>
        </div>
      </div>
    `
  }

  /**
   * @param {Object} actionCard
   * @returns {Promise<void>}
   */
  async _mergeCards (actionCard) {
    try {
      const cardsToMerge = this.actionCards.filter(a => a.action === actionCard.action)
      await server.mergeCards(cardsToMerge[0], cardsToMerge[1])
      toast('Merged cards to a better one.')
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

    const items = positions.map((p, index) => `
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
