// Integration-test bootstrap. Runs once per Vitest worker (one worker per test
// file with `pool: 'forks'`). It creates a unique throwaway MySQL database,
// points the app's connection pool at it via env vars, runs the schema
// migration, and drops the database at the end.
//
// Layered carefully:
//   1. **Top-level**: set DB_NAME/HOST/USER/PASS env vars *before* the test
//      file's imports execute, so `lib/database.js` reads the right config
//      when its module-level pool is created.
//   2. **beforeAll**: actually CREATE the database (the pool created in step
//      1 connects lazily, so this is fine) and run `runMigration`.
//   3. **afterAll**: close the pool and DROP the database.
//
// To run locally:
//   docker compose up database -d           # provides MySQL on localhost:3306
//   npm run test:integration

import mysql from 'mysql'
import { afterAll, beforeAll } from 'vitest'

const DB_HOST = process.env.DB_HOST ?? 'localhost'
const DB_USER = process.env.DB_USER ?? 'root'
const DB_PASS = process.env.DB_PASS ?? 'root'
const DB_NAME = `soccer_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

// Override env so `lib/database.js` picks these up when it's imported by the
// test file (or by anything the test file pulls in).
process.env.DB_HOST = DB_HOST
process.env.DB_USER = DB_USER
process.env.DB_PASS = DB_PASS
process.env.DB_NAME = DB_NAME

/** Open an admin connection that is NOT bound to any database, for DDL. */
function adminConnection () {
  return mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASS,
    charset: 'utf8mb4',
    multipleStatements: true
  })
}

function execAdmin (sql) {
  return new Promise((resolve, reject) => {
    const conn = adminConnection()
    conn.connect(err => {
      if (err) return reject(err)
      conn.query(sql, (qErr, res) => {
        conn.end(() => qErr ? reject(qErr) : resolve(res))
      })
    })
  })
}

beforeAll(async () => {
  await execAdmin(`CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  const { runMigration } = await import('../../migrate-database.js')
  await runMigration()
}, 180_000)

afterAll(async () => {
  try {
    const { closePool } = await import('../../lib/database.js')
    await closePool()
  } catch (e) {
    console.warn('closePool failed (ignored):', e?.message)
  }
  await execAdmin(`DROP DATABASE IF EXISTS \`${DB_NAME}\``)
}, 60_000)

export { DB_NAME }
