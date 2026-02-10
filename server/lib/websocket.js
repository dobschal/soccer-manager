import { WebSocketServer } from 'ws'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { query } from './database.js'

/** @type {Map<number, import('ws').WebSocket>} */
const clients = new Map()

/** @type {WebSocketServer|null} */
let wss = null

/**
 * Initialize WebSocket server attached to HTTP server
 * @param {import('http').Server} server
 */
export function initWebSocket (server) {
  wss = new WebSocketServer({ server })

  wss.on('connection', async (ws, req) => {
    try {
      // Extract token from query parameter
      const url = new URL(req.url, `http://${req.headers.host}`)
      const token = url.searchParams.get('token')

      if (!token) {
        ws.close(4001, 'No authentication token provided')
        return
      }

      // Verify JWT
      const { sub: userId } = jwt.verify(token, config.SECRET)

      // Verify user exists
      const [user] = await query('SELECT id FROM user WHERE id=? LIMIT 1', [userId])
      if (!user) {
        ws.close(4002, 'User not found')
        return
      }

      // Store connection by user ID
      clients.set(userId, ws)
      console.log(`WebSocket connected for user ${userId}`)

      ws.on('close', () => {
        clients.delete(userId)
        console.log(`WebSocket disconnected for user ${userId}`)
      })

      ws.on('error', (error) => {
        console.error(`WebSocket error for user ${userId}:`, error)
        clients.delete(userId)
      })

      // Send a welcome message
      ws.send(JSON.stringify({ event: 'CONNECTED', data: { userId } }))
    } catch (error) {
      console.error('WebSocket authentication failed:', error.message)
      ws.close(4003, 'Authentication failed')
    }
  })

  console.log('WebSocket server initialized')
}

/**
 * Send an event to a specific user
 * @param {number} userId
 * @param {string} event
 * @param {any} [data]
 * @returns {boolean} - true if message was sent
 */
export function sendToUser (userId, event, data = null) {
  const ws = clients.get(userId)
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ event, data }))
    console.log(`Sent ${event} to user ${userId}`)
    return true
  }
  return false
}

/**
 * Send an event to a team's user (if they have one)
 * @param {number} teamId
 * @param {string} event
 * @param {any} [data]
 * @returns {Promise<boolean>}
 */
export async function sendToTeam (teamId, event, data = null) {
  const [team] = await query('SELECT user_id FROM team WHERE id=? LIMIT 1', [teamId])
  if (team?.user_id) {
    return sendToUser(team.user_id, event, data)
  }
  return false
}
