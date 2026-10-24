/**
 * The client. One `ViaSocket` per deployment, one `UserScope` per end user.
 *
 * The split mirrors the API's own model: every call except running an action is made *for* a
 * specific end user (the `unique_identifier` in the token), while running an action needs no
 * token at all — the `script_id` is the credential. Putting `runAction` on the root client and
 * everything else behind `user(id)` makes that distinction structural rather than something a
 * reader has to remember.
 */

import { ViaSocketError } from './errors.js'
import { request } from './http.js'
import { signEmbedToken } from './token.js'
import type {
  AiAccepted,
  AiHistoryPage,
  AiReply,
  AiRtLayerToken,
  AiSend,
  AiSendParams,
  AiThread,
  BuiltInApp,
  CatalogAction,
  CatalogApp,
  CatalogService,
  CatalogTrigger,
  CatalogVersions,
  EnableResult,
  Envelope,
  Flow,
  MemoryToken,
  FlowStatus,
  ListOptionsParams,
  ListAppsParams,
  ListOptionsResult,
  Option,
  RenameFlowParams,
  SubscribeParams,
  SubscribeResult,
  UpdateSubscriptionParams,
  UserOptions,
  ViaSocketOptions
} from './types.js'

const DEFAULT_API_BASE_URL = 'https://flow-api.viasocket.com'
/** The AI API's thread id: the product's own string. */
const AI_THREAD_ID = /^[A-Za-z0-9_-]{1,100}$/
const AI_MAX_TOOLS = 20
const DEFAULT_RUN_BASE_URL = 'https://flow.sokt.io'

/** The public catalog: no token, the same data in every environment. */
const CATALOG = {
  search: 'https://flow.sokt.io/func/scri12BSufQM',
  list: 'https://plug-service.viasocket.com/api/v1/plugins/all',
  versions: 'https://flow.sokt.io/func/scriK4LFg2kc',
  slug: 'https://plug-service.viasocket.com/api/v1/plugins/recommend/services'
}
const LIST_LIMIT_MAX = 200
/** The run-host function that fetches one real event of a trigger for one connection. */
const SAMPLE_EVENT_FUNCTION = 'scrijZpnr8zJ'
/** Plugs tagged with these categories in Developer Hub are the built-ins `catalog.listBuiltIn()` returns. */
export const BUILT_IN_PLUG_CATEGORIES = ['SDK'] as const
/** The list answers an empty page for a category with `limit=200`; stay under it. */
const BUILT_IN_PAGE = 100
/** An unknown slug is answered by nothing, slowly; a known one in well under a second. */
const SLUG_TIMEOUT_MS = 30_000
/** How long `versionIdFor` trusts its copy of an app's catalog. */
const VERSIONS_TTL_MS = 10 * 60_000

