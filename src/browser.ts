/**
 * The browser half: opening the app's own consent screen and getting the connection back.
 *
 *   import { connect } from 'viasocket-apps-api/browser'
 *   const { authId } = await connect({ embedToken, serviceId })
 *
 * It wraps viaSocket's standalone connect script — the popup, the postMessage handshake, the
 * three message types — behind one promise. Nothing here touches the signing secret: the
 * embedToken comes from your backend, already signed for this end user.
 */

const DEFAULT_SCRIPT_URL = 'https://embed.viasocket.com/prod-connectcomponent.js'
const SCRIPT_ID = 'viasocket-connect-script'

export type ConnectErrorCode =
  /** The user closed the popup before finishing. Nothing was created. */
  | 'closed'
  /** The app refused the authorisation. */
  | 'rejected'
  /** The connect script could not be loaded. */
  | 'script'
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
  /** The app to connect. Its service_id is shown on every app in the Apps API reference. */
  serviceId: string
  /** Where the connect script is served from. Only override for a non-production environment. */
  scriptUrl?: string
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
    openViasocketConnection?: (embedToken: string, serviceId: string) => void
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

/**
 * Opens the consent popup for one app and resolves with the connection it creates.
 *
 * Rejects with a ViaSocketConnectError whose `code` says why: 'closed' if the user gave up,
 * 'rejected' if the app said no, 'script' if the connect script could not load.
 */
export async function connect(options: ConnectOptions): Promise<ConnectResult> {
  const serviceId = options?.serviceId
  if (!options?.embedToken) throw new ViaSocketConnectError('unavailable', serviceId ?? '', 'connect: embedToken is required')
  if (!serviceId) throw new ViaSocketConnectError('unavailable', '', 'connect: serviceId is required')

  await loadConnectScript(options.scriptUrl)

  const open = window.openViasocketConnection
  if (typeof open !== 'function') {
    throw new ViaSocketConnectError('script', serviceId, 'The connect script loaded but did not expose openViasocketConnection()')
  }

  return new Promise<ConnectResult>((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      const payload = event?.data
      if (!payload || typeof payload.type !== 'string' || !payload.type.startsWith('viasocket_connection')) return
      // Two apps can be connecting in one page; only this app's messages are ours.
      if (payload.serviceId && payload.serviceId !== serviceId) return

      window.removeEventListener('message', onMessage)
      if (payload.type === 'viasocket_connection_success') {
        const connection = (payload.data ?? {}) as Record<string, unknown>
        const authId = typeof connection.id === 'string' ? connection.id : ''
        if (!authId) {
          reject(new ViaSocketConnectError('rejected', serviceId, 'The connection succeeded but carried no id'))
          return
        }
        resolve({ authId, serviceId, connection })
      } else if (payload.type === 'viasocket_connection_error') {
        reject(new ViaSocketConnectError('rejected', serviceId, payload.error?.message || 'The app rejected the connection'))
      } else if (payload.type === 'viasocket_connection_closed') {
        reject(new ViaSocketConnectError('closed', serviceId, 'The popup was closed before the connection finished'))
      }
    }

    window.addEventListener('message', onMessage)
    open(options.embedToken, serviceId)
  })
}
