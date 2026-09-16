/**
 * The one place a request is made and a response judged.
 *
 * The embed endpoints answer with one envelope, `{ success, data }`, and can say "no" two ways:
 * a non-2xx status, or a 2xx whose body carries `success: false`. Callers should never have to
 * remember that, so both become a ViaSocketError here with the API's own message attached —
 * that message is almost always the explanation.
 *
 * The action runner is the exception: some actions answer in that envelope, many hand back their
 * own result at the top level with no `success` or `data` key at all (Gmail's list-mails returns
 * `{ emails, nextPageToken }`). So a body only counts as an envelope when it actually carries a
 * boolean `success`; anything else is the result itself. Getting this wrong returned `undefined`
 * for every such action.
 */

import { ViaSocketError } from './errors.js'
import type { Envelope } from './types.js'

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  url: string
  /** The embed token. Omitted for the action runner, where the script_id is the credential. */
  token?: string
  /** Already serialised. `''` sends an empty body, which is what /embed/enable expects. */
  body?: string
  fetchImpl: typeof fetch
}

export async function request<T = unknown>(options: RequestOptions): Promise<Envelope<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options.token) headers.authorization = options.token

  let response: Response
  try {
    response = await options.fetchImpl(options.url, { method: options.method, headers, body: options.body })
  } catch (error) {
    throw new ViaSocketError(`Request to ${options.url} failed: ${(error as Error)?.message || 'network error'}`, { status: null })
  }

  const text = await response.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }

  const isEnvelope = payload !== null && typeof payload === 'object' && typeof (payload as { success?: unknown }).success === 'boolean'
  const envelope = isEnvelope ? (payload as Envelope<T> & { error?: { message?: string } }) : null
  if (!response.ok || envelope?.success === false) {
    const raw = payload && typeof payload === 'object' ? (payload as { message?: string; error?: { message?: string } }) : null
    const message =
      envelope?.message ||
      envelope?.error?.message ||
      raw?.message ||
      raw?.error?.message ||
      `viaSocket responded ${response.status} for ${options.method} ${options.url}`
    throw new ViaSocketError(message, { status: response.status, body: payload })
  }

  return (envelope ?? { success: true, data: payload as T }) as Envelope<T>
}
