import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { signEmbedToken, ViaSocketError } from '../dist/esm/index.js'

// A real token from the platform's own notes, for org 2163. We don't have its secret, so the
// signature cannot be checked — but the first two segments are pure encoding, and they must
// come out byte-identical or nothing the platform verifies will match.
const KNOWN_HEADER = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
const KNOWN_PAYLOAD =
  'eyJvcmdfaWQiOiIyMTYzIiwicHJvamVjdF9pZCI6InByb2pTR2VrcFA3bSIsInVuaXF1ZV9pZGVudGlmaWVyIjoiPHVuaXF1ZV9pZGVudGlmaWVyX3RvX2lzb2xhdGVfZmxvd3M-In0'

const input = {
  orgId: '2163',
  projectId: 'projSGekpP7m',
  uniqueIdentifier: '<unique_identifier_to_isolate_flows>',
  secret: 'not-the-real-secret'
}

test('encodes header and payload exactly as the platform does', async () => {
  const [header, payload] = (await signEmbedToken(input)).split('.')
  assert.equal(header, KNOWN_HEADER)
  // The `-` inside the known payload is what base64url produces where plain base64 has `+`;
  // getting this wrong is the classic "invalid token" that looks right to the eye.
  assert.equal(payload, KNOWN_PAYLOAD)
})

test('signs with HMAC-SHA256 over header.payload', async () => {
  const token = await signEmbedToken(input)
  const [header, payload, signature] = token.split('.')
  const expected = createHmac('sha256', input.secret).update(`${header}.${payload}`).digest('base64url')
  assert.equal(signature, expected)
})

test('a different user gets a different token; a different secret a different signature', async () => {
  const a = await signEmbedToken(input)
  const b = await signEmbedToken({ ...input, uniqueIdentifier: 'someone-else' })
  const c = await signEmbedToken({ ...input, secret: 'rotated' })
  assert.notEqual(a, b)
  assert.equal(a.split('.')[1], c.split('.')[1], 'same payload')
  assert.notEqual(a.split('.')[2], c.split('.')[2], 'different signature')
})

test('refuses to sign with anything missing', async () => {
  await assert.rejects(() => signEmbedToken({ ...input, secret: '' }), (error) => {
    assert.ok(error instanceof ViaSocketError)
    assert.match(error.message, /secret is required/)
    return true
  })
})