/** `Send Message` → `send-message`: an event's path on its documentation page. */
const eventPath = (name: string) =>
  `${name || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

function required(name: string, value: string | undefined): string {
  if (typeof value !== 'string' || !value.trim()) throw new ViaSocketError(`${name} is required`, { status: null })
  return value
}

const trimSlash = (url: string) => url.replace(/\/+$/, '')

export class ViaSocket {
  readonly orgId: string
  readonly projectId: string
  readonly apiBaseUrl: string
  readonly runBaseUrl: string
  private readonly secret: string
  /** @internal */
  readonly transport: typeof fetch
  /** slug → service_id. Slugs never change their app, so for the life of the process. */
  private readonly serviceIds = new Map<string, Promise<string>>()
  /** service_id → its catalog, for `versionIdFor`; a failed read is dropped, never kept. */
  private readonly versionsCache = new Map<string, { at: number; value: Promise<CatalogVersions | null> }>

  constructor(options: ViaSocketOptions) {
    this.orgId = required('orgId', options?.orgId)
    this.projectId = required('projectId', options?.projectId)
    this.secret = required('secret', options?.secret)
    this.apiBaseUrl = trimSlash(options.apiBaseUrl || DEFAULT_API_BASE_URL)
    this.runBaseUrl = trimSlash(options.runBaseUrl || DEFAULT_RUN_BASE_URL)

    const transport = options.fetch ?? globalThis.fetch
    if (typeof transport !== 'function') {
      throw new ViaSocketError('No fetch available. Use Node 20+, or pass `fetch` in the options.', { status: null })
    }
    // Bound so a bare `fetch` reference still has the right `this` on runtimes that care.
    this.transport = options.fetch ? transport : transport.bind(globalThis)
  }

  /**
   * The catalog: which apps exist and what each can do. Public, no token, nothing per user — so
   * it lives on the root client and is safe to call from a browser too.
   */
  readonly catalog = {
    /** The best 30 apps for what the user typed. A type-ahead: an empty key returns nothing. */
    search: async (key: string): Promise<CatalogApp[]> => {
      const url = `${CATALOG.search}?key=${encodeURIComponent(required('key', key))}`
      const { data } = await request<Array<Record<string, string>>>({ method: 'GET', url, fetchImpl: this.transport })
      return (Array.isArray(data) ? data : []).map((row) => ({
        serviceId: row.service_id,
        name: row.name,
        description: row.description ?? '',
        iconUrl: row.iconurl ?? ''
      }))
    },
    /**
     * Every app, most used first, a page at a time (200 at most). An empty page ends it. The list
     * is the whole table — far down it holds apps with nothing published — so a grid drops every
     * app whose `versions()` comes back empty.
     */
    list: async (params: ListAppsParams = {}): Promise<CatalogApp[]> => {
      const query = new URLSearchParams({
        limit: String(Math.min(Math.max(1, params.limit ?? LIST_LIMIT_MAX), LIST_LIMIT_MAX)),
        offset: String(Math.max(0, params.offset ?? 0))
      })
      if (params.category) query.set('category', params.category)
      // The body is `{ message, data: [...] }` with no `success` key, so it is not the envelope and
      // arrives whole as `data`.
      const { data } = await request<{ data?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>({
        method: 'GET',
        url: `${CATALOG.list}?${query}`,
        fetchImpl: this.transport
      })
      const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
      return rows.map((row) => ({
        serviceId: String(row.rowid ?? ''),
        name: String(row.name ?? ''),
        description: String(row.description ?? ''),
        iconUrl: String(row.iconurl ?? ''),
        ...(typeof row.appslugname === 'string' && row.appslugname ? { slug: row.appslugname } : {}),
        category: Array.isArray(row.category) ? (row.category as string[]) : [],
        domain: typeof row.domain === 'string' ? row.domain : undefined
      }))
    },
    /**
     * The `service_id` of the app with this slug (`slack`, `google-sheets`) — how code names a fixed
     * app. Exact and case-sensitive; an unknown slug is a ViaSocketError, never a guess (it can take
     * up to 30 s to be told so). Cached for the life of the process.
     */
    serviceIdFor: (slug: string): Promise<string> => {
      const key = required('slug', slug)
      let found = this.serviceIds.get(key)
      if (!found) {
        found = this.resolveSlug(key)
        this.serviceIds.set(key, found)
        found.catch(() => this.serviceIds.delete(key))
      }
      return found
    },
    /**
     * The version id `runAction`, `listOptions` and `subscribe` take, for one event of an app, read
     * from the live catalog. `event` is the event's `action_id` / `trigger_id` (it survives a rename)
     * or its path on the app's page (`send-message`). `version` is the one your code was written
     * against (`V107`): when the app has published another, this warns and returns the published one —
     * reread the event's page and update the code. Cached 10 minutes per app.
     */
    versionIdFor: async (serviceId: string, event: string, version?: string): Promise<string> => {
      const wanted = required('event', event).trim()
      const app = await this.cachedVersions(required('serviceId', serviceId))
      if (!app) throw new ViaSocketError(`versionIdFor: no app has the service id "${serviceId}"`, { status: null })
      // Each event with the version id the calls take, whichever kind it is.
      const all = [
        ...app.actions.map((e) => ({ id: e.action_id, versionId: e.action_version_id, name: e.name, versionid: e.versionid })),
        ...app.triggers.map((e) => ({ id: e.trigger_id, versionId: e.trigger_version_id, name: e.name, versionid: e.versionid }))
      ]
      const byId = all.filter((e) => e.id === wanted)
      const found = byId.length ? byId : all.filter((e) => eventPath(e.name) === wanted)
      if (found.length !== 1) {
        throw new ViaSocketError(
          `versionIdFor: ${app.service.name} has ${found.length ? 'several events' : 'no published event'} "${wanted}" — use its action_id / trigger_id from the app's page`,
          { status: null }
        )
      }
      const [match] = found
      if (version && match.versionid && match.versionid !== version) {
        console.warn(`viaSocket: ${app.service.name} "${wanted}" is published as ${match.versionid}, not ${version}: reread its page and update the code`)
      }
      return match.versionId
    },
    /**
     * The built-in plugs — Run AI Model, Pause Workflow, Memory, scraping, GST and more: every plug
     * tagged `SDK` in Developer Hub, with its published actions. Live, so a newly tagged plug appears
     * without a release.
     */
    listBuiltIn: async (): Promise<BuiltInApp[]> => {
      const pages = await Promise.all(
        BUILT_IN_PLUG_CATEGORIES.map((category) => this.catalog.list({ category, limit: BUILT_IN_PAGE }))
      )
      const apps = [...new Map(pages.flat().map((app) => [app.serviceId, app])).values()].filter((app) => app.serviceId)
      const withActions = await Promise.all(
        apps.map(async (app) => {
          const versions = await this.catalog.versions(app.serviceId)
          if (!versions?.actions.length) return null
          return {
            serviceId: app.serviceId,
            slug: app.slug ?? '',
            name: versions.service.name || app.name,
            iconUrl: versions.service.icon_url || app.iconUrl,
            requiresAuth: versions.service.requires_auth !== false && `${versions.service.auth_type ?? ''}`.toLowerCase() !== 'noauth',
            actions: versions.actions
          }
        })
      )
      return withActions.filter((app): app is BuiltInApp => app !== null).sort((a, b) => a.name.localeCompare(b.name))
    },
    /**
     * One app and every published action and trigger of it, as `{ service, actions, triggers }`.
     * Each action carries `action_id` and `action_version_id`, each trigger `trigger_id` and
     * `trigger_version_id` — named as the calls take them: the version id for `runAction`,
     * `listOptions` and `subscribe`; the other for `connect`, automations and the prebuilt UI.
     * `input_schema` is the field schema a form is rendered from. `null` for an unknown service id
     * (the API answers 200 with an empty service); empty arrays for an app with nothing published.
     * Cache it per app; ids are stable and schemas change rarely.
     */
    versions: async (serviceId: string): Promise<CatalogVersions | null> => {
      const { data } = await request<Record<string, unknown>>({
        method: 'POST',
        url: CATALOG.versions,
        body: JSON.stringify({ service_id: required('serviceId', serviceId) }),
        fetchImpl: this.transport
      })
      // No `success` key, so the body arrives whole as `data`; tolerate an envelope anyway.
      const body = (data && 'service' in data ? data : (data?.data as Record<string, unknown> | undefined)) ?? {}
      const service = body.service as CatalogService | undefined
      if (!service?.name) return null
      return {
        service,
        actions: Array.isArray(body.actions) ? (body.actions as CatalogAction[]) : [],
        triggers: Array.isArray(body.triggers) ? (body.triggers as CatalogTrigger[]) : []
      }
    }
  }

  /** Everything that is done for one of your end users. */
  user(uniqueIdentifier: string, options: UserOptions = {}): UserScope {
    return new UserScope(this, required('uniqueIdentifier', uniqueIdentifier), options)
  }

  /**
   * A signed embed token for one end user — what the connect popup on your frontend needs.
   * Sign on demand per request; there is nothing to gain from caching it in the browser.
   */
  tokenFor(uniqueIdentifier: string, options: UserOptions = {}): Promise<string> {
    return signEmbedToken({
      orgId: this.orgId,
      projectId: this.projectId,
      uniqueIdentifier: required('uniqueIdentifier', uniqueIdentifier),
      secret: this.secret,
      memorySpaces: options.memorySpaces
    })
  }

  /**
   * Runs one action. No token: the script_id from `user.enable()` is the credential, which is
   * exactly why this call belongs on your server.
   */
  async runAction<T = unknown>(scriptId: string, actionVersionId: string, inputData: Record<string, unknown>): Promise<T> {
    const payload = await request<T>({
      method: 'POST',
      url: `${this.runBaseUrl}/func/${required('scriptId', scriptId)}`,
      body: JSON.stringify({ action_version_id: required('actionVersionId', actionVersionId), inputData: inputData ?? {} }),
      fetchImpl: this.transport
    })
    return payload.data
  }

  /**
   * One real event of a trigger for one connection: exactly what a handler reads at
   * `context.req.body`, and what an automation's steps read there. Map from it, never from the
   * catalog's `sample_output`, which the connector's author recorded on another account. It takes
   * the `trigger_id` (a version id answers "No response"); `authType` is the app's
   * `service.auth_type` from `catalog.versions()`; `inputData` is the trigger's own settings, the
   * same the subscription will carry. No token, but the `auth_id` is a credential: server only.
   */
  async sampleEvent<T = Record<string, unknown>>(
    triggerId: string,
    authId: string,
    authType: string,
    inputData: Record<string, unknown> = {}
  ): Promise<T> {
    const query = new URLSearchParams({
      action_id: required('triggerId', triggerId),
      auth_id: required('authId', authId),
      authType: required('authType', authType)
    })
    const { data } = await request<Record<string, unknown>>({
      method: 'POST',
      url: `${this.runBaseUrl}/func/${SAMPLE_EVENT_FUNCTION}?${query}`,
      body: JSON.stringify({ context: { inputData: inputData ?? {} } }),
      fetchImpl: this.transport
    })
    // An unreadable connection (revoked, another user's, the wrong auth_id) answers 200 with the
    // failure nested inside, as list-options does.
    const nested = (data as { response?: { status?: number | string; data?: { message?: string } } } | null)?.response
    if (nested && Number(nested.status) >= 400) {
      throw new ViaSocketError(`sampleEvent: ${nested.data?.message || 'the connection could not be read'}`, {
        status: Number(nested.status),
        body: data
      })
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || (data as { message?: string }).message === 'No response') {
      throw new ViaSocketError(
        `sampleEvent: no event came back (${JSON.stringify(data)?.slice(0, 120)}) — pass the trigger_id, not its version id, and a live auth_id`,
        { status: null, body: data }
      )
    }
    // `viasocket_help` is a note for the developer, not a field of the event.
    const { viasocket_help: _help, ...event } = data
    return event as T
  }

  private async resolveSlug(slug: string): Promise<string> {
    let data: { data?: { plugins?: Record<string, { rowid?: string }> } } | undefined
    try {
      ;({ data } = await request<{ data?: { plugins?: Record<string, { rowid?: string }> } }>({
        method: 'GET',
        url: `${CATALOG.slug}?service=${encodeURIComponent(slug)}`,
        fetchImpl: this.transport,
        signal: AbortSignal.timeout(SLUG_TIMEOUT_MS)
      }))
    } catch (error) {
      if ((error as Error)?.name !== 'TimeoutError') throw error
    }
    const serviceId = data?.data?.plugins?.[slug]?.rowid
    if (!serviceId) {
      throw new ViaSocketError(`No viaSocket app has the slug "${slug}" — slugs are exact and case-sensitive; find it with catalog.list()`, {
        status: null
      })
    }
    return serviceId
  }

  private cachedVersions(serviceId: string): Promise<CatalogVersions | null> {
    const cached = this.versionsCache.get(serviceId)
    if (cached && Date.now() - cached.at < VERSIONS_TTL_MS) return cached.value
    const value = this.catalog.versions(serviceId)
    this.versionsCache.set(serviceId, { at: Date.now(), value })
    // Neither a failure nor an empty answer is kept: one bad read must not block runs for ten minutes.
    value.then(
      (app) => {
        if (!app) this.versionsCache.delete(serviceId)
      },
      () => this.versionsCache.delete(serviceId)
    )
    return value
  }
}

