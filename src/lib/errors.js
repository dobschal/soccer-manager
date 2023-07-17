export class BadRequestError {
  constructor (message) {
    this.message = message
    this.status = 400
  }
}

export class UnauthorizedError {
  constructor (message) {
    this.message = message
    this.status = 401
  }
}
