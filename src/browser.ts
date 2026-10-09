/**
 * The browser half: opening the app's own consent screen and getting the connection back.
 *
 *   import { connect } from 'viasocket-apps/browser'
 *   const { authId } = await connect({ embedToken, serviceId })
 *
 * It wraps viaSocket's standalone connect script — the popup, the postMessage handshake, the
 * three message types — behind one promise. Nothing here touches the signing secret: the
 * embedToken comes from your backend, already signed for this end user.
 *
 * The script is served by viaSocket at a fixed URL and is the only supported way to open the
 * popup: it registers the token, hands the session over, opens the right page for its
 * environment, and listens for the result on both paths it can arrive by (the popup's own
 * postMessage, and a relay for sign-in pages that sever the popup's link to this page). A
 * viasocket URL built by hand opens a page that does not exist.
 */

const DEFAULT_SCRIPT_URL = 'https://flow.viasocket.com/connect.js'
const SCRIPT_ID = 'viasocket-connect-script'
/** A service id is one bare token of letters and digits: `rowo0bqrhj5g`, never `rowo0bqrhj5g_gmail`. */
const SERVICE_ID = /^[A-Za-z0-9]+$/
/** How long a late success is still delivered after `closed` — the script's own bound. */
const LATE_SUCCESS_WINDOW_MS = 15 * 60 * 1000

export type ConnectErrorCode =
  /**
   * The popup seems to have been closed before finishing. Best-effort: once the popup is on the
   * app's own sign-in page a close can only be inferred, and arrives about a minute later. If the
   * user in fact finishes after that, `onLateSuccess` is called with the connection.
   */
  | 'closed'
  /** The app refused the authorisation, or viaSocket refused the request (an id that names no app). */
  | 'rejected'
  /** The connect script could not be loaded. */
  | 'script'
  /** The `serviceId` is not a bare service id — the app's name, its slug, or an id with a name joined on. */
  | 'invalid'
  /** Not running in a browser, or the popup could not be opened. */
  | 'unavailable'

export class ViaSocketConnectError extends Error {
  readonly code: ConnectErrorCode
  readonly serviceId: string

  constructor(code: ConnectErrorCode, serviceId: string, message: string) {
    super(message)
    this.name = 'ViaSocketConnectError'
    this.code = code
    this.serviceId = serviceId
  }
}

export interface ConnectOptions {
  /** Signed on your backend for the current end user — see `viasocket.user(id).token()`. */
  embedToken: string
  /**
   * The app to connect: its `service_id` exactly as the catalog returns it (`rowo0bqrhj5g`).
   * Never the app's name or slug, never the id with a name joined on.
   */
  serviceId: string
  /**
   * The `action_id`s and `trigger_id`s this product uses (listed under each one in the app's
   * document and in `catalog.versions()`). The popup then asks only for their scopes. Omit to
   * offer every action. Never a version id.
   */
  actions?: string[]
  /** With `actions`: skip the action list and open the app's consent screen directly. */
  skipActionSelection?: boolean
  /**
   * Called if the connection completes after `connect()` already rejected with `'closed'` — the
   * close was inferred while the user was still on the app's sign-in page. Treat it exactly like
   * a resolved `connect()`.
   */
  onLateSuccess?: (result: ConnectResult) => void
  /**
   * Where the connect script is served from. The script picks its API and auth hosts from its
   * own origin, so for a non-production stack point this at that stack's copy
   * (`https://dev-flow.viasocket.com/connect.js`).
   */
  scriptUrl?: string
}

/** The third argument of the connect script's `openViasocketConnection`. */
interface ConnectScriptOptions {
  filteredActions?: string[]
  skipActionSelection?: boolean
}

export interface ConnectResult {
  /** The connection. Every later call for this app takes it as auth_id. */
  authId: string
  serviceId: string
  /** The full connection record the popup posted back. */
  connection: Record<string, unknown>
}

declare global {
  interface Window {
    openViasocketConnection?: (embedToken: string, serviceId: string, options?: ConnectScriptOptions) => Promise<unknown> | void
  }
}

/** Loaded once per page, however many apps get connected. */
let scriptPromise: Promise<void> | null = null

/**
 * Loads the connect script ahead of the click, so the popup opens without a delay. Optional —
 * `connect()` loads it on demand.
 */
