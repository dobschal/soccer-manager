import { el } from '../lib/html.js'
import { goTo } from '../lib/router.js'
import { server, showServerError } from '../lib/gateway.js'
import { toast } from '../partials/toast.js'
import { getLocale, setLocale, t } from '../i18n/index.js'
import { showConfirmDialog, showOverlay } from '../partials/overlay.js'
import { disconnectWebSocket } from '../lib/websocket.js'

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_AVATAR_SIZE = 5 * 1024 * 1024

/**
 * @param {string} avatar
 * @returns {string}
 */
function avatarSrc (avatar) {
  if (avatar) return `${window.__NATIVE_SERVER_URL || ''}/uploads/avatars/${avatar}`
  return './assets/avatar-placeholder.svg'
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
function fileToDataUrl (file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * @param {string} dataUrl
 * @param {string} type
 * @returns {Promise<string>}
 */
function cropToSquare (dataUrl, type) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const size = Math.min(img.width, img.height)
      const sx = Math.floor((img.width - size) / 2)
      const sy = Math.floor((img.height - size) / 2)
      const targetSize = Math.min(size, 512)
      const canvas = document.createElement('canvas')
      canvas.width = targetSize
      canvas.height = targetSize
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, sx, sy, size, size, 0, 0, targetSize, targetSize)
      const outputType = type === 'image/png' ? 'image/png' : 'image/jpeg'
      resolve(canvas.toDataURL(outputType, 0.9))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

/**
 * Refresh the avatar shown in the top navbar/native top bar after a change.
 * @param {string} avatar
 * @returns {void}
 */
function updateNavbarAvatar (avatar) {
  document.querySelectorAll('.nav-avatar').forEach(img => {
    img.setAttribute('src', avatarSrc(avatar))
    if (avatar) {
      img.classList.remove('nav-avatar--default')
    } else {
      img.classList.add('nav-avatar--default')
    }
  })
}

/**
 * Shows the account settings overlay with avatar, language and delete account options
 * @returns {Promise<void>}
 */
export async function showAccountOverlay () {
  let teamData
  try {
    teamData = await server.getMyTeam()
  } catch (e) {
    showServerError(e)
    return
  }
  let currentAvatar = teamData.user?.avatar || ''
  const username = teamData.user?.username || ''
  const currentLocale = getLocale()

  const renderAvatar = () => `
    <div class="coach-avatar mb-3">
      <img class="coach-avatar__img${currentAvatar ? '' : ' coach-avatar__img--default'}"
           src="${avatarSrc(currentAvatar)}" alt="${username}">
    </div>
    <input type="file" class="d-none" id="account-avatar-input" accept="image/jpeg,image/png,image/webp">
    <div class="d-flex gap-2 flex-wrap justify-content-center">
      <button type="button" class="btn btn-sm btn-outline-primary" id="account-avatar-upload">
        <i class="fa fa-upload" aria-hidden="true"></i>
        ${currentAvatar ? t('myTeam.changeAvatar') : t('myTeam.uploadAvatar')}
      </button>
      ${currentAvatar
    ? `<button type="button" class="btn btn-sm btn-outline-secondary" id="account-avatar-remove">
            <i class="fa fa-trash" aria-hidden="true"></i> ${t('myTeam.removeAvatar')}
          </button>`
    : ''}
    </div>
  `

  const content = `
    <div class="settings-overlay-content">
      <div id="account-avatar-section" class="text-center mb-3">
        ${renderAvatar()}
      </div>
      <hr>
      <div class="mb-3">
        <label class="form-label mt-2">${t('nav.language')}</label>
        <div class="btn-group w-100" role="group">
          <button id="account-lang-en" class="btn ${currentLocale === 'en' ? 'btn-primary' : 'btn-outline-info'}">English</button>
          <button id="account-lang-de" class="btn ${currentLocale === 'de' ? 'btn-primary' : 'btn-outline-info'}">Deutsch</button>
        </div>
      </div>
      <hr>
      <button id="account-delete" class="btn btn-outline-danger w-100">
        <i class="fa fa-trash" aria-hidden="true"></i> ${t('nav.deleteAccount')}
      </button>
    </div>
  `

  const overlay = showOverlay(t('nav.account'), '', content)

  const bindAvatarHandlers = () => {
    const uploadBtn = el('#account-avatar-upload')
    const fileInput = el('#account-avatar-input')
    const removeBtn = el('#account-avatar-remove')

    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => fileInput.click())
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
          toast(t('myTeam.avatarInvalidType'), 'error')
          return
        }
        if (file.size > MAX_AVATAR_SIZE) {
          toast(t('myTeam.avatarTooLarge'), 'error')
          return
        }
        try {
          const dataUrl = await fileToDataUrl(file)
          const squared = await cropToSquare(dataUrl, file.type)
          const { avatar } = await server.uploadAvatar(squared, file.type)
          currentAvatar = avatar
          updateNavbarAvatar(avatar)
          toast(t('myTeam.avatarUpdated'), 'success')
          rerenderAvatarSection()
        } catch (err) {
          showServerError(err)
        }
      })
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', async () => {
        try {
          await server.removeAvatar()
          currentAvatar = ''
          updateNavbarAvatar('')
          toast(t('myTeam.avatarRemoved'), 'success')
          rerenderAvatarSection()
        } catch (err) {
          showServerError(err)
        }
      })
    }
  }

  const rerenderAvatarSection = () => {
    const section = el('#account-avatar-section')
    if (section) {
      section.innerHTML = renderAvatar()
      bindAvatarHandlers()
    }
  }

  setTimeout(() => {
    bindAvatarHandlers()

    const langEnBtn = el('#account-lang-en')
    const langDeBtn = el('#account-lang-de')

    if (langEnBtn) {
      langEnBtn.addEventListener('click', async () => {
        if (currentLocale !== 'en') {
          setLocale('en')
          try {
            await server.setLanguage('en')
          } catch (err) {
            console.error('Failed to save language preference:', err)
          }
          window.location.reload()
        }
      })
    }

    if (langDeBtn) {
      langDeBtn.addEventListener('click', async () => {
        if (currentLocale !== 'de') {
          setLocale('de')
          try {
            await server.setLanguage('de')
          } catch (err) {
            console.error('Failed to save language preference:', err)
          }
          window.location.reload()
        }
      })
    }

    const deleteAccountBtn = el('#account-delete')
    if (deleteAccountBtn) {
      deleteAccountBtn.addEventListener('click', async () => {
        const confirmed = await showConfirmDialog(t('nav.deleteAccountConfirm'), t('nav.deleteAccount'))
        if (!confirmed) return
        try {
          await server.deleteAccount()
          overlay.remove()
          disconnectWebSocket()
          window.localStorage.removeItem('auth-token')
          goTo('login')
        } catch (err) {
          toast(err.message ?? t('toast.somethingWentWrong'), 'error')
        }
      })
    }
  }, 0)
}
