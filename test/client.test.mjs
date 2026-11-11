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
  assert.deepEqual(result, { options: [{ label: 'Sheet1', value: '0' }], paginate: null, hasMore: false, offset: null })
  assert.deepEqual(JSON.parse(calls[0].body), {
    fieldKey: 'grid_Id',
    auth_id: 'auth2c38gFVg_rowqm5xi2',
    existingFields: { spreadsheet_Id: '1uk1FuJzU41xPQptrNlhxQn-KyyWc4B_NXjxB8vGPqxI' }
  })
})

test('listOptions normalises the paginated shape', async () => {
  const { user } = client([ok({ data: [{ label: 'demo', value: '1uk1' }], offset: 'page-2' })])
  const result = await user.listOptions('row5dxvkb0mr', { fieldKey: 'spreadsheet_Id', authId: 'a' })
  assert.deepEqual(result, { options: [{ label: 'demo', value: '1uk1' }], paginate: 'page-2', hasMore: true, offset: 'page-2' })
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

test('findEnabled also finds a paused app, which is resumed rather than enabled twice', async () => {
  const flows = { flows: [{ id: 'scriPAUSED', title: 't', status: 'paused', webhook: '', auth_id: 'a', service_id: 'rowqm5xi2' }] }
  const { user } = client([ok(flows)])
  assert.equal(await user.findEnabled('rowqm5xi2'), 'scriPAUSED')
})

test('disableFlow pauses (status=2) — 0 deletes — and trims the flow record down to what matters', async () => {
  const { user, calls } = client([ok({ id: 'scriCXNY1Ogu', status: '2', script: 'function _response_calling() {…}', json_script: { huge: true } })])
  const result = await user.disableFlow('scriCXNY1Ogu')
  assert.equal(calls[0].url, 'https://flow-api.viasocket.com/embed/updatestatus/scriCXNY1Ogu?status=2')
  assert.equal(calls[0].method, 'PUT')
  assert.deepEqual(result, { id: 'scriCXNY1Ogu', status: '2' })
})

test('deleteFlow sends status=0 and enableFlow status=1', async () => {
  const { user, calls } = client([ok({ id: 's', status: '0' }), ok({ id: 's', status: '1' })])
  await user.deleteFlow('s')
  await user.enableFlow('s')
  assert.match(calls[0].url, /\?status=0$/)
  assert.match(calls[1].url, /\?status=1$/)
})

test('renameFlow PUTs title, description and meta to the flow route and returns only what a caller uses', async () => {
  const { user, calls } = client([ok({ id: 'scriX', title: 'Daily digest', description: 'd', script: 'function…' })])
  const result = await user.renameFlow('scriX', { title: 'Daily digest', description: 'd', meta: { plan: 'pro' } })
  assert.equal(calls[0].url, 'https://flow-api.viasocket.com/projects/updateflowembed/scriX')
  assert.equal(calls[0].method, 'PUT')
  assert.deepEqual(JSON.parse(calls[0].body), { title: 'Daily digest', description: 'd', meta: { plan: 'pro' } })
  assert.deepEqual(result, { id: 'scriX', title: 'Daily digest', description: 'd' })
  await assert.rejects(user.renameFlow('scriX', { title: '' }), /title is required/)
})

const slackCatalog = {
  service: { service_id: 'rowbu58rc', name: 'Slack', description: null, icon_url: null, auth_type: 'Auth2.0', requires_auth: true },
  actions: [
    { action_id: 'row1jrbor', action_version_id: 'rowj2u3wc8h5', key: 'Send_Message', versionid: 'V107', name: 'Send Message', description: '', input_schema: {} },
    { action_id: 'rowA', action_version_id: 'rowAv', versionid: 'V1', name: 'Twin', description: '', input_schema: {} },
    { action_id: 'rowB', action_version_id: 'rowBv', versionid: 'V1', name: 'Twin', description: '', input_schema: {} }
  ],
  triggers: [{ trigger_id: 'rowT', trigger_version_id: 'rowTv', versionid: 'V9', name: 'New Mention', description: '', input_schema: {} }]
}

test('catalog.serviceIdFor resolves a slug once, caches it, and refuses an unknown or mis-cased one', async () => {
  const { viasocket, calls } = client([
    { status: 200, body: { service: { service_id: 'rowbu58rc', slug: 'slack', name: 'Slack' } } },
    { status: 404, body: { error: "No app has the slug or id 'Slack'. Slugs are case-sensitive." } }
  ])
  assert.equal(await viasocket.catalog.serviceIdFor('slack'), 'rowbu58rc')
  assert.equal(await viasocket.catalog.serviceIdFor('slack'), 'rowbu58rc')
  assert.equal(calls.length, 1, 'the second lookup is cached')
  assert.equal(calls[0].url, 'https://plug-service.viasocket.com/api/v1/plugins/slack')
  assert.equal(calls[0].headers.authorization, undefined)
  await assert.rejects(viasocket.catalog.serviceIdFor('Slack'), /No viaSocket app has the slug "Slack"/)
})

test('catalog.versionIdFor finds an event by id or path, refuses an ambiguous one, and warns on a newer version', async () => {
  const { viasocket, calls } = client([{ status: 200, body: slackCatalog }])
  assert.equal(await viasocket.catalog.versionIdFor('rowbu58rc', 'row1jrbor', 'V107'), 'rowj2u3wc8h5')
  assert.equal(await viasocket.catalog.versionIdFor('rowbu58rc', 'send-message'), 'rowj2u3wc8h5')
  assert.equal(await viasocket.catalog.versionIdFor('rowbu58rc', 'Send_Message'), 'rowj2u3wc8h5', 'the key the readable routes take')
  assert.equal(await viasocket.catalog.versionIdFor('rowbu58rc', 'rowT'), 'rowTv', 'a trigger gives its trigger_version_id')
  assert.equal(calls.length, 1, 'one catalog read serves every lookup')
  await assert.rejects(viasocket.catalog.versionIdFor('rowbu58rc', 'twin'), /several events "twin"/)
  await assert.rejects(viasocket.catalog.versionIdFor('rowbu58rc', 'nope'), /no published event "nope"/)

  const warnings = []
  const warn = console.warn
  console.warn = (message) => warnings.push(message)
  try {
    assert.equal(await viasocket.catalog.versionIdFor('rowbu58rc', 'row1jrbor', 'V106'), 'rowj2u3wc8h5')
  } finally {
    console.warn = warn
  }
  assert.match(warnings[0], /published as V107, not V106/)
})

test('catalog.versionIdFor does not keep an empty answer: the next call reads again', async () => {
  const { viasocket, calls } = client([{ status: 404, body: { error: 'no such app' } }, { status: 200, body: slackCatalog }])
  await assert.rejects(viasocket.catalog.versionIdFor('rowbu58rc', 'row1jrbor'), /no app has the service id/)
  assert.equal(await viasocket.catalog.versionIdFor('rowbu58rc', 'row1jrbor'), 'rowj2u3wc8h5')
  assert.equal(calls.length, 2)
})

test('catalog.list carries the slug', async () => {
  const { viasocket } = client([{ status: 200, body: { data: [{ rowid: 'rowbu58rc', name: 'Slack', appslugname: 'slack' }] } }])
  const [app] = await viasocket.catalog.list()
  assert.equal(app.slug, 'slack')
})

test('catalog.listBuiltIn lists the SDK-tagged plugs that publish actions, with their sign-in', async () => {
  const { viasocket, calls } = client([
    { status: 200, body: { data: [
      { rowid: 'row29ruc9gs1', name: 'viaSocket utilities', appslugname: 'viasocket-utilities' },
      { rowid: 'rowhc2623dta', name: 'Memory', appslugname: 'memory' },
      { rowid: 'rowEMPTY', name: 'Nothing yet', appslugname: 'nothing' }
    ] } },
    { status: 200, body: { service: { name: 'viaSocket utilities', auth_type: 'NoAuth', requires_auth: false }, actions: [{ action_id: 'rowskkqydb6f', name: 'Run AI Model' }], triggers: [] } },
    { status: 200, body: { service: { name: 'Memory', auth_type: 'apikey', requires_auth: true }, actions: [{ action_id: 'rown00e31rlb', name: 'Memory' }], triggers: [] } },
    { status: 200, body: { service: { name: 'Nothing yet', requires_auth: true }, actions: [], triggers: [] } }
  ])
  const apps = await viasocket.catalog.listBuiltIn()
  assert.equal(calls[0].url, 'https://plug-service.viasocket.com/api/v1/plugins/all?limit=100&offset=0&category=SDK')
  assert.deepEqual(apps.map((app) => [app.slug, app.requiresAuth, app.actions.length]), [['memory', true, 1], ['viasocket-utilities', false, 1]])
})

test('sampleEvent posts the trigger_id, auth and inputData to the run host, and drops viasocket_help', async () => {
  const { viasocket, calls } = client([{ status: 200, body: { text: 'hi', channel: 'C1', viasocket_help: 'a note' } }])
  const event = await viasocket.sampleEvent('rowT', 'auth1_rowbu58rc', 'Auth2.0', { channel: 'C1' })
  assert.equal(calls[0].url, 'https://flow.sokt.io/func/scrijZpnr8zJ?action_id=rowT&auth_id=auth1_rowbu58rc&authType=Auth2.0')
  assert.equal(calls[0].headers.authorization, undefined)
  assert.deepEqual(JSON.parse(calls[0].body), { context: { inputData: { channel: 'C1' } } })
  assert.deepEqual(event, { text: 'hi', channel: 'C1' })
})

test('sampleEvent: a connection that cannot be read is an error, not an event', async () => {
  const { viasocket } = client([{ status: 200, body: { response: { status: 400, data: { message: 'Auth data not found' } } } }])
  await assert.rejects(viasocket.sampleEvent('rowT', 'bad', 'Auth2.0'), /Auth data not found/)
})

test('setFlowStatus to the state a flow is already in succeeds', async () => {
  const { user } = client([{ status: 400, body: { success: false, message: 'Status is already set to this value' } }])
  assert.deepEqual(await user.enableFlow('scriX'), { id: 'scriX', status: '1' })
})

test('sampleEvent explains "No response": it was given a version id', async () => {
  const { viasocket } = client([{ status: 200, body: { success: true, message: 'No response' } }])
  await assert.rejects(viasocket.sampleEvent('rowTv', 'a', 'Auth2.0'), /pass the trigger_id, not its version id/)
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
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].url, 'https://plug-service.viasocket.com/api/v1/plugins/rowbu58rc/actions')
  assert.equal(calls[0].headers.authorization, undefined)
  assert.equal(catalog.service.name, 'Slack')
  assert.deepEqual(catalog.actions.map((a) => [a.action_id, a.action_version_id]), [['row1jrbor', 'rowj2u3wc8h5']])
  assert.deepEqual(catalog.triggers.map((t) => [t.trigger_id, t.trigger_version_id]), [['rowypjs0enry', 'row9na0usfnq']])
})

