import {server, showServerError} from '../../lib/gateway.js'
import {el, generateId} from '../../lib/html.js'
import {onClick} from '../../lib/htmlEventHandlers.js'
import {UIElement} from '../../lib/UIElement.js'
import {toast} from '../../partials/toast.js'
import {showOverlay} from '../../partials/overlay.js'
import {showTutorialIfNeeded} from '../../partials/tutorialOverlay.js'
import {t} from '../../i18n/index.js'
import {wikiInfoIcon} from '../../partials/wikiInfoIcon.js'
import {euroFormat} from '../../lib/currency.js'
import {StadiumCanvas} from '../../partials/stadiumCanvas.js'

/**
 * The painted level images. They are only the fallback now — every card image is
 * replaced by a still cropped out of the 3D scene above as soon as it has been
 * rendered (`_loadBuildingStills`), so the card shows the player's actual
 * building. Without WebGL these stay.
 */
const TRAINING_AREA_IMAGES = {
  1: 'assets/training-area/training-area-1.png',
  2: 'assets/training-area/training-area-2.png',
  3: 'assets/training-area/training-area-3.png'
}

const FITNESS_STUDIO_IMAGES = {
  1: 'assets/fitness/fitness-1.png',
  2: 'assets/fitness/fitness-2.png',
  3: 'assets/fitness/fitness-3.png'
}

const YOUTH_ACADEMY_IMAGES = {
  1: 'assets/youth-academy/youth-academy-level-1.png',
  2: 'assets/youth-academy/youth-academy-level-2.png',
  3: 'assets/youth-academy/youth-academy-level-3.png'
}

const FALLBACK_IMAGES = {
  training_area: TRAINING_AREA_IMAGES,
  fitness_studio: FITNESS_STUDIO_IMAGES,
  youth_academy: YOUTH_ACADEMY_IMAGES,
  // The medical practice was never painted — it only ever shows a still of the
  // 3D building (which is rendered even before it is built, as a preview of what
  // the money buys). Without WebGL its card simply has no image.
  medical_practice: {}
}

export class BuildingsPage extends UIElement {
  /**
   * @param {UIElement} parent
   */
  constructor (parent) {
    super()
    this.parent = parent
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const [data, stadiumResponse, teamResponse] = await Promise.all([
      server.getBuildings(),
      server.getStadium(),
      server.getMyTeam()
    ])
    this.buildings = data.buildings || []
    this.upgrades = data.upgrades || {}
    this.cardChances = data.cardChances || {}
    this.fitnessCardChances = data.fitnessCardChances || {}
    this.youthAcademyCardChances = data.youthAcademyCardChances || {}
    this.medicalPracticeCardChances = data.medicalPracticeCardChances || {}
    this.stadium = stadiumResponse?.stadium || {}
    this.team = teamResponse?.team || {}
  }

  /**
   * @returns {string}
   */
  get template () {
    // Same 3D scene as the stadium page, but orbiting the road intersection the
    // club buildings are laid out around instead of the pitch.
    this._canvas = new StadiumCanvas(this.stadium, this.team, 'buildings-canvas', {
      interactive: false,
      autoRotate: true,
      controlsToggle: true,
      daylightControl: true,
      focus: 'buildings',
      buildings: this.buildings
    })
    return `
      <div>
        <h3>${t('buildings.title')} ${wikiInfoIcon('buildings')}</h3>
        <div class="alert alert-info">
          <i class="fa fa-info-circle me-1"></i> ${t('buildings.pageDesc')}
        </div>
        <div class="mb-4" id="buildings-canvas-container">
          ${this._canvas}
        </div>
        ${this._renderTrainingArea()}
        ${this._renderFitnessStudio()}
        ${this._renderYouthAcademy()}
        ${this._renderMedicalPractice()}
      </div>
    `
  }

  onMounted () {
    this._canvas?.onMounted()
    void showTutorialIfNeeded('buildings', this)
    void this._loadBuildingStills()
  }

  /**
   * Free the WebGL context when the page goes away — the canvas cannot be
   * reused, so the tab switch recreates it (see `ClubPage`).
   */
  onDestroy () {
    this._canvas?.onDestroy()
    this._canvas = null
  }

  /** @type {StadiumCanvas|null} */
  _canvas = null

  stadium = {}

  team = {}

  /** Stills already rendered, keyed `type:level`. @type {Object<string, string>} */
  _stills = {}

