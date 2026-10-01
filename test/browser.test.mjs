import { test } from 'node:test'
import assert from 'node:assert/strict'

/**
 * The browser half runs over the connect script, so the test stands in for the script: a window
 * whose openViasocketConnection records what it was called with, and a way to post back the same
 * message the real script posts when the popup finishes.
 */
function fakeBrowser() {
  const calls = []
  const listeners = new Set()
  globalThis.document = {}
  globalThis.window = {
    openViasocketConnection: (embedToken, serviceId, options) => {
      calls.push({ embedToken, serviceId, options })
    },
    addEventListener: (type, fn) => {
      if (type === 'message') listeners.add(fn)
    },
    removeEventListener: (_type, fn) => listeners.delete(fn)
  }
  const post = (data) => listeners.forEach((fn) => fn({ data }))
  const opened = () => new Promise((resolve) => setImmediate(resolve))
  return { calls, post, opened }
}

const { connect } = await import('../dist/esm/browser.js')

test('connect() hands the named actions to the script, so the popup asks only for their scopes', async () => {
  const { calls, post, opened } = fakeBrowser()
  const pending = connect({ embedToken: 'tok', serviceId: 'slack', actions: ['act1', 'trig1'], skipActionSelection: true })
  await opened()
  assert.deepEqual(calls, [{ embedToken: 'tok', serviceId: 'slack', options: { filteredActions: ['act1', 'trig1'], skipActionSelection: true } }])
  post({ type: 'viasocket_connection_success', serviceId: 'slack', data: { id: 'auth1', service_id: 'slack' } })
  const result = await pending
  assert.equal(result.authId, 'auth1')
  assert.equal(result.serviceId, 'slack')
})

test('connect() without a list offers every action, as before', async () => {
  const { calls, post, opened } = fakeBrowser()
  const pending = connect({ embedToken: 'tok', serviceId: 'gmail' })
  await opened()
  assert.deepEqual(calls[0].options, {})
  post({ type: 'viasocket_connection_closed', serviceId: 'gmail' })
  await assert.rejects(pending, (error) => error.code === 'closed')
})
