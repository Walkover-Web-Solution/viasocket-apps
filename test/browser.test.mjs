import { test } from 'node:test'
import assert from 'node:assert/strict'

// A minimal browser: one window with message listeners, and a connect script that is already loaded.
const listeners = new Set()
globalThis.window = {
  addEventListener: (type, fn) => type === 'message' && listeners.add(fn),
  removeEventListener: (type, fn) => listeners.delete(fn)
}
globalThis.document = { getElementById: () => null }
const post = (data) => listeners.forEach((fn) => fn({ data }))
const { connect } = await import('../dist/esm/browser.js')

test('passes authId to the connect script, to update that connection', async () => {
  let seen
  window.openViasocketConnection = (token, serviceId, options) => {
    seen = { token, serviceId, options }
    queueMicrotask(() => post({ type: 'viasocket_connection_success', serviceId, data: { id: 'auth_abc_rowbu58rc' } }))
  }
  const result = await connect({ embedToken: 't', serviceId: 'rowbu58rc', authId: 'auth_abc_rowbu58rc' })
  assert.deepEqual(seen.options, { authId: 'auth_abc_rowbu58rc' })
  assert.equal(result.authId, 'auth_abc_rowbu58rc', 'a reconnect resolves with the same authId')
})

test('passes actions, skipActionSelection and authId together', async () => {
  let seen
  window.openViasocketConnection = (token, serviceId, options) => {
    seen = options
    queueMicrotask(() => post({ type: 'viasocket_connection_success', serviceId, data: { id: 'auth_x' } }))
  }
  await connect({ embedToken: 't', serviceId: 'rowbu58rc', actions: ['row1jrbor'], skipActionSelection: true, authId: 'auth_x' })
  assert.deepEqual(seen, { filteredActions: ['row1jrbor'], skipActionSelection: true, authId: 'auth_x' })
})

test('without options, opens a new connection exactly as before', async () => {
  let args
  window.openViasocketConnection = (...a) => {
    args = a
    queueMicrotask(() => post({ type: 'viasocket_connection_success', serviceId: 'rowbu58rc', data: { id: 'auth_new' } }))
  }
  await connect({ embedToken: 't', serviceId: 'rowbu58rc' })
  assert.equal(args.length, 2, 'no third argument when nothing was asked for')
})
