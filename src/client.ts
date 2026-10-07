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
  CatalogAction,
  CatalogApp,
  CatalogService,
  CatalogTrigger,
  CatalogVersions,
  EnableResult,
  Envelope,
  Flow,
  FlowStatus,
  ListOptionsParams,
  ListAppsParams,
  ListOptionsResult,
  Option,
  SubscribeParams,
  SubscribeResult,
  UpdateSubscriptionParams,
  ViaSocketOptions
} from './types.js'

const DEFAULT_API_BASE_URL = 'https://flow-api.viasocket.com'
const DEFAULT_RUN_BASE_URL = 'https://flow.sokt.io'

/** The public catalog: no token, the same data in every environment. */
const CATALOG = {
  search: 'https://flow.sokt.io/func/scri12BSufQM',
  list: 'https://plug-service.viasocket.com/api/v1/plugins/all',
  versions: 'https://flow.sokt.io/func/scriK4LFg2kc'
}
const LIST_LIMIT_MAX = 200

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
        category: Array.isArray(row.category) ? (row.category as string[]) : [],
        domain: typeof row.domain === 'string' ? row.domain : undefined
      }))
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
  user(uniqueIdentifier: string): UserScope {
    return new UserScope(this, required('uniqueIdentifier', uniqueIdentifier))
  }

  /**
   * A signed embed token for one end user — what the connect popup on your frontend needs.
   * Sign on demand per request; there is nothing to gain from caching it in the browser.
   */
  tokenFor(uniqueIdentifier: string): Promise<string> {
    return signEmbedToken({
      orgId: this.orgId,
      projectId: this.projectId,
      uniqueIdentifier: required('uniqueIdentifier', uniqueIdentifier),
      secret: this.secret
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
}

/**
 * Calls made on behalf of one end user. Obtained from `viasocket.user(id)`.
 *
 * The token is signed once per scope and reused: it carries no expiry, so there is nothing to
 * refresh, and re-signing per call would only add work.
 */
export class UserScope {
  private tokenPromise: Promise<string> | undefined

  constructor(
    private readonly client: ViaSocket,
    readonly uniqueIdentifier: string
  ) {}

  /** The signed embed token for this user. */
  token(): Promise<string> {
    this.tokenPromise ??= this.client.tokenFor(this.uniqueIdentifier)
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
   * The script_id of an app this user already enabled, or null. Call it before `enable()` —
   * enabling twice leaves you with two script_ids for one app.
   */
  async findEnabled(serviceId: string): Promise<string | null> {
    const flows = await this.listFlows()
    return flows.find((flow) => flow.serviceId === required('serviceId', serviceId) && flow.status === 'active')?.id ?? null
  }

  /** Turns a flow off (0) or back on (1): an enabled app, or a trigger subscription. */
  async setFlowStatus(scriptId: string, status: FlowStatus): Promise<{ id: string; status: string }> {
    const { data } = await this.call<{ id: string; status: string }>(
      'PUT',
      `/embed/updatestatus/${required('scriptId', scriptId)}?status=${status}`
    )
    // The response is the whole flow record; nothing else in it is anything a caller acts on.
    return { id: data.id, status: String(data.status) }
  }

  disableFlow(scriptId: string) {
    return this.setFlowStatus(scriptId, 0)
  }

  enableFlow(scriptId: string) {
    return this.setFlowStatus(scriptId, 1)
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
