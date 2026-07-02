import { server, showServerError } from '../lib/gateway.js'
import { el, generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { showOverlay } from './overlay.js'
import { toast } from './toast.js'
import {
  EMBLEM_COLORS,
  EMBLEM_ICONS,
  EMBLEM_PATTERNS,
  EMBLEM_SHAPES,
  EMBLEM_TINT_OPTIONS,
  generateEmblem,
  parseEmblemParams,
  resolveTint,
  resolveWordsOnBanner,
  splitTeamNameWords
} from '../util/emblemGenerator.js'
import { t } from '../i18n/index.js'

/**
 * Open the club emblem editor overlay for the given team (#453, extracted from
 * the club-info page so the post-registration wizard can reuse it).
 *
 * The editor persists the emblem itself via server.updateEmblem. After a
 * successful save it mutates the passed team object (team.emblem / team.color),
 * closes the overlay, and invokes onSave so the caller can refresh its own UI
 * or advance a flow.
 *
 * @param {object} team - team object with at least { name, emblem, color }
 * @param {(emblemParams: string, color: string) => void} [onSave]
 * @returns {object} the overlay handle from showOverlay
 */
export function openEmblemEditor (team, onSave) {
  const currentParams = parseEmblemParams(team.emblem) || {
    shape: 'shield',
    pattern: 'solid',
    color: team.color || EMBLEM_COLORS[0],
    color2: EMBLEM_COLORS[1]
  }

  let selectedShape = currentParams.shape
  let selectedPattern = currentParams.pattern
  // White is intentionally excluded from Color 1: the banner darkens
  // color1 by -20% / -40% for its background and folds, and a white
  // banner would hide the team-name text on the white-ish surface.
  const color1Palette = EMBLEM_COLORS.filter(c => c.toLowerCase() !== '#ffffff')
  let selectedColor = color1Palette.includes(currentParams.color) ? currentParams.color : color1Palette[0]
  let selectedColor2 = currentParams.color2 || EMBLEM_COLORS[1]
  // Color 1 and Color 2 must always differ — if a legacy emblem has the
  // same value for both, force color2 to a different palette entry.
  if (selectedColor === selectedColor2) {
    selectedColor2 = EMBLEM_COLORS.find(c => c !== selectedColor) || EMBLEM_COLORS[1]
  }
  let selectedStrokeColor = EMBLEM_TINT_OPTIONS.includes(currentParams.strokeColor) ? currentParams.strokeColor : 'white'
  let selectedIcon = currentParams.icon && EMBLEM_ICONS.includes(currentParams.icon) ? currentParams.icon : null
  let selectedIconColor = EMBLEM_TINT_OPTIONS.includes(currentParams.iconColor) ? currentParams.iconColor : 'white'

  /** Pick the first palette color that differs from the given one. */
  const firstDifferentColor = (other, palette = EMBLEM_COLORS) => palette.find(c => c !== other) || palette[0]

  /** Reset the selected-class on swatches in one group based on the new value. */
  const refreshColorSelection = (groupClass, value) => {
    document.querySelectorAll(`.${groupClass}`).forEach(item => {
      item.classList.toggle('emblem-editor__color--selected', item.dataset.color === value)
    })
  }
  const nameWords = splitTeamNameWords(team.name)
  const wordsOnBanner = resolveWordsOnBanner(nameWords, currentParams)

  const previewId = generateId()
  const saveButtonId = generateId()
  const wordCheckboxIds = nameWords.map(() => generateId())

  const updatePreview = () => {
    const previewEl = el(previewId)
    if (previewEl) {
      previewEl.innerHTML = generateEmblem({
        shape: selectedShape,
        pattern: selectedPattern,
        color: selectedColor,
        color2: selectedColor2,
        wordsOnBanner,
        strokeColor: selectedStrokeColor,
        icon: selectedIcon,
        iconColor: selectedIconColor,
        teamName: team.name,
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

  const colorOptions = color1Palette.map(c => {
    const id = generateId()
    setTimeout(() => {
      const element = el(id)
      if (element) {
        element.addEventListener('click', () => {
          // If color 1 collides with color 2, bump color 2 so they
          // always differ. Tints that reference color1/color2 then
          // pick up the new value automatically.
          if (c === selectedColor2) {
            selectedColor2 = firstDifferentColor(c)
            refreshColorSelection('emblem-editor__color2', selectedColor2)
          }
          selectedColor = c
          refreshColorSelection('emblem-editor__color1', selectedColor)
          refreshTintSwatchColors()
          updatePreview()
        })
      }
    }, 100)
    const isSelected = c === selectedColor
    return `
      <div id="${id}" class="emblem-editor__color emblem-editor__color1 ${isSelected ? 'emblem-editor__color--selected' : ''}" style="background-color: ${c};" data-color="${c}"></div>
    `
  }).join('')

  const color2Options = EMBLEM_COLORS.map(c => {
    const id = generateId()
    setTimeout(() => {
      const element = el(id)
      if (element) {
        element.addEventListener('click', () => {
          if (c === selectedColor) {
            // Color 1 cannot become white when pushed aside, so pick
            // from color1Palette.
            selectedColor = firstDifferentColor(c, color1Palette)
            refreshColorSelection('emblem-editor__color1', selectedColor)
          }
          selectedColor2 = c
          refreshColorSelection('emblem-editor__color2', selectedColor2)
          refreshTintSwatchColors()
          updatePreview()
        })
      }
    }, 100)
    const isSelected = c === selectedColor2
    return `
      <div id="${id}" class="emblem-editor__color2 emblem-editor__color ${isSelected ? 'emblem-editor__color--selected' : ''}" style="background-color: ${c};" data-color="${c}"></div>
    `
  }).join('')

  onClick(saveButtonId, async () => {
    try {
      const emblemParams = JSON.stringify({
        shape: selectedShape,
        pattern: selectedPattern,
        color: selectedColor,
        color2: selectedColor2,
        wordsOnBanner,
        strokeColor: selectedStrokeColor,
        icon: selectedIcon,
        iconColor: selectedIconColor
      })
      await server.updateEmblem(emblemParams, selectedColor)
      toast(t('myTeam.emblemUpdated'), 'success')
      team.emblem = emblemParams
      team.color = selectedColor
      overlay.remove()
      if (typeof onSave === 'function') onSave(emblemParams, selectedColor)
    } catch (e) {
      showServerError(e)
    }
  })

  /**
   * Render a tint selector (white + color1 light/normal/dark + color2
   * light/normal/dark) for either the shape outline or the icon. Each
   * swatch shows the resolved colour so the user can see exactly what
   * they're picking. The swatches re-tint live via refreshTintSwatchColors
   * when Color 1 or Color 2 changes.
   */
  const renderTintSelector = ({
    groupClass,
    currentValue,
    onSelect
  }) => {
    return EMBLEM_TINT_OPTIONS.map(role => {
      const id = generateId()
      setTimeout(() => {
        const element = el(id)
        if (element) {
          element.addEventListener('click', () => {
            onSelect(role)
            document.querySelectorAll(`.${groupClass}`).forEach(item => {
              item.classList.remove('emblem-editor__color--selected')
            })
            element.classList.add('emblem-editor__color--selected')
            updatePreview()
          })
        }
      }, 100)
      const swatchColor = resolveTint(role, selectedColor, selectedColor2)
      const isSelected = role === currentValue
      const label = t(`myTeam.tint.${role}`)
      return `
        <div id="${id}" class="emblem-editor__color ${groupClass} ${isSelected ? 'emblem-editor__color--selected' : ''}" style="background-color: ${swatchColor};" data-tint-role="${role}" title="${label}"></div>
      `
    }).join('')
  }

  /** Re-tint every Outline/Icon swatch after a Color 1 or Color 2 change. */
  const refreshTintSwatchColors = () => {
    document.querySelectorAll('.emblem-editor__stroke[data-tint-role], .emblem-editor__icon-color[data-tint-role]').forEach(swatch => {
      const role = swatch.dataset.tintRole
      swatch.style.backgroundColor = resolveTint(role, selectedColor, selectedColor2)
    })
  }

  const strokeColorOptions = renderTintSelector({
    groupClass: 'emblem-editor__stroke',
    currentValue: selectedStrokeColor,
    onSelect: role => {
      selectedStrokeColor = role
    }
  })

  const iconColorOptions = renderTintSelector({
    groupClass: 'emblem-editor__icon-color',
    currentValue: selectedIconColor,
    onSelect: role => {
      selectedIconColor = role
    }
  })

  const selectIconElement = (element) => {
    document.querySelectorAll('.emblem-editor__icon').forEach(item => {
      item.classList.remove('emblem-editor__icon--selected', 'emblem-editor__option--selected')
    })
    element.classList.add('emblem-editor__icon--selected', 'emblem-editor__option--selected')
  }

  const iconNoneId = generateId()
  setTimeout(() => {
    const element = el(iconNoneId)
    if (element) {
      element.addEventListener('click', () => {
        selectedIcon = null
        selectIconElement(element)
        updatePreview()
      })
    }
  }, 100)

  const iconOptions = EMBLEM_ICONS.map(name => {
    const id = generateId()
    setTimeout(() => {
      const element = el(id)
      if (element) {
        element.addEventListener('click', () => {
          selectedIcon = name
          selectIconElement(element)
          updatePreview()
        })
      }
    }, 100)
    const isSelected = name === selectedIcon
    return `
      <div id="${id}" class="emblem-editor__option emblem-editor__icon ${isSelected ? 'emblem-editor__icon--selected emblem-editor__option--selected' : ''}" title="${name}">
        <img src="./assets/emblem-icons/${name}.svg" alt="${name}" class="emblem-editor__icon-img">
      </div>
    `
  }).join('')

  wordCheckboxIds.forEach((id, index) => {
    setTimeout(() => {
      const element = el(id)
      if (element) {
        element.addEventListener('change', (e) => {
          wordsOnBanner[index] = e.target.checked
          updatePreview()
        })
      }
    }, 100)
  })

  const escapeHtml = (str) => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

  const nameDisplaySection = nameWords.length > 0
    ? `
    <h6>${t('myTeam.nameDisplay')}</h6>
    <div class="emblem-editor__section emblem-editor__section--toggles mb-4">
      ${nameWords.map((word, i) => `
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="${wordCheckboxIds[i]}" ${wordsOnBanner[i] ? 'checked' : ''}>
          <label class="form-check-label" for="${wordCheckboxIds[i]}">${t('myTeam.wordOnBanner', { word: escapeHtml(word) })}</label>
        </div>
      `).join('')}
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
  wordsOnBanner,
  strokeColor: selectedStrokeColor,
  icon: selectedIcon,
  iconColor: selectedIconColor,
  teamName: team.name,
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

    <h6>${t('myTeam.strokeColor')}</h6>
    <div class="emblem-editor__section mb-4">
      ${strokeColorOptions}
    </div>

    <h6>${t('myTeam.icon')}</h6>
    <div class="emblem-editor__section emblem-editor__section--icons mb-2">
      <div id="${iconNoneId}" class="emblem-editor__option emblem-editor__icon emblem-editor__icon--none ${selectedIcon === null ? 'emblem-editor__icon--selected emblem-editor__option--selected' : ''}" title="${t('myTeam.iconNone')}">
        <span><i class="fa fa-ban" aria-hidden="true"></i></span>
      </div>
      ${iconOptions}
    </div>

    <h6>${t('myTeam.iconColor')}</h6>
    <div class="emblem-editor__section mb-4">
      ${iconColorOptions}
    </div>

    ${nameDisplaySection}

    <button id="${saveButtonId}" class="btn btn-primary w-100">${t('myTeam.saveEmblem')}</button>
  `)
  return overlay
}
