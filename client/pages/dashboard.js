import { server } from '../lib/gateway.js'
import { generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { render } from '../lib/render.js'
import { showOverlay } from '../partials/overlay.js'
import { renderPlayersList } from '../partials/playersList.js'
import { toast } from '../partials/toast.js'

let overlay

export async function renderDashboardPage () {
  const userInfo = await server.getMyTeam()
  console.log('userInfo: ', userInfo)
  const data = await server.getActionCards()
  console.log('Data: ', data)
  return `
    <h2>${userInfo.team.name}</h2>
    <p>
      Welcome ${userInfo.user.username}! We hope you are doing well! 
    </p>
    <h3>Action Cards</h3>
    <p>With every game played, you have the chance to earn one action card. All earned cards are shown here:</p>
    <div class="row">
      ${data.actionCards.map(_renderActionCard).join('')}
      <div class="col ${data.actionCards.length === 0 ? '' : 'hidden'}">
        <h4 class="text-muted text-center mt-5 mb-5">No action cards available...</h4>
      </span>
    </div>
  `
}

const actionCardTexts = {
  LEVEL_UP_PLAYER: {
    title: 'Player Level Up ⬆',
    description: 'Choose a player in your team to give him a level up.'
  },
  CHANGE_PLAYER_POSITION: {
    title: 'Change Player Position',
    description: 'Choose a player in your team and change his favorite lineup position.'
  },
  NEW_YOUTH_PLYER: {
    title: 'New Talent',
    description: 'Get a new player from your youth academy!'
  }
}

function _renderActionCard (actionCard) {
  const id = generateId()

  onClick('#' + id, () => {
    _useActionCard(actionCard)
  })

  return `
      <div class="col-4">
        <div class="action-card card text-white bg-dark">
        <div class="card-header">
          <i class="fa fa-magic" aria-hidden="true"></i>
          <i>Action Card</i>
        </div>
          <img class="card-img-top" src="assets/stock-image-1.jpg" alt="Football">
          <div class="card-body">
            <h5 class="card-title">${actionCardTexts[actionCard.action].title}</h5>
            <p class="card-text">${actionCardTexts[actionCard.action].description}</p>
            <button id="${id}" type="button" class="btn btn-primary">Use now</button>
          </div>
        </div>
      </div>
    `
}

async function _useActionCard (actionCard) {
  if (actionCard.action === 'LEVEL_UP_PLAYER') {
    _handleLevelUpActionCard(actionCard)
    return
  }
  if (actionCard.action === 'CHANGE_PLAYER_POSITION') {
    _handleChangePositionActionCard(actionCard)
    return
  }
  if (actionCard.action === 'NEW_YOUTH_PLYER') {
    try {
      await server.useActionCard({ actionCard })
      toast('You got a new player!')
      render('#page', await renderDashboardPage())
    } catch (e) {
      console.error(e)
      toast('Something went wrong...')
    }
    return
  }
  toast('Not implemented yet...')
}

async function _handleChangePositionActionCard (actionCard) {
  const data = await server.getMyTeam()
  const playerList = await renderPlayersList(data.players, false, async player => {
    overlay?.remove()
    const positionList = renderPositionList(async (position) => {
      try {
        await server.useActionCard({ actionCard, position, player })
        overlay?.remove()
        toast(`OK. ${player.name} plays another position now!`)
        render('#page', await renderDashboardPage())
      } catch (e) {
        console.error(e)
        toast('Something went wrong...')
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
  const playerList = await renderPlayersList(data.players, false, async player => {
    try {
      await server.useActionCard({ actionCard, player })
      overlay?.remove()
      toast(`Nice. ${player.name} got a level up!`)
      render('#page', await renderDashboardPage())
    } catch (e) {
      console.error(e)
      toast('Something went wrong...')
    }
  })
  overlay = showOverlay(
    'Select player',
    'Which player should get a level up?',
    `${playerList}`
  )
}
