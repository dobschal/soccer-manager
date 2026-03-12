import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { toast } from '../partials/toast.js'
import { generateId } from '../lib/html.js'

export class AdminPage extends UIElement {
  get template () {
    return `
      <div>
        <h3>Admin</h3>

        <div class="card mb-4">
          <div class="card-header"><h5 class="mb-0">Game Day</h5></div>
          <div class="card-body">
            <button id="${this._triggerBtnId}" class="btn btn-primary">
              <i class="fa fa-play" aria-hidden="true"></i> Trigger Game Day
            </button>
          </div>
        </div>

        <div class="card mb-4">
          <div class="card-header"><h5 class="mb-0">Push Notification</h5></div>
          <div class="card-body">
            <div class="mb-3">
              <label for="${this._tokenInputId}" class="form-label">Device Token</label>
              <input type="text" id="${this._tokenInputId}" class="form-control" placeholder="Enter device token">
            </div>
            <div class="mb-3">
              <label for="${this._messageInputId}" class="form-label">Message</label>
              <input type="text" id="${this._messageInputId}" class="form-control" placeholder="Enter message">
            </div>
            <button id="${this._sendBtnId}" class="btn btn-primary">
              <i class="fa fa-bell" aria-hidden="true"></i> Send Notification
            </button>
          </div>
        </div>
      </div>
    `
  }
  get events () {
    return {
      [`#${this._triggerBtnId}`]: {
        click: () => this._triggerGameDay()
      },
      [`#${this._sendBtnId}`]: {
        click: () => this._sendNotification()
      }
    }
  }
  _triggerBtnId = generateId()
  
  _sendBtnId = generateId()
  _tokenInputId = generateId()
  _messageInputId = generateId()

  async _triggerGameDay () {
    const btn = document.getElementById(this._triggerBtnId)
    try {
      btn.disabled = true
      btn.innerHTML = '<i class="fa fa-spinner fa-spin" aria-hidden="true"></i> Running...'
      await server.triggerGameDay()
      toast('Game day completed', 'success')
      btn.innerHTML = '<i class="fa fa-play" aria-hidden="true"></i> Trigger Game Day'
      btn.disabled = false
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
      btn.innerHTML = '<i class="fa fa-play" aria-hidden="true"></i> Trigger Game Day'
      btn.disabled = false
    }
  }

  async _sendNotification () {
    const token = document.getElementById(this._tokenInputId).value.trim()
    const message = document.getElementById(this._messageInputId).value.trim()

    if (!token || !message) {
      toast('Device token and message are required', 'error')
      return
    }

    const btn = document.getElementById(this._sendBtnId)
    try {
      btn.disabled = true
      const result = await server.testPushNotification(token, message)
      toast(`Sent: ${result.sent}, Failed: ${result.failed}${result.failureReason ? ' - ' + result.failureReason : ''}`, result.failed ? 'error' : 'success')
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    } finally {
      btn.disabled = false
    }
  }
}
