/**
 * @param {string} sqlStatement
 * @returns {Promise<Array>}
 */
export async function queryApi (sqlStatement) {
  const rawResponse = await fetch(`/api/read?query=${encodeURIComponent(sqlStatement)}`)
  const response = await rawResponse.json()
  return response
}

/**
 * Awesome Proxy wrapper to call server with HTTP Post Request
 */
export const server = new Proxy({}, {
  get (_, key) {
    return async (params) => {
      const response = await fetch(`/api/${key}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      })
      if (response.status >= 400) {
        throw (await response.json())
      }
      return await response.json()
    }
  }
})