test('catalog.versions is empty, not an error, for an app with nothing published', async () => {
  const service = { service_id: 'rowzwz91vwaw', name: 'Quiet App', description: null, icon_url: null, auth_type: null, requires_auth: false }
  const { viasocket } = client([{ status: 200, body: { service, actions: [], triggers: [] } }])
  assert.deepEqual(await viasocket.catalog.versions('rowzwz91vwaw'), { service, actions: [], triggers: [] })
})

test('catalog.versions is null for an unknown service id, which the catalog answers with a 404', async () => {
  const { viasocket } = client([{ status: 404, body: { error: "No app has the slug or id 'rowdoesnotexist'." } }])
  assert.equal(await viasocket.catalog.versions('rowdoesnotexist'), null)
})

test('ai.send POSTs the message with every field renamed as the API takes it, and maps the reply', async () => {
  const { user, calls } = client([ok({ thread_id: 'support-7f3a9c', message_id: 'm1', content: 'Order #981 shipped today.', finish_reason: 'completed' })])
  const reply = await user.ai.send({
    threadId: 'support-7f3a9c',
    message: 'Where is my order?',
    prompt: 'You are an order assistant.',
    responseType: 'text',
    model: 'gpt-5.6-luna',
    service: 'openai',
    tools: [
      {
        name: 'lookup_order',
        description: 'Fetches an order',
        url: 'https://api.example.com/orders',
        headers: { Authorization: 'Bearer k' },
        fields: { id: { type: 'string', description: 'Customer id' } },
        requiredParams: ['id']
      }
    ],
    mcpServers: [{ name: 'acme', url: 'https://mcp.viasocket.com/connector/acme', headers: { Authorization: 'Bearer t' } }]
  })
  assert.equal(calls[0].url, 'https://flow-api.viasocket.com/embed/ai/message')
  assert.equal(calls[0].method, 'POST')
  assert.match(calls[0].headers.authorization, /^eyJ/)
  assert.deepEqual(JSON.parse(calls[0].body), {
    message: 'Where is my order?',
    thread_id: 'support-7f3a9c',
    prompt: 'You are an order assistant.',
    response_type: 'text',
    model: 'gpt-5.6-luna',
    service: 'openai',
    extra_tools: [
      {
        name: 'lookup_order',
        description: 'Fetches an order',
        url: 'https://api.example.com/orders',
        method: 'POST',
        headers: { Authorization: 'Bearer k' },
        fields: { id: { type: 'string', description: 'Customer id' } },
        required_params: ['id'],
        tool_and_variable_path: {}
      }
    ],
    mcp_servers: [{ name: 'acme', url: 'https://mcp.viasocket.com/connector/acme', headers: { Authorization: 'Bearer t' } }]
  })
  assert.deepEqual(reply, { threadId: 'support-7f3a9c', messageId: 'm1', content: 'Order #981 shipped today.', finishReason: 'completed' })
})

