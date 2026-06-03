import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { generateId } from '../../lib/html.js'
import { t } from '../../i18n/index.js'
import { showDialog } from '../../partials/dialog.js'
import { showConfirmDialog } from '../../partials/overlay.js'
import { sendLog } from '../../lib/clientLogger.js'

export class GeneralAdminPage extends UIElement {
  get template () {
    return `
      <div>
        ${this._isIosNative ? `
        <div class="mb-4">
          <h4>${t('admin.iosEnvironmentTitle')}</h4>
          <p class="text-muted">${t('admin.iosEnvironmentDescription')}</p>
          <div class="input-group">
            <select id="${this._iosEnvSelectId}" class="form-control">
              <option value="production"${this._currentIosEnv === 'production' ? ' selected' : ''}>${t('admin.iosEnvironmentProduction')}</option>
              <option value="sandbox"${this._currentIosEnv === 'sandbox' ? ' selected' : ''}>${t('admin.iosEnvironmentSandbox')}</option>
            </select>
            <button id="${this._iosEnvBtnId}" class="btn btn-info">
              <i class="fa fa-exchange" aria-hidden="true"></i> ${t('admin.iosEnvironmentSwitch')}
            </button>
          </div>
        </div>
        ` : ''}

        <div class="mb-4">
          <h4>${t('admin.gameDay')}</h4>
          <p class="text-muted">${t('admin.gameDayDescription')}</p>
          <button id="${this._triggerBtnId}" class="btn btn-danger">
            <i class="fa fa-play" aria-hidden="true"></i> ${t('admin.triggerGameDay')}
          </button>
        </div>
      </div>
    `
  }

  get events () {
    return {
      [`#${this._triggerBtnId}`]: {
        click: () => this._triggerGameDay()
      },
      [`(optional)#${this._iosEnvBtnId}`]: {
        click: () => this._switchIosEnvironment()
      }
    }
  }

  _triggerBtnId = generateId()
  _iosEnvSelectId = generateId()
  _iosEnvBtnId = generateId()

  get _isIosNative () {
    return typeof window !== 'undefined' && window.__nativePlatform === 'ios'
  }

  get _currentIosEnv () {
    if (typeof window === 'undefined') return 'production'
    return window.__nativeEnvironment === 'sandbox' ? 'sandbox' : 'production'
  }

  async _triggerGameDay () {
    if (!(await showConfirmDialog(t('admin.triggerGameDayConfirm'), t('admin.triggerGameDay'), t('dialog.cancel')))) return
    const btn = document.getElementById(this._triggerBtnId)
    try {
      btn.disabled = true
      btn.innerHTML = '<i class="fa fa-spinner fa-spin" aria-hidden="true"></i> Running...'
      await server.triggerGameDay()
      toast('Game day completed', 'success')
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    } finally {
      btn.innerHTML = `<i class="fa fa-play" aria-hidden="true"></i> ${t('admin.triggerGameDay')}`
      btn.disabled = false
    }
  }

  async _switchIosEnvironment () {
    const select = document.getElementById(this._iosEnvSelectId)
    if (!select) return
    const target = select.value === 'sandbox' ? 'sandbox' : 'production'
    if (target === this._currentIosEnv) return

    const label = target === 'sandbox'
      ? t('admin.iosEnvironmentSandbox')
      : t('admin.iosEnvironmentProduction')

    const { ok } = await showDialog({
      title: t('admin.iosEnvironmentTitle'),
      text: t('admin.iosEnvironmentConfirm', { env: label }),
      buttonText: t('admin.iosEnvironmentSwitch'),
      buttonType: 'warning'
    })
    if (!ok) {
      select.value = this._currentIosEnv
      return
    }

    const bridge = window.webkit?.messageHandlers?.fmioBridge
    if (!bridge || typeof bridge.postMessage !== 'function') {
      sendLog(`[EnvSwitch] Bridge missing — webkit=${!!window.webkit}, messageHandlers=${!!window.webkit?.messageHandlers}`, 'error')
      toast(t('admin.iosEnvironmentBridgeMissing'), 'error')
      select.value = this._currentIosEnv
      return
    }

    sendLog(`[EnvSwitch] Posting setEnvironment to bridge: ${target}`)
    try {
      bridge.postMessage(JSON.stringify({
        type: 'setEnvironment',
        env: target
      }))
    } catch (e) {
      sendLog(`[EnvSwitch] bridge.postMessage threw: ${e?.message ?? e}`, 'error')
      toast(t('admin.iosEnvironmentBridgeMissing'), 'error')
    }
  }
}
