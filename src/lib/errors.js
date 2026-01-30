export class BadRequestError {
  /**
   * @param {string} message
   */
  constructor (message) {
    this.message = message
    this.status = 400
  }
}

export class UnauthorizedError {
  /**
   * @param {string} message
   */
  constructor (message) {
    this.message = message
    this.status = 401
  }
}
