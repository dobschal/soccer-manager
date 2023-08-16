import { renderPlayerImage } from './playerImage.js'
import { el, generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'

const data = {}

/**
 * @param {GameResultType} game
 * @param {TeamType} team1
 * @param {TeamType} team2
 * @returns {string}
 */
export function renderGameAnimation (game, team1, team2) {
  data.team1 = team1
  data.team2 = team2
  data.game = game
  data.details = JSON.parse(game.details)
  console.log(data.details, game)
  /** @type {PlayerType[]} */
  data.playerTeamA = data.details.playerTeamA
  /** @type {PlayerType[]} */
  data.playerTeamB = data.details.playerTeamB
  data.gameAnimationId = generateId()

  // position hack for 2x CM and 2x CD
  setTimeout(() => {
    ['.player.home.CM', '.player.home.CD', '.player.home.DM', '.player.away.CM', '.player.away.CD', '.player.away.DM'].forEach(positionClass => {
      const el = document.querySelectorAll(positionClass)
      if (el.length === 2) {
        el.item(0).style.top = '38%'
        el.item(1).style.top = '62%'
      }
      if (el.length === 3) {
        el.item(0).style.top = '38%'
        el.item(1).style.top = '50%'
        el.item(2).style.top = '62%'
      }
    })
  }, 1000)

  return `<div class="game-animation" id="${data.gameAnimationId}">
        ${_renderPlayButton()}
        ${data.playerTeamA.map(_renderTeamPlayer(team1, 'home')).join('')}
        ${data.playerTeamB.map(_renderTeamPlayer(team2, 'away')).join('')}
    </div>`
}

/**
 * @returns {string}
 */
function _renderPlayButton () {
  const id = generateId()
  onClick(id, () => _playGameAnimation())
  return `
    <div class="play-button" id="${id}">
        <i class="fa fa-play text-white" aria-hidden="true"></i>
    </div>
  `
}

/**
 * @param {TeamType} team
 * @param {string} type
 * @returns {function(*): string}
 * @private
 */
function _renderTeamPlayer (team, type) {
  return (player) => {
    const id = generateId()
    renderPlayerImage(player, team, 50).then(image => el(id)?.insertAdjacentHTML('afterbegin', image)).catch(() => console.error('Could not load player image'))
    setTimeout(() => el(id)?.classList.add(player.in_game_position), 500)
    return `
        <div class="player ${type} ${player.freshness < 0.4 ? 'text-danger' : (player.freshness < 0.7 ? 'text-warning' : '')}" id="${id}">
          ${player.name.split(' ')[1]}
        </div>
      `
  }
}

async function _playGameAnimation () {
  el(data.gameAnimationId).classList.add('play')
  const timerId = _renderTimer()
  const ballId = _renderBall()
  const messageId = _renderEventMessage()
  const items = data.details.log
  let i = 0
  let goalsTeamA = 0
  let goalsTeamB = 0
  for (const item of items) {
    i++
    el(messageId).innerHTML = `${goalsTeamA} : ${goalsTeamB}`
    el(timerId).innerHTML = `'${Math.floor(i / 10)}`
    if (item.pass) {
      let player = data.playerTeamA.find(p => p.id === item.newPlayer)
      if (player) {
        el(ballId).className = 'ball home ' + player.position
      }
      player = data.playerTeamB.find(p => p.id === item.newPlayer)
      if (player) {
        el(ballId).className = 'ball away ' + player.position
      }
    }
    if (item.goal) {
      if (data.playerTeamA.some(p => p.id === item.player)) {
        goalsTeamA++
      } else {
        goalsTeamB++
      }
      el(messageId).innerHTML = 'GOOOAAAAL!!!'
    }
    if (item.lostBall) {
      el(messageId).innerHTML = 'Lost ball...'
      const newPlayerId = item.oponentPlayer
      let player = data.playerTeamA.find(p => p.id === newPlayerId)
      if (player) {
        el(ballId).className = 'ball home ' + player.position
      }
      player = data.playerTeamB.find(p => p.id === newPlayerId)
      if (player) {
        el(ballId).className = 'ball away ' + player.position
      }
    }
    await delay(300)
  }
}

/**
 * @param {number} delay
 * @returns {Promise<void>}
 */
function delay (delay) {
  return new Promise(resolve => {
    setTimeout(resolve, delay)
  })
}

/**
 * @returns {string} - ballId
 * @private
 */
function _renderBall () {
  const ballId = generateId()
  el(data.gameAnimationId).insertAdjacentHTML('beforeend', `
    <div id="${ballId}" class="ball">
        <img src="./assets/ball.svg" alt="ball"/>
    </div>
  `)
  return ballId
}

function _renderTimer () {
  const timerId = generateId()
  el(data.gameAnimationId).insertAdjacentHTML('beforeend', `
    <div id="${timerId}" class="timer">
        '0
    </div>
  `)
  return timerId
}

function _renderEventMessage () {
  const messageId = generateId()
  el(data.gameAnimationId).insertAdjacentHTML('beforeend', `
    <div id="${messageId}" class="message">
        Kickoff!
    </div>
  `)
  return messageId
}
