/**
 * Central registry of all WebSocket server events sent from the API to the
 * browser client. Both server-side senders (`sendToUser`, `sendToTeam`) and
 * client-side subscribers (`UIElement.serverEvents`) validate their event
 * names against this map, so a typo on either side fails loudly instead of
 * silently dropping notifications.
 *
 * Physically lives under `client/lib/` (so it ships with the browser + native
 * app bundle without extra plumbing), but is imported by the server via the
 * same cross-package pattern already used for `client/util/formation.js`.
 *
 * When adding a new event:
 * 1. Add a constant here with a one-line `description` explaining what
 *    triggers it, who receives it, and the payload shape.
 * 2. Send it from the server via `sendToUser(userId, SERVER_EVENTS.MY_EVENT, payload)`.
 * 3. Consume it from a client UIElement via
 *    `get serverEvents () { return { [SERVER_EVENTS.MY_EVENT]: (data) => this.update(true) } }`.
 *
 * @typedef {Object} ServerEventSpec
 * @property {string} name - The event name sent over the wire.
 * @property {string} description - One-liner: what triggers it, receiver, payload shape.
 */

/** @type {Record<string, ServerEventSpec>} */
export const SERVER_EVENTS = {
  CONNECTED: {
    name: 'CONNECTED',
    description: 'Sent by the server right after a successful websocket handshake. Payload: { userId }.'
  },
  RECONNECTED: {
    name: 'RECONNECTED',
    description: 'Fired locally on the client when the websocket recovers after a drop; consumers should refetch to catch missed events. No payload.'
  },
  NEW_SELL_TRADE_OFFER: {
    name: 'NEW_SELL_TRADE_OFFER',
    description: 'A sell offer was created for one of the recipient\'s players. Sent only to the selling team\'s user. Payload: { playerId }.'
  },
  REMOVE_SELL_TRADE_OFFER: {
    name: 'REMOVE_SELL_TRADE_OFFER',
    description: 'A sell offer was removed (user-cancelled or auto-cleaned by the per-team limit) for one of the recipient\'s players. Sent only to the selling team\'s user. Payload: { playerId }.'
  },
  NEW_LOG_MESSAGE: {
    name: 'NEW_LOG_MESSAGE',
    description: 'A generic log entry was added for the team (excess sell-offer cleanup, etc.) — used by the layout to bump the "new messages" badge. Sent only to the affected team\'s user. Payload: { message, action, icon, type }.'
  },
  BALANCE_UPDATED: {
    name: 'BALANCE_UPDATED',
    description: 'The team balance changed (income, expense, transfer). Sent only to the affected team\'s user. Payload: { balance }.'
  },
  BUY_OFFER_ACCEPTED: {
    name: 'BUY_OFFER_ACCEPTED',
    description: 'A buy offer this user made was accepted. Sent only to the buying user. Payload: { message, ... }.'
  },
  BUY_OFFER_REJECTED: {
    name: 'BUY_OFFER_REJECTED',
    description: 'A buy offer this user made was rejected. Sent only to the buying user. Payload: { message, ... }.'
  },
  PLAYER_SOLD: {
    name: 'PLAYER_SOLD',
    description: 'One of this user\'s players was sold. Sent only to the selling user. Payload: { message, ... }.'
  },
  TUTORIAL_COMPLETED: {
    name: 'TUTORIAL_COMPLETED',
    description: 'The user finished the tutorial. Sent only to that user. No payload.'
  }
}

/**
 * The set of allowed event names as strings, for O(1) validation.
 * @type {Set<string>}
 */
export const SERVER_EVENT_NAMES = new Set(Object.values(SERVER_EVENTS).map(e => e.name))

/**
 * Throws if `name` is not a registered server event.
 * @param {string} name
 * @param {string} context - Where the check runs (for the error message).
 */
export function assertKnownServerEvent (name, context) {
  if (!SERVER_EVENT_NAMES.has(name)) {
    throw new Error(`Unknown server event "${name}" (${context}). Register it in client/lib/serverEvents.js.`)
  }
}
