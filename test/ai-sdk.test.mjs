import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ViaSocket } from '../dist/esm/index.js'
import { viasocketTools } from '../dist/esm/ai-sdk.js'

/** Slack with one action whose channel field is a picker, so the app also gets its list-options tool. */
const CATALOG = {
  service: { name: 'Slack', auth_type: 'OAuth2' },
  actions: [
    {
      name: 'Send Message',
      description: 'Send a message.',
      action_id: 'act1',
      action_version_id: 'ver1',
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
    const reply = url.includes('recommend/services')
      ? { data: { plugins: { slack: { rowid: 'rowbu58rc' } } } }
      : url.endsWith('/func/scriK4LFg2kc')
        ? CATALOG
        : url.includes('/integrations')
          ? { success: true, data: { flows } }
          : { success: true, data: { ok: true } }
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  return { fetchImpl, calls }
}

const enabledSlack = { id: 'scriSLACK', status: 'active', service_id: 'rowbu58rc', auth_id: 'a1', title: 'Slack', webhook: '' }

test('viasocketTools (AI SDK): a record of tools keyed by name, each with its JSON Schema', async () => {
  const { fetchImpl } = fakeFetch({ flows: [enabledSlack] })
  const viasocket = new ViaSocket({ orgId: 'o', projectId: 'p', secret: 's', fetch: fetchImpl })
  const tools = await viasocketTools(viasocket, { user: 'user_123', apps: ['slack'] })
  assert.deepEqual(Object.keys(tools).sort(), ['slack_list-options', 'slack_send-message'])
  const send = tools['slack_send-message']
  assert.equal(send.description, 'Slack: Send a message.')
  assert.deepEqual(send.inputSchema.jsonSchema.required, ['channel', 'text'])
})

test('viasocketTools (AI SDK): execute runs the action on the script the user enabled', async () => {
  const { fetchImpl, calls } = fakeFetch({ flows: [enabledSlack] })
  const viasocket = new ViaSocket({ orgId: 'o', projectId: 'p', secret: 's', fetch: fetchImpl })
  const tools = await viasocketTools(viasocket, { user: 'user_123', apps: ['slack'] })
  const input = { channel: 'C1', text: 'hi' }
  assert.equal(await tools['slack_send-message'].execute(input, { toolCallId: '1', messages: [] }), '{"ok":true}')
  const run = calls.find((call) => call.url.endsWith('/func/scriSLACK'))
  assert.deepEqual(JSON.parse(run.body), { action_version_id: 'ver1', inputData: input })
})

test('viasocketTools (AI SDK): an app the user has not connected is a sentence for the model', async () => {
  const { fetchImpl } = fakeFetch({ flows: [] })
  const viasocket = new ViaSocket({ orgId: 'o', projectId: 'p', secret: 's', fetch: fetchImpl })
  const tools = await viasocketTools(viasocket, { user: 'user_123', apps: ['slack'] })
  assert.match(await tools['slack_send-message'].execute({ channel: 'C1', text: 'hi' }, { toolCallId: '1', messages: [] }), /not connected/)
})

test('viasocketTools (AI SDK): generateText calls the tool and the action runs for the user', async (t) => {
  const { generateText, stepCountIs } = await import('ai')
  const { MockLanguageModelV4 } = await import('ai/test')
  if (!MockLanguageModelV4) return t.skip('the generateText check needs ai 7, which the dev dependency installs')
  const { fetchImpl, calls } = fakeFetch({ flows: [enabledSlack] })
  const viasocket = new ViaSocket({ orgId: 'o', projectId: 'p', secret: 's', fetch: fetchImpl })
  const tools = await viasocketTools(viasocket, { user: 'user_123', apps: ['slack'] })
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined }
  }
  let turn = 0
  const model = new MockLanguageModelV4({
    doGenerate: async () =>
      turn++ === 0
        ? {
            content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'slack_send-message', input: JSON.stringify({ channel: 'C1', text: 'hi' }) }],
            finishReason: { unified: 'tool-calls', raw: undefined },
            usage,
            warnings: []
          }
        : { content: [{ type: 'text', text: 'Posted.' }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] }
  })
  const result = await generateText({ model, tools, stopWhen: stepCountIs(3), prompt: 'Say hi in C1' })
  assert.equal(result.text, 'Posted.')
  assert.equal(result.steps[0].toolResults[0].output, '{"ok":true}')
  const run = calls.find((call) => call.url.endsWith('/func/scriSLACK'))
  assert.deepEqual(JSON.parse(run.body), { action_version_id: 'ver1', inputData: { channel: 'C1', text: 'hi' } })
})
