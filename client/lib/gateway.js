/**
 * @param {string} sqlStatement
 * @returns {Promise<Array>}
 */
export async function queryApi (sqlStatement) {
  const rawResponse = await fetch(`/api/read?query=${encodeURIComponent(sqlStatement)}`)
  const response = await rawResponse.json()
  return response
}
