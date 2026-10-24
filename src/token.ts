/**
 * The embed token: an HS256 JWT of { org_id, project_id, unique_identifier }, signed with the
 * org secret, plus `memory_spaces` when a user is granted shared AI-memory spaces.
 *
 * Implemented on WebCrypto rather than a JWT library so the package has no dependencies and
 * runs unchanged on Node 20+, Bun, Deno and edge runtimes. The payload is exactly the three
 * claims the platform reads, in that order — nothing else is added, because the token's only job is
 * to say which end user a call is for (and, for AI memory, which shared spaces they reach).
 */

import { ViaSocketError } from './errors.js'
import type { MemoryAccess } from './types.js'

const encoder = new TextEncoder()

/** Standard base64url: the URL-safe alphabet, no padding. */
function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function encodeSegment(value: unknown): string {
  return base64Url(encoder.encode(JSON.stringify(value)))
}

export interface SignEmbedTokenInput {
  orgId: string
  projectId: string
  /** Your own id for the end user. Connections and subscriptions are isolated by it. */
  uniqueIdentifier: string
  secret: string
  /** Shared AI-memory spaces this user reaches, as the `memory_spaces` claim. Omit for none. */
  memorySpaces?: Record<string, MemoryAccess>
}

const MEMORY_ACCESS = new Set(['read', 'append', 'write'])

export async function signEmbedToken(input: SignEmbedTokenInput): Promise<string> {
  for (const name of ['orgId', 'projectId', 'uniqueIdentifier', 'secret'] as const) {
    const value = input?.[name]
    if (typeof value !== 'string' || !value) {
      throw new ViaSocketError(`signEmbedToken: ${name} is required`, { status: null })
    }
  }
  const spaces = Object.entries(input.memorySpaces ?? {})
  for (const [space, access] of spaces) {
    if (!MEMORY_ACCESS.has(access)) {
      throw new ViaSocketError(`signEmbedToken: memorySpaces["${space}"] is read, append or write`, { status: null })
    }
  }

  const header = encodeSegment({ alg: 'HS256', typ: 'JWT' })
  const payload = encodeSegment({
    org_id: input.orgId,
    project_id: input.projectId,
    unique_identifier: input.uniqueIdentifier,
    ...(spaces.length && { memory_spaces: input.memorySpaces })
  })
  const signingInput = `${header}.${payload}`

  const key = await crypto.subtle.importKey('raw', encoder.encode(input.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput))

  return `${signingInput}.${base64Url(new Uint8Array(signature))}`
}