export function loadConnectScript(scriptUrl: string = DEFAULT_SCRIPT_URL): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new ViaSocketConnectError('unavailable', '', 'connect() only runs in a browser'))
  }
  if (typeof window.openViasocketConnection === 'function') return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const fail = () => {
      scriptPromise = null
      document.getElementById(SCRIPT_ID)?.remove()
      reject(new ViaSocketConnectError('script', '', `Could not load the viaSocket connect script from ${scriptUrl}`))
    }
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    const script = existing ?? document.createElement('script')
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', fail, { once: true })
    if (!existing) {
      script.id = SCRIPT_ID
      script.src = scriptUrl
      document.body.appendChild(script)
    }
  })
  return scriptPromise
}

const RESULT_TYPES = ['viasocket_connection_success', 'viasocket_connection_error', 'viasocket_connection_closed']

/**
 * Opens the consent popup for one app and resolves with the connection it creates.
 *
 * Rejects with a ViaSocketConnectError whose `code` says why: 'closed' if the user seems to have
 * given up (best-effort — see `onLateSuccess`), 'rejected' if the app or viaSocket said no,
 * 'invalid' if the serviceId is not a service id, 'script' if the connect script could not load.
 */
export async function connect(options: ConnectOptions): Promise<ConnectResult> {
  const serviceId = options?.serviceId
  if (!options?.embedToken) throw new ViaSocketConnectError('unavailable', serviceId ?? '', 'connect: embedToken is required')
  if (!serviceId) throw new ViaSocketConnectError('unavailable', '', 'connect: serviceId is required')
  if (typeof serviceId !== 'string' || !SERVICE_ID.test(serviceId)) {
    throw new ViaSocketConnectError(
      'invalid',
      String(serviceId),
      `connect: "${serviceId}" is not a service id. Pass the service_id exactly as the catalog returns it (a bare id such as rowo0bqrhj5g), not the app's name or slug, and not the id with a name joined on`
    )
  }

  await loadConnectScript(options.scriptUrl)

  const open = window.openViasocketConnection
  if (typeof open !== 'function') {
    throw new ViaSocketConnectError('script', serviceId, 'The connect script loaded but did not expose openViasocketConnection()')
  }

  return new Promise<ConnectResult>((resolve, reject) => {
    let closedReported = false
    let lateTimer: ReturnType<typeof setTimeout> | null = null
    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      if (lateTimer) clearTimeout(lateTimer)
    }
    const toResult = (payload: { data?: unknown }): ConnectResult | null => {
      const connection = (payload.data ?? {}) as Record<string, unknown>
      const authId = typeof connection.id === 'string' ? connection.id : ''
      return authId ? { authId, serviceId, connection } : null
    }

    function onMessage(event: MessageEvent) {
      const payload = event?.data
      if (!payload || typeof payload.type !== 'string' || !RESULT_TYPES.includes(payload.type)) return
      // Two apps can be connecting in one page; only this app's messages are ours.
      if (payload.serviceId && payload.serviceId !== serviceId) return

      if (payload.type === 'viasocket_connection_closed') {
        if (closedReported) return
        closedReported = true
        // Keep listening: a close on the app's sign-in page is inferred, and the script still
        // delivers a success that arrives after it.
        lateTimer = setTimeout(cleanup, LATE_SUCCESS_WINDOW_MS)
        reject(new ViaSocketConnectError('closed', serviceId, 'The popup seems to have been closed before the connection finished'))
        return
      }

      cleanup()
      if (payload.type === 'viasocket_connection_success') {
        const result = toResult(payload)
        if (closedReported) {
          if (result) options.onLateSuccess?.(result)
          return
        }
        if (!result) {
          reject(new ViaSocketConnectError('rejected', serviceId, 'The connection succeeded but carried no id'))
          return
        }
        resolve(result)
      } else if (!closedReported) {
        reject(new ViaSocketConnectError('rejected', serviceId, payload.error?.message || 'The app rejected the connection'))
      }
    }

    window.addEventListener('message', onMessage)
    const scriptOptions: ConnectScriptOptions = {}
    if (options.actions?.length) scriptOptions.filteredActions = options.actions
    if (options.skipActionSelection) scriptOptions.skipActionSelection = true
    if (Object.keys(scriptOptions).length) open(options.embedToken, serviceId, scriptOptions)
    else open(options.embedToken, serviceId)
  })
}