  /**
   * Swap every card's painted image for a still of the team's own building, taken
   * out of the 3D scene above. The level an upgrade would bring is photographed
   * too — that is the image its confirmation dialog shows.
   *
   * One frame per still is rendered and read back, which is not free, so they are
   * spread over separate frames and the whole thing simply does not happen when
   * the scene never came up (no WebGL): the painted images stay.
   * @returns {Promise<void>}
   */
  async _loadBuildingStills () {
    const canvas = this._canvas
    if (!canvas || !(await canvas.whenReady())) return

    for (const building of this.buildings) {
      const info = building.constructionInfo || {}
      // Level 0 (the unbuilt medical practice) has no building to photograph, so
      // its card shows what level 1 would look like — the same still its build
      // button already needs.
      const current = Math.max(1, building.level)
      const next = Math.min(3, info.underConstruction ? info.targetLevel : building.level + 1)
      for (const level of new Set([current, next])) {
        // The canvas may have gone away between two frames (tab switch).
        if (this._canvas !== canvas) return
        const still = canvas.captureBuilding(building.type, {level})
        if (!still) continue
        this._stills[`${building.type}:${level}`] = still
        if (level === current) this._showStill(building.type, still)
        await new Promise(resolve => requestAnimationFrame(resolve))
      }
    }
  }

  /**
   * Put a freshly rendered still onto its card, without re-rendering the page —
   * that would drop the canvas' WebGL context.
   * @param {string} type
   * @param {string} src
   */
  _showStill (type, src) {
    const image = el(this._elementQuery)?.querySelector(`[data-building-image="${type}"]`)
    if (image) image.src = src
  }

  /**
   * The image for one building at one level: its still if that has been rendered,
   * the painted fallback until then — and nothing at all for a building that was
   * never painted and whose still has not arrived yet.
   * @param {string} type
   * @param {number} level
   * @returns {string|undefined}
   */
  _buildingImage (type, level) {
    const clamped = Math.max(1, Math.min(level, 3))
    return this._stills[`${type}:${clamped}`] || FALLBACK_IMAGES[type]?.[clamped]
  }

  /**
   * The card's image, tagged so `_showStill` finds it again.
   * @param {string} type
   * @param {number} level
   * @param {string} alt
   * @returns {string}
   */
  _renderCardImage (type, level, alt) {
    const src = this._buildingImage(type, level)
    return `
      <div class="building-card__image">
        <img ${src ? `src="${src}"` : ''} alt="${alt}" data-building-image="${type}">
      </div>
    `
  }

  /**
   * @returns {string}
   */
  _renderTrainingArea () {
    const building = this.buildings.find(b => b.type === 'training_area')
    if (!building) {
      return `<p class="text-muted">${t('buildings.noBuilding')}</p>`
    }

    const level = building.level
    const constructionInfo = building.constructionInfo || {}
    const isMaxLevel = level >= 3 && !constructionInfo.underConstruction
    const nextLevel = constructionInfo.underConstruction ? constructionInfo.targetLevel : level + 1
    const upgradeKey = `training_area_${nextLevel}`
    const upgrade = this.upgrades[upgradeKey]

    return `
      <div class="building-card mb-4">
        ${this._renderCardImage('training_area', level, t('buildings.trainingArea'))}
        <div class="building-card__content bg-dark">
          <h4 class="building-card__title mb-2">
            ${t('buildings.trainingArea')} - ${isMaxLevel ? t('buildings.maxLevel') : t('buildings.level', {level})}
          </h4>
          ${this._renderEffects(level)}
          ${constructionInfo.underConstruction ? this._renderConstructionStatus(constructionInfo) : ''}
          ${!constructionInfo.underConstruction && upgrade ? this._renderUpgradeButton(building, upgrade, nextLevel) : ''}
          ${isMaxLevel ? '<p class="building-card__max-level mb-0"><i class="fa fa-check-circle"></i> ' + t('buildings.maxLevel') + '</p>' : ''}
        </div>
      </div>
    `
  }

  /**
   * @returns {string}
   */
  _renderFitnessStudio () {
    const building = this.buildings.find(b => b.type === 'fitness_studio')
    if (!building) {
      return `<p class="text-muted">${t('buildings.noBuilding')}</p>`
    }

    const level = building.level
    const constructionInfo = building.constructionInfo || {}
    const isMaxLevel = level >= 3 && !constructionInfo.underConstruction
    const nextLevel = constructionInfo.underConstruction ? constructionInfo.targetLevel : level + 1
    const upgradeKey = `fitness_studio_${nextLevel}`
    const upgrade = this.upgrades[upgradeKey]

    return `
      <div class="building-card mb-4">
        ${this._renderCardImage('fitness_studio', level, t('buildings.fitnessStudio'))}
        <div class="building-card__content bg-dark">
          <h4 class="building-card__title mb-2">
            ${t('buildings.fitnessStudio')} - ${isMaxLevel ? t('buildings.maxLevel') : t('buildings.level', {level})}
          </h4>
          ${this._renderFitnessEffects(level)}
          ${constructionInfo.underConstruction ? this._renderConstructionStatus(constructionInfo) : ''}
          ${!constructionInfo.underConstruction && upgrade ? this._renderFitnessUpgradeButton(building, upgrade, nextLevel) : ''}
          ${isMaxLevel ? '<p class="building-card__max-level mb-0"><i class="fa fa-check-circle"></i> ' + t('buildings.maxLevel') + '</p>' : ''}
        </div>
      </div>
    `
  }

