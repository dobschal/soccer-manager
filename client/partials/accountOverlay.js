import { el } from '../lib/html.js'
import { clearHasTeamCache, goTo } from '../lib/router.js'
import { server, showServerError } from '../lib/gateway.js'
import { toast } from '../partials/toast.js'
import { getLocale, setLocale, t } from '../i18n/index.js'
import { showConfirmDialog, showOverlay } from '../partials/overlay.js'
import { disconnectWebSocket } from '../lib/websocket.js'
import { fetchText } from '../lib/fetchText.js'
import { isValidEmail } from '../lib/emailRegex.js'
import { renderPageNumbers } from '../partials/pagination.js'
import { showInviteFriendOverlay } from '../partials/inviteFriendOverlay.js'

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_AVATAR_SIZE = 5 * 1024 * 1024
const FRIENDS_PAGE_SIZE = 5

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
  let versionData
  let friendsData
  try {
    [teamData, versionData, friendsData] = await Promise.all([
      server.getMyTeam(),
      server.getVersion(),
      server.getFriends()
    ])
  } catch (e) {
    showServerError(e)
    return
  }
  let currentAvatar = teamData.user?.avatar || ''
  let currentEmail = teamData.user?.email || ''
  let currentPendingEmail = teamData.user?.pending_email || ''
  let emailOptOut = !!teamData.user?.email_opt_out
  const username = teamData.user?.username || ''
  const isAdmin = teamData.isAdmin || false
  const version = versionData.version
  const friends = friendsData.friends || []
  const currentLocale = getLocale()
  let friendsPageIndex = 0

  const renderEmail = () => {
    const verifiedRow = currentEmail
      ? `<div class="d-flex align-items-center gap-2 mb-2">
           <span class="text-truncate">${currentEmail}</span>
           <span class="badge bg-success">${t('account.emailVerified')}</span>
         </div>`
      : `<div class="text-muted small mb-2">${t('account.emailNone')}</div>`
    const pendingRow = currentPendingEmail
      ? `<div class="alert alert-warning py-2 px-3 mb-2 small">
           <div class="d-flex align-items-center gap-2 mb-1">
             <span class="text-truncate">${currentPendingEmail}</span>
             <span class="badge bg-warning text-dark">${t('account.emailPending')}</span>
           </div>
           <div class="text-muted">${t('account.emailPendingHint', { email: currentPendingEmail })}</div>
         </div>`
      : ''
    return `
      <label class="form-label mt-2">${t('account.email')}</label>
      ${verifiedRow}
      ${pendingRow}
      <div class="input-group">
        <input type="email" id="account-email-input" class="form-control border-info" autocomplete="email" placeholder="${t('account.emailPlaceholder')}">
        <button type="button" id="account-email-save" class="btn btn-info">${t('account.emailSave')}</button>
      </div>
      <small class="form-text text-muted">${t('account.emailHint')}</small>
      <div class="form-check mt-2">
        <input class="form-check-input" type="checkbox" id="account-email-opt-out"${emailOptOut ? ' checked' : ''}>
        <label class="form-check-label" for="account-email-opt-out">
          ${t('account.emailOptOut')}
        </label>
        <div class="form-text text-muted">${t('account.emailOptOutHint')}</div>
      </div>
    `
  }

  const renderFriends = () => {
    if (friends.length === 0) {
      return `<div class="text-muted small">${t('account.noFriends')}</div>`
    }
    const totalPages = Math.ceil(friends.length / FRIENDS_PAGE_SIZE)
    const start = friendsPageIndex * FRIENDS_PAGE_SIZE
    const pageFriends = friends.slice(start, start + FRIENDS_PAGE_SIZE)
    const list = `
      <div class="account-friends-list">
        ${pageFriends.map(f => `
          <a href="${f.teamId ? '#team?id=' + f.teamId : '#dashboard'}" data-account-friend-link class="account-friend-row d-flex align-items-center gap-2">
            <img class="account-friend-avatar${f.avatar ? '' : ' account-friend-avatar--default'}"
                 src="${avatarSrc(f.avatar)}" alt="${f.username}">
            <div class="flex-grow-1 text-truncate">
              <div class="text-truncate">${f.username}</div>
              ${f.teamName ? `<div class="text-muted small text-truncate">${f.teamName}</div>` : ''}
            </div>
          </a>
        `).join('')}
      </div>
    `
    if (totalPages <= 1) return list
    const hasPrev = friendsPageIndex > 0
    const hasNext = friendsPageIndex < totalPages - 1
    const pageNumbers = renderPageNumbers(totalPages, friendsPageIndex)
    return `
      ${list}
      <nav class="mt-2 account-friends-pagination">
        <ul class="pagination pagination-sm justify-content-center flex-wrap mb-0">
          <li class="page-item ${hasPrev ? '' : 'disabled'}">
            <span class="page-link u-cursor-pointer" data-account-friends-prev>${t('common.prev')}</span>
          </li>
          ${pageNumbers}
          <li class="page-item ${hasNext ? '' : 'disabled'}">
            <span class="page-link u-cursor-pointer" data-account-friends-next>${t('common.next')}</span>
          </li>
        </ul>
      </nav>
    `
  }

  const renderAvatar = () => `
    <div class="coach-avatar mb-4">
      <img class="coach-avatar__img${currentAvatar ? '' : ' coach-avatar__img--default'}"
           src="${avatarSrc(currentAvatar)}" alt="${username}">
    </div>
    <input type="file" class="d-none" id="account-avatar-input" accept="image/jpeg,image/png,image/webp">
    <div class="d-flex gap-2 flex-wrap justify-content-center">
      <button type="button" class="btn btn-sm btn-outline-info" id="account-avatar-upload">
        <i class="fa fa-upload" aria-hidden="true"></i>
        ${currentAvatar ? t('myTeam.changeAvatar') : t('myTeam.uploadAvatar')}
      </button>
      ${currentAvatar
    ? `<button type="button" class="btn btn-sm btn-outline-info" id="account-avatar-remove">
            <i class="fa fa-trash" aria-hidden="true"></i> ${t('myTeam.removeAvatar')}
          </button>`
    : ''}
    </div>
  `

  const content = `
    <div class="settings-overlay-content">
      <div id="account-avatar-section" class="text-center mb-4">
        ${renderAvatar()}
      </div>
      
      <div id="account-friends-section" class="mb-4">
        <label class="form-label mt-2">${t('account.friends')}</label>
        ${renderFriends()}
        <button type="button" id="account-invite-friend" class="btn btn-outline-info btn-sm mt-2 w-100">
          <i class="fa fa-paper-plane" aria-hidden="true"></i> ${t('referral.inviteFriend')}
        </button>
      </div>

      <div id="account-email-section" class="mb-4">
        ${renderEmail()}
      </div>

      <div id="account-password-section" class="mb-4">
        <label class="form-label mt-2">${t('account.password')}</label>
        <input type="password" id="account-password-old" class="form-control border-info mb-2" autocomplete="current-password" placeholder="${t('account.passwordOld')}">
        <div class="input-group">
          <input type="password" id="account-password-new" class="form-control border-info" autocomplete="new-password" placeholder="${t('account.passwordNew')}">
          <button type="button" id="account-password-save" class="btn btn-info">${t('account.passwordSave')}</button>
        </div>
      </div>

      <div class="mb-4">
        <label class="form-label mt-2">${t('nav.language')}</label>
        <div class="btn-group w-100" role="group">
          <button id="account-lang-en" class="btn ${currentLocale === 'en' ? 'btn-info' : 'btn-outline-info'}">English</button>
          <button id="account-lang-de" class="btn ${currentLocale === 'de' ? 'btn-info' : 'btn-outline-info'}">Deutsch</button>
        </div>
      </div>
      
      <div class="mb-4">
        <label class="form-label mt-2">${t('account.dangerZone')}</label>
        <div class="d-grid gap-2">
          ${isAdmin
    ? `<a href="#admin" id="account-admin" class="btn btn-info text-white">
              <i class="fa fa-shield" aria-hidden="true"></i> ${t('admin.title')}
            </a>`
    : ''}
          <button id="account-logout" class="btn btn-info">
            <i class="fa fa-sign-out" aria-hidden="true"></i> ${t('nav.logout')}
          </button>
          <button id="account-delete" class="btn btn-outline-danger mt-3">
            <i class="fa fa-trash" aria-hidden="true"></i> ${t('nav.deleteAccount')}
          </button>
        </div>
      </div>
      
      <div class="text-muted small text-center">
        FootballManager.IO v${version}
      </div>
      ${window.__NATIVE_SERVER_URL
    ? '<div class="text-muted small text-center" id="account-client-version">' + t('common.loading') + '</div>'
    : ''}
      <div class="text-center mt-2">
        <a href="support.html" class="text-muted small me-3">${t('nav.support')}</a>
        <a href="imprint.html" class="text-muted small">${t('nav.privacyPolicy')}</a>
      </div>
    </div>
  `

  const overlay = showOverlay(t('nav.account'), username, content)

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

  const bindEmailHandlers = () => {
    const saveBtn = el('#account-email-save')
    const input = el('#account-email-input')
    const optOutCheckbox = el('#account-email-opt-out')
    if (!saveBtn || !input) return
    const submit = async () => {
      const email = input.value.trim()
      if (!isValidEmail(email)) {
        toast(t('landing.emailInvalid'), 'error')
        return
      }
      saveBtn.disabled = true
      try {
        const { pendingEmail } = await server.setEmail(email)
        currentPendingEmail = pendingEmail || ''
        toast(t('account.emailUpdated'), 'success')
        rerenderEmailSection()
      } catch (err) {
        showServerError(err)
        saveBtn.disabled = false
      }
    }
    saveBtn.addEventListener('click', submit)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
      }
    })
    if (optOutCheckbox) {
      optOutCheckbox.addEventListener('change', async () => {
        const next = optOutCheckbox.checked
        optOutCheckbox.disabled = true
        try {
          await server.setEmailOptOut(next)
          emailOptOut = next
          toast(t('account.emailOptOutUpdated'), 'success')
        } catch (err) {
          optOutCheckbox.checked = emailOptOut
          showServerError(err)
        } finally {
          optOutCheckbox.disabled = false
        }
      })
    }
  }

  const rerenderEmailSection = () => {
    const section = el('#account-email-section')
    if (section) {
      section.innerHTML = renderEmail()
      bindEmailHandlers()
    }
  }

  const bindPasswordHandlers = () => {
    const saveBtn = el('#account-password-save')
    const oldInput = el('#account-password-old')
    const newInput = el('#account-password-new')
    if (!saveBtn || !oldInput || !newInput) return
    const submit = async () => {
      const oldPassword = oldInput.value
      const newPassword = newInput.value
      if (!oldPassword || !newPassword) {
        toast(t('account.passwordMissing'), 'error')
        return
      }
      saveBtn.disabled = true
      try {
        await server.setPassword(oldPassword, newPassword)
        oldInput.value = ''
        newInput.value = ''
        toast(t('account.passwordUpdated'), 'success')
      } catch (err) {
        showServerError(err)
      } finally {
        saveBtn.disabled = false
      }
    }
    saveBtn.addEventListener('click', submit)
    newInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
      }
    })
  }

  const bindFriendsHandlers = () => {
    document.querySelectorAll('[data-account-friend-link]').forEach(link => {
      link.addEventListener('click', () => {
        overlay.remove()
      })
    })

    const inviteBtn = el('#account-invite-friend')
    if (inviteBtn) {
      inviteBtn.addEventListener('click', () => showInviteFriendOverlay())
    }

    const totalPages = Math.ceil(friends.length / FRIENDS_PAGE_SIZE)
    const goToPage = (next) => {
      if (next < 0 || next >= totalPages || next === friendsPageIndex) return
      friendsPageIndex = next
      rerenderFriendsSection()
    }

    document.querySelectorAll('[data-account-friends-prev]').forEach(btn => {
      btn.addEventListener('click', () => goToPage(friendsPageIndex - 1))
    })
    document.querySelectorAll('[data-account-friends-next]').forEach(btn => {
      btn.addEventListener('click', () => goToPage(friendsPageIndex + 1))
    })
    document.querySelectorAll('.account-friends-pagination [data-page-index]').forEach(btn => {
      btn.addEventListener('click', () => goToPage(parseInt(btn.dataset.pageIndex, 10)))
    })
  }

  const rerenderFriendsSection = () => {
    const section = el('#account-friends-section')
    if (section) {
      section.innerHTML = `
        <label class="form-label mt-2">${t('account.friends')}</label>
        ${renderFriends()}
        <button type="button" id="account-invite-friend" class="btn btn-outline-info btn-sm mt-2 w-100">
          <i class="fa fa-paper-plane" aria-hidden="true"></i> ${t('referral.inviteFriend')}
        </button>
      `
      bindFriendsHandlers()
    }
  }

  setTimeout(() => {
    bindAvatarHandlers()
    bindEmailHandlers()
    bindPasswordHandlers()
    bindFriendsHandlers()

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

    const adminLink = el('#account-admin')
    if (adminLink) {
      adminLink.addEventListener('click', () => {
        overlay.remove()
      })
    }

    const logoutBtn = el('#account-logout')
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        overlay.remove()
        disconnectWebSocket()
        window.localStorage.removeItem('auth-token')
        clearHasTeamCache()
        goTo('login')
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
          clearHasTeamCache()
          goTo('login')
        } catch (err) {
          toast(err.message ?? t('toast.somethingWentWrong'), 'error')
        }
      })
    }

    if (window.__NATIVE_SERVER_URL) {
      const clientVersionEl = el('#account-client-version')
      if (clientVersionEl) {
        fetchText('./native-version.json')
          .then(text => JSON.parse(text))
          .then(data => {
            clientVersionEl.textContent = `Client: v${data.version} (${data.commitHash})`
          })
          .catch(() => {
            clientVersionEl.textContent = 'Client: unknown'
          })
      }
    }
  }, 0)
}
