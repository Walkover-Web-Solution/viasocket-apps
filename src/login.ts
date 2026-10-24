/**
 * Login, users and organisations, from 36Blocks: the calls the product's server makes with a signed-in
 * user's `proxy_auth_token`. 36Blocks keeps the accounts; the login screens are its script in the browser
 * (https://flow.viasocket.com/documentation/skill/login-and-orgs.md).
 *
 * Separate from the viaSocket calls because the host, header and envelope differ: the token goes in a
 * `proxy_auth_token` header, and a refusal is `{ data: { message }, status: "error", hasError: true,
 * errors: { message } }` (401 for a bad or ended session).
 */

import { ViaSocketError } from './errors.js'
import type { LoginUser } from './types.js'

const LOGIN_API = 'https://routes.msg91.com/api'

interface LoginEnvelope {
  data?: unknown
  status?: string
  hasError?: boolean
  errors?: unknown
}

const messageOf = (value: unknown): string | null => {
  if (typeof value === 'string' && value) return value
  if (Array.isArray(value)) return value.map(messageOf).filter(Boolean).join('; ') || null
  if (value && typeof value === 'object' && typeof (value as { message?: unknown }).message === 'string') {
    return (value as { message: string }).message
  }
  return null
}

export async function loginRequest(
  fetchImpl: typeof fetch,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  token: string,
  body?: unknown
): Promise<unknown> {
  if (typeof token !== 'string' || !token.trim()) throw new ViaSocketError('login: the proxy_auth_token is required', { status: null })
  const url = `${LOGIN_API}${path}`
  let response: Response
  try {
    response = await fetchImpl(url, {
      method,
      headers: { 'Content-Type': 'application/json', proxy_auth_token: token },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  } catch (error) {
    throw new ViaSocketError(`Request to ${url} failed: ${(error as Error)?.message || 'network error'}`, { status: null })
  }
  const text = await response.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }
  const envelope = payload && typeof payload === 'object' ? (payload as LoginEnvelope) : null
  if (!response.ok || envelope?.hasError === true || envelope?.status === 'error') {
    const message = messageOf(envelope?.errors) || messageOf(envelope?.data) || `36Blocks responded ${response.status} for ${method} ${path}`
    throw new ViaSocketError(message, { status: response.status, body: payload })
  }
  return envelope && 'data' in envelope ? envelope.data : payload
}

type RawUser = {
  id: number
  name?: string
  email?: string
  c_companies?: Array<{ id: number; name?: string; role_id?: number; role_name?: string }>
  currentCompany?: { id: number; role?: { id: number; name: string; is_default?: boolean }; permissions?: string[] } | null
}

export function toLoginUser(data: unknown): LoginUser {
  const raw = (Array.isArray(data) ? data[0] : data) as RawUser | undefined
  if (!raw || typeof raw !== 'object' || raw.id === undefined) {
    throw new ViaSocketError('login.details: 36Blocks returned no user', { status: 200, body: data })
  }
  const current = raw.currentCompany
  return {
    id: raw.id,
    name: raw.name ?? '',
    email: raw.email ?? '',
    companies: (raw.c_companies ?? []).map((company) => ({
      id: company.id,
      name: company.name ?? '',
      roleId: company.role_id ?? null,
      roleName: company.role_name ?? null
    })),
    currentCompany: current
      ? {
          id: current.id,
          role: current.role ? { id: current.role.id, name: current.role.name, isDefault: Boolean(current.role.is_default) } : null,
          permissions: current.permissions ?? []
        }
      : null
  }
}

/** The JWT `/c/switchCompany` answers with, wherever in its reply it sits; null when there is none. */
export function jwtOf(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const found = (data as { jwt?: unknown }).jwt
  if (typeof found === 'string' && found) return found
  for (const value of Array.isArray(data) ? data : Object.values(data)) {
    const nested = jwtOf(value)
    if (nested) return nested
  }
  return null
}
