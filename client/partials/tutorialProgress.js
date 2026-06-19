import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { t } from '../i18n/index.js'
import { goTo } from '../lib/router.js'
import { showTutorialOverlay } from './tutorialOverlay.js'

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
    route: '#club'
  },
  {
    key: 'finances',
    route: '#club?sub_page=finances'
  },
  {
    key: 'buildings',
    route: '#club?sub_page=buildings'
  }
]

export class TutorialProgress extends UIElement {
  /**
   * @returns {Promise<void>}
   */
  async load () {
    try {
      const { tutorialCompleted } = await server.getTutorialStatus()
      this._tutorialCompleted = tutorialCompleted
    } catch (e) {
      console.error('Failed to load tutorial status:', e)
    }
  }
  /**
   * @returns {string}
   */
  get template () {
    const completed = TUTORIALS.filter(tut => this._tutorialCompleted[tut.key]).length
    const total = TUTORIALS.length

    // Hide if all tutorials completed
    if (completed >= total) {
      return '<div></div>'
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
              <button type="button" class="btn btn-info btn-sm flex-shrink-0 text-white tutorial-progress-next" data-tutorial-key="${nextTutorial.key}" data-tutorial-route="${nextTutorial.route}">
                <i class="fa fa-arrow-right me-1"></i>${t('tutorialProgress.nextTutorial', { page: t(`tutorialProgress.page.${nextTutorial.key}`) })}
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `
  }
  /**
   * @returns {import('../lib/UIElement.js').UIElementEvents}
   */
  get events () {
    return {
      '.tutorial-progress-next': {
        click: this._onNextTutorialClick
      }
    }
  }

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
   * Re-open the tutorial overlay for the next uncompleted tutorial. Unlike a
   * plain link, this works even when the user is already on the target page
   * (e.g. dashboard → dashboard), where a navigation would be a no-op.
   * @param {MouseEvent} event
   * @returns {void}
   */
  _onNextTutorialClick (event) {
    const button = event.currentTarget
    const key = button.dataset.tutorialKey
    const route = button.dataset.tutorialRoute
    const currentRoute = window.location.hash || '#dashboard'
    if (route && route !== currentRoute) {
      goTo(route.replace(/^#/, ''))
    }
    void showTutorialOverlay(key)
  }
  
  _tutorialCompleted = {}

  /**
   * Get the next uncompleted tutorial
   * @returns {Object|null}
   */
  _getNextTutorial () {
    return TUTORIALS.find(tut => !this._tutorialCompleted[tut.key]) || null
  }
}