  /**
   * @returns {string}
   */
  _renderYouthAcademy () {
    const building = this.buildings.find(b => b.type === 'youth_academy')
    if (!building) {
      return `<p class="text-muted">${t('buildings.noBuilding')}</p>`
    }

    const level = building.level
    const constructionInfo = building.constructionInfo || {}
    const isMaxLevel = level >= 3 && !constructionInfo.underConstruction
    const nextLevel = constructionInfo.underConstruction ? constructionInfo.targetLevel : level + 1
    const upgradeKey = `youth_academy_${nextLevel}`
    const upgrade = this.upgrades[upgradeKey]

    return `
      <div class="building-card mb-4">
        ${this._renderCardImage('youth_academy', level, t('buildings.youthAcademy'))}
        <div class="building-card__content bg-dark">
          <h4 class="building-card__title mb-2">
            ${t('buildings.youthAcademy')} - ${isMaxLevel ? t('buildings.maxLevel') : t('buildings.level', {level})}
          </h4>
          <p class="building-card__desc mb-4">${t(`buildings.youthLevel${level}Desc`)}</p>
          ${constructionInfo.underConstruction ? this._renderConstructionStatus(constructionInfo) : ''}
          ${!constructionInfo.underConstruction && upgrade ? this._renderYouthAcademyUpgradeButton(building, upgrade, nextLevel) : ''}
          ${isMaxLevel ? '<p class="building-card__max-level mb-0"><i class="fa fa-check-circle"></i> ' + t('buildings.maxLevel') + '</p>' : ''}
        </div>
      </div>
    `
  }

  /**
   * The medical practice is the one building with a single level: it is either
   * built or it is not, so its card shows a build button instead of an upgrade
   * ladder and never a "next level".
   * @returns {string}
   */
  _renderMedicalPractice () {
    const building = this.buildings.find(b => b.type === 'medical_practice')
    if (!building) {
      return `<p class="text-muted">${t('buildings.noBuilding')}</p>`
    }

    const level = building.level
    const constructionInfo = building.constructionInfo || {}
    const isBuilt = level >= 1
    const upgrade = this.upgrades.medical_practice_1

    return `
      <div class="building-card mb-4">
        ${this._renderCardImage('medical_practice', level, t('buildings.medicalPractice'))}
        <div class="building-card__content bg-dark">
          <h4 class="building-card__title mb-2">
            ${t('buildings.medicalPractice')}${isBuilt ? ` - ${t('buildings.built')}` : ''}
          </h4>
          <p class="building-card__desc mb-4">${t(`buildings.medicalLevel${isBuilt ? 1 : 0}Desc`)}</p>
          ${constructionInfo.underConstruction ? this._renderConstructionStatus(constructionInfo) : ''}
          ${!isBuilt && !constructionInfo.underConstruction && upgrade ? this._renderMedicalPracticeBuildButton(building, upgrade) : ''}
          ${isBuilt ? `<p class="building-card__max-level mb-0"><i class="fa fa-check-circle"></i> ${t('buildings.singleLevel')}</p>` : ''}
        </div>
      </div>
    `
  }

  /**
   * @param {Object} building
   * @param {Object} upgrade
   * @returns {string}
   */
  _renderMedicalPracticeBuildButton (building, upgrade) {
    const btnId = generateId()

    onClick(btnId, () => {
      this._showMedicalPracticeBuildConfirmation(building, upgrade)
    })

    return `
      <div class="building-card__upgrade mt-2 p-2">
        <h6 class="building-card__upgrade-title">${t('buildings.nextLevelEffects')}</h6>
        <p class="building-card__desc mb-2">${t('buildings.medicalLevel1Desc')}</p>
        <p class="building-card__upgrade-cost mb-1">${t('buildings.upgradeCost', {cost: euroFormat.format(upgrade.cost)})}</p>
        <p class="building-card__upgrade-time mb-2">${t('buildings.constructionDays', {days: upgrade.constructionDays})}</p>
        <button id="${btnId}" class="btn btn-outline-light">${t('buildings.build')}</button>
      </div>
    `
  }

