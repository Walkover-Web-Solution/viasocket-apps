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
  /**
   * The event's own configuration — which channel, which sheet. For polled triggers it may also
   * carry `scheduledTime`, the minutes between checks as a string: "5" or "15".
   */
  inputData: Record<string, unknown>
  /**
   * What to do when the event fires: a script we run on viaSocket's servers per event. The
   * default. It runs an action in another app the user connected, or calls your own API.
   *
   * It is a string of JavaScript executed away from your process, so it must stand alone — no
   * imports and no reference to anything in your codebase. In scope there: `axios`, `fetch` and
   * `context`; the event the app sent is `context.req.body`. Bake in any value of yours (a
   * script_id, a picked id, an API key) when you build the string. Exactly one of `code` or `webhook`.
   */
  code?: string
  /** Edge case: a public, unauthenticated URL of yours. We POST every raw event to it. */
  webhook?: string
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
  /** A new script to run per event. Same rules as `SubscribeParams.code`. */
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
/** One app of the catalog, from a search or the full list. */
export interface CatalogApp {
  /** The `service_id` every other call takes. */
  serviceId: string
  name: string
  description: string
  iconUrl: string
  /** Only the full list carries these. */
  category?: string[]
  domain?: string
}

export interface ListAppsParams {
  /** Up to 200, the API's cap. */
  limit?: number
  offset?: number
  /** One of the catalog's category names, e.g. "CRM". */
  category?: string
}

/** One published action or trigger version of an app, as the catalog returns it. */
export interface CatalogVersion {
  /**
   * The action’s or trigger’s own id: what `connect`’s `actions`, an automation’s `trigger_id` /
   * `action_id` and the prebuilt UI’s `open: { actionId }` / `{ triggerId }` take. Looks like the
   * version id below and is not interchangeable with it.
   */
  rowid: string
  /** The `action_version_id` (or `trigger_version_id`) that `runAction`, `listOptions` and `subscribe` take — and only those. */
  actionversionrecordid: string
  type: 'action' | 'trigger' | string
  name: string
  description: string
  /** The field schema a form is rendered from; `inputData` follows it. */
  inputjson: Record<string, unknown>
  sampledata?: unknown
  pluginrecordid?: string
  iconurl?: string
  authtype?: string
  [key: string]: unknown
}

export interface CatalogVersions {
  actions: CatalogVersion[]
  triggers: CatalogVersion[]
}

export interface Envelope<T = unknown> {
  success: boolean
  message?: string
  data: T
  isCached?: boolean
}