test('ai.send with delivery rtlayer returns the channel from the 202, and needs a threadId', async () => {
  const { user, calls } = client([
    { status: 202, body: { success: true, message: 'accepted', data: { thread_id: 't1', message_id: 'm2', channel: 'embedai_proj_1_t1' } } }
  ])
  const accepted = await user.ai.send({ threadId: 't1', message: 'hi', delivery: 'rtlayer' })
  assert.deepEqual(accepted, { threadId: 't1', messageId: 'm2', channel: 'embedai_proj_1_t1' })
  assert.equal(JSON.parse(calls[0].body).delivery, 'rtlayer')
  await assert.rejects(() => user.ai.send({ message: 'hi', delivery: 'rtlayer' }), /threadId is required/)
})

test('ai.send refuses what the API would refuse, before any request', async () => {
  const { user, calls } = client([])
  await assert.rejects(() => user.ai.send({ message: 'hi', model: 'gpt-5.6-luna' }), /model and service/)
  await assert.rejects(() => user.ai.send({ message: 'hi', jsonSchema: { name: 'x', schema: {} } }), /json_schema/)
  await assert.rejects(() => user.ai.send({ message: 'hi', threadId: 'has space' }), /threadId/)
  await assert.rejects(() => user.ai.send({ message: '' }), /message is required/)
  const many = Array.from({ length: 11 }, (_, i) => ({ url: `https://cdn.example.com/${i}.png` }))
  await assert.rejects(() => user.ai.send({ message: 'hi', attachments: many }), /at most 10 attachments/)
  await assert.rejects(() => user.ai.send({ message: 'hi', attachments: [{ url: 'http://cdn.example.com/a.png' }] }), /https only/)
  await assert.rejects(() => user.ai.send({ message: 'hi', attachments: [{ url: 'https://cdn.example.com/a.gif', type: 'gif' }] }), /attachment type/)
  await assert.rejects(() => user.ai.send({ message: 'hi', attachments: [{ type: 'image' }] }), /attachment\.url is required/)
  assert.equal(calls.length, 0)
})

