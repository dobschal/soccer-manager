import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    root: __dirname,
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    globals: true,
    include: ['test/**/*.test.js'],
    exclude: ['test/integration/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['routes/**/*.js', 'helper/**/*.js']
    }
  }
})