/**
 * Calls made on behalf of one end user. Obtained from `viasocket.user(id)`.
 *
 * The token is signed once per scope and reused: it carries no expiry, so there is nothing to
 * refresh, and re-signing per call would only add work.
 */
export class UserScope {
  private tokenPromise: Promise<string> | undefined
  /** The memory token `memory.call` reuses, until a minute before it runs out. */
  private memoryCache: { token: Promise<MemoryToken>; expiresAt: number } | undefined

  constructor(
    private readonly client: ViaSocket,
    readonly uniqueIdentifier: string,
    private readonly options: UserOptions = {}
  ) {}

  /** The signed embed token for this user. */
  token(): Promise<string> {
    this.tokenPromise ??= this.client.tokenFor(this.uniqueIdentifier, this.options)
    return this.tokenPromise
  }

  private async call<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<Envelope<T>> {
    return request<T>({
      method,
      url: `${this.client.apiBaseUrl}${path}`,
      token: await this.token(),
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      fetchImpl: this.client.transport
    })
  }

  /**
   * Turns a connection into a script_id you can run actions with. Needed only for actions —
   * subscribing to a trigger takes the auth_id alone. Do it once per connection; see
   * `findEnabled()` before calling it again.
   */
  async enable(serviceId: string, authId: string): Promise<EnableResult> {
    const { data } = await this.call<{ script_id: string; webhook_url: string; service_id: string; auth_id: string }>(
      'POST',
      `/embed/enable/${required('serviceId', serviceId)}/${required('authId', authId)}`,
      ''
    )
    return { scriptId: data.script_id, webhookUrl: data.webhook_url, serviceId: data.service_id, authId: data.auth_id }
  }

