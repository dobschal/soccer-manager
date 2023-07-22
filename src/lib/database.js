import mysql from 'mysql'

const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST ?? 'database', // switch to localhost if running locally
  user: 'root',
  password: 'root',
  database: 'soccer'
})

/**
 * Wrapper of the existing database query method, but returns a promise.
 *
 * @param {[string, *, () => Promise]|[string, () => Promise]} params
 * @returns {Promise<Array>}
 */
export function query (...params) {
  return new Promise((resolve, reject) => {
    params.push(function (error, results) {
      if (error) return reject(error)
      resolve(results)
    })
    pool.query(...params)
  })
}
