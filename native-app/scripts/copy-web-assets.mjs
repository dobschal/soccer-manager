import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { prepareNativeWebDir } from '../../scripts/lib/native-build-utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

await prepareNativeWebDir({
  clientDir: resolve(ROOT, '..', 'client'),
  outputDir: resolve(ROOT, 'web'),
  rootDir: resolve(ROOT, '..')
})

console.log('Done! Web assets ready in native-app/web/')