  /**
   * The values one field accepts, scoped by what the user has already chosen.
   *
   * Handles both response shapes the endpoint uses — a plain array, or `{ data, offset }` on
   * fields that paginate — so the caller always gets `{ options, offset }`.
   */
  async listOptions(actionVersionId: string, params: ListOptionsParams): Promise<ListOptionsResult> {
    const { data } = await this.call<
      Option[] | { data?: Option[]; offset?: string | null; response?: { status?: number | string; data?: { message?: string } } }
    >('POST', `/embed/list-options/${required('actionVersionId', actionVersionId)}`, {
      fieldKey: required('fieldKey', params?.fieldKey),
      auth_id: required('authId', params?.authId),
      existingFields: params?.existingFields ?? {}
    })
    if (Array.isArray(data)) return { options: data, offset: null }
    // A connection that cannot be read (revoked, or another user's auth_id) is answered with 200 and
    // success: true, the failure nested in data. It is an error, and the message is the explanation.
    if (data?.response && Number(data.response.status) >= 400) {
      throw new ViaSocketError(data.response.data?.message || 'list-options failed', { status: Number(data.response.status), body: data })
    }
    return { options: Array.isArray(data?.data) ? data.data : [], offset: data?.offset ?? null }
  }

  /**
   * Subscribes to an app event with a handler: `code`, a self-contained script we run on our
   * servers each time the event fires, with the event at `context.req.body`. It runs an action in
   * another app the user connected, or calls your own API. `webhook` (a public URL we POST raw
   * events to) is the edge case. Exactly one of the two.
   */
  async subscribe(triggerVersionId: string, params: SubscribeParams): Promise<SubscribeResult> {
    if (!params?.webhook === !params?.code) {
      throw new ViaSocketError('subscribe: pass exactly one of `code` (a handler we run per event) or `webhook`', { status: null })
    }
    const body: Record<string, unknown> = {
      auth_id: required('authId', params.authId),
      inputData: params.inputData ?? {},
      meta: params.meta ?? {}
    }
    if (params.webhook) body.webhook = params.webhook
    if (params.code) body.code = params.code

    const { data } = await this.call<{
      script_id: string
      title: string
      auth_id: string
      inputData: Record<string, unknown> & { hookUrl?: string }
      meta: Record<string, unknown>
    }>('POST', `/embed/subscribe-event/${required('triggerVersionId', triggerVersionId)}`, body)

    return {
      scriptId: data.script_id,
      hookUrl: data.inputData?.hookUrl ?? '',
      title: data.title,
      authId: data.auth_id,
      inputData: data.inputData ?? {},
      meta: data.meta ?? {}
    }
  }

