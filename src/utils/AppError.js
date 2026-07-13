/**
 * Erreur applicative avec code HTTP et code métier optionnel.
 */
export class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} [statusCode=500]
   * @param {string} [code]
   */
  constructor(message, statusCode = 500, code) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.isOperational = true
  }
}
