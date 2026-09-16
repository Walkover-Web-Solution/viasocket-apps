/**
 * Public types. Everything the API returns in snake_case is mapped to camelCase here, so the
 * shape a caller sees is the shape a JavaScript codebase expects — and so that if a field is
 * ever renamed upstream, it is renamed in one place.
 */

export interface ViaSocketOptions {
  /** Your organisation id, from the Install Code page. */
  orgId: string
  /** The Apps API project id, from the Install Code page. */
  projectId: string
  /**
   * Your org's signing secret. Server-side only: anyone holding it can act as any of your
   * users. Read it from an environment variable, never from a bundle.
   */
  secret: string
  /** Defaults to https://flow-api.viasocket.com. Override for a different environment. */
  apiBaseUrl?: string
  /** Where actions run. Defaults to https://flow.sokt.io. */
  runBaseUrl?: string
  /** Swap the transport — for tests, retries, or a runtime without a global fetch. */
  fetch?: typeof fetch
}

/** One choice a field accepts. Show the label; put the value in inputData. */
export interface Option {
  label: string
  value: string
}

export interface ListOptionsResult {
  options: Option[]
  /** Cursor for the next page on fields that paginate; null when there is no more. */
  offset: string | null
}

export interface ListOptionsParams {
  /** The field you want choices for, exactly as it appears in the action's inputData. */
  fieldKey: string
  /** The connection to read through. */
  authId: string
  /**
   * Everything the user has already chosen. Fields this one depends on must be present, or
   * the list comes back empty.
   */
  existingFields?: Record<string, unknown>
}

export interface EnableResult {
  /** Your run URL for this app and this connection. A credential — keep it server-side. */
  scriptId: string
  webhookUrl: string
  serviceId: string
  authId: string
}

export interface SubscribeParams {
  authId: string
  /** The event's own configuration — which channel, which sheet. */
  inputData: Record<string, unknown>
  /** Your endpoint. We POST every event to it. Use this or `code`, not both. */
  webhook?: string
  /** JavaScript run on each event instead of a webhook. */
  code?: string
  /** Anything of yours; handed back with every delivery. */
  meta?: Record<string, unknown>
}

export interface SubscribeResult {
  /** The subscription. Keep it — changing or ending the subscription needs it. */
  scriptId: string
  /** The hook we registered on the app's side. */
  hookUrl: string
  title: string
  authId: string
  inputData: Record<string, unknown>
  meta: Record<string, unknown>
}

export interface UpdateSubscriptionParams {
  code?: string
  meta?: Record<string, unknown>
}

/** One flow of an end user: an enabled app, or a trigger subscription. */
export interface Flow {
  /** The script_id. */
  id: string
  title: string
  status: string
  webhook: string
  description: string
  authId: string
  serviceId: string
}

export type FlowStatus = 0 | 1

/** The envelope every viaSocket endpoint answers with. */
export interface Envelope<T = unknown> {
  success: boolean
  message?: string
  data: T
  isCached?: boolean
}