  /** Changes a live subscription in place. The script_id does not change. */
  async updateSubscription(subscriptionScriptId: string, params: UpdateSubscriptionParams): Promise<SubscribeResult> {
    const { data } = await this.call<{
      script_id: string
      title: string
      auth_id: string
      inputData: Record<string, unknown> & { hookUrl?: string }
      meta: Record<string, unknown>
    }>('PUT', `/embed/update-subscribed-event/${required('subscriptionScriptId', subscriptionScriptId)}`, params ?? {})
    return {
      scriptId: data.script_id,
      hookUrl: data.inputData?.hookUrl ?? '',
      title: data.title,
      authId: data.auth_id,
      inputData: data.inputData ?? {},
      meta: data.meta ?? {}
    }
  }

  /** Every flow this user has: one per enabled app, one per trigger subscription. */
  async listFlows(): Promise<Flow[]> {
    const { data } = await this.call<{
      flows?: Array<{ id: string; title: string; status: string; webhook: string; description?: string; auth_id: string; service_id: string }>
    }>('GET', `/projects/${this.client.projectId}/integrations`)
    return (data?.flows ?? []).map((flow) => ({
      id: flow.id,
      title: flow.title,
      status: flow.status,
      webhook: flow.webhook,
      description: flow.description ?? '',
      authId: flow.auth_id,
      serviceId: flow.service_id
    }))
  }

