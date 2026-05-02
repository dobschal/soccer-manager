// Copies google-services.json from App_Resources/Android/ into the generated
// platforms/android/app/ directory so the com.google.gms.google-services
// Gradle plugin can find it. NativeScript regenerates platforms/ on every
// build, so the file has to be (re)copied each time.
const fs = require('fs')
const path = require('path')

module.exports = function (hookArgs) {
  const projectDir = (hookArgs && hookArgs.projectData && hookArgs.projectData.projectDir) || process.cwd()
  const src = path.join(projectDir, 'app', 'App_Resources', 'Android', 'google-services.json')
  if (!fs.existsSync(src)) return Promise.resolve()

  const destDir = path.join(projectDir, 'platforms', 'android', 'app')
  fs.mkdirSync(destDir, { recursive: true })
  fs.copyFileSync(src, path.join(destDir, 'google-services.json'))
  return Promise.resolve()
}
