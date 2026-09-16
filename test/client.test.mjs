import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ViaSocket, ViaSocketError } from '../dist/esm/index.js'

/**
 * A fetch that records what it was asked and answers from a script. Each test hands it the
 * responses it expects, in order, so the assertions are about what the client sent — the URL,
 * the method, the headers, the body — which is the whole contract.
 */
function fakeFetch(responses) {
  const calls = []
  const queue = [...responses]
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body })
    const next = queue.shift() ?? { status: 200, body: { success: true, data: {} } }
    return new Response(typeof next.body === 'string' ? next.body : JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  return { fetchImpl, calls }
}

const ok = (data) => ({ status: 200, body: { success: true, message: 'ok', data, isCached: false } })

function client(responses, overrides = {}) {
  const { fetchImpl, calls } = fakeFetch(responses)
  const viasocket = new ViaSocket({ orgId: '4160', projectId: 'proj9U0smb62', secret: 's3cret', fetch: fetchImpl, ...overrides })
  return { viasocket, user: viasocket.user('user_123'), calls }
}

test('refuses to construct without the three things it cannot work without', () => {
  assert.throws(() => new ViaSocket({ orgId: '', projectId: 'p', secret: 's' }), /orgId is required/)
  assert.throws(() => new ViaSocket({ orgId: 'o', projectId: 'p', secret: '' }), /secret is required/)
})

test('enable: POST to the right path, token in the header, empty JSON body — exactly the working curl', async () => {
  const { user, calls } = client([ok({ script_id: 'scriRx0PKDEG', webhook_url: 'https://flow.sokt.io/func/scriRx0PKDEG', service_id: 'rowqm5xi2', auth_id: 'auth2c38gFVg_rowqm5xi2' })])
  const result = await user.enable('rowqm5xi2', 'auth2c38gFVg_rowqm5xi2')

  const [call] = calls
  assert.equal(call.url, 'https://flow-api.viasocket.com/embed/enable/rowqm5xi2/auth2c38gFVg_rowqm5xi2')
  assert.equal(call.method, 'POST')
  assert.equal(call.headers['Content-Type'], 'application/json')
  assert.match(call.headers.authorization, /^eyJ/, 'a signed JWT goes in the authorization header')
  assert.equal(call.body, '')
  assert.deepEqual(result, {
    scriptId: 'scriRx0PKDEG',
    webhookUrl: 'https://flow.sokt.io/func/scriRx0PKDEG',
    serviceId: 'rowqm5xi2',
    authId: 'auth2c38gFVg_rowqm5xi2'
  })
})

test('the token is signed once per user scope and reused', async () => {
  const { user, calls } = client([ok({ flows: [] }), ok({ flows: [] })])
  await user.listFlows()
  await user.listFlows()
  assert.equal(calls[0].headers.authorization, calls[1].headers.authorization)
})

test('listOptions normalises the plain shape', async () => {
  const { user, calls } = client([ok([{ label: 'Sheet1', value: '0' }])])
  const result = await user.listOptions('row5dxvkb0mr', {
    fieldKey: 'grid_Id',
    authId: 'auth2c38gFVg_rowqm5xi2',
    existingFields: { spreadsheet_Id: '1uk1FuJzU41xPQptrNlhxQn-KyyWc4B_NXjxB8vGPqxI' }
  })
  assert.deepEqual(result, { options: [{ label: 'Sheet1', value: '0' }], offset: null })
  assert.deepEqual(JSON.parse(calls[0].body), {
    fieldKey: 'grid_Id',
    auth_id: 'auth2c38gFVg_rowqm5xi2',
    existingFields: { spreadsheet_Id: '1uk1FuJzU41xPQptrNlhxQn-KyyWc4B_NXjxB8vGPqxI' }
  })
})

test('listOptions normalises the paginated shape', async () => {
  const { user } = client([ok({ data: [{ label: 'demo', value: '1uk1' }], offset: 'page-2' })])
  const result = await user.listOptions('row5dxvkb0mr', { fieldKey: 'spreadsheet_Id', authId: 'a' })
  assert.deepEqual(result, { options: [{ label: 'demo', value: '1uk1' }], offset: 'page-2' })
})

test('runAction posts to the run host with no authorization header — the script_id is the credential', async () => {
  const { viasocket, calls } = client([{ status: 200, body: { success: true, data: { name: 'Chirag', _rowNumber: 16 } } }])
  const result = await viasocket.runAction('scriRx0PKDEG', 'row5dxvkb0mr', { spreadsheet_Id: '1uk1', grid_Id: '0' })

  const [call] = calls
  assert.equal(call.url, 'https://flow.sokt.io/func/scriRx0PKDEG')
  assert.equal(call.method, 'POST')
  assert.equal(call.headers.authorization, undefined)
  assert.deepEqual(JSON.parse(call.body), { action_version_id: 'row5dxvkb0mr', inputData: { spreadsheet_Id: '1uk1', grid_Id: '0' } })
  assert.deepEqual(result, { name: 'Chirag', _rowNumber: 16 })
})