  /**
   * The script_id of an app this user already enabled — active or paused — or null. Call it before
   * `enable()`: enabling twice leaves you with two script_ids for one app. A paused one is resumed
   * with `enableFlow()`, never enabled again.
   */
  async findEnabled(serviceId: string): Promise<string | null> {
    const flows = await this.listFlows()
    const wanted = required('serviceId', serviceId)
    return flows.find((flow) => flow.serviceId === wanted && (flow.status === 'active' || flow.status === 'paused'))?.id ?? null
  }

  /**
   * Pauses (2), resumes or restores (1), or deletes (0) one flow: an enabled app, a trigger
   * subscription or an automation. A deleted flow is listed as `deleted` and can be restored with 1.
   */
  async setFlowStatus(scriptId: string, status: FlowStatus): Promise<{ id: string; status: string }> {
    const id = required('scriptId', scriptId)
    try {
      const { data } = await this.call<{ id: string; status: string }>('PUT', `/embed/updatestatus/${id}?status=${status}`)
      // The response is the whole flow record; nothing else in it is anything a caller acts on.
      return { id: data.id, status: String(data.status) }
    } catch (error) {
      // Already in that state: what the caller asked for is true, so it is not a failure.
      if (error instanceof ViaSocketError && /already set/i.test(error.message)) return { id, status: String(status) }
      throw error
    }
  }

  /** Pauses a flow (status 2). Before 0.7.0 this sent 0, which deletes. */
  disableFlow(scriptId: string) {
    return this.setFlowStatus(scriptId, 2)
  }

  /** Resumes a paused flow, or restores a deleted one (status 1). */
  enableFlow(scriptId: string) {
    return this.setFlowStatus(scriptId, 1)
  }

  /** Deletes a flow (status 0). It stays listed as `deleted`; `enableFlow` restores it. */
  deleteFlow(scriptId: string) {
    return this.setFlowStatus(scriptId, 0)
  }

  /** Renames a flow; `meta` comes back as `metadata` in the prebuilt UI's flow events. */
  async renameFlow(scriptId: string, params: RenameFlowParams): Promise<{ id: string; title: string; description: string }> {
    const body: Record<string, unknown> = { title: required('title', params?.title) }
    if (params.description !== undefined) body.description = params.description
    if (params.meta !== undefined) body.meta = params.meta
    const { data } = await this.call<{ id: string; title: string; description?: string }>(
      'PUT',
      `/projects/updateflowembed/${required('scriptId', scriptId)}`,
      body
    )
    // The response is the whole script, code included; only these are anything a caller acts on.
    return { id: data.id, title: data.title, description: data.description ?? '' }
  }

