import { server } from '../lib/gateway.js'
import { generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { render } from '../lib/render.js'
import { showOverlay } from '../partials/overlay.js'
import { PlayerList } from '../partials/playerList.js'
import { toast } from '../partials/toast.js'
import { formatDate } from '../lib/date.js'
import { renderNews } from '../partials/news.js'

let overlay; let data; const pageIndex = 0; const pageSize = 10

export async function renderDashboardPage () {
  data = await server.getActionCards()
  const { team, user } = await server.getMyTeam()
  const { level, league } = team
  const { season, gameDay } = await server.getCurrentGameday()
  const { results } = await server.getResults({ season, gameDay: gameDay - 1, level, league })
  const game = results.find(r => r.team1Id === team.id || r.team2Id === team.id) ?? {}
  const isHomeGame = game.team1Id === team.id
  const messages = await server.getLogMessages_V2(pageIndex, pageSize)
  //
  //  TODO: add pagination to messages
  //
  return `
    <h2>${team.name}</h2>
    <p>
      Welcome ${user.username}! We hope you are doing well!      
    </p>
    <h3>Last Game</h3>
    <p>
    <b>Season: </b> ${season + 1}, <b>Game day: </b> ${gameDay}
    </p>
    <div  class="card card-body mb-4 bg-light">    
      <a class="row pt-2 d-flex" href="#results?game_id=${game.id}">
          <div class="col-12 col-sm-5 text-dark text-center ${isHomeGame ? 'font-weight-bold' : ''}"><h4>${game.team1 ?? ''}</h4></div>
          <div class="col-12 col-sm-2 text-dark text-center"><h4><span class="badge bg-info">${game.goalsTeam1 ?? '-'}:${game.goalsTeam2 ?? '-'}</span></h4></div>
          <div class="col-12 col-sm-5 text-dark text-center ${!isHomeGame ? 'font-weight-bold' : ''}"><h4>${game.team2 ?? ''}</h4></div>
      </a>
    </div>
    <h3>Action Cards</h3>
    <p>With every game played, you have the chance to earn one action card. All earned cards are shown here:</p>
    <div class="row">
      ${data.actionCards.map(_renderActionCard).join('')}
      <div class="col ${data.actionCards.length === 0 ? '' : 'hidden'}">
        <h4 class="text-muted text-center mt-5 mb-5">No action cards available...</h4>
      </div>
    </div>
    
    ${renderNews()}
    
    <h3>Messages</h3>
    <ul class="list-group">
        ${messages.map(_renderLogMessage).join('')}
    </ul>
  `
}

function _renderLogMessage (messageItem) {
  const isToday = formatDate('WORDY hh:mm', messageItem.created_at).toLowerCase().includes('today')
  return `<li class="list-group-item ${isToday ? 'text-info' : 'text-muted'}">
            <small>${formatDate('WORDY hh:mm', messageItem.created_at)}</small><br><i class="fa fa-chevron-right" aria-hidden="true"></i> ${messageItem.message}
          </li>`
}

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
  }
}

/**
 * @param {ActionCardType} actionCard
 * @private
 */
function _renderActionCard (actionCard) {
  const id = generateId()
  const mergeButtonId = generateId()

  onClick('#' + id, () => {
    _useActionCard(actionCard)
  })

  const canMerge = (actionCard.action === 'LEVEL_UP_PLAYER_4' && data.actionCards.filter(a => a.action === 'LEVEL_UP_PLAYER_4').length > 1) ||
    (actionCard.action === 'LEVEL_UP_PLAYER_7' && data.actionCards.filter(a => a.action === 'LEVEL_UP_PLAYER_7').length > 1)

  if (canMerge) {
    onClick(mergeButtonId, async () => {
      try {
        const cardsToMerge = data.actionCards.filter(a => a.action === actionCard.action)
        await server.mergeCards({
          actionCard1: cardsToMerge[0],
          actionCard2: cardsToMerge[1]
        })
        toast('Merged cards to a better one.')
        render('#page', await renderDashboardPage())
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong', 'error')
      }
    })
  }

  const mergeButton = !canMerge
    ? ''
    : `<button id="${mergeButtonId}" type="button" class="btn btn-warning mt-2 w-100">Merge Cards</button>`

  return `
      <div class="col-12 col-sm-6 col-md-4 mb-4">
        <div class="action-card card text-white bg-dark">
        <div class="card-header">
          <i class="fa fa-magic" aria-hidden="true"></i>
          <i>Action Card</i>
        </div>
          <img class="card-img-top" src="assets/stock-image-${(actionCard.id % 4) + 1}.jpg" alt="Football">
          <div class="card-body">
            <h5 class="card-title">${actionCardTexts[actionCard.action].title}</h5>
            <p class="card-text">${actionCardTexts[actionCard.action].description}</p>
            <button id="${id}" type="button" class="btn btn-success w-100">Use now</button>
            ${mergeButton}
          </div>
        </div>
      </div>
    `
}

async function _useActionCard (actionCard) {
  if (actionCard.action.startsWith('LEVEL_UP_PLAYER_')) {
    _handleLevelUpActionCard(actionCard)
    return
  }
  if (actionCard.action === 'CHANGE_PLAYER_POSITION') {
    _handleChangePositionActionCard(actionCard)
    return
  }
  if (actionCard.action === 'NEW_YOUTH_PLAYER') {
    try {
      await server.useActionCard({ actionCard })
      toast('You got a new player!', 'success')
      render('#page', await renderDashboardPage())
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong...', 'error')
    }
    return
  }
  toast('Not implemented yet...')
}

async function _handleChangePositionActionCard (actionCard) {
  const data = await server.getMyTeam()
  const playerList = new PlayerList(data.players, false, async player => {
    overlay?.remove()
    const positionList = renderPositionList(async (position) => {
      try {
        await server.useActionCard({ actionCard, position, player })
        overlay?.remove()
        toast(`OK. ${player.name} plays another position now!`)
        render('#page', await renderDashboardPage())
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong...', 'error')
      }
    })
    overlay = showOverlay(
      'Select position',
      'Which position should the player play in the future?',
        `${positionList}`
    )
  })
  overlay = showOverlay(
    'Select player',
    'Which player should change his position?',
    `${playerList}`
  )
}

function renderPositionList (onClickHandler) {
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
  return '<ul class="list-group">' + positions.map(p => {
    const id = generateId()

    onClick('#' + id, () => onClickHandler(p[1]))

    return `
      <li id="${id}" class="list-group-item list-group-item-action">${p[0]} (${p[1]})</li>
    `
  }).join('') + '</ul>'
}

async function _handleLevelUpActionCard (actionCard) {
  const data = await server.getMyTeam()
  const playerList = new PlayerList(data.players, false, async player => {
    try {
      await server.useActionCard({ actionCard, player })
      overlay?.remove()
      toast(`Nice. ${player.name} got a level up!`)
      render('#page', await renderDashboardPage())
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong...', 'error')
    }
  })
  overlay = showOverlay(
    'Select player',
    'Which player should get a level up?',
    `${playerList}`
  )
}