  /**
   * @param {Object} building
   * @param {Object} upgrade
   */
  _showMedicalPracticeBuildConfirmation (building, upgrade) {
    const confirmId = generateId()
    const imageUrl = this._buildingImage('medical_practice', 1)

    onClick(confirmId, async () => {
      try {
        await server.upgradeBuilding(building.type)
        toast(t('buildings.buildStarted'), 'success')
        overlay.remove()
        void this.parent.update(true)
      } catch (e) {
        showServerError(e)
      }
    })

    const overlay = showOverlay(
      t('buildings.buildConfirmTitle', {buildingName: t('buildings.medicalPractice')}),
      t('buildings.upgradeConfirmText', {
        cost: euroFormat.format(upgrade.cost),
        days: upgrade.constructionDays
      }),
      `
      ${imageUrl ? `<div class="text-center mb-3">
        <img src="${imageUrl}" alt="${t('buildings.medicalPractice')}" class="building-card__confirm-img">
      </div>` : ''}
      <button id="${confirmId}" class="btn btn-primary w-100">
        ${t('buildings.build')}
      </button>
    `)
  }

  /**
   * @param {Object} building
   * @param {Object} upgrade
   * @param {number} nextLevel
   * @returns {string}
   */
  _renderYouthAcademyUpgradeButton (building, upgrade, nextLevel) {
    const btnId = generateId()

    onClick(btnId, () => {
      this._showYouthAcademyUpgradeConfirmation(building, upgrade, nextLevel)
    })

    return `
      <div class="building-card__upgrade mt-2 p-2">
        <h6 class="building-card__upgrade-title">${t('buildings.nextLevelEffects')}</h6>
        <p class="building-card__desc mb-2">${t(`buildings.youthLevel${nextLevel}Desc`)}</p>
        <p class="building-card__upgrade-cost mb-1">${t('buildings.upgradeCost', {cost: euroFormat.format(upgrade.cost)})}</p>
        <p class="building-card__upgrade-time mb-2">${t('buildings.constructionDays', {days: upgrade.constructionDays})}</p>
        <button id="${btnId}" class="btn btn-outline-light">${t('buildings.upgrade', {level: nextLevel})}</button>
      </div>
    `
  }

  /**
   * @param {Object} building
   * @param {Object} upgrade
   * @param {number} nextLevel
   */
  _showYouthAcademyUpgradeConfirmation (building, upgrade, nextLevel) {
    const confirmId = generateId()
    const imageUrl = this._buildingImage('youth_academy', nextLevel)

    onClick(confirmId, async () => {
      try {
        await server.upgradeBuilding(building.type)
        toast(t('buildings.upgradeStarted'), 'success')
        overlay.remove()
        void this.parent.update(true)
      } catch (e) {
        showServerError(e)
      }
    })

    const overlay = showOverlay(
      t('buildings.upgradeConfirmTitle', {buildingName: t('buildings.youthAcademy')}),
      t('buildings.upgradeConfirmText', {
        cost: euroFormat.format(upgrade.cost),
        days: upgrade.constructionDays
      }),
      `
      <div class="text-center mb-3">
        <img src="${imageUrl}" alt="${t('buildings.youthAcademy')}" class="building-card__confirm-img">
      </div>
      <button id="${confirmId}" class="btn btn-primary w-100">
        ${t('buildings.upgrade', {level: nextLevel})}
      </button>
    `)
  }

  /**
   * @param {number} level
   * @returns {string}
   */
  _renderEffects (level) {
    return `
      <p class="building-card__desc mb-4">${t(`buildings.level${level}Desc`)}</p>
    `
  }

  /**
   * @param {number} level
   * @returns {string}
   */
  _renderFitnessEffects (level) {
    return `
      <p class="building-card__desc mb-4">${t(`buildings.fitnessLevel${level}Desc`)}</p>
    `
  }

  /**
   * @param {{remainingGameDays: number}} constructionInfo
   * @returns {string}
   */
  _renderConstructionStatus (constructionInfo) {
    const remaining = constructionInfo.remainingGameDays
    return `
      <div class="building-card__construction mt-2 p-2">
        <i class="fa fa-wrench"></i>
        <strong>${t('buildings.underConstruction')}</strong><br>
        <small>${remaining > 0 ? t('buildings.constructionRemaining', {days: remaining}) : t('buildings.constructionCompletesToday')}</small>
      </div>
    `
  }

