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

test('listOptions: a 200 whose data carries { response: { status: 400 } } is an error, not an empty list', async () => {
  const { user } = client([ok({ response: { status: 400, data: { message: 'Auth data not found' } } })])
  await assert.rejects(() => user.listOptions('rowj2u3wc8h5', { fieldKey: 'destination.channel_id', authId: 'authNOPE' }), (error) => {
    assert.ok(error instanceof ViaSocketError)
    assert.equal(error.status, 400)
    assert.equal(error.message, 'Auth data not found')
    return true
  })
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

test('runAction returns a bare body that carries its own success key — it is the result, not an envelope', async () => {
  const raw = { success: true, channels: [{ id: 'C01MXRG0W3W', name: 'general' }] }
  const { viasocket } = client([{ status: 200, body: raw }])
  const result = await viasocket.runAction('scriyxv14Ac2', 'rowl5126q33g', { search_by: 'name', search_query: 'general' })
  assert.deepEqual(result, raw)
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

  await assert.rejects(() => user.subscribe('t', { authId: 'a', inputData: {} }), /exactly one of `code`/)
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

// ---------------------------------------------------------------- the catalog: public, no token, normalised shapes

test('catalog.search GETs the search function with the key encoded and no authorization header', async () => {
  const { viasocket, calls } = client([{ status: 200, body: { success: true, data: [{ service_id: 'rowbu58rc', name: 'Slack', iconurl: 'i', description: 'd' }] } }])
  const apps = await viasocket.catalog.search('sla ck')
  assert.equal(calls[0].url, 'https://flow.sokt.io/func/scri12BSufQM?key=sla%20ck')
  assert.equal(calls[0].headers.authorization, undefined)
  assert.deepEqual(apps, [{ serviceId: 'rowbu58rc', name: 'Slack', description: 'd', iconUrl: 'i' }])
})

test('catalog.list pages the full table, caps the limit at 200, and maps rowid to serviceId', async () => {
  const row = { rowid: 'rowxzmscatfe', name: 'Microsoft Teams', description: 'd', iconurl: 'i', category: ['Communication'], domain: 'teams.live.com', brandcolor: '#0078D4' }
  const { viasocket, calls } = client([{ status: 200, body: { message: 'successfully get plugins data', data: [row] } }])
  const apps = await viasocket.catalog.list({ limit: 500, offset: 400, category: 'CRM' })
  assert.equal(calls[0].url, 'https://plug-service.viasocket.com/api/v1/plugins/all?limit=200&offset=400&category=CRM')
  assert.deepEqual(apps, [{ serviceId: 'rowxzmscatfe', name: 'Microsoft Teams', description: 'd', iconUrl: 'i', category: ['Communication'], domain: 'teams.live.com' }])
})

test('catalog.versions POSTs the service_id and returns the service with its actions and triggers', async () => {
  const body = {
    service: { service_id: 'rowbu58rc', name: 'Slack', description: 'd', icon_url: 'i', auth_type: 'Auth2.0', requires_auth: true },
    actions: [{ action_id: 'row1jrbor', action_version_id: 'rowj2u3wc8h5', name: 'Send Message', description: '', input_schema: {} }],
    triggers: [{ trigger_id: 'rowypjs0enry', trigger_version_id: 'row9na0usfnq', name: 'New Mention', description: '', input_schema: {}, polled: true }]
  }
  const { viasocket, calls } = client([{ status: 200, body }])
  const catalog = await viasocket.catalog.versions('rowbu58rc')
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].url, 'https://flow.sokt.io/func/scriK4LFg2kc')
  assert.deepEqual(JSON.parse(calls[0].body), { service_id: 'rowbu58rc' })
  assert.equal(catalog.service.name, 'Slack')
  assert.deepEqual(catalog.actions.map((a) => [a.action_id, a.action_version_id]), [['row1jrbor', 'rowj2u3wc8h5']])
  assert.deepEqual(catalog.triggers.map((t) => [t.trigger_id, t.trigger_version_id]), [['rowypjs0enry', 'row9na0usfnq']])
})

test('catalog.versions is empty, not an error, for an app with nothing published', async () => {
  const service = { service_id: 'rowzwz91vwaw', name: 'Quiet App', description: null, icon_url: null, auth_type: null, requires_auth: false }
  const { viasocket } = client([{ status: 200, body: { service, actions: [], triggers: [] } }])
  assert.deepEqual(await viasocket.catalog.versions('rowzwz91vwaw'), { service, actions: [], triggers: [] })
})

test('catalog.versions is null for an unknown service id, which the API answers with an empty service', async () => {
  const service = { service_id: 'rowdoesnotexist', name: null, description: null, icon_url: null, auth_type: null, requires_auth: false }
  const { viasocket } = client([{ status: 200, body: { service, actions: [], triggers: [] } }])
  assert.equal(await viasocket.catalog.versions('rowdoesnotexist'), null)
})
