import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ViaSocket, ViaSocketError } from '../dist/esm/index.js'

// Automations built from code: https://viasocket.com/docs/automations.md. The same fake fetch as
// client.test.mjs: the assertions are about what the client sent and how it read the answer.
function fakeFetch(responses) {
  const calls = []
  const queue = [...responses]
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body })
    const next = queue.shift() ?? { status: 200, body: { success: true, data: {} } }
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { 'Content-Type': 'application/json' } })
  }
  return { fetchImpl, calls }
}
const ok = (data) => ({ status: 200, body: { success: true, message: 'ok', data } })
const register = { status: 201, body: { success: true, message: 'logged in successfully', data: { token: 'proxy-token-abc', user_id: 1 } } }
function client(responses) {
  const { fetchImpl, calls } = fakeFetch(responses)
  const viasocket = new ViaSocket({ orgId: '4160', projectId: 'proj9U0smb62', secret: 's3cret', fetch: fetchImpl })
  return { user: viasocket.user('user_123'), calls }
}

const flowAnswer = {
  script_id: 'scriQw8RtY2u',
  title: 'Daily summary',
  status: 'active',
  trigger: { type: 'trigger', triggerType: 'webhook', webhook_url: 'https://flow.sokt.io/func/scriQw8RtY2u', runOncePerItem: false },
  steps: [{ stepname: 'note', code: 'return await askAi({ inputData: { query: context.req.body.item } })', service_action_functions: [{ name: 'askAi', auth_id: 'NoAuth', action_id: 'rowskkqydb6f' }] }],
  variables: [],
  version: '1.1.0',
  webhook_url_of_flow: 'https://flow.sokt.io/func/scriQw8RtY2u'
}

test('createFlow derives the user token once from /users/register and posts with it as proxy_auth_token', async () => {
  const { user, calls } = client([
    register,
    { status: 201, body: { success: true, message: 'Successfully created Flow', data: { script_id: 'scriQw8RtY2u', title: 'Daily summary', status: 'draft' } } },
    { status: 201, body: { success: true, data: { script_id: 'scriSecond00', title: 'Second', status: 'draft' } } }
  ])
  assert.deepEqual(await user.createFlow({ title: 'Daily summary', description: 'what the user sees' }), { scriptId: 'scriQw8RtY2u', title: 'Daily summary', status: 'draft' })
  assert.equal(calls[0].url, 'https://flow-api.viasocket.com/users/register')
  assert.match(calls[0].headers.authorization, /^eyJ/, 'register takes the embed token')
  assert.equal(calls[1].url, 'https://flow-api.viasocket.com/automations')
  assert.equal(calls[1].method, 'POST')
  assert.equal(calls[1].headers.proxy_auth_token, 'proxy-token-abc')
  assert.equal(calls[1].headers.authorization, undefined, 'the embed token is not sent to the Automation API')
  assert.deepEqual(JSON.parse(calls[1].body), { title: 'Daily summary', description: 'what the user sees' })
  await user.createFlow({ title: 'Second' })
  assert.equal(calls.length, 3, 'the token is derived once per user scope')
})

test('setTrigger sends each trigger type in the route names and maps the answer back', async () => {
  const { user, calls } = client([
    register,
    ok({ script_id: 'scriQw8RtY2u', status: 'draft', triggerType: 'webhook', webhook_url: 'https://flow.sokt.io/func/scriQw8RtY2u', runOncePerItem: true, arrayKey: 'orders' }),
    ok({ script_id: 'scriQw8RtY2u', status: 'draft', triggerType: 'cron', cronStatement: 'Every day at 9am', cron_statement: 'At 09:00 AM every day', timezone: 'Asia/Kolkata' }),
    ok({ script_id: 'scriQw8RtY2u', status: 'active', triggerType: 'plugin', trigger_id: 'rowqz5a1b2c3', auth_id: 'NoAuth', inputData: { hookUrl: 'https://flow.sokt.io/func/scriQw8RtY2u' }, sampleData: { text: 'hi' } })
  ])
  const webhook = await user.setTrigger('scriQw8RtY2u', { triggerType: 'webhook', runOncePerItem: true, arrayKey: 'orders' })
  assert.equal(calls[1].url, 'https://flow-api.viasocket.com/automations/scriQw8RtY2u/trigger')
  assert.deepEqual(JSON.parse(calls[1].body), { triggerType: 'webhook', runOncePerItem: true, arrayKey: 'orders' })
  assert.deepEqual(webhook, { scriptId: 'scriQw8RtY2u', status: 'draft', triggerType: 'webhook', webhookUrl: 'https://flow.sokt.io/func/scriQw8RtY2u', runOncePerItem: true, arrayKey: 'orders' })

  const cron = await user.setTrigger('scriQw8RtY2u', { triggerType: 'cron', cronStatement: 'Every day at 9am', timezone: 'Asia/Kolkata' })
  assert.deepEqual(JSON.parse(calls[2].body), { triggerType: 'cron', cronStatement: 'Every day at 9am', timezone: 'Asia/Kolkata' })
  assert.equal(cron.schedule, 'At 09:00 AM every day')
  assert.equal(cron.timezone, 'Asia/Kolkata')

  const plugin = await user.setTrigger('scriQw8RtY2u', { triggerType: 'plugin', triggerId: 'rowqz5a1b2c3', inputData: {} })
  assert.deepEqual(JSON.parse(calls[3].body), { triggerType: 'plugin', trigger_id: 'rowqz5a1b2c3', inputData: {} }, 'no auth_id when none was given')
  assert.equal(plugin.triggerId, 'rowqz5a1b2c3')
  assert.equal(plugin.authId, 'NoAuth')
  assert.deepEqual(plugin.sampleData, { text: 'hi' })
})

