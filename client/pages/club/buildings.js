import { server, showServerError } from '../../lib/gateway.js'
import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { UIElement } from '../../lib/UIElement.js'
import { toast } from '../../partials/toast.js'
import { showOverlay } from '../../partials/overlay.js'
import { t } from '../../i18n/index.js'
import { euroFormat } from '../../lib/currency.js'

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
    const data = await server.getBuildings()
    this.buildings = data.buildings || []
    this.upgrades = data.upgrades || {}
    this.cardChances = data.cardChances || {}
    this.fitnessCardChances = data.fitnessCardChances || {}
  }
  /**
   * @returns {string}
   */
  get template () {
    return `
      <div>
        <h3>${t('buildings.title')}</h3>
        <p class="text-muted">${t('buildings.trainingAreaDesc')}</p>
        ${this._renderTrainingArea()}
        <p class="text-muted mt-4">${t('buildings.fitnessStudioDesc')}</p>
        ${this._renderFitnessStudio()}
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
    const imageUrl = TRAINING_AREA_IMAGES[Math.max(1, Math.min(level, 3))]

    return `
      <div class="building-card mb-4">
        <div class="building-card__image">
          <img src="${imageUrl || TRAINING_AREA_IMAGES[1]}" alt="${t('buildings.trainingArea')}">
        </div>
        <div class="building-card__content bg-dark">
          <h4 class="building-card__title mb-2">
            ${t('buildings.trainingArea')} - ${isMaxLevel ? t('buildings.maxLevel') : t('buildings.level', { level })}
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
    const imageUrl = FITNESS_STUDIO_IMAGES[Math.max(1, Math.min(level, 3))]

    return `
      <div class="building-card mb-4">
        <div class="building-card__image">
          <img src="${imageUrl || FITNESS_STUDIO_IMAGES[1]}" alt="${t('buildings.fitnessStudio')}">
        </div>
        <div class="building-card__content bg-dark">
          <h4 class="building-card__title mb-2">
            ${t('buildings.fitnessStudio')} - ${isMaxLevel ? t('buildings.maxLevel') : t('buildings.level', { level })}
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
        <small>${remaining > 0 ? t('buildings.constructionRemaining', { days: remaining }) : t('buildings.constructionCompletesToday')}</small>
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
        <p class="building-card__upgrade-cost mb-1">${t('buildings.upgradeCost', { cost: euroFormat.format(upgrade.cost) })}</p>
        <p class="building-card__upgrade-time mb-2">${t('buildings.constructionDays', { days: upgrade.constructionDays })}</p>
        <button id="${btnId}" class="btn btn-outline-light">
          ${t('buildings.upgrade', { level: nextLevel })}
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
        <p class="building-card__upgrade-cost mb-1">${t('buildings.upgradeCost', { cost: euroFormat.format(upgrade.cost) })}</p>
        <p class="building-card__upgrade-time mb-2">${t('buildings.constructionDays', { days: upgrade.constructionDays })}</p>
        <button id="${btnId}" class="btn btn-outline-light">
          ${t('buildings.upgrade', { level: nextLevel })}
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
    const imageUrl = TRAINING_AREA_IMAGES[Math.min(nextLevel, 3)]

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
      t('buildings.upgradeConfirmTitle', { buildingName: t('buildings.trainingArea') }),
      t('buildings.upgradeConfirmText', {
        cost: euroFormat.format(upgrade.cost),
        days: upgrade.constructionDays
      }),
      `
      <div class="text-center mb-3">
        <img src="${imageUrl}" alt="${t('buildings.trainingArea')}" class="building-card__confirm-img">
      </div>
      <button id="${confirmId}" class="btn btn-primary w-100">
        ${t('buildings.upgrade', { level: nextLevel })}
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
    const imageUrl = FITNESS_STUDIO_IMAGES[Math.min(nextLevel, 3)]

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
      t('buildings.upgradeConfirmTitle', { buildingName: t('buildings.fitnessStudio') }),
      t('buildings.upgradeConfirmText', {
        cost: euroFormat.format(upgrade.cost),
        days: upgrade.constructionDays
      }),
      `
      <div class="text-center mb-3">
        <img src="${imageUrl}" alt="${t('buildings.fitnessStudio')}" class="building-card__confirm-img">
      </div>
      <button id="${confirmId}" class="btn btn-primary w-100">
        ${t('buildings.upgrade', { level: nextLevel })}
      </button>
    `)
  }
}