test('ai.send passes the attached files as the API takes them, with the type only when given', async () => {
  const { user, calls } = client([ok({ thread_id: 't1', message_id: 'm1', content: 'A dog runs across a beach.', finish_reason: 'completed' })])
  const reply = await user.ai.send({
    threadId: 't1',
    message: 'What happens in this clip?',
    attachments: [{ url: 'https://cdn.example.com/clip.mp4', type: 'video' }, { url: 'https://cdn.example.com/notes.pdf' }]
  })
  assert.deepEqual(JSON.parse(calls[0].body), {
    message: 'What happens in this clip?',
    thread_id: 't1',
    attachments: [{ url: 'https://cdn.example.com/clip.mp4', type: 'video' }, { url: 'https://cdn.example.com/notes.pdf' }]
  })
  assert.equal(reply.content, 'A dog runs across a beach.')
})

test('ai.history keeps the files a user message was sent with', async () => {
  const { user } = client([
    ok({
      thread_id: 't1',
      messages: [
        {
          role: 'user',
          content: 'What happens in this clip?',
          attachments: [{ url: 'https://cdn.example.com/clip.mp4', type: 'video' }],
          message_id: 'm1',
          created_at: '2026-11-04T09:14:01.000Z'
        },
        { role: 'assistant', content: 'A dog runs across a beach.', message_id: 'm1', created_at: '2026-11-04T09:14:01.000Z' }
      ],
      page: 1,
      has_more: false
    })
  ])
  const page = await user.ai.history('t1')
  assert.deepEqual(page.messages[0].attachments, [{ url: 'https://cdn.example.com/clip.mp4', type: 'video' }])
  assert.equal('attachments' in page.messages[1], false)
})

test('ai.threads and ai.history map the lists, keeping a null title', async () => {
  const { user, calls } = client([
    ok({ threads: [{ thread_id: 't1', title: null, updated_at: '2026-10-08T09:14:02.000Z' }] }),
    ok({ thread_id: 't1', messages: [{ role: 'user', content: 'hi', message_id: 'm1', created_at: '2026-10-08T09:14:01.000Z' }], page: 2, has_more: true })
  ])
  assert.deepEqual(await user.ai.threads(), [{ threadId: 't1', title: null, updatedAt: '2026-10-08T09:14:02.000Z' }])
  assert.equal(calls[0].url, 'https://flow-api.viasocket.com/embed/ai/threads')
  const page = await user.ai.history('t1', { page: 2 })
  assert.equal(calls[1].url, 'https://flow-api.viasocket.com/embed/ai/threads/t1/history?page=2')
  assert.equal(calls[1].method, 'GET')
  assert.deepEqual(page, {
    threadId: 't1',
    messages: [{ role: 'user', content: 'hi', messageId: 'm1', createdAt: '2026-10-08T09:14:01.000Z' }],
    page: 2,
    hasMore: true
  })
})

