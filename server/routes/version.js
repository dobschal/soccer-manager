import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const packageJson = require('../../package.json')

export default {
  /**
   * @returns {{ version: string }}
   */
  getVersion () {
    return { version: packageJson.version }
  }
}
