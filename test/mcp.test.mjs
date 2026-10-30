import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ViaSocket } from '../dist/esm/index.js'

// user.mcp against a fake of the two services it calls: flow-api's GET /embed/mcp/token (with the user's embed token)
// and mcp.viasocket.com's management API (with that token as a Bearer).
const MCP = 'https://mcp.test/api'

function fakeServices({ failOn } = {}) {
  const state = { servers: {}, tools: {}, skills: {}, prompts: {}, next: 1, tokens: 0, expireNext: false }
  const calls = []
  const id = () => `id${String(state.next++).padStart(4, '0')}`
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method || 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    const auth = new Headers(init.headers).get('authorization') || ''
    calls.push({ method, url: url.href, auth, body })
    if (url.pathname === '/embed/mcp/token') {
      assert.ok(auth && !auth.startsWith('Bearer'), 'the token route takes the bare embed token')
      state.tokens++
      return json(200, { success: true, data: { token: `mcp_${state.tokens}`, token_type: 'Bearer', expires_in: 3600, api: MCP } })
    }
    if (!url.href.startsWith(MCP)) return json(404, { success: false, message: 'no route' })
    if (auth !== `Bearer mcp_${state.tokens}` || state.expireNext) {
      state.expireNext = false
      return json(401, { success: false, message: 'Unauthorized' })
    }
    const path = url.pathname.replace(/^\/api/, '')
    if (failOn && failOn(method, path)) return json(500, { success: false, message: 'boom' })
    let m
    // like the real list, each server comes with its URL
    if (path === '/mcp' && method === 'GET')
      return json(201, {
        success: true,
        data: Object.values(state.servers).map((server) => ({ ...server, url: `https://mcp.test/mcp/${server._id}-8645` }))
      })
    if (path === '/mcp' && method === 'POST') {
      const server = { _id: id(), ...body, skillIds: [], promptIds: [] }
      state.servers[server._id] = server
      return json(201, { success: true, data: { ...server, url: `https://mcp.test/mcp/${server._id}-8645` } })
    }
    if ((m = path.match(/^\/mcp\/([^/]+)$/))) {
      if (!state.servers[m[1]]) return json(404, { success: false, message: 'MCP server not found' })
      if (method === 'PUT') return json(200, { success: true, data: Object.assign(state.servers[m[1]], body) })
      if (method === 'DELETE') {
        delete state.servers[m[1]]
        for (const [toolId, tool] of Object.entries(state.tools)) if (tool.mcpServerId === m[1]) delete state.tools[toolId]
        return json(200, { success: true, data: {} })
      }
    }
    if (path === '/tool' && method === 'POST') {
      const tool = body.toolId ? state.tools[body.toolId] : { _id: id() }
      Object.assign(tool, body)
      state.tools[tool._id] = tool
      return json(201, { success: true, data: tool })
    }
    if ((m = path.match(/^\/tool\/id\/([^/]+)$/)) && method === 'DELETE') {
      delete state.tools[m[1]]
      return json(201, { success: true })
    }
    for (const kind of ['skill', 'prompt']) {
      const store = state[`${kind}s`]
      if (path === `/${kind}` && method === 'POST') {
        if (Object.values(store).some((item) => item.name === body.name))
          return json(400, {
            success: false,
            message: 'An error occurred while processing your request',
            error: 'E11000 duplicate key error'
          })
        const item = { _id: id(), ...body }
        store[item._id] = item
        return json(201, { success: true, data: item })
      }
      if ((m = path.match(new RegExp(`^/${kind}s/([^/]+)$`))) && method === 'GET')
        return json(200, { success: true, data: (state.servers[m[1]]?.[`${kind}Ids`] || []).map((itemId) => store[itemId]) })
      if ((m = path.match(new RegExp(`^/${kind}/([^/]+)$`)))) {
        if (!store[m[1]]) return json(404, { success: false, message: 'not found' })
        if (method === 'PUT') return json(200, { success: true, data: Object.assign(store[m[1]], body) })
        if (method === 'DELETE') {
          delete store[m[1]]
          return json(200, { success: true, data: {} })
        }
      }
      if ((m = path.match(new RegExp(`^/mcp/([^/]+)/${kind}/([^/]+)$`)))) {
        const list = state.servers[m[1]][`${kind}Ids`]
        if (method === 'POST' && !list.includes(m[2])) list.push(m[2])
        if (method === 'DELETE') list.splice(list.indexOf(m[2]), 1)
        return json(200, { success: true, data: {} })
      }
    }
    return json(404, { success: false, message: `no route ${method} ${path}` })
  }
  return { fetchImpl, state, calls }
}

const viasocketWith = (fetchImpl) => new ViaSocket({ orgId: '8645', projectId: 'projA', secret: 's', fetch: fetchImpl, mcpApiBaseUrl: MCP })

const AGENT = {
  name: 'Order desk',
  instructions: 'Looks up and refunds orders.',
  login: { mode: 'api-key', validationUrl: 'https://shop.example/me' },
  tools: [
    {
      name: 'get_order',
      description: 'Gets one order.',
      api: { url: 'https://shop.example/orders/{{id}}', method: 'GET', tokenPrefix: 'Bearer' },
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
    },
    {
      name: 'refund_order',
      description: 'Refunds one order.',
      api: { url: 'https://shop.example/refunds', method: 'POST', tokenPrefix: 'Bearer' }
    }
  ],
  skills: [{ name: 'handle_refund', description: 'How to refund.', content: '# Refund\n\n1. get_order\n2. refund_order' }],
  prompts: [
    { name: 'refund', description: 'Refund an order.', arguments: [{ name: 'id', required: true }], content: 'Refund order {{id}}.' }
  ]
}