  /**
   * The AI API: a chat assistant viaSocket runs for this user — threads and history kept per
   * `unique_identifier`, your prompt per call, your own endpoints as its tools. Backend only, like
   * everything else here: the prompt and the tools' headers are yours to keep off the browser.
   * The whole contract is https://flow.viasocket.com/documentation/ai.md.
   */
  readonly ai = {
    /**
     * Sends one message and returns the answer — or, with `delivery: 'rtlayer'`, the 202's
     * `channel` the answer will be published on (subscribe to it in the browser before sending).
     * Refuses, before any request, what the API would refuse: a threadId with other characters,
     * `rtlayer` without a threadId, a model without its service, a jsonSchema without its responseType.
     */
    send: (async (params: AiSendParams): Promise<AiReply | AiAccepted> => {
      const body: Record<string, unknown> = { message: required('message', params?.message) }
      if (params.threadId !== undefined) {
        if (!AI_THREAD_ID.test(params.threadId)) {
          throw new ViaSocketError('ai.send: threadId is letters, digits, - and _, up to 100 characters', { status: null })
        }
        body.thread_id = params.threadId
      }
      if (params.delivery === 'rtlayer' && !params.threadId) {
        throw new ViaSocketError('ai.send: threadId is required with delivery "rtlayer" — subscribe to its channel, then send', { status: null })
      }
      if (params.prompt !== undefined) body.prompt = params.prompt
      if (params.responseType) body.response_type = params.responseType
      if (params.jsonSchema) {
        if (params.responseType !== 'json_schema') {
          throw new ViaSocketError('ai.send: jsonSchema is only allowed with responseType "json_schema"', { status: null })
        }
        body.json_schema = params.jsonSchema
      }
      if (!params.model !== !params.service) throw new ViaSocketError('ai.send: model and service go together', { status: null })
      if (params.model) {
        body.model = params.model
        body.service = params.service
      }
      if (params.tools?.length) {
        if (params.tools.length > AI_MAX_TOOLS) throw new ViaSocketError(`ai.send: at most ${AI_MAX_TOOLS} tools in one call`, { status: null })
        body.extra_tools = params.tools.map((tool) => ({
          name: required('tool.name', tool?.name),
          description: required('tool.description', tool?.description),
          url: required('tool.url', tool?.url),
          method: tool.method ?? 'POST',
          headers: tool.headers ?? {},
          fields: tool.fields ?? {},
          required_params: tool.requiredParams ?? [],
          tool_and_variable_path: tool.toolAndVariablePath ?? {}
        }))
      }
      if (params.delivery) body.delivery = params.delivery

      const { data } = await this.call<{
        thread_id: string
        message_id: string
        content?: string | Record<string, unknown>
        finish_reason?: string
        channel?: string
      }>('POST', '/embed/ai/message', body)
      if (params.delivery === 'rtlayer') return { threadId: data.thread_id, messageId: data.message_id, channel: data.channel ?? '' }
      return { threadId: data.thread_id, messageId: data.message_id, content: data.content ?? '', finishReason: data.finish_reason ?? '' }
    }) as unknown as AiSend,

    /** This user's threads in this project, most recently active first. */
    threads: async (): Promise<AiThread[]> => {
      const { data } = await this.call<{ threads?: Array<{ thread_id: string; title: string | null; updated_at: string }> }>(
        'GET',
        '/embed/ai/threads'
      )
      return (data?.threads ?? []).map((thread) => ({ threadId: thread.thread_id, title: thread.title ?? null, updatedAt: thread.updated_at }))
    },

    /** One thread's messages, 40 exchanges a page; page 1 holds the latest, oldest of those first. */
    history: async (threadId: string, params: { page?: number } = {}): Promise<AiHistoryPage> => {
      const page = Math.max(1, Math.floor(params.page ?? 1))
      const { data } = await this.call<{
        thread_id: string
        messages?: Array<{ role: string; content: string; message_id: string; created_at: string }>
        page?: number
        has_more?: boolean
      }>('GET', `/embed/ai/threads/${encodeURIComponent(required('threadId', threadId))}/history?page=${page}`)
      return {
        threadId: data.thread_id ?? threadId,
        messages: (data.messages ?? []).map((message) => ({
          role: message.role,
          content: message.content,
          messageId: message.message_id,
          createdAt: message.created_at
        })),
        page: data.page ?? page,
        hasMore: Boolean(data.has_more)
      }
    },

    /** A 48-hour subscribe token for the browser, and the prefix every thread's channel starts with. */
    rtlayerToken: async (): Promise<AiRtLayerToken> => {
      const { data } = await this.call<{ token: string; org_id: string; service_id: string; channel_prefix: string; expires_in: string }>(
        'GET',
        '/embed/ai/rtlayer-token'
      )
      return { token: data.token, orgId: data.org_id, serviceId: data.service_id, channelPrefix: data.channel_prefix, expiresIn: data.expires_in }
    }
  }

