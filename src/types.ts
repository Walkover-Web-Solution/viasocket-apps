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

/** The app, once, at the top of `catalog.versions()`. */
export interface CatalogService {
  service_id: string
  /** The display name. The API sends `null` for an unknown id; `versions()` then returns `null` instead of a catalog. */
  name: string
  description: string | null
  icon_url: string | null
  /** `Auth2.0`, `apikey`, `NoAuth`, … Informational: connect handles it. */
  auth_type: string | null
  /** `false` for an app without sign-in: no connect button, and `'NoAuth'` wherever a call takes an `authId`. */
  requires_auth: boolean
}

interface CatalogEventBase {
  name: string
  description: string
  /**
   * The field schema a form is rendered from; `inputData` follows it. A `dropdown` / `multiselect`
   * block with no `options` (or with `enableSearchApi` / `willDynamicFetchOptions`), and an
   * `input groups` block with no children in `steps`, is a picker: fill it with `listOptions`. The
   * schema carries no generator code.
   */
  input_schema: Record<string, unknown>
  /** A real response of the action, or a real event payload of the trigger. */
  sample_output?: unknown
  updated_at?: string
  [key: string]: unknown
}

/** One published action, its two ids named as the calls take them. */
export interface CatalogAction extends CatalogEventBase {
  /**
   * The action’s own id: what `connect`’s `actions`, an automation step’s `action_id` and the
   * prebuilt UI’s `open: { actionId }` take. Looks like the version id and is not interchangeable with it.
   */
  action_id: string
  /** What `runAction` and `listOptions` take — and only those. */
  action_version_id: string
}

/** One published trigger, its two ids named as the calls take them. */
export interface CatalogTrigger extends CatalogEventBase {
  /**
   * The trigger’s own id: what `connect`’s `actions`, an automation’s `trigger_id` and the prebuilt
   * UI’s `open: { triggerId }` take. Looks like the version id and is not interchangeable with it.
   */
  trigger_id: string
  /** What `subscribe` and `listOptions` take — and only those. */
  trigger_version_id: string
  /** Not reliable yet: the API answers `true` for every trigger. */
  polled?: boolean | null
}

/** @deprecated The catalog no longer returns rows of one shape; use `CatalogAction` and `CatalogTrigger`. */
export type CatalogVersion = CatalogAction | CatalogTrigger

/** What `catalog.versions()` returns for a known app. */
export interface CatalogVersions {
  service: CatalogService
  actions: CatalogAction[]
  triggers: CatalogTrigger[]
}

export interface Envelope<T = unknown> {
  success: boolean
  message?: string
  data: T
  isCached?: boolean
}

/**
 * The AI API — `user.ai`: a chat assistant viaSocket runs for one end user, with threads and
 * history kept per `unique_identifier` and your own HTTP endpoints as the tools it may call.
 */

/** One HTTP endpoint of yours the assistant may call while answering. */
export interface AiTool {
  /** The name the model calls it by, and the name you use in the prompt: letters, digits, underscores. */
  name: string
  /** When to use it, in a sentence or two. The model decides from this. */
  description: string
  /** The endpoint to call: your own backend, with its own auth in `headers`. Never a run URL — its script_id is a credential. */
  url: string
  /** Default POST. */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Headers for that call — your own API key. They stay server-side. */
  headers?: Record<string, string>
  /** The parameters the model may fill, each with a `type` and a `description` it fills from. */
  fields?: Record<string, { type: string; description?: string; [key: string]: unknown }>
  /** Which of `fields` the model must fill before calling. */
  requiredParams?: string[]
  /** Maps prompt variables to tool parameters. Advanced; omit for an ordinary tool. */
  toolAndVariablePath?: Record<string, unknown>
}

export interface AiSendParams {
  /** What the user said. */
  message: string
  /**
   * Your own string per conversation: letters, digits, `-` and `_`, up to 100 characters. Omit to
   * start a thread and read the id from the reply. Required with `delivery: 'rtlayer'`, so the
   * browser can subscribe to the thread's channel before the send.
   */
  threadId?: string
  /**
   * The system prompt for this call. It is not stored, so send it every time. May use
   * `{{orgId}}`, `{{projectId}}` and `{{userId}}`. Name the tools in it and say when to use each.
   */
  prompt?: string
  /** `text` (default); `json_object`; or `json_schema`, which needs `jsonSchema`. */
  responseType?: 'text' | 'json_object' | 'json_schema'
  jsonSchema?: { name: string; schema: Record<string, unknown>; strict?: boolean }
  /** A model and its provider, always together: `model: 'gpt-5.6-luna', service: 'openai'`. Omit both for the default. */
  model?: string
  service?: string
  /** Up to 20. Only the ones this conversation can need. */
  tools?: AiTool[]
  /** `sync` (default): the answer in the response. `rtlayer`: a 202 and the answer on the thread's websocket channel. */
  delivery?: 'sync' | 'rtlayer'
}

/** The answer, from a synchronous send. */
export interface AiReply {
  threadId: string
  messageId: string
  /** A string, or the parsed object for a JSON `responseType`. */
  content: string | Record<string, unknown>
  /** `completed`, `truncated` (out of output tokens), or `tool_call` (stopped to call a tool). */
  finishReason: 'completed' | 'truncated' | 'tool_call' | string
}

/** The acknowledgement of a send with `delivery: 'rtlayer'`; the answer follows on `channel`. */
export interface AiAccepted {
  threadId: string
  messageId: string
  /** `channelPrefix + threadId`, from `rtlayerToken()`. */
  channel: string
}

export interface AiSend {
  (params: AiSendParams & { delivery: 'rtlayer' }): Promise<AiAccepted>
  (params: AiSendParams & { delivery?: 'sync' }): Promise<AiReply>
}

export interface AiThread {
  threadId: string
  /** Written by the AI from the thread's first message; `null` until then. */
  title: string | null
  updatedAt: string
}

export interface AiMessage {
  role: 'user' | 'assistant' | string
  content: string
  /** A user message and its reply share one id. */
  messageId: string
  createdAt: string
}

/** 40 exchanges a page; page 1 holds the latest, in chronological order. */
export interface AiHistoryPage {
  threadId: string
  messages: AiMessage[]
  page: number
  hasMore: boolean
}

/** What the browser needs to listen for replies: valid 48 hours, this user's threads only. */
export interface AiRtLayerToken {
  token: string
  orgId: string
  serviceId: string
  /** A thread's channel is this followed by the threadId. */
  channelPrefix: string
  expiresIn: string
}