  /**
   * @param {Object} building
   * @param {Object} upgrade
   * @param {number} nextLevel
   * @returns {string}
   */
  _renderUpgradeButton (building, upgrade, nextLevel) {
    const btnId = generateId()

    onClick(btnId, () => {
      this._showUpgradeConfirmation(building, upgrade, nextLevel)
    })

    return `
      <div class="building-card__upgrade mt-2 p-2">
        <h6 class="building-card__upgrade-title">${t('buildings.nextLevelEffects')}</h6>
        ${this._renderNextLevelPreview(nextLevel)}
        <p class="building-card__upgrade-cost mb-1">${t('buildings.upgradeCost', {cost: euroFormat.format(upgrade.cost)})}</p>
        <p class="building-card__upgrade-time mb-2">${t('buildings.constructionDays', {days: upgrade.constructionDays})}</p>
        <button id="${btnId}" class="btn btn-outline-light">
          ${t('buildings.upgrade', {level: nextLevel})}
        </button>
      </div>
    `
  }

  /**
   * @param {Object} building
   * @param {Object} upgrade
   * @param {number} nextLevel
   * @returns {string}
   */
  _renderFitnessUpgradeButton (building, upgrade, nextLevel) {
    const btnId = generateId()

    onClick(btnId, () => {
      this._showFitnessUpgradeConfirmation(building, upgrade, nextLevel)
    })

    return `
      <div class="building-card__upgrade mt-2 p-2">
        <h6 class="building-card__upgrade-title">${t('buildings.nextLevelEffects')}</h6>
        <p class="building-card__desc mb-2">${t(`buildings.fitnessLevel${nextLevel}Desc`)}</p>
        <p class="building-card__upgrade-cost mb-1">${t('buildings.upgradeCost', {cost: euroFormat.format(upgrade.cost)})}</p>
        <p class="building-card__upgrade-time mb-2">${t('buildings.constructionDays', {days: upgrade.constructionDays})}</p>
        <button id="${btnId}" class="btn btn-outline-light">
          ${t('buildings.upgrade', {level: nextLevel})}
        </button>
      </div>
    `
  }

  /**
   * @param {number} nextLevel
   * @returns {string}
   */
  _renderNextLevelPreview (nextLevel) {
    return `
      <p class="building-card__desc mb-2">${t(`buildings.level${nextLevel}Desc`)}</p>
    `
  }

  /**
   * @param {Object} building
   * @param {Object} upgrade
   * @param {number} nextLevel
   */
  _showUpgradeConfirmation (building, upgrade, nextLevel) {
    const confirmId = generateId()
    const imageUrl = this._buildingImage('training_area', nextLevel)

    onClick(confirmId, async () => {
      try {
        await server.upgradeBuilding(building.type)
        toast(t('buildings.upgradeStarted'), 'success')
        overlay.remove()
        void this.parent.update(true)
      } catch (e) {
        showServerError(e)
      }
    })

    const overlay = showOverlay(
      t('buildings.upgradeConfirmTitle', {buildingName: t('buildings.trainingArea')}),
      t('buildings.upgradeConfirmText', {
        cost: euroFormat.format(upgrade.cost),
        days: upgrade.constructionDays
      }),
      `
      <div class="text-center mb-3">
        <img src="${imageUrl}" alt="${t('buildings.trainingArea')}" class="building-card__confirm-img">
      </div>
      <button id="${confirmId}" class="btn btn-primary w-100">
        ${t('buildings.upgrade', {level: nextLevel})}
      </button>
    `)
  }

  /**
   * @param {Object} building
   * @param {Object} upgrade
   * @param {number} nextLevel
   */
  _showFitnessUpgradeConfirmation (building, upgrade, nextLevel) {
    const confirmId = generateId()
    const imageUrl = this._buildingImage('fitness_studio', nextLevel)

    onClick(confirmId, async () => {
      try {
        await server.upgradeBuilding(building.type)
        toast(t('buildings.upgradeStarted'), 'success')
        overlay.remove()
        void this.parent.update(true)
      } catch (e) {
        showServerError(e)
      }
    })

    const overlay = showOverlay(
      t('buildings.upgradeConfirmTitle', {buildingName: t('buildings.fitnessStudio')}),
      t('buildings.upgradeConfirmText', {
        cost: euroFormat.format(upgrade.cost),
        days: upgrade.constructionDays
      }),
      `
      <div class="text-center mb-3">
        <img src="${imageUrl}" alt="${t('buildings.fitnessStudio')}" class="building-card__confirm-img">
      </div>
      <button id="${confirmId}" class="btn btn-primary w-100">
        ${t('buildings.upgrade', {level: nextLevel})}
      </button>
    `)
  }
}
