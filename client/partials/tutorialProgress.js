import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { t } from '../i18n/index.js'

/**
 * Tutorial definitions with page routes
 */
const TUTORIALS = [
  {
    key: 'dashboard',
    route: '#dashboard'
  },
  {
    key: 'team',
    route: '#my-team'
  },
  {
    key: 'youth',
    route: '#my-team?sub_page=youth'
  },
  {
    key: 'results',
    route: '#results'
  },
  {
    key: 'trades',
    route: '#trades'
  },
  {
    key: 'stadium',
    route: '#stadium'
  },
  {
    key: 'finances',
    route: '#finances'
  }
]

export class TutorialProgress extends UIElement {
  _tutorialCompleted = {}
  _loaded = false

  /**
   * Server events to listen for
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      TUTORIAL_COMPLETED: (data) => {
        this._tutorialCompleted = data.tutorialCompleted
        this.update(false)
      }
    }
  }

  /**
   * @returns {string}
   */
  get template () {
    if (!this._loaded) {
      return ''
    }

    const completed = TUTORIALS.filter(tut => this._tutorialCompleted[tut.key]).length
    const total = TUTORIALS.length

    // Hide if all tutorials completed
    if (completed >= total) {
      return ''
    }

    const progress = Math.round((completed / total) * 100)
    const nextTutorial = this._getNextTutorial()

    return `
      <div class="card bg-info bg-opacity-10 border-info mb-4">
        <div class="card-body">
          <div class="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
            <div class="flex-grow-1">
              <h5 class="card-title mb-2">
                <i class="fa fa-graduation-cap me-2"></i>${t('tutorialProgress.title')}
              </h5>
              <p class="card-text text-muted mb-2">${t('tutorialProgress.description')}</p>
              <div class="d-flex align-items-center gap-2">
                <div class="progress flex-grow-1" style="height: 8px; max-width: 300px;">
                  <div class="progress-bar bg-info" role="progressbar" style="width: ${progress}%"
                       aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
                <small class="text-muted">${completed}/${total}</small>
              </div>
            </div>
            ${nextTutorial ? `
              <a href="${nextTutorial.route}" class="btn btn-info btn-sm flex-shrink-0">
                <i class="fa fa-arrow-right me-1"></i>${t('tutorialProgress.nextTutorial', { page: t(`tutorialProgress.page.${nextTutorial.key}`) })}
              </a>
            ` : ''}
          </div>
        </div>
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    try {
      const { tutorialCompleted } = await server.getTutorialStatus()
      this._tutorialCompleted = tutorialCompleted
      this._loaded = true
    } catch (e) {
      console.error('Failed to load tutorial status:', e)
      this._loaded = true
    }
  }

  /**
   * Get the next uncompleted tutorial
   * @returns {Object|null}
   */
  _getNextTutorial () {
    return TUTORIALS.find(tut => !this._tutorialCompleted[tut.key]) || null
  }
}
