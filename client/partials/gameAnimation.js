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
  onClick(id, async () => {
    data.isPlaying = !data.isPlaying
    if (data.isPlaying) {
      el(id).innerHTML = '<i class="fa fa-pause text-white" aria-hidden="true"></i>'
      await _playGameAnimation()
      el(id).innerHTML = '<i class="fa fa-play text-white" aria-hidden="true"></i>'
    } else {
      el(id).innerHTML = '<i class="fa fa-play text-white" aria-hidden="true"></i>'
    }
  })
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
    if (!data.isPlaying) {
      _endAnimation(timerId, messageId, ballId)
      return
    }
    i++
    el(messageId).innerHTML = `${goalsTeamA} : ${goalsTeamB}`
    el(timerId).innerHTML = `'${Math.floor(i / 10)}`
    if (item.goal) {
      if (data.playerTeamA.some(p => p.id === item.player)) {
        el(data.gameAnimationId).style.boxShadow = `0 0 10px 10px ${data.team1.color}`
      } else {
        el(data.gameAnimationId).style.boxShadow = `0 0 10px 10px ${data.team2.color}`
      }
      for (let j = Math.max(0, i - 5); j < i; j++) {
        if (!data.isPlaying) {
          _endAnimation(timerId, messageId, ballId)
          return
        }
        const item2 = items[j]
        if (item2.pass && _inSameTeam(item2.newPlayer, item.player)) {
          await _moveBallToPlayer(item2.newPlayer, ballId)
        }
      }
      await _moveBallToPlayer(item.player, ballId)
      el(messageId).innerHTML = `${_playerName(item.player)} shoots...`
      await delay(1000)
      if (data.playerTeamA.some(p => p.id === item.player)) {
        el(ballId).className = 'ball away GK'
        goalsTeamA++
      } else {
        el(ballId).className = 'ball home GK'
        goalsTeamB++
      }
      el(messageId).innerHTML = 'GOAL!!!'
      await delay(1000)
    }
    if (item.keeperHolds && item.player) {
      if (data.playerTeamA.some(p => p.id === item.player)) {
        el(data.gameAnimationId).style.boxShadow = `0 0 10px 10px ${data.team1.color}`
      } else {
        el(data.gameAnimationId).style.boxShadow = `0 0 10px 10px ${data.team2.color}`
      }
      for (let j = Math.max(0, i - 5); j < i; j++) {
        if (!data.isPlaying) {
          _endAnimation(timerId, messageId, ballId)
          return
        }
        const item2 = items[j]
        if (item2.pass && _inSameTeam(item2.newPlayer, item.player)) {
          await _moveBallToPlayer(item2.newPlayer, ballId)
        }
      }
      await _moveBallToPlayer(item.player, ballId)

      el(messageId).innerHTML = `${_playerName(item.player)} shoots...`
      await delay(500)
      if (data.playerTeamA.some(p => p.id === item.player)) {
        el(ballId).className = 'ball away GK'
      } else {
        el(ballId).className = 'ball home GK'
      }
      el(messageId).innerHTML = 'No goal...'
      await delay(500)
    }
  }
  data.isPlaying = false
  _endAnimation(timerId, messageId, ballId)
}

function _playerName (playerId) {
  let player = data.playerTeamA.find(p => p.id === playerId)
  if (!player) player = data.playerTeamB.find(p => p.id === playerId)
  return player.name.split(' ')[1]
}

function _endAnimation (timerId, messageId, ballId) {
  el(data.gameAnimationId).classList.remove('play')
  el(timerId).remove()
  el(messageId).remove()
  el(ballId).remove()
  el(data.gameAnimationId).style.boxShadow = 'none'
}

/**
 * @param {number} playerId1
 * @param {number} playerId2
 * @returns {boolean}
 * @private
 */
function _inSameTeam (playerId1, playerId2) {
  const player1InTeamA = data.playerTeamA.some(p => p.id === playerId1)
  const player2InTeamA = data.playerTeamA.some(p => p.id === playerId2)
  const player1InTeamB = data.playerTeamB.some(p => p.id === playerId1)
  const player2InTeamB = data.playerTeamB.some(p => p.id === playerId2)
  return (player1InTeamA && player2InTeamA) || (player1InTeamB && player2InTeamB)
}

async function _moveBallToPlayer (playerId, ballId) {
  let player = data.playerTeamA.find(p => p.id === playerId)
  if (player) {
    el(ballId).className = 'ball home ' + player.position
  }
  player = data.playerTeamB.find(p => p.id === playerId)
  if (player) {
    el(ballId).className = 'ball away ' + player.position
  }
  await delay(500)
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
