import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Heavy end-to-end suite that runs against a real MySQL container. Each test
// file gets its own forked worker process (so it can set DB env vars before
// `lib/database.js` is imported) and its own throwaway schema. NOT included
// in `npm test` — kick off explicitly with `npm run test:integration`.
export default defineConfig({
  test: {
    root: __dirname,
    environment: 'node',
    globals: true,
    include: ['test/integration/**/*.test.js'],
    setupFiles: ['./test/integration/setup.js'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: false }
    },
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
    teardownTimeout: 60_000,
    coverage: { enabled: false }
  }
})
