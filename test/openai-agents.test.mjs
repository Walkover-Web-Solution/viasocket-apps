import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ViaSocket } from '../dist/esm/index.js'
import { viasocketTools } from '../dist/esm/openai-agents.js'

/** Slack with one action whose channel field is a picker, so the app also gets its list-options tool. */
const CATALOG = {
  service: { name: 'Slack', auth_type: 'OAuth2' },
  actions: [
    {
      name: 'Send Message',
      description: 'Send a message.',
      action_id: 'rowact1',
      action_version_id: 'rowver1',
      input_schema: {
        steps: { root: ['channel', 'text'] },
        blocks: {
          channel: { key: 'channel', type: 'dropdown', label: 'Channel', required: true },
          text: { key: 'text', type: 'string', label: 'Message', required: true }
        }
      }
    }
  ],
  triggers: []
}

function fakeFetch({ flows = [] } = {}) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    url = String(url)
    calls.push({ url, method: init.method ?? 'GET', body: init.body })
    const reply = url.includes('/embed/services/slack/actions')
      ? { success: true, data: { service: 'slack', service_id: 'rowbu58rc', actions: [{ key: 'Send_Message', name: 'Send Message', type: 'action', action_id: 'rowact1', version: 'V1', action_version_id: 'rowver1', versions: [] }] } }
      : url.endsWith('/api/v1/plugins/rowbu58rc/actions')
        ? CATALOG
        : url.includes('/integrations')
          ? { success: true, data: { flows } }
          : { success: true, data: { ok: true } }
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  return { fetchImpl, calls }
}

const enabledSlack = { id: 'scriSLACK', status: 'active', service_id: 'rowbu58rc', auth_id: 'a1', title: 'Slack', webhook: '' }

test('viasocketTools (OpenAI Agents): function tools with the JSON Schema, not strict', async () => {
  const { fetchImpl } = fakeFetch({ flows: [enabledSlack] })
  const viasocket = new ViaSocket({ orgId: 'o', projectId: 'p', secret: 's', fetch: fetchImpl })
  const [send, options] = await viasocketTools(viasocket, { user: 'user_123', apps: ['slack'] })
  // The SDK turns '-' into '_' in names; the id field names the list-options tool the same way.
  assert.deepEqual([send.name, options.name], ['slack_send_message', 'slack_list_options'])
  assert.equal(send.type, 'function')
  assert.equal(send.strict, false)
  assert.deepEqual(send.parameters.required, ['channel', 'text'])
  assert.match(send.parameters.properties.channel.description, /slack_list_options/)
  assert.doesNotMatch(send.parameters.properties.channel.description, /slack_list-options/)
  // The list-options tool still takes the action's own name.
  assert.deepEqual(options.parameters.properties.tool.enum, ['slack_send-message'])
})

test('viasocketTools (OpenAI Agents): invoke runs the action on the script the user enabled', async () => {
  const { fetchImpl, calls } = fakeFetch({ flows: [enabledSlack] })
  const viasocket = new ViaSocket({ orgId: 'o', projectId: 'p', secret: 's', fetch: fetchImpl })
  const [send] = await viasocketTools(viasocket, { user: 'user_123', apps: ['slack'] })
  const input = { channel: 'C1', text: 'hi' }
  assert.equal(await send.invoke({}, JSON.stringify(input)), '{"ok":true}')
  const run = calls.find((call) => call.url.endsWith('/func/scriSLACK'))
  assert.deepEqual(JSON.parse(run.body).inputData, input)
})

test('viasocketTools (OpenAI Agents): an app the user has not connected is a sentence for the model', async () => {
  const { fetchImpl } = fakeFetch({ flows: [] })
  const viasocket = new ViaSocket({ orgId: 'o', projectId: 'p', secret: 's', fetch: fetchImpl })
  const [send] = await viasocketTools(viasocket, { user: 'user_123', apps: ['slack'] })
  assert.match(await send.invoke({}, JSON.stringify({ channel: 'C1', text: 'hi' })), /not connected/)
})