test('ai.rtlayerToken maps the subscribe token', async () => {
  const { user, calls } = client([ok({ token: 'rt', org_id: 'o', service_id: 's', channel_prefix: 'embedai_proj_1_', expires_in: '48h' })])
  assert.deepEqual(await user.ai.rtlayerToken(), { token: 'rt', orgId: 'o', serviceId: 's', channelPrefix: 'embedai_proj_1_', expiresIn: '48h' })
  assert.equal(calls[0].url, 'https://flow-api.viasocket.com/embed/ai/rtlayer-token')
  assert.equal(calls[0].method, 'GET')
})

const memoryTokenReply = (token = 'mem1', expires_in = 3600) =>
  ok({ token, url: 'https://memory-api.viasocket.com/', mcp_url: 'https://memory-api.viasocket.com/mcp', expires_in, me: 'users/u9', spaces: { 'users/u9': 'write' } })

test('memory.token exchanges the embed token and maps the reply', async () => {
  const { user, calls } = client([memoryTokenReply()])
  assert.deepEqual(await user.memory.token({ expiresIn: 900 }), {
    token: 'mem1', url: 'https://memory-api.viasocket.com', mcpUrl: 'https://memory-api.viasocket.com/mcp', expiresIn: 3600, me: 'users/u9', spaces: { 'users/u9': 'write' }
  })
  assert.equal(calls[0].url, 'https://flow-api.viasocket.com/embed/ai/memory-token?expires_in=900')
  assert.equal(calls[0].headers.authorization, await user.token())
  await assert.rejects(() => user.memory.token({ expiresIn: 30 }), /60 to 86400/)
})

test('memory.call sends Bearer to the memory service, reuses the token, and returns the bare reply', async () => {
  const { user, calls } = client([memoryTokenReply(), { status: 200, body: { prompt: 'p', results: [] } }, { status: 200, body: { deleted: 1 } }])
  assert.deepEqual(await user.memory.call('POST', '/search', { query: 'crm' }), { prompt: 'p', results: [] })
  assert.deepEqual(await user.memory.call('DELETE', '/notes', { space: 'users/u9', path: 'facts/x' }), { deleted: 1 })
  assert.equal(calls.length, 3, 'one token for both calls')
  assert.equal(calls[1].url, 'https://memory-api.viasocket.com/search')
  assert.equal(calls[1].headers.authorization, 'Bearer mem1')
  assert.deepEqual(JSON.parse(calls[1].body), { query: 'crm' })
  assert.equal(calls[2].method, 'DELETE')
})

test('memory.call takes a new token once when the service refuses one, and surfaces its message', async () => {
  const refused = { status: 401, body: { status: 'error', success: false, message: 'The memory token has expired', data: null } }
  const { user, calls } = client([memoryTokenReply('old'), refused, memoryTokenReply('new'), { status: 200, body: { notes: [] } }])
  assert.deepEqual(await user.memory.call('GET', '/index?space=users/u9'), { notes: [] })
  assert.equal(calls[3].headers.authorization, 'Bearer new')

  const again = client([memoryTokenReply('a'), refused, memoryTokenReply('b'), refused])
  await assert.rejects(() => again.user.memory.call('GET', '/index'), (error) => {
    assert.ok(error instanceof ViaSocketError)
    assert.equal(error.status, 401)
    assert.match(error.message, /has expired/)
    return true
  })
  await assert.rejects(() => user.memory.call('GET', 'index'), /starts with \//)
})

test('memorySpaces are signed into the user token as memory_spaces', async () => {
  const { viasocket } = client([])
  const payload = async (scope) => JSON.parse(Buffer.from((await scope.token()).split('.')[1], 'base64url').toString())
  assert.deepEqual(await payload(viasocket.user('maya', { memorySpaces: { 'teams/acme': 'append' } })), {
    org_id: '4160', project_id: 'proj9U0smb62', unique_identifier: 'maya', memory_spaces: { 'teams/acme': 'append' }
  })
  assert.equal('memory_spaces' in (await payload(viasocket.user('maya'))), false)
  await assert.rejects(() => viasocket.user('maya', { memorySpaces: { 'teams/acme': 'admin' } }).token(), /read, append or write/)
})

test('login.details sends the proxy_auth_token header and maps the user', async () => {
  const raw = {
    data: [{
      id: 99152, name: 'Maya', email: 'maya@acme.com', client_id: 8,
      c_companies: [{ id: 61434, name: 'Acme', role_id: 1, role_name: 'Owner' }],
      currentCompany: { id: 61434, role: { id: 1, name: 'Owner', is_default: true }, permissions: ['update_c_company'] }
    }],
    status: 'success', hasError: false, errors: []
  }
  const { viasocket, calls } = client([{ status: 200, body: raw }])
  assert.deepEqual(await viasocket.login.details('pat-1'), {
    id: 99152, name: 'Maya', email: 'maya@acme.com',
    companies: [{ id: 61434, name: 'Acme', roleId: 1, roleName: 'Owner' }],
    currentCompany: { id: 61434, role: { id: 1, name: 'Owner', isDefault: true }, permissions: ['update_c_company'] }
  })
  assert.equal(calls[0].url, 'https://routes.msg91.com/api/c/getDetails')
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].headers.proxy_auth_token, 'pat-1')
})

