import mysql from 'mysql'

const pool = mysql.createPool({
  connectionLimit: 25,
  host: process.env.DB_HOST ?? 'database', // switch to localhost if running locally
  user: 'root',
  password: 'root',
  database: 'soccer'
})

/**
 * Wrapper of the existing database query method, but returns a promise.
 *
 * @param {any} params
 * @returns {Promise<Array<unknown>>}
 */
export function query (...params) {
  return new Promise((resolve, reject) => {
    const t1 = Date.now()
    params.push(function (error, results) {
      if (error) return reject(error)
      const duration = Date.now() - t1
      if (params[0].includes('SELECT') && duration > 10) {
        console.warn(`🔍 Query "${params[0].substring(0, 50)}" took ${duration}ms`)
      }
      resolve(results)
    })
    pool.query(...params)
  })
}

/**
 * Execute multiple queries within a transaction.
 * If any query fails, the transaction is rolled back.
 *
 * @param {Function} callback - Receives a query function bound to the transaction connection
 * @returns {Promise<any>}
 */
export function transaction (callback) {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) return reject(err)

      connection.beginTransaction(async (err) => {
        if (err) {
          connection.release()
          return reject(err)
        }

        const txQuery = (...params) => {
          return new Promise((resolve, reject) => {
            params.push((error, results) => {
              if (error) return reject(error)
              resolve(results)
            })
            connection.query(...params)
          })
        }

        try {
          const result = await callback(txQuery)
          connection.commit((err) => {
            if (err) {
              connection.rollback(() => {
                connection.release()
                reject(err)
              })
              return
            }
            connection.release()
            resolve(result)
          })
        } catch (error) {
          connection.rollback(() => {
            connection.release()
            reject(error)
          })
        }
      })
    })
  })
}
