import fs from 'fs'

// Local dev convenience: auto-load `.env` from the current working directory
// before `process.env` is read by other modules. In production the container
// receives its env via docker-compose's `environment:` block, so no `.env`
// file exists in the working directory and this is a no-op.
if (fs.existsSync('.env')) {
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile('.env')
    } catch (e) {
      console.warn('Failed to load .env:', e?.message ?? e)
    }
  } else {
    console.warn('.env file found but Node version lacks process.loadEnvFile. Upgrade to Node 20.12+.')
  }
}