test('login refusals surface 36Blocks\' own message and status', async () => {
  const refused = { status: 401, body: { data: { message: 'Unauthorized' }, status: 'error', hasError: true, errors: { message: 'Unauthorized' } } }
  const { viasocket } = client([refused])
  await assert.rejects(() => viasocket.login.details('expired'), (error) => {
    assert.ok(error instanceof ViaSocketError)
    assert.equal(error.status, 401)
    assert.equal(error.message, 'Unauthorized')
    return true
  })
  await assert.rejects(() => viasocket.login.details(''), /proxy_auth_token is required/)
})

test('login.switchCompany posts company_ref_id and finds the jwt; logout sends DELETE', async () => {
  const { viasocket, calls } = client([
    { status: 200, body: { data: { jwt: 'jwt-61434' }, status: 'success', hasError: false } },
    { status: 200, body: { data: { message: 'logged out' }, status: 'success', hasError: false } }
  ])
  const switched = await viasocket.login.switchCompany('pat-1', 61434)
  assert.equal(switched.jwt, 'jwt-61434')
  assert.deepEqual(JSON.parse(calls[0].body), { company_ref_id: 61434 })
  await viasocket.login.logout('pat-1')
  assert.equal(calls[1].method, 'DELETE')
  assert.equal(calls[1].url, 'https://routes.msg91.com/api/c/logout')
  await assert.rejects(() => viasocket.login.switchCompany('pat-1', ''), /companyId is required/)
})

// ---------------------------------------------------------------- the readable routes: apps by slug, actions by key

const gmailListing = {
  service: 'gmail',
  service_id: 'rowo0bqrhj5g',
  actions: [
    {
      key: 'Send_Email', name: 'Send Email', type: 'action', description: 'Sends an email.', action_id: 'rowogelpy0h6', version: 'V55', action_version_id: 'rowwj0sfmhub',
      versions: [{ version: 'V55', action_version_id: 'rowwj0sfmhub', status: 'published' }, { version: 'V54', action_version_id: 'rowg2h7k0abc', status: 'published' }]
    },
    { key: 'New_Email_Arrives', name: 'New Email Arrives', type: 'trigger', description: '', action_id: 'rowqz5a1b2c3', version: 'V11', action_version_id: 'rowd4e5f6g7h', versions: [] }
  ]
}

test('listActions reads the app by its slug with the token, maps the listing, filters by type and caches it', async () => {
  const { user, calls } = client([ok(gmailListing)])
  const all = await user.listActions('gmail')
  assert.equal(calls[0].url, 'https://flow-api.viasocket.com/embed/services/gmail/actions')
  assert.equal(calls[0].method, 'GET')
  assert.match(calls[0].headers.authorization, /^eyJ/)
  assert.equal(all.app, 'gmail')
  assert.equal(all.serviceId, 'rowo0bqrhj5g')
  assert.deepEqual(all.actions[0], {
    key: 'Send_Email', name: 'Send Email', type: 'action', description: 'Sends an email.', actionId: 'rowogelpy0h6', version: 'V55', actionVersionId: 'rowwj0sfmhub',
    versions: [{ version: 'V55', actionVersionId: 'rowwj0sfmhub', status: 'published' }, { version: 'V54', actionVersionId: 'rowg2h7k0abc', status: 'published' }],
    pauses: null
  })
  const triggers = await user.listActions('gmail', { type: 'trigger' })
  assert.deepEqual(triggers.actions.map((action) => action.key), ['New_Email_Arrives'])
  assert.equal(await user.serviceIdFor('gmail'), 'rowo0bqrhj5g')
  assert.equal(calls.length, 1, 'one read serves the filtered list and the service id')
})

