import { UIElement } from '../../lib/UIElement.js'
import { server, showServerError } from '../../lib/gateway.js'
import { el, generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { showOverlay } from '../../partials/overlay.js'
import { toast } from '../../partials/toast.js'
import { renderEmblem } from '../../partials/emblem.js'
import {
  EMBLEM_COLORS,
  EMBLEM_PATTERNS,
  EMBLEM_SHAPES,
  generateEmblem,
  parseEmblemParams,
  splitTeamName
} from '../../util/emblemGenerator.js'
import { t } from '../../i18n/index.js'
import { calculateMarketValue, calculatePlayerAge, getSalary } from '../../util/player.js'
import { euroFormat } from '../../lib/currency.js'
import { formatLeague } from '../../util/league.js'
import { formatDate } from '../../lib/date.js'

export class ClubInfoPage extends UIElement {
  /**
   * @returns {Promise<void>}
   */
  async load () {
    const [teamData, gamedayData] = await Promise.all([
      server.getMyTeam(),
      server.getCurrentGameday()
    ])
    this.team = teamData.team
    this.players = teamData.players
    this.user = teamData.user
    this.season = gamedayData.season
  }

  /**
   * @returns {string}
   */
  get template () {
    const realPlayers = this.players.filter(p => !p.fake)
    const totalSalary = realPlayers.reduce((sum, p) => sum + getSalary(p.level), 0)
    const totalStrength = realPlayers.reduce((sum, p) => sum + p.level, 0)
    const lineupStrength = this._calculateLineupStrength(this.players)
    const avgLevel = realPlayers.length > 0 ? (totalStrength / realPlayers.length).toFixed(1) : 0
    const avgAge = realPlayers.length > 0
      ? (realPlayers.reduce((sum, p) => sum + calculatePlayerAge(p, this.season), 0) / realPlayers.length).toFixed(1)
      : 0
    const teamValue = realPlayers.reduce(
      (sum, p) => sum + calculateMarketValue(p.level, calculatePlayerAge(p, this.season)),
      0
    )
    const coachName = this.user?.username ?? '-'
    const coachSince = this.team.created_at
      ? formatDate('DD.MM.YYYY', this.team.created_at)
      : '-'
    const avatarFilename = this.user?.avatar

    return `
      <div>
        <h2 class="team-name-header u-cursor-pointer mb-4 text-center text-lg-start" title="${t('myTeam.clickToEditName')}">
          ${this.team.name} <i class="fa fa-pencil" aria-hidden="true"></i>
        </h2>
        <div class="row">
          <div class="col-12 col-md-6 col-xl-4 mb-4">
            <div class="card h-100 border-0">
              <div class="card-header text-white gradient-header">
                <h5 class="card-title mb-0">${t('myTeam.teamInfo')}</h5>
              </div>
              <div class="card-body pt-0">
                <table class="table table-sm mb-0 team-info-table">
                  <tbody>
                    <tr><td class="text-muted ps-3">${t('myTeam.league')}</td><td class="text-end pe-3">${formatLeague(this.team.level, this.team.league)}</td></tr>
                    <tr><td class="text-muted ps-3">${t('myTeam.salaryTotal')}</td><td class="text-end pe-3">${euroFormat.format(totalSalary)}</td></tr>
                    <tr><td class="text-muted ps-3">${t('myTeam.teamValue')}</td><td class="text-end pe-3">${euroFormat.format(teamValue)}</td></tr>
                    <tr><td class="text-muted ps-3">${t('myTeam.avgAge')}</td><td class="text-end pe-3">${avgAge} ${t('myTeam.years')}</td></tr>
                    <tr><td class="text-muted ps-3">${t('myTeam.avgLevel')}</td><td class="text-end pe-3">${avgLevel}</td></tr>
                    <tr><td class="text-muted ps-3">${t('myTeam.totalStrength')}</td><td class="text-end pe-3">${totalStrength}</td></tr>
                    <tr><td class="text-muted ps-3">${t('myTeam.lineupStrength')}</td><td class="text-end pe-3">${lineupStrength}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="col-12 col-md-6 col-xl-4 mb-4">
            <div class="card h-100 border-0">
              <div class="card-header text-white gradient-header">
                <h5 class="card-title mb-0 emblem-header u-cursor-pointer" title="${t('myTeam.clickToEditEmblem')}">${t('myTeam.emblem')} <i class="fa fa-pencil" aria-hidden="true"></i></h5>
              </div>
              <div class="card-body u-perspective-40">
                <div class="mb-4 emblem-viewer">
                  ${renderEmblem(this.team, 200)}
                </div>
              </div>
            </div>
          </div>
          <div class="col-12 col-md-6 col-xl-4 mb-4">
            <div class="card h-100 border-0">
              <div class="card-header text-white gradient-header">
                <h5 class="card-title mb-0">${t('myTeam.coach')}</h5>
              </div>
              <div class="card-body">
                <div class="coach-avatar mb-3">
                  ${avatarFilename
    ? `<img class="coach-avatar__img" src="${window.__NATIVE_SERVER_URL || ''}/uploads/avatars/${avatarFilename}" alt="${coachName}">`
    : `<img class="coach-avatar__img coach-avatar__img--default" src="./assets/avatar-placeholder.svg" alt="${coachName}">`}
                </div>
                <input type="file" class="coach-avatar-input d-none" accept="image/jpeg,image/png,image/webp">
                <div class="d-flex gap-2 flex-wrap justify-content-center mb-3">
                  <button type="button" class="btn btn-sm btn-outline-primary coach-avatar-upload">
                    <i class="fa fa-upload" aria-hidden="true"></i>
                    ${avatarFilename ? t('myTeam.changeAvatar') : t('myTeam.uploadAvatar')}
                  </button>
                  ${avatarFilename
    ? `<button type="button" class="btn btn-sm btn-outline-secondary coach-avatar-remove">
                        <i class="fa fa-trash" aria-hidden="true"></i> ${t('myTeam.removeAvatar')}
                      </button>`
    : ''}
                </div>
                <table class="table table-sm mb-0 team-info-table">
                  <tbody>
                    <tr><td class="text-muted ps-3">${t('myTeam.coach')}</td><td class="text-end pe-3">${coachName}</td></tr>
                    <tr><td class="text-muted ps-3">${t('myTeam.coachSince')}</td><td class="text-end pe-3">${coachSince}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  }

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '.emblem-viewer': {
        click: () => this._showEmblemEditor()
      },
      '.emblem-header': {
        click: () => this._showEmblemEditor()
      },
      '.team-name-header': {
        click: () => this._showTeamNameEditor()
      },
      '.coach-avatar-upload': {
        click: () => {
          const input = el(`${this._elementQuery} .coach-avatar-input`)
          if (input) input.click()
        }
      },
      '.coach-avatar-input': {
        change: (e) => this._onAvatarSelected(e)
      },
      '(optional).coach-avatar-remove': {
        click: () => this._removeAvatar()
      }
    }
  }

  /**
   * @param {Event} event
   * @returns {Promise<void>}
   */
  async _onAvatarSelected (event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast(t('myTeam.avatarInvalidType'), 'error')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast(t('myTeam.avatarTooLarge'), 'error')
      return
    }
    try {
      const dataUrl = await this._fileToDataUrl(file)
      const squared = await this._cropToSquare(dataUrl, file.type)
      const { avatar } = await server.uploadAvatar(squared, file.type)
      this.user.avatar = avatar
      toast(t('myTeam.avatarUpdated'), 'success')
      await this.update()
    } catch (e) {
      showServerError(e)
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async _removeAvatar () {
    try {
      await server.removeAvatar()
      this.user.avatar = null
      toast(t('myTeam.avatarRemoved'), 'success')
      await this.update()
    } catch (e) {
      showServerError(e)
    }
  }

  /**
   * @param {File} file
   * @returns {Promise<string>}
   */
  _fileToDataUrl (file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  /**
   * Center-crop the given image to a square data URL. Reduces client upload
   * size; the server crops a second time defensively.
   * @param {string} dataUrl
   * @param {string} type
   * @returns {Promise<string>}
   */
  _cropToSquare (dataUrl, type) {
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
   * @param {Array} players
   * @returns {number}
   */
  _calculateLineupStrength (players) {
    return players.filter(p => p.in_game_position).reduce((sum, player) => sum + player.level, 0)
  }

  /**
   * @returns {void}
   */
  _showEmblemEditor () {
    const currentParams = parseEmblemParams(this.team.emblem) || {
      shape: 'shield',
      pattern: 'solid',
      color: this.team.color || EMBLEM_COLORS[0],
      color2: EMBLEM_COLORS[1]
    }

    let selectedShape = currentParams.shape
    let selectedPattern = currentParams.pattern
    let selectedColor = currentParams.color
    let selectedColor2 = currentParams.color2 || EMBLEM_COLORS[1]
    const { prefix1, prefix2 } = splitTeamName(this.team.name)
    const hasPrefix1 = !!prefix1
    const hasPrefix2 = !!prefix2
    const emblemPrefixLabel = prefix1 || prefix2
    const hasEmblemPrefix = !!emblemPrefixLabel
    let selectedPrefixOnEmblem = hasEmblemPrefix && !!currentParams.prefixOnEmblem
    let selectedPrefix1OnBanner = hasPrefix1 && !!currentParams.prefix1OnBanner
    let selectedPrefix2OnBanner = hasPrefix2 && !!currentParams.prefix2OnBanner

    const previewId = generateId()
    const saveButtonId = generateId()
    const prefixOnEmblemId = generateId()
    const prefix1OnBannerId = generateId()
    const prefix2OnBannerId = generateId()

    const updatePreview = () => {
      const previewEl = el(previewId)
      if (previewEl) {
        previewEl.innerHTML = generateEmblem({
          shape: selectedShape,
          pattern: selectedPattern,
          color: selectedColor,
          color2: selectedColor2,
          prefixOnEmblem: selectedPrefixOnEmblem,
          prefix1OnBanner: selectedPrefix1OnBanner,
          prefix2OnBanner: selectedPrefix2OnBanner,
          teamName: this.team.name,
          size: 150
        })
      }
    }

    const shapeOptions = Object.entries(EMBLEM_SHAPES).map(([key]) => {
      const id = generateId()
      setTimeout(() => {
        const element = el(id)
        if (element) {
          element.addEventListener('click', () => {
            selectedShape = key
            document.querySelectorAll('.emblem-editor__option').forEach(item => {
              item.classList.remove('emblem-editor__option--selected')
            })
            element.classList.add('emblem-editor__option--selected')
            updatePreview()
          })
        }
      }, 100)
      const isSelected = key === selectedShape
      const previewSvg = generateEmblem({
        shape: key,
        pattern: 'solid',
        color: '#666',
        teamName: '',
        size: 40
      })
      return `
        <div id="${id}" class="emblem-editor__option ${isSelected ? 'emblem-editor__option--selected' : ''}">
          ${previewSvg}
        </div>
      `
    }).join('')

    const patternOptions = Object.entries(EMBLEM_PATTERNS).map(([key, pattern]) => {
      const id = generateId()
      setTimeout(() => {
        const element = el(id)
        if (element) {
          element.addEventListener('click', () => {
            selectedPattern = key
            document.querySelectorAll('.emblem-editor__option--pattern').forEach(item => {
              item.classList.remove('emblem-editor__option--selected')
            })
            element.classList.add('emblem-editor__option--selected')
            updatePreview()
          })
        }
      }, 100)
      const isSelected = key === selectedPattern
      return `
        <div id="${id}" class="emblem-editor__option emblem-editor__option--pattern ${isSelected ? 'emblem-editor__option--selected' : ''}">
          ${pattern.name}
        </div>
      `
    }).join('')

    const colorOptions = EMBLEM_COLORS.map(c => {
      const id = generateId()
      setTimeout(() => {
        const element = el(id)
        if (element) {
          element.addEventListener('click', () => {
            selectedColor = c
            document.querySelectorAll('.emblem-editor__color').forEach(item => {
              item.classList.remove('emblem-editor__color--selected')
            })
            element.classList.add('emblem-editor__color--selected')
            updatePreview()
          })
        }
      }, 100)
      const isSelected = c === selectedColor
      return `
        <div id="${id}" class="emblem-editor__color ${isSelected ? 'emblem-editor__color--selected' : ''}" style="background-color: ${c};"></div>
      `
    }).join('')

    const color2Options = EMBLEM_COLORS.map(c => {
      const id = generateId()
      setTimeout(() => {
        const element = el(id)
        if (element) {
          element.addEventListener('click', () => {
            selectedColor2 = c
            document.querySelectorAll('.emblem-editor__color2').forEach(item => {
              item.classList.remove('emblem-editor__color--selected')
            })
            element.classList.add('emblem-editor__color--selected')
            updatePreview()
          })
        }
      }, 100)
      const isSelected = c === selectedColor2
      return `
        <div id="${id}" class="emblem-editor__color2 emblem-editor__color ${isSelected ? 'emblem-editor__color--selected' : ''}" style="background-color: ${c};"></div>
      `
    }).join('')

    onClick(saveButtonId, async () => {
      try {
        const emblemParams = JSON.stringify({
          shape: selectedShape,
          pattern: selectedPattern,
          color: selectedColor,
          color2: selectedColor2,
          prefixOnEmblem: selectedPrefixOnEmblem,
          prefix1OnBanner: selectedPrefix1OnBanner,
          prefix2OnBanner: selectedPrefix2OnBanner
        })
        await server.updateEmblem(emblemParams, selectedColor)
        toast(t('myTeam.emblemUpdated'), 'success')
        this.team.emblem = emblemParams
        this.team.color = selectedColor
        await this.update(true)
        overlay.remove()
      } catch (e) {
        showServerError(e)
      }
    })

    const bindCheckbox = (id, setter) => {
      setTimeout(() => {
        const element = el(id)
        if (element) {
          element.addEventListener('change', (e) => {
            setter(e.target.checked)
            updatePreview()
          })
        }
      }, 100)
    }
    if (hasEmblemPrefix) {
      bindCheckbox(prefixOnEmblemId, (v) => { selectedPrefixOnEmblem = v })
    }
    if (hasPrefix1) {
      bindCheckbox(prefix1OnBannerId, (v) => { selectedPrefix1OnBanner = v })
    }
    if (hasPrefix2) {
      bindCheckbox(prefix2OnBannerId, (v) => { selectedPrefix2OnBanner = v })
    }

    const nameDisplaySection = (hasEmblemPrefix || hasPrefix1 || hasPrefix2)
      ? `
      <h6>${t('myTeam.nameDisplay')}</h6>
      <div class="emblem-editor__section emblem-editor__section--toggles mb-4">
        ${hasEmblemPrefix
    ? `<div class="form-check">
          <input class="form-check-input" type="checkbox" id="${prefixOnEmblemId}" ${selectedPrefixOnEmblem ? 'checked' : ''}>
          <label class="form-check-label" for="${prefixOnEmblemId}">${t('myTeam.prefixOnEmblem', { prefix: emblemPrefixLabel })}</label>
        </div>`
    : ''}
        ${hasPrefix1
    ? `<div class="form-check">
          <input class="form-check-input" type="checkbox" id="${prefix1OnBannerId}" ${selectedPrefix1OnBanner ? 'checked' : ''}>
          <label class="form-check-label" for="${prefix1OnBannerId}">${t('myTeam.prefix1OnBanner', { prefix: prefix1 })}</label>
        </div>`
    : ''}
        ${hasPrefix2
    ? `<div class="form-check">
          <input class="form-check-input" type="checkbox" id="${prefix2OnBannerId}" ${selectedPrefix2OnBanner ? 'checked' : ''}>
          <label class="form-check-label" for="${prefix2OnBannerId}">${t('myTeam.prefix2OnBanner', { prefix: prefix2 })}</label>
        </div>`
    : ''}
      </div>`
      : ''

    const overlay = showOverlay(
      t('myTeam.createEmblem'),
      t('myTeam.designEmblem'),
      `
      <div class="emblem-editor__preview">
        <div id="${previewId}">${generateEmblem({
  shape: selectedShape,
  pattern: selectedPattern,
  color: selectedColor,
  color2: selectedColor2,
  prefixOnEmblem: selectedPrefixOnEmblem,
  prefix1OnBanner: selectedPrefix1OnBanner,
  prefix2OnBanner: selectedPrefix2OnBanner,
  teamName: this.team.name,
  size: 150
})}</div>
      </div>

      <h6>${t('myTeam.shape')}</h6>
      <div class="emblem-editor__section">
        ${shapeOptions}
      </div>

      <h6>${t('myTeam.pattern')}</h6>
      <div class="emblem-editor__section">
        ${patternOptions}
      </div>

      <h6>${t('myTeam.color1')}</h6>
      <div class="emblem-editor__section">
        ${colorOptions}
      </div>

      <h6>${t('myTeam.color2')}</h6>
      <div class="emblem-editor__section mb-4">
        ${color2Options}
      </div>

      ${nameDisplaySection}

      <button id="${saveButtonId}" class="btn btn-primary w-100">${t('myTeam.saveEmblem')}</button>
    `)
  }

  /**
   * @returns {Promise<void>}
   */
  async _showTeamNameEditor () {
    const nameLibrary = await server.getNameLibrary()
    const {
      clubPrefixes1,
      clubPrefixes2,
      cityNames
    } = nameLibrary

    const currentName = this.team.name
    const { prefix1, prefix2, city } = splitTeamName(currentName)

    const selectedPrefix1 = clubPrefixes1.includes(prefix1) ? prefix1 : ''
    const selectedPrefix2 = clubPrefixes2.includes(prefix2) ? prefix2 : ''
    const selectedCity = cityNames.includes(city) ? city : ''

    const prefix1SelectId = generateId()
    const prefix2SelectId = generateId()
    const citySelectId = generateId()
    const saveButtonId = generateId()
    const previewId = generateId()

    const escapeHtml = (str) => String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

    const composeName = () => {
      const prefix1 = el(prefix1SelectId)?.value || ''
      const prefix2 = el(prefix2SelectId)?.value || ''
      const city = el(citySelectId)?.value || ''
      return `${prefix1} ${prefix2} ${city}`.replace(/\s+/g, ' ').trim()
    }

    const updatePreview = () => {
      const previewEl = el(previewId)
      if (previewEl) {
        previewEl.textContent = composeName()
      }
    }

    const prefix1Options = clubPrefixes1.map(p =>
      `<option value="${escapeHtml(p)}" ${p === selectedPrefix1 ? 'selected' : ''}>${escapeHtml(p) || '(none)'}</option>`
    ).join('')

    const prefix2Options = clubPrefixes2.map(p =>
      `<option value="${escapeHtml(p)}" ${p === selectedPrefix2 ? 'selected' : ''}>${escapeHtml(p) || '(none)'}</option>`
    ).join('')

    const sortedCityNames = [...cityNames].sort((a, b) => a.localeCompare(b))
    let currentLetter = ''
    const cityOptions = sortedCityNames.map(c => {
      const firstLetter = c.charAt(0).toUpperCase()
      let divider = ''
      if (firstLetter !== currentLetter) {
        currentLetter = firstLetter
        divider = `<option disabled>── ${firstLetter} ──</option>`
      }
      return `${divider}<option value="${escapeHtml(c)}" ${c === selectedCity ? 'selected' : ''}>${escapeHtml(c)}</option>`
    }).join('')

    const onChangeEl = (query, handler) => {
      setTimeout(() => {
        const element = el(query)
        if (element) element.addEventListener('change', handler)
      })
    }
    onChangeEl(prefix1SelectId, updatePreview)
    onChangeEl(prefix2SelectId, updatePreview)
    onChangeEl(citySelectId, updatePreview)

    onClick(saveButtonId, async () => {
      try {
        const newName = composeName()

        if (!newName) {
          toast(t('myTeam.selectNamePart'), 'error')
          return
        }

        await server.updateTeamName(newName)
        toast(t('myTeam.nameUpdated'), 'success')
        this.team.name = newName
        await this.update(true)
        overlay.remove()
      } catch (e) {
        showServerError(e)
      }
    })

    const overlay = showOverlay(
      t('myTeam.customizeTeamName'),
      t('myTeam.createUniqueName'),
      `
      <div class="mb-4">
        <h6>${t('myTeam.preview')}</h6>
        <div id="${previewId}" class="team-name-preview">
          ${escapeHtml(currentName)}
        </div>
      </div>

      <div class="form-group mb-3">
        <label for="${prefix1SelectId}"><h6>${t('myTeam.clubPrefix1')}</h6></label>
        <select id="${prefix1SelectId}" class="form-control">
          ${prefix1Options}
        </select>
      </div>

      <div class="form-group mb-3">
        <label for="${prefix2SelectId}"><h6>${t('myTeam.clubPrefix2')}</h6></label>
        <select id="${prefix2SelectId}" class="form-control">
          ${prefix2Options}
        </select>
      </div>

      <div class="form-group mb-3">
        <label for="${citySelectId}"><h6>${t('myTeam.cityName')}</h6></label>
        <select id="${citySelectId}" class="form-control">
          ${cityOptions}
        </select>
      </div>

      <button id="${saveButtonId}" class="btn btn-primary w-100">${t('myTeam.saveTeamName')}</button>
    `)
  }
}