test('setTrigger: a refusal is a ViaSocketError with the route message and status', async () => {
  const { user } = client([
    register,
    { status: 400, body: { success: false, message: 'Validation error "trigger_id" is not allowed' } },
    { status: 403, body: { success: false, message: 'Sorry, You are not authorized to access this flow!' } }
  ])
  await assert.rejects(() => user.setTrigger('scriQw8RtY2u', { triggerType: 'webhook' }), (error) => error instanceof ViaSocketError && error.status === 400 && /trigger_id/.test(error.message))
  await assert.rejects(() => user.setTrigger('scriOther0000', { triggerType: 'webhook' }), (error) => error instanceof ViaSocketError && error.status === 403)
})

test('saveSteps sends the whole step list in the route names, and answers the flow as readFlow does', async () => {
  const { user, calls } = client([register, { status: 201, body: { success: true, message: 'successfully published the flow', data: flowAnswer } }])
  const flow = await user.saveSteps('scriQw8RtY2u', [
    { stepname: 'note', code: 'return await askAi({ inputData: { query: context.req.body.item } })', serviceActionFunctions: [{ name: 'askAi', authId: 'NoAuth', actionId: 'rowskkqydb6f' }] }
  ])
  assert.equal(calls[1].url, 'https://flow-api.viasocket.com/automations/scriQw8RtY2u/steps')
  assert.deepEqual(JSON.parse(calls[1].body), {
    steps: [{ stepname: 'note', code: 'return await askAi({ inputData: { query: context.req.body.item } })', service_action_functions: [{ name: 'askAi', auth_id: 'NoAuth', action_id: 'rowskkqydb6f' }] }]
  })
  assert.equal(flow.scriptId, 'scriQw8RtY2u')
  assert.equal(flow.status, 'active')
  assert.equal(flow.trigger.triggerType, 'webhook')
  assert.equal(flow.trigger.webhookUrl, 'https://flow.sokt.io/func/scriQw8RtY2u')
  assert.deepEqual(flow.steps[0].serviceActionFunctions, [{ name: 'askAi', authId: 'NoAuth', actionId: 'rowskkqydb6f' }])
  assert.equal(flow.webhookUrl, 'https://flow.sokt.io/func/scriQw8RtY2u')
  await assert.rejects(() => user.saveSteps('scriQw8RtY2u', []), /non-empty/)
})

test('readFlow reads the flow with the user token; runHistory reads the runs newest first', async () => {
  const run = {
    flowHitId: 'flhQw8RtY2u-1',
    status: 'success',
    requestTimestamp: '2026-11-11T09:00:00.000Z',
    output: '{"ok":true}',
    console: { note: '### wrote it\n' },
    stepOrderJsonData: [{ id: 'note', status: 200, timeTaken: 1548, creditsUsed: 1 }],
    requestSnapshot: '{}'
  }
  const { user, calls } = client([register, ok(flowAnswer), ok({ finalResponse: [run] })])
  const flow = await user.readFlow('scriQw8RtY2u')
  assert.equal(calls[1].url, 'https://flow-api.viasocket.com/automations/scriQw8RtY2u')
  assert.equal(calls[1].method, 'GET')
  assert.equal(calls[1].headers.proxy_auth_token, 'proxy-token-abc')
  assert.equal(flow.steps[0].code, 'return await askAi({ inputData: { query: context.req.body.item } })')
  const runs = await user.runHistory('scriQw8RtY2u', { limit: 10 })
  assert.equal(calls[2].url, 'https://flow-api.viasocket.com/logs/orgId/4160?projectId=proj9U0smb62&scriptId=scriQw8RtY2u&page=1&limit=10')
  assert.equal(runs.length, 1)
  assert.equal(runs[0].status, 'success')
  assert.equal(runs[0].output, '{"ok":true}')
  assert.deepEqual(runs[0].steps, [{ id: 'note', status: 200, timeTaken: 1548 }])
  assert.equal(runs[0].requestSnapshot, '{}', 'the rest of the entry is kept as sent')
})

test('listActions carries pauses: why a flow waits after a step with that action', async () => {
  const listing = {
    service: 'viasocket-utilities',
    service_id: 'row29ruc9gs1',
    actions: [
      { key: 'Pause_Workflow', name: 'Pause Workflow', type: 'action', action_id: 'row6hurrxf00', version: 'V31', action_version_id: 'rowv31', versions: [], pauses: 'delay' },
      { key: 'Run_AI_Model', name: 'Run AI Model', type: 'action', action_id: 'rowskkqydb6f', version: 'V3', action_version_id: 'rowv3', versions: [], pauses: null },
      { key: 'Old_Listing', name: 'Old Listing', type: 'action', action_id: 'rowold', version: 'V1', action_version_id: 'rowv1', versions: [] }
    ]
  }
  const { user } = client([ok(listing)])
  const { actions } = await user.listActions('viasocket-utilities')
  assert.deepEqual(actions.map((action) => action.pauses), ['delay', null, null], 'a listing without the field reads as null')
})
