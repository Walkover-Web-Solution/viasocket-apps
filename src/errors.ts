/**
 * Thrown for any call that did not succeed — a non-2xx status, or a 2xx whose body says
 * `success: false`. Both carry the message the API gave, because that message is almost
 * always the explanation ("existingFields missing spreadsheet_Id", "invalid token").
 */
export class ViaSocketError extends Error {
  /** HTTP status, or null when the request never got a response. */
  readonly status: number | null
  /** The parsed response body, when there was one. */
  readonly body: unknown

  constructor(message: string, options: { status: number | null; body?: unknown }) {
    super(message)
    this.name = 'ViaSocketError'
    this.status = options.status
    this.body = options.body
  }
}