test('subscribe sends webhook, maps hookUrl out of inputData, and insists on webhook xor code', async () => {
  const { user, calls } = client([
    ok({
      script_id: 'scrijuDbsudA',
      title: 'rowempdbsh48',
      auth_id: 'auth2c38gFVg_rowqm5xi2',
      inputData: { hookUrl: 'https://flow.sokt.io/func/scrijuDbsudA', sheet_id: '0' },
      meta: { whatever: 455454 }
    })
  ])
  const result = await user.subscribe('rowempdbsh48', {
    authId: 'auth2c38gFVg_rowqm5xi2',
    inputData: { sheet_id: '0' },
    webhook: 'https://your-app.com/hook',
    meta: { whatever: 455454 }
  })
  assert.equal(calls[0].url, 'https://flow-api.viasocket.com/embed/subscribe-event/rowempdbsh48')
  const body = JSON.parse(calls[0].body)
  assert.equal(body.webhook, 'https://your-app.com/hook')
  assert.equal(body.code, undefined)
  assert.equal(result.scriptId, 'scrijuDbsudA')
  assert.equal(result.hookUrl, 'https://flow.sokt.io/func/scrijuDbsudA')

  await assert.rejects(() => user.subscribe('t', { authId: 'a', inputData: {} }), /exactly one of `webhook` or `code`/)
  await assert.rejects(() => user.subscribe('t', { authId: 'a', inputData: {}, webhook: 'w', code: 'c' }), /exactly one/)
})

test('findEnabled matches on service_id and active status, and reads the project route', async () => {
  const flows = {
    flows: [
      { id: 'scriOLD', title: 'rowqm5xi2', status: '0', webhook: '', auth_id: 'a', service_id: 'rowqm5xi2' },
      { id: 'scriRx0PKDEG', title: 'rowqm5xi2', status: 'active', webhook: 'https://flow.sokt.io/func/scriRx0PKDEG', auth_id: 'a', service_id: 'rowqm5xi2' },
      { id: 'scriSLACK', title: 'rowbu58rc', status: 'active', webhook: '', auth_id: 'b', service_id: 'rowbu58rc' }
    ]
  }
  const { user, calls } = client([ok(flows), ok(flows)])
  assert.equal(await user.findEnabled('rowqm5xi2'), 'scriRx0PKDEG')
  assert.equal(await user.findEnabled('rowNOPE'), null)
  assert.equal(calls[0].url, 'https://flow-api.viasocket.com/projects/proj9U0smb62/integrations')
  assert.equal(calls[0].method, 'GET')
})

test('disableFlow PUTs status=0 and trims the flow record down to what matters', async () => {
  const { user, calls } = client([ok({ id: 'scriCXNY1Ogu', status: '0', script: 'function _response_calling() {…}', json_script: { huge: true } })])
  const result = await user.disableFlow('scriCXNY1Ogu')
  assert.equal(calls[0].url, 'https://flow-api.viasocket.com/embed/updatestatus/scriCXNY1Ogu?status=0')
  assert.equal(calls[0].method, 'PUT')
  assert.deepEqual(result, { id: 'scriCXNY1Ogu', status: '0' })
})

test('revokeConnection DELETEs and resolves on the empty-array response', async () => {
  const { user, calls } = client([ok([])])
  await user.revokeConnection('auth2c38gFVg_rowqm5xi2')
  assert.equal(calls[0].url, 'https://flow-api.viasocket.com/embed/authentications/revoke/auth2c38gFVg_rowqm5xi2')
  assert.equal(calls[0].method, 'DELETE')
})

test('a 2xx with success:false is still an error, carrying the API message', async () => {
  const { user } = client([{ status: 200, body: { success: false, message: 'existingFields missing spreadsheet_Id' } }])
  await assert.rejects(() => user.listOptions('v', { fieldKey: 'grid_Id', authId: 'a' }), (error) => {
    assert.ok(error instanceof ViaSocketError)
    assert.equal(error.message, 'existingFields missing spreadsheet_Id')
    assert.equal(error.status, 200)
    return true
  })
})

test('a 401 surfaces as a ViaSocketError with the status', async () => {
  const { user } = client([{ status: 401, body: { success: false, message: 'invalid token' } }])
  await assert.rejects(() => user.listFlows(), (error) => {
    assert.ok(error instanceof ViaSocketError)
    assert.equal(error.status, 401)
    assert.equal(error.message, 'invalid token')
    return true
  })
})

test('base URLs can be pointed at another environment', async () => {
  const { user, calls } = client([ok({ flows: [] })], { apiBaseUrl: 'https://dev-api.viasocket.com/', runBaseUrl: 'https://dev.sokt.io' })
  await user.listFlows()
  assert.equal(calls[0].url, 'https://dev-api.viasocket.com/projects/proj9U0smb62/integrations')
})

test('runAction returns an unwrapped result as-is — many actions answer with no envelope at all', async () => {
  // Gmail's list-mails, verbatim shape: no `success`, no `data`, the result is the whole body.
  const raw = { emails: [{ id: '1a0aa52fba263adc', subject: 'Re: Security alert' }], nextPageToken: '15851404148698197925' }
  const { viasocket } = client([{ status: 200, body: raw }])
  const result = await viasocket.runAction('scriR6F2TzG2', 'rowgko0n0edh', { max: 3 })
  assert.deepEqual(result, raw)
})

test('runAction still unwraps and still fails on a real envelope', async () => {
  const { viasocket } = client([
    { status: 200, body: { success: true, data: { ok: 1 } } },
    { status: 200, body: { success: false, message: 'action failed: bad label' } }
  ])
  assert.deepEqual(await viasocket.runAction('scri1', 'row1', {}), { ok: 1 })
  await assert.rejects(viasocket.runAction('scri1', 'row1', {}), (error) => error instanceof ViaSocketError && /bad label/.test(error.message))
})

test('a non-2xx with an un-enveloped body still surfaces its message', async () => {
  const { viasocket } = client([{ status: 500, body: { message: 'script crashed' } }])
  await assert.rejects(viasocket.runAction('scri1', 'row1', {}), (error) => error.status === 500 && /script crashed/.test(error.message))
})