test('user.mcp.sync creates a server with its tools, skill and prompt, as this user, with one token', async () => {
  const { fetchImpl, state, calls } = fakeServices()
  const user = viasocketWith(fetchImpl).user('alice')
  const { ids, url, changes } = await user.mcp.sync(AGENT)
  assert.equal(url, `https://mcp.test/mcp/${ids.server}-8645`)
  assert.deepEqual(Object.keys(ids.tools), ['get_order', 'refund_order'])
  assert.ok(ids.skills.handle_refund && ids.prompts.refund)
  assert.deepEqual(changes, [
    'server created',
    'tool get_order created',
    'tool refund_order created',
    'skill handle_refund created',
    'prompt refund created'
  ])
  const server = state.servers[ids.server]
  assert.equal(server.isAuthenticationEnabled, true)
  assert.deepEqual(server.externalAuth, { validationUrl: 'https://shop.example/me', headerName: 'Authorization', method: 'GET' })
  assert.equal(server.branding.instructions, 'Looks up and refunds orders.')
  assert.deepEqual(state.tools[ids.tools.get_order].apiConfig, {
    url: 'https://shop.example/orders/{{id}}',
    method: 'GET',
    tokenPrefix: 'Bearer'
  })
  assert.equal(state.tokens, 1, 'the token was fetched more than once')
  assert.ok(calls.filter((call) => call.url.startsWith(MCP)).every((call) => call.auth === 'Bearer mcp_1'))
})

test('user.mcp.sync with the saved ids updates in place and removes what the definition dropped', async () => {
  const { fetchImpl, state } = fakeServices()
  const user = viasocketWith(fetchImpl).user('alice')
  const first = await user.mcp.sync(AGENT)
  const second = await user.mcp.sync({ ...AGENT, tools: [AGENT.tools[0]], prompts: [] }, first.ids)
  assert.equal(second.ids.server, first.ids.server)
  assert.equal(second.ids.tools.get_order, first.ids.tools.get_order)
  assert.deepEqual(second.changes, [
    'server updated',
    'tool get_order updated',
    'tool refund_order removed',
    'skill handle_refund updated',
    'prompt refund removed'
  ])
  assert.equal(Object.keys(state.servers).length, 1)
  assert.equal(Object.keys(state.tools).length, 1)
  assert.equal(Object.keys(state.prompts).length, 0)
})

test('user.mcp.sync refuses a bad definition by key, a slug included, before any call', async () => {
  const { fetchImpl, calls } = fakeServices()
  const user = viasocketWith(fetchImpl).user('alice')
  await assert.rejects(() => user.mcp.sync({ ...AGENT, slug: 'order-desk' }), /"slug" is not for a user's server/)
  await assert.rejects(
    () => user.mcp.sync({ ...AGENT, tools: [{ ...AGENT.tools[0], name: 'Get Order' }] }),
    /tools\[0\]\.name is snake_case/
  )
  await assert.rejects(
    () => user.mcp.sync({ ...AGENT, login: { mode: 'oauth', validationUrl: 'https://x.example/me' } }),
    /login\.loginUrl/
  )
  assert.equal(calls.length, 0)
})

test('user.mcp takes a new token once when the management API refuses the old one', async () => {
  const { fetchImpl, state } = fakeServices()
  const user = viasocketWith(fetchImpl).user('alice')
  await user.mcp.list()
  state.expireNext = true
  assert.deepEqual(await user.mcp.list(), [])
  assert.equal(state.tokens, 2)
})

test('a failed user.mcp.sync hands back what it made, so a retry updates it', async () => {
  const { fetchImpl, state } = fakeServices({ failOn: (method, path) => method === 'POST' && path === '/skill' })
  const user = viasocketWith(fetchImpl).user('alice')
  const error = await user.mcp.sync(AGENT).catch((e) => e)
  assert.match(error.message, /boom/)
  assert.ok(error.ids.server && error.ids.tools.get_order && error.ids.tools.refund_order, JSON.stringify(error.ids))
  assert.equal(Object.keys(state.servers).length, 1)
})

test('user.mcp.list gives each server its URL; remove deletes it with its skills and prompts', async () => {
  const { fetchImpl, state } = fakeServices()
  const user = viasocketWith(fetchImpl).user('alice')
  const { ids } = await user.mcp.sync(AGENT)
  assert.deepEqual(await user.mcp.list(), [{ id: ids.server, name: 'Order desk', url: `https://mcp.test/mcp/${ids.server}-8645` }])
  await user.mcp.remove(ids)
  assert.equal(Object.keys(state.servers).length, 0)
  assert.equal(Object.keys(state.tools).length, 0)
  assert.equal(Object.keys(state.skills).length, 0)
  assert.equal(Object.keys(state.prompts).length, 0)
  await user.mcp.remove(ids) // already gone is fine
})

test('a skill name this user already uses on another server is said plainly', async () => {
  const { fetchImpl } = fakeServices()
  const user = viasocketWith(fetchImpl).user('alice')
  await user.mcp.sync(AGENT)
  await assert.rejects(
    () => user.mcp.sync({ ...AGENT, name: 'Second desk', prompts: [] }),
    /already has a skill named handle_refund on another server/
  )
})