test('listActions: an unknown slug is a 404 with the message, and is not kept', async () => {
  const { user, calls } = client([{ status: 404, body: { success: false, message: "Unknown service 'gmial'." } }, ok(gmailListing)])
  await assert.rejects(() => user.listActions('gmial'), (error) => error instanceof ViaSocketError && error.status === 404 && /Unknown service/.test(error.message))
  await user.listActions('gmial')
  assert.equal(calls.length, 2)
})

test('enable by slug posts to the services route and keeps the slug; by service id it keeps the old route', async () => {
  const reply = { script_id: 'scriXk3PqLm9', webhook_url: 'https://flow.sokt.io/func/scriXk3PqLm9', service: 'gmail', service_id: 'rowo0bqrhj5g', auth_id: 'auth8f3a9c2d' }
  const { user, calls } = client([{ status: 201, body: { success: true, data: reply } }, ok({ script_id: 's', webhook_url: 'w', service_id: 'rowo0bqrhj5g', auth_id: 'a' })])
  assert.deepEqual(await user.enable('gmail', 'auth8f3a9c2d'), {
    scriptId: 'scriXk3PqLm9', webhookUrl: 'https://flow.sokt.io/func/scriXk3PqLm9', serviceId: 'rowo0bqrhj5g', authId: 'auth8f3a9c2d', app: 'gmail'
  })
  assert.equal(calls[0].url, 'https://flow-api.viasocket.com/embed/services/gmail/enable/auth8f3a9c2d')
  assert.equal(calls[0].body, '')
  await user.enable('rowo0bqrhj5g', 'a')
  assert.equal(calls[1].url, 'https://flow-api.viasocket.com/embed/enable/rowo0bqrhj5g/a')
})

test('findEnabled takes the slug: the service id comes from the listing', async () => {
  const flows = { flows: [{ id: 'scriGMAIL', title: 'rowo0bqrhj5g', status: 'active', webhook: '', auth_id: 'a', service_id: 'rowo0bqrhj5g' }] }
  const { user, calls } = client([ok(gmailListing), ok(flows)])
  assert.equal(await user.findEnabled('gmail'), 'scriGMAIL')
  assert.equal(calls[0].url, 'https://flow-api.viasocket.com/embed/services/gmail/actions')
  assert.equal(calls[1].url, 'https://flow-api.viasocket.com/projects/proj9U0smb62/integrations')
})

test('runAction names the action by key, pins a version, still takes a version id, and runCode sends custom_code', async () => {
  const { viasocket, calls } = client([
    { status: 200, body: { id: '19a3', threadId: '19a3' } },
    { status: 200, body: { ok: 1 } },
    { status: 200, body: { ok: 2 } },
    { status: 200, body: { ok: 3 } }
  ])
  assert.deepEqual(await viasocket.runAction('scriXk3PqLm9', 'Send_Email', { to: 'a@b.c' }, { version: 'v55' }), { id: '19a3', threadId: '19a3' })
  assert.equal(calls[0].url, 'https://flow.sokt.io/func/scriXk3PqLm9')
  assert.equal(calls[0].headers.authorization, undefined)
  assert.deepEqual(JSON.parse(calls[0].body), { action: 'Send_Email', version: 'v55', inputData: { to: 'a@b.c' } })
  await viasocket.runAction('scriXk3PqLm9', 'rowwj0sfmhub', { to: 'a@b.c' }, { version: 'v55' })
  assert.deepEqual(JSON.parse(calls[1].body), { action_version_id: 'rowwj0sfmhub', inputData: { to: 'a@b.c' } }, 'a version id names the version itself')
  await viasocket.runCode('scriXk3PqLm9', 'return 1', {}, { action: 'Send_Email' })
  assert.deepEqual(JSON.parse(calls[2].body), { custom_code: 'return 1', inputData: {}, action: 'Send_Email' })
  await viasocket.runAction('scriXk3PqLm9', 'Send_Email', {}, { customCode: 'return 2' })
  assert.deepEqual(JSON.parse(calls[3].body), { action: 'Send_Email', custom_code: 'return 2', inputData: {} })
})

test('a failed run carries the app own message, with the status the app answered inside the body', async () => {
  const refused = { success: false, errorMsg: { status: 404, message: 'Requested entity was not found.', data: { error: { code: 404 } } } }
  const { viasocket } = client([{ status: 400, body: refused }])
  await assert.rejects(() => viasocket.runAction('scri1', 'Send_Email', {}), (error) => {
    assert.ok(error instanceof ViaSocketError)
    assert.equal(error.status, 400)
    assert.equal(error.message, 'Requested entity was not found.')
    assert.equal(error.body.errorMsg.status, 404)
    return true
  })
})

