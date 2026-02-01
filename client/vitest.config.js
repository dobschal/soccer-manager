import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    root: __dirname,
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    globals: true,
    include: ['test/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['pages/**/*.js', 'partials/**/*.js', 'layouts/**/*.js']
    }
  }
})