  /**
   * AI memory for this user: what the product's AI remembers about them, and the shared spaces
   * granted with `viasocket.user(id, { memorySpaces })`. Recall with `POST /search` before an answer,
   * `POST /learn` after it. Every path and body is https://memory-api.viasocket.com/guide.md.
   */
  readonly memory = {
    /**
     * A fresh memory token, lasting `expiresIn` seconds (60 to 86400, default 3600). Take a
     * separate short one for an AI's tool headers or an agent; `call` keeps its own.
     */
    token: async (params: { expiresIn?: number } = {}): Promise<MemoryToken> => {
      const expiresIn = params.expiresIn ?? 3600
      if (!Number.isInteger(expiresIn) || expiresIn < 60 || expiresIn > 86400) {
        throw new ViaSocketError('memory.token: expiresIn is whole seconds, 60 to 86400', { status: null })
      }
      const { data } = await this.call<{
        token: string
        url: string
        mcp_url: string
        expires_in: number
        me: string
        spaces: MemoryToken['spaces']
      }>('GET', `/embed/ai/memory-token?expires_in=${expiresIn}`)
      return { token: data.token, url: trimSlash(data.url), mcpUrl: data.mcp_url, expiresIn: data.expires_in, me: data.me, spaces: data.spaces ?? {} }
    },

    /**
     * One call to the memory service as this user: `memory.call('POST', '/search', { query })`.
     * Returns the service's reply. The token is reused until a minute before it runs out, and taken
     * again once if the service refuses it.
     */
    call: async <T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> => {
      if (!required('path', path).startsWith('/')) throw new ViaSocketError('memory.call: path starts with /', { status: null })
      for (let attempt = 0; ; attempt++) {
        const { token, url } = await this.memoryToken()
        try {
          const { data } = await request<T>({
            method,
            url: `${url}${path}`,
            token: `Bearer ${token}`,
            body: body === undefined ? undefined : JSON.stringify(body),
            fetchImpl: this.client.transport
          })
          return data
        } catch (error) {
          if (attempt || (error as ViaSocketError)?.status !== 401) throw error
          this.memoryCache = undefined
        }
      }
    }
  }

  private async memoryToken(): Promise<MemoryToken> {
    const cached = this.memoryCache
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token
    const entry = { token: this.memory.token(), expiresAt: Infinity }
    this.memoryCache = entry
    try {
      const value = await entry.token
      entry.expiresAt = Date.now() + value.expiresIn * 1000
      return value
    } catch (error) {
      if (this.memoryCache === entry) this.memoryCache = undefined
      throw error
    }
  }

  /**
   * Every app this user has connected. Returned as the API sends it: the shape of each entry
   * is not yet documented, so nothing is mapped or dropped here.
   */
  async listConnections(): Promise<unknown[]> {
    const { data } = await this.call<unknown>('GET', '/embed/authentications')
    return Array.isArray(data) ? data : []
  }

  /** Disconnects an app. Disable the flows built on it first, or they stop working. */
  async revokeConnection(authId: string): Promise<void> {
    await this.call('DELETE', `/embed/authentications/revoke/${required('authId', authId)}`)
  }
}