test('listOptions by app and key posts search and paginate to the options route and maps the page', async () => {
  const { user, calls } = client([
    ok({ options: [{ label: 'Invoices', value: 'Label_12' }], paginate: 'CAESBm5leHQ3', has_more: true }),
    ok({ options: [], paginate: null, has_more: false, message: 'Choose a spreadsheet first.' })
  ])
  const page = await user.listOptions('gmail', 'Modify_Email_Labels', { fieldKey: 'labels', authId: 'auth8f3a9c2d', search: 'inv', version: 'v3' })
  assert.equal(calls[0].url, 'https://flow-api.viasocket.com/embed/services/gmail/actions/Modify_Email_Labels/options')
  assert.deepEqual(JSON.parse(calls[0].body), { auth_id: 'auth8f3a9c2d', fieldKey: 'labels', existingFields: {}, version: 'v3', search: 'inv' })
  assert.deepEqual(page, { options: [{ label: 'Invoices', value: 'Label_12' }], paginate: 'CAESBm5leHQ3', hasMore: true, offset: 'CAESBm5leHQ3' })

  const next = await user.listOptions('google-sheets', 'Add_Row', { fieldKey: 'sheet', authId: 'a', existingFields: { spreadsheet: '1' }, paginate: 'CAESBm5leHQ3' })
  assert.deepEqual(JSON.parse(calls[1].body), { auth_id: 'a', fieldKey: 'sheet', existingFields: { spreadsheet: '1' }, paginate: 'CAESBm5leHQ3' })
  assert.deepEqual(next, { options: [], paginate: null, hasMore: false, message: 'Choose a spreadsheet first.', offset: null })
})

test('listOptions by version id still travels the old route, with the search text inside existingFields', async () => {
  const { user, calls } = client([ok([{ label: 'A', value: 'a' }])])
  await user.listOptions('row5dxvkb0mr', { fieldKey: 'grid_Id', authId: 'a', search: 'ab' })
  assert.equal(calls[0].url, 'https://flow-api.viasocket.com/embed/list-options/row5dxvkb0mr')
  assert.deepEqual(JSON.parse(calls[0].body), { fieldKey: 'grid_Id', auth_id: 'a', existingFields: { _searchText: 'ab' } })
})

test('subscribe by app and trigger key posts to the triggers route with the version', async () => {
  const { user, calls } = client([
    ok({ script_id: 'scriQw8RtY2u', title: 'rowd4e5f6g7h', auth_id: 'auth8f3a9c2d', inputData: { label: 'INBOX', hookUrl: 'https://flow.sokt.io/func/scriQw8RtY2u' }, meta: { customer: 'acme' } })
  ])
  const result = await user.subscribe('gmail', 'New_Email_Arrives', { authId: 'auth8f3a9c2d', inputData: { label: 'INBOX' }, version: 'v11', code: 'return 1', meta: { customer: 'acme' } })
  assert.equal(calls[0].url, 'https://flow-api.viasocket.com/embed/services/gmail/triggers/New_Email_Arrives/subscribe')
  assert.deepEqual(JSON.parse(calls[0].body), { auth_id: 'auth8f3a9c2d', inputData: { label: 'INBOX' }, meta: { customer: 'acme' }, code: 'return 1', version: 'v11' })
  assert.equal(result.scriptId, 'scriQw8RtY2u')
  assert.equal(result.hookUrl, 'https://flow.sokt.io/func/scriQw8RtY2u')
  await assert.rejects(() => user.subscribe('gmail', 'New_Email_Arrives', { authId: 'a', inputData: {} }), /exactly one of `code`/)
})

test('a failed run never shows the script_id, the credential that runs actions, in its error', async () => {
  const { viasocket } = client([{ status: 502, body: '' }])
  await assert.rejects(() => viasocket.runAction('scriSECRET123', 'row5dxvkb0mr', {}), (error) => {
    assert.ok(error instanceof ViaSocketError)
    assert.doesNotMatch(error.message, /scriSECRET123/)
    assert.match(error.message, /\/func\/<script_id>/)
    return true
  })
  const offline = new ViaSocket({ orgId: 'o', projectId: 'p', secret: 's', fetch: async () => { throw new TypeError('fetch failed') } })
  await assert.rejects(() => offline.runAction('scriSECRET123', 'row5dxvkb0mr', {}), (error) => {
    assert.doesNotMatch(error.message, /scriSECRET123/)
    return true
  })
})
