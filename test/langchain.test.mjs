import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ViaSocket, actionInputSchema } from '../dist/esm/index.js'
import { viasocketTools } from '../dist/esm/langchain.js'

/** A trimmed copy of Slack's live `Send Message` schema: nested group, picker, static dropdown, conditional field. */
const SEND_MESSAGE = {
  steps: {
    root: ['destination', 'text', 'help_note'],
    destination: ['destination.messageto', 'destination.channel_id']
  },
  blocks: {
    destination: { key: 'destination', type: 'input groups', label: 'Destination' },
    'destination.messageto': {
      key: 'destination.messageto',
      type: 'dropdown',
      label: 'Send Message To',
      required: true,
      placeholder: 'type',
      options: [
        { label: 'Channel', value: 'channel' },
        { label: 'User', value: 'user' }
      ]
    },
    'destination.channel_id': {
      key: 'destination.channel_id',
      type: 'multiselect',
      label: 'Channels',
      required: true,
      visibilityCondition: "context?.inputData?.destination?.messageto === 'channel'"
    },
    text: { key: 'text', type: 'markdown', label: 'Message', required: true, placeholder: 'Hello' },
    help_note: { key: 'help_note', type: 'help', help: 'Not an input' }
  }
}

const CATALOG = {
  service: { name: 'Slack', auth_type: 'OAuth2' },
  actions: [
    { name: 'Send Message', description: 'Send a message.', action_id: 'act1', action_version_id: 'ver1', input_schema: SEND_MESSAGE }
  ],
  triggers: []
}

function fakeFetch({ flows = [] } = {}) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    url = String(url)
    calls.push({ url, method: init.method ?? 'GET', body: init.body })
    const reply = url.includes('/embed/list-options/')
      ? {
          success: true,
          data: [
            { label: '#general', value: 'C1' },
            { label: '#random', value: 'C2' }
          ]
        }
      : url.includes('recommend/services')
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

test('actionInputSchema: nests groups, keeps static choices, marks pickers and drops help text', () => {
  const schema = actionInputSchema(SEND_MESSAGE)
  assert.deepEqual(Object.keys(schema.properties), ['destination', 'text'])
  assert.deepEqual(schema.required, ['text'])
  const destination = schema.properties.destination
  assert.deepEqual(destination.properties.messageto.enum, ['channel', 'user'])
  assert.doesNotMatch(destination.properties.messageto.description, /Example/)
  assert.deepEqual(destination.required, ['messageto'])
  assert.equal(destination.properties.channel_id.type, 'array')
  assert.match(destination.properties.channel_id.description, /not a display name/)
  assert.match(destination.properties.channel_id.description, /Only when: destination\?\.messageto === 'channel'/)
  assert.match(schema.properties.text.description, /Example: Hello/)
})

test('viasocketTools: one tool per action, run on the script the user enabled', async () => {
  const { fetchImpl, calls } = fakeFetch({ flows: [enabledSlack] })
  const viasocket = new ViaSocket({ orgId: 'o', projectId: 'p', secret: 's', fetch: fetchImpl })
  const [send] = await viasocketTools(viasocket, { user: 'user_123', apps: ['slack'], actions: { slack: ['send-message'] } })
  assert.equal(send.name, 'slack_send-message')
  assert.equal(send.description, 'Slack: Send a message.')

  const input = { destination: { messageto: 'channel', channel_id: ['C1'] }, text: 'hi' }
  assert.equal(await send.invoke(input), '{"ok":true}')
  const run = calls.find((call) => call.url.endsWith('/func/scriSLACK'))
  assert.deepEqual(JSON.parse(run.body), { action_version_id: 'ver1', inputData: input })
})

test('viasocketTools: an app the user has not connected is a sentence for the model, not a throw', async () => {
  const { fetchImpl } = fakeFetch({ flows: [] })
  const viasocket = new ViaSocket({ orgId: 'o', projectId: 'p', secret: 's', fetch: fetchImpl })
  const [send] = await viasocketTools(viasocket, { user: 'user_123', apps: ['slack'] })
  assert.match(await send.invoke({ text: 'hi' }), /Slack is not connected for this user/)
})

test('viasocketTools: an action the app does not have fails at build time, by name', async () => {
  const { fetchImpl } = fakeFetch()
  const viasocket = new ViaSocket({ orgId: 'o', projectId: 'p', secret: 's', fetch: fetchImpl })
  await assert.rejects(
    () => viasocketTools(viasocket, { user: 'u', apps: ['slack'], actions: { slack: ['add-row'] } }),
    /no published action "add-row"/
  )
})

test('viasocketTools: an id field names the list-options tool, which reads the user account through their connection', async () => {
  const { fetchImpl, calls } = fakeFetch({ flows: [enabledSlack] })
  const viasocket = new ViaSocket({ orgId: 'o', projectId: 'p', secret: 's', fetch: fetchImpl })
  const tools = await viasocketTools(viasocket, { user: 'user_123', apps: ['slack'], actions: { slack: ['send-message'] } })
  assert.deepEqual(
    tools.map((t) => t.name),
    ['slack_send-message', 'slack_list-options']
  )
  const [send, options] = tools
  const channel = send.schema.properties.destination.properties.channel_id.description
  assert.match(channel, /get it with slack_list-options \(tool "slack_send-message", field "destination\.channel_id"\)/)

  const answer = JSON.parse(
    await options.invoke({
      tool: 'slack_send-message',
      field: 'destination.channel_id',
      chosen: { destination: { messageto: 'channel' } },
      search: 'gen'
    })
  )
  assert.deepEqual(answer, {
    options: [
      { label: '#general', value: 'C1' },
      { label: '#random', value: 'C2' }
    ],
    more: false
  })
  const listed = calls.find((call) => call.url.includes('/embed/list-options/ver1'))
  assert.deepEqual(JSON.parse(listed.body), {
    fieldKey: 'destination.channel_id',
    auth_id: 'a1',
    existingFields: { destination: { messageto: 'channel' }, _searchText: 'gen' }
  })
  // `tool` is an enum, so LangChain itself refuses a tool the model made up
  await assert.rejects(() => options.invoke({ tool: 'nope', field: 'x' }), /did not match expected schema/)
})

test('viasocketTools: no list-options tool for an app whose chosen actions have no id field', async () => {
  const { fetchImpl } = fakeFetch({ flows: [enabledSlack] })
  const viasocket = new ViaSocket({ orgId: 'o', projectId: 'p', secret: 's', fetch: fetchImpl })
  const plain = { steps: { root: ['text'] }, blocks: { text: { key: 'text', type: 'string', label: 'Text', required: true } } }
  CATALOG.actions.push({
    name: 'Set Status',
    description: 'Set status.',
    action_id: 'act2',
    action_version_id: 'ver2',
    input_schema: plain
  })
  try {
    const tools = await viasocketTools(viasocket, { user: 'u', apps: ['slack'], actions: { slack: ['set-status'] } })
    assert.deepEqual(
      tools.map((t) => t.name),
      ['slack_set-status']
    )
  } finally {
    CATALOG.actions.pop()
  }
})
