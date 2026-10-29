import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

// `npx viasocket-apps login` and `setup` without a browser. One fake server plays connect.viasocket.com
// (resource metadata, server metadata, registration, token), the org endpoint and the dashboard API
// (embed projects, the signing secret). The test plays the browser: it opens the authorize URL the
// command printed and follows the redirect to the command's loopback callback.
const bin = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'viasocket.mjs')

const base64url = (buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
const readBody = (req) =>
  new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => resolve(body))
  })

/** The fake server; `seen` records what the command sent, `state.projects` is what the workspace has. */
async function fakeServer({ projects = [], projectSecrets = {}, projectSecretRoute = true } = {}) {
  const seen = { register: null, authorize: null, token: null, created: null, whoamiHeaders: [], secretCreated: [] }
  const state = { projects, projectSecrets }
  let origin = ''
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, origin)
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (url.pathname === '/.well-known/oauth-protected-resource/mcp')
      return json(200, { resource: `${origin}/mcp`, authorization_servers: [`${origin}/oauth/x`] })
    if (url.pathname === '/.well-known/oauth-authorization-server/oauth/x')
      return json(200, {
        issuer: `${origin}/oauth/x`,
        authorization_endpoint: `${origin}/oauth/x/authorize`,
        token_endpoint: `${origin}/oauth/x/token`,
        registration_endpoint: `${origin}/oauth/x/register`,
        code_challenge_methods_supported: ['S256']
      })
    if (url.pathname === '/oauth/x/register' && req.method === 'POST') {
      seen.register = JSON.parse(await readBody(req))
      return json(201, { client_id: 'cid-1', client_secret: 'sec-1', token_endpoint_auth_method: 'client_secret_post' })
    }
    if (url.pathname === '/oauth/x/authorize') {
      // The developer signed in, picked the workspace and clicked Allow.
      seen.authorize = Object.fromEntries(url.searchParams)
      const back = new URL(url.searchParams.get('redirect_uri'))
      back.search = new URLSearchParams({ code: 'code-1', state: url.searchParams.get('state') }).toString()
      res.writeHead(302, { location: back.toString() })
      return res.end()
    }
    if (url.pathname === '/oauth/x/token' && req.method === 'POST') {
      seen.token = Object.fromEntries(new URLSearchParams(await readBody(req)))
      const expected = base64url(
        createHash('sha256')
          .update(seen.token.code_verifier || '')
          .digest()
      )
      if (seen.token.code !== 'code-1' || expected !== seen.authorize?.code_challenge || seen.token.client_secret !== 'sec-1')
        return json(400, { error: 'invalid_grant' })
      return json(200, { access_token: 'tok_abc', token_type: 'Bearer' })
    }
    // viaSocket proper: the bare token in Authorization, as the skill sends it.
    const authed = req.headers.authorization === 'tok_abc'
    if (url.pathname === '/whoami') {
      seen.whoamiHeaders.push(req.headers.authorization)
      res.writeHead(authed ? 200 : 401, { 'content-type': 'application/json' })
      return res.end(authed ? JSON.stringify({ user_id: '2919', org: { id: '83682' }, company_id: '4255', viasocket_token: true }) : 'null')
    }
    if (!authed) return json(401, { success: false, message: 'Unauthorized' })
    if (url.pathname === '/orgs/83682/projects' && req.method === 'GET') {
      assert.equal(url.searchParams.get('type'), 'embed')
      return json(200, { success: true, data: { projects: state.projects } })
    }
    if (url.pathname === '/orgs/83682/projects' && req.method === 'POST') {
      seen.created = JSON.parse(await readBody(req))
      const project = { id: 'projNEW00001', title: seen.created.title, status: 1 }
      state.projects = [...state.projects, project]
      return json(200, { success: true, data: project })
    }
    if (url.pathname === '/orgs/83682/token') return json(200, { success: true, data: 'sekret-14chars' })
    if (url.pathname === '/mcp/agent-token')
      return json(200, { success: true, data: { token: 'mcp_tok', token_type: 'Bearer', expires_in: 86400 } })
    const secretRoute = url.pathname.match(/^\/projects\/([^/]+)\/secret$/)
    if (secretRoute && projectSecretRoute) {
      const id = secretRoute[1]
      if (req.method === 'GET')
        return json(200, { success: true, data: state.projectSecrets[id] ? { secret: state.projectSecrets[id] } : {} })
      if (req.method === 'POST') {
        state.projectSecrets[id] = `psec-${id}`
        seen.secretCreated.push(id)
        return json(200, { success: true, data: { secret: state.projectSecrets[id] } })
      }
    }
    res.writeHead(404)
    res.end('Route does not exist')
  })
  const port = await listen(server)
  origin = `http://127.0.0.1:${port}`
  return { server, origin, seen, state }
}

function run(command, args, fake, envFile) {
  const env = {
    ...process.env,
    VIASOCKET_OAUTH_RESOURCE: `${fake.origin}/mcp`,
    VIASOCKET_WHOAMI_URL: `${fake.origin}/whoami`,
    VIASOCKET_API_URL: fake.origin
  }
  const child = spawn(process.execPath, [bin, command, '--no-open', '--env', envFile, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  const output = { text: '' }
  child.stdout.on('data', (chunk) => (output.text += chunk))
  child.stderr.on('data', (chunk) => (output.text += chunk))
  const exited = new Promise((resolve) => child.on('exit', resolve))
  const printed = async (pattern) => {
    const started = Date.now()
    while (!pattern.test(output.text)) {
      assert.ok(Date.now() - started < 10000, `the command did not print ${pattern}:\n${output.text}`)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    return output.text.match(pattern)
  }
  /** Plays the browser once the command has printed its authorize URL. */
  const allow = async () => {
    const [authorizeUrl] = await printed(/http:\/\/127\.0\.0\.1:\d+\/oauth\/x\/authorize\?\S+/)
    const callback = await fetch(authorizeUrl)
    assert.equal(callback.status, 200)
    assert.match(await callback.text(), /Signed in/)
  }
  return { exited, output, printed, allow }
}

const tempEnv = (content) => {
  const file = join(mkdtempSync(join(tmpdir(), 'viasocket-login-')), '.env')
  if (content !== undefined) writeFileSync(file, content)
  return file
}

test('login signs in with PKCE through the authorization server and writes the token to .env', async (t) => {
  const envFile = tempEnv('OTHER=1\nVIASOCKET_AGENT_TOKEN=old\n')
  const fake = await fakeServer()
  t.after(() => fake.server.close())
  const { exited, output, allow } = run('login', ['--timeout', '20'], fake, envFile)
  await allow()
  assert.equal(await exited, 0, output.text)

  assert.deepEqual(fake.seen.register.redirect_uris, [fake.seen.token.redirect_uri])
  assert.match(fake.seen.token.redirect_uri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/)
  assert.equal(fake.seen.authorize.response_type, 'code')
  assert.equal(fake.seen.authorize.client_id, 'cid-1')
  assert.equal(fake.seen.authorize.code_challenge_method, 'S256')
  assert.equal(fake.seen.authorize.resource, `${fake.origin}/mcp`)
  assert.equal(fake.seen.token.grant_type, 'authorization_code')

  assert.equal(readFileSync(envFile, 'utf8'), 'OTHER=1\nVIASOCKET_AGENT_TOKEN=tok_abc\nVIASOCKET_ORG_ID=83682\n')
  assert.ok(!output.text.includes('tok_abc'), 'the token was printed')
  assert.match(output.text, /for workspace 83682\./)
  assert.ok(!output.text.includes('Warning'), output.text)
})

test('a callback with the wrong state is refused and the command keeps waiting, then gives up', async (t) => {
  const envFile = tempEnv()
  const fake = await fakeServer()
  t.after(() => fake.server.close())
  const { exited, output, printed } = run('login', ['--timeout', '2'], fake, envFile)
  const [, port] = await printed(/redirect_uri=http%3A%2F%2F127\.0\.0\.1%3A(\d+)%2Fcallback/)
  const wrong = await fetch(`http://127.0.0.1:${port}/callback?code=code-1&state=not-it`)
  assert.equal(wrong.status, 400)
  assert.equal(await exited, 1)
  assert.match(output.text, /No sign-in arrived/)
  assert.throws(() => readFileSync(envFile))
})

test('setup signs in, reuses the only embed project and writes all four values, never the secret to the screen', async (t) => {
  const envFile = tempEnv()
  const fake = await fakeServer({ projects: [{ id: 'projONE00001', title: 'My product', status: 1 }] })
  t.after(() => fake.server.close())
  const { exited, output, allow } = run('setup', ['--timeout', '20'], fake, envFile)
  await allow()
  assert.equal(await exited, 0, output.text)
  assert.equal(
    readFileSync(envFile, 'utf8'),
    'VIASOCKET_AGENT_TOKEN=tok_abc\nVIASOCKET_ORG_ID=83682\nVIASOCKET_PROJECT_ID=projONE00001\nVIASOCKET_EMBED_SECRET=psec-projONE00001\n'
  )
  assert.equal(fake.seen.created, null, 'created a project although one existed')
  assert.match(output.text, /projONE00001 "My product" \(the workspace's only embed\); project secret\./)
  assert.deepEqual(fake.seen.secretCreated, ['projONE00001'], 'the project secret was not created once')
  assert.ok(!output.text.includes('psec-'), 'the secret was printed')
  assert.ok(!output.text.includes('sekret'), 'the secret was printed')
  assert.ok(!output.text.includes('tok_abc'), 'the token was printed')
})

test('setup with a working token in .env skips the sign-in, and creates the embed when there is none, with no limits or billing', async (t) => {
  const envFile = tempEnv('VIASOCKET_AGENT_TOKEN=tok_abc\n')
  const fake = await fakeServer({ projects: [] })
  t.after(() => fake.server.close())
  const { exited, output } = run('setup', ['--name', 'Growth Master'], fake, envFile)
  assert.equal(await exited, 0, output.text)
  assert.equal(fake.seen.authorize, null, 'signed in although the token worked')
  assert.equal(fake.seen.created.type, 'embed')
  assert.equal(fake.seen.created.title, 'Growth Master')
  assert.equal(fake.seen.created.org_id, '83682')
  assert.ok(fake.seen.created.settings?.config?.universal === true && fake.seen.created.settings?.config?.appsApi === true)
  for (const key of Object.keys(fake.seen.created)) assert.ok(!/limit|billing|plan/i.test(key), `create sent ${key}`)
  assert.match(readFileSync(envFile, 'utf8'), /^VIASOCKET_PROJECT_ID=projNEW00001$/m)
  assert.match(readFileSync(envFile, 'utf8'), /^VIASOCKET_EMBED_SECRET=psec-projNEW00001$/m)
  assert.match(output.text, /\(created\)/)
})

test('setup with several embeds lists them and exits 3; --project picks one; the one in .env is kept', async (t) => {
  const projects = [
    { id: 'projAAA00001', title: 'First', status: 1 },
    { id: 'projBBB00002', title: 'Second', status: 1 },
    { id: 'projDEL00003', title: 'Deleted', status: 0 }
  ]
  const envFile = tempEnv('VIASOCKET_AGENT_TOKEN=tok_abc\n')
  const fake = await fakeServer({ projects })
  t.after(() => fake.server.close())

  const several = run('setup', [], fake, envFile)
  assert.equal(await several.exited, 3, several.output.text)
  assert.match(several.output.text, /2 embed projects/)
  assert.match(several.output.text, /projAAA00001 {2}First/)
  assert.ok(!several.output.text.includes('projDEL00003'), 'a deleted project was offered')
  assert.ok(!readFileSync(envFile, 'utf8').includes('VIASOCKET_PROJECT_ID'))

  const picked = run('setup', ['--project', 'projBBB00002'], fake, envFile)
  assert.equal(await picked.exited, 0, picked.output.text)
  assert.match(readFileSync(envFile, 'utf8'), /^VIASOCKET_PROJECT_ID=projBBB00002$/m)

  const kept = run('setup', [], fake, envFile)
  assert.equal(await kept.exited, 0, kept.output.text)
  assert.match(kept.output.text, /projBBB00002 "Second" \(already in/)

  // --new: a second product in the same workspace gets its own embed, even with one already in .env
  const fresh = run('setup', ['--new', '--name', 'Second Product'], fake, envFile)
  assert.equal(await fresh.exited, 0, fresh.output.text)
  assert.equal(fake.seen.created.title, 'Second Product')
  assert.match(readFileSync(envFile, 'utf8'), /^VIASOCKET_PROJECT_ID=projNEW00001$/m)
  assert.match(fresh.output.text, /\(created\)/)
})

test('setup reuses an existing project secret, and falls back to the workspace secret on a backend without the route', async (t) => {
  const project = { id: 'projONE00001', title: 'My product', status: 1 }
  const withSecret = await fakeServer({ projects: [project], projectSecrets: { projONE00001: 'psec-kept' } })
  t.after(() => withSecret.server.close())
  const envFile = tempEnv('VIASOCKET_AGENT_TOKEN=tok_abc\n')
  const reused = run('setup', [], withSecret, envFile)
  assert.equal(await reused.exited, 0, reused.output.text)
  assert.deepEqual(withSecret.seen.secretCreated, [])
  assert.match(readFileSync(envFile, 'utf8'), /^VIASOCKET_EMBED_SECRET=psec-kept$/m)

  const older = await fakeServer({ projects: [project], projectSecretRoute: false })
  t.after(() => older.server.close())
  const envFile2 = tempEnv('VIASOCKET_AGENT_TOKEN=tok_abc\n')
  const fallback = run('setup', [], older, envFile2)
  assert.equal(await fallback.exited, 0, fallback.output.text)
  assert.match(readFileSync(envFile2, 'utf8'), /^VIASOCKET_EMBED_SECRET=sekret-14chars$/m)
  assert.match(fallback.output.text, /workspace secret\./)
})

test('a bad option exits 2 with the usage', async () => {
  const child = spawn(process.execPath, [bin, '--nope'], { stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  child.stdout.on('data', (chunk) => (out += chunk))
  const code = await new Promise((resolve) => child.on('exit', resolve))
  assert.equal(code, 2)
  assert.match(out, /usage:/)
})

// ---- the mcp command -------------------------------------------------------------------------------

/**
 * A fake mcp.viasocket.com: the management API under /api (servers, tools, skills, prompts) and the server it
 * hosts at /connector/<slug>, answering tools/list, prompts/list and tools/call the way the real one does. The
 * dashboard API's /mcp/agent-token lives on the login fake (it is viaSocket's main API).
 */
async function fakeMcp({ mcpToken = 'mcp_tok' } = {}) {
  const state = { servers: {}, tools: {}, skills: {}, prompts: {}, next: 1 }
  const seen = { requests: [], connectorHeaders: [] }
  let origin = ''
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, origin)
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    const body = req.method === 'GET' || req.method === 'DELETE' ? null : JSON.parse((await readBody(req)) || 'null')
    seen.requests.push({ method: req.method, path: url.pathname, body })
    const id = () => `id${String(state.next++).padStart(20, '0')}`
    // the hosted server
    const connector = url.pathname.match(/^\/connector\/([^/]+)$/)
    if (connector) {
      const mcp = Object.values(state.servers).find((entry) => entry.slug === connector[1])
      if (!mcp) return json(404, { error: 'MCP server not found' })
      seen.connectorHeaders.push(req.headers.authorization || '')
      if (mcp.isAuthenticationEnabled && !/^Bearer .+/.test(req.headers.authorization || '')) {
        res.writeHead(401, { 'WWW-Authenticate': 'Bearer error="invalid_token"' })
        return res.end('Unauthorized')
      }
      const tools = Object.values(state.tools).filter((tool) => tool.mcpServerId === mcp._id)
      const skills = (mcp.skillIds || []).map((skillId) => state.skills[skillId])
      if (body.method === 'tools/list')
        return json(200, {
          jsonrpc: '2.0',
          id: body.id,
          result: { tools: [...tools.map((tool) => ({ name: tool.title })), ...skills.map((skill) => ({ name: skill.name }))] }
        })
      if (body.method === 'prompts/list')
        return json(200, {
          jsonrpc: '2.0',
          id: body.id,
          result: { prompts: (mcp.promptIds || []).map((promptId) => ({ name: state.prompts[promptId].name })) }
        })
      if (body.method === 'tools/call') {
        // the token reaches the tool's API bare, with the prefix when set
        const tool = tools.find((entry) => entry.title === body.params.name)
        const token = (req.headers.authorization || '').replace(/^Bearer /, '')
        const forwarded = token ? `${tool.apiConfig.tokenPrefix ? `${tool.apiConfig.tokenPrefix} ` : ''}${token}` : ''
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        return res.end(
          `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: JSON.stringify({ args: body.params.arguments, forwarded }) }] } })}\n\n`
        )
      }
      return json(200, { jsonrpc: '2.0', id: body.id, error: { message: `no ${body.method}` } })
    }
    // the management API
    if (req.headers.authorization !== `Bearer ${mcpToken}`) return json(401, { success: false, message: 'Unauthorized' })
    const path = url.pathname.replace(/^\/api/, '')
    if (path === '/mcp' && req.method === 'GET') return json(201, { success: true, data: Object.values(state.servers) })
    if (path === '/mcp' && req.method === 'POST') {
      if (!body.name) return json(400, { success: false, message: 'Name is required' })
      const mcp = { _id: id(), ...body, skillIds: [], promptIds: [] }
      state.servers[mcp._id] = mcp
      return json(201, { success: true, data: { ...mcp, url: `${origin}/mcp/${mcp._id}-83682` } })
    }
    let match
    if ((match = path.match(/^\/mcp\/([^/]+)$/)) && req.method === 'PUT') {
      if (!body.name) return json(400, { success: false, message: 'Name is required' })
      const mcp = state.servers[match[1]]
      if (!mcp) return json(404, { success: false, message: 'MCP server not found' })
      Object.assign(mcp, body)
      if (body.externalAuth === null) delete mcp.externalAuth
      return json(200, { success: true, data: mcp })
    }
    if (path === '/tool' && req.method === 'POST') {
      const tool = body.toolId ? state.tools[body.toolId] : { _id: id() }
      if (!tool) return json(404, { success: false, message: 'Tool not found' })
      Object.assign(tool, body)
      state.tools[tool._id] = tool
      return json(200, { success: true, data: tool })
    }
    if ((match = path.match(/^\/tool\/id\/([^/]+)$/)) && req.method === 'DELETE') {
      delete state.tools[match[1]]
      return json(201, { success: true })
    }
    for (const kind of ['skill', 'prompt']) {
      const store = state[`${kind}s`]
      if ((match = path.match(new RegExp(`^/${kind}s/([^/]+)$`))) && req.method === 'GET') {
        const server = state.servers[match[1]]
        return json(200, { success: true, data: (server?.[`${kind}Ids`] || []).map((itemId) => store[itemId]).filter(Boolean) })
      }
      if (path === `/${kind}` && req.method === 'POST') {
        const item = { _id: id(), ...body }
        store[item._id] = item
        return json(201, { success: true, data: item })
      }
      if ((match = path.match(new RegExp(`^/${kind}/([^/]+)$`))) && req.method === 'PUT') {
        Object.assign(store[match[1]], body)
        return json(200, { success: true, data: store[match[1]] })
      }
      if ((match = path.match(new RegExp(`^/${kind}/([^/]+)$`))) && req.method === 'DELETE') {
        delete store[match[1]]
        return json(200, { success: true })
      }
      if ((match = path.match(new RegExp(`^/mcp/([^/]+)/${kind}/([^/]+)$`)))) {
        const list = state.servers[match[1]][`${kind}Ids`]
        if (req.method === 'POST' && !list.includes(match[2])) list.push(match[2])
        if (req.method === 'DELETE') list.splice(list.indexOf(match[2]), 1)
        return json(200, { success: true })
      }
    }
    return json(404, { success: false, message: `no route ${req.method} ${path}` })
  })
  const port = await listen(server)
  origin = `http://127.0.0.1:${port}`
  return { server, origin, state, seen }
}

const DEFINITION = {
  name: 'TaskPad',
  slug: 'taskpad',
  instructions: 'TaskPad is a task tracker.',
  login: { mode: 'api-key', validationUrl: 'https://api.taskpad.test/me' },
  tools: [
    {
      name: 'list_tasks',
      description: 'Lists tasks.',
      api: { url: 'https://api.taskpad.test/todos', method: 'GET', tokenPrefix: 'Bearer' },
      inputSchema: { type: 'object', properties: { userId: { type: 'number' } }, required: ['userId'] }
    },
    {
      name: 'create_task',
      description: 'Adds a task.',
      api: { url: 'https://api.taskpad.test/todos', method: 'POST', tokenPrefix: 'Bearer' }
    }
  ],
  skills: [{ name: 'daily_review', description: 'Plan the day.', content: '# Daily review' }],
  prompts: [
    { name: 'plan_my_day', description: 'Plan.', arguments: [{ name: 'user_id', required: true }], content: 'Plan for {{user_id}}' }
  ]
}

function runMcp(args, fake, mcp, dir) {
  const env = {
    ...process.env,
    VIASOCKET_OAUTH_RESOURCE: `${fake.origin}/mcp`,
    VIASOCKET_WHOAMI_URL: `${fake.origin}/whoami`,
    VIASOCKET_API_URL: fake.origin,
    VIASOCKET_MCP_API_URL: `${mcp.origin}/api`
  }
  const child = spawn(process.execPath, [bin, 'mcp', '--no-open', '--env', join(dir, '.env'), ...args], {
    env,
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const output = { text: '' }
  child.stdout.on('data', (chunk) => (output.text += chunk))
  child.stderr.on('data', (chunk) => (output.text += chunk))
  return { exited: new Promise((resolve) => child.on('exit', resolve)), output }
}

test('mcp mints the MCP token from the agent token, creates the server, tools, skill and prompt, keeps the ids, and tests the URL', async (t) => {
  const fake = await fakeServer()
  const mcp = await fakeMcp()
  t.after(() => fake.server.close())
  t.after(() => mcp.server.close())
  const dir = dirname(tempEnv('VIASOCKET_AGENT_TOKEN=tok_abc\n'))
  writeFileSync(join(dir, 'viasocket.mcp.json'), JSON.stringify(DEFINITION))

  const first = runMcp([], fake, mcp, dir)
  assert.equal(await first.exited, 0, first.output.text)
  assert.match(readFileSync(join(dir, '.env'), 'utf8'), /^VIASOCKET_MCP_TOKEN=mcp_tok$/m)
  assert.match(
    first.output.text,
    /server created; tool list_tasks created; tool create_task created; skill daily_review created; prompt plan_my_day created\./
  )
  const ids = JSON.parse(readFileSync(join(dir, 'viasocket.mcp.ids.json'), 'utf8'))
  assert.ok(ids.server && ids.tools.list_tasks && ids.tools.create_task && ids.skills.daily_review && ids.prompts.plan_my_day)
  assert.equal(ids.url, `${mcp.origin}/connector/taskpad`)
  const created = mcp.state.servers[ids.server]
  assert.equal(created.slug, 'taskpad')
  assert.equal(created.isAuthenticationEnabled, true)
  assert.deepEqual(created.externalAuth, { validationUrl: 'https://api.taskpad.test/me', headerName: 'Authorization', method: 'GET' })
  assert.equal(created.branding.instructions, 'TaskPad is a task tracker.')
  const tool = mcp.state.tools[ids.tools.list_tasks]
  assert.equal(tool.type, 'custom')
  assert.equal(tool.title, 'list_tasks')
  assert.deepEqual(tool.apiConfig, { url: 'https://api.taskpad.test/todos', method: 'GET', tokenPrefix: 'Bearer' })
  assert.equal(tool.payload.inputSchema.required[0], 'userId')
  // the login is on, so tools/list without a token is a 401, and the command says so instead of failing
  assert.match(first.output.text, /answered 401: right, the login is on/)
  assert.match(first.output.text, /MCP URL: .*\/connector\/taskpad/)
  assert.ok(!first.output.text.includes('mcp_tok') && !first.output.text.includes('tok_abc'), 'a token was printed')

  // a rerun with one tool and the prompt gone updates in place, removes the extras, and the token lets it call a tool
  const smaller = { ...DEFINITION, tools: [DEFINITION.tools[0]], prompts: [] }
  writeFileSync(join(dir, 'viasocket.mcp.json'), JSON.stringify(smaller))
  const second = runMcp(['--token', 'agt_1', '--call', 'list_tasks', '--args', '{"userId":7}'], fake, mcp, dir)
  assert.equal(await second.exited, 0, second.output.text)
  assert.match(
    second.output.text,
    /server updated; tool list_tasks updated; tool create_task removed .*; skill daily_review updated; prompt plan_my_day removed/
  )
  assert.equal(Object.keys(mcp.state.tools).length, 1)
  assert.equal(Object.keys(mcp.state.prompts).length, 0)
  assert.match(second.output.text, /tools\/list: 2 tools \(list_tasks, daily_review\)\./)
  assert.match(second.output.text, /"forwarded":"Bearer agt_1"/)
  assert.match(second.output.text, /"userId":7/)
  const again = JSON.parse(readFileSync(join(dir, 'viasocket.mcp.ids.json'), 'utf8'))
  assert.equal(again.server, ids.server, 'a second server was created')
  assert.equal(again.tools.list_tasks, ids.tools.list_tasks, 'the tool was recreated')
  assert.equal(again.tools.create_task, undefined)
  assert.equal(mcp.seen.requests.filter((request) => request.path === '/api/mcp' && request.method === 'POST').length, 1)
})

test('mcp refuses a bad definition by key before creating anything, and reads ${ENV} from the env file', async (t) => {
  const fake = await fakeServer()
  const mcp = await fakeMcp()
  t.after(() => fake.server.close())
  t.after(() => mcp.server.close())
  const dir = dirname(tempEnv('VIASOCKET_AGENT_TOKEN=tok_abc\nVIASOCKET_MCP_TOKEN=mcp_tok\nTASKPAD_SECRET=s3\n'))

  writeFileSync(join(dir, 'viasocket.mcp.json'), JSON.stringify({ ...DEFINITION, tools: [{ ...DEFINITION.tools[0], name: 'List Tasks' }] }))
  const bad = runMcp([], fake, mcp, dir)
  assert.equal(await bad.exited, 1)
  assert.match(bad.output.text, /tools\[0\]\.name must be snake_case/)
  assert.equal(Object.keys(mcp.state.servers).length, 0, 'created a server from a bad definition')

  writeFileSync(
    join(dir, 'viasocket.mcp.json'),
    JSON.stringify({
      ...DEFINITION,
      login: {
        mode: 'oauth',
        validationUrl: 'https://x.test/me',
        loginUrl: 'https://x.test/a',
        tokenUrl: 'https://x.test/t',
        clientId: 'c',
        clientSecret: '${TASKPAD_SECRET}'
      }
    })
  )
  const oauth = runMcp([], fake, mcp, dir)
  assert.equal(await oauth.exited, 0, oauth.output.text)
  assert.equal(Object.values(mcp.state.servers)[0].externalAuth.clientSecret, 's3')
  assert.ok(!oauth.output.text.includes('s3'), 'the secret was printed')
  assert.equal(fake.seen.authorize, null, 'signed in although both tokens worked')

  writeFileSync(
    join(dir, 'viasocket.mcp.json'),
    JSON.stringify({
      ...DEFINITION,
      login: {
        mode: 'oauth',
        validationUrl: 'https://x.test/me',
        loginUrl: 'https://x.test/a',
        tokenUrl: 'https://x.test/t',
        clientId: 'c',
        clientSecret: '${MISSING_SECRET}'
      }
    })
  )
  const missing = runMcp([], fake, mcp, dir)
  assert.equal(await missing.exited, 1)
  assert.match(missing.output.text, /login\.clientSecret needs MISSING_SECRET/)
})

test('mcp moves an ids-only viasocket.mcp.json of the earlier layout, keeps the slug from its URL, and the next run updates that server', async (t) => {
  const fake = await fakeServer()
  const mcp = await fakeMcp()
  t.after(() => fake.server.close())
  t.after(() => mcp.server.close())
  const dir = dirname(tempEnv('VIASOCKET_AGENT_TOKEN=tok_abc\nVIASOCKET_MCP_TOKEN=mcp_tok\n'))

  // the server a product made by hand, before the mcp command
  writeFileSync(join(dir, 'viasocket.mcp.json'), JSON.stringify(DEFINITION))
  const first = runMcp([], fake, mcp, dir)
  assert.equal(await first.exited, 0, first.output.text)
  const ids = JSON.parse(readFileSync(join(dir, 'viasocket.mcp.ids.json'), 'utf8'))
  writeFileSync(
    join(dir, 'viasocket.mcp.json'),
    JSON.stringify({ tools: ids.tools, mcpServerId: ids.server, url: `${mcp.origin}/connector/taskpad`, skillId: ids.skills.daily_review })
  )
  rmSync(join(dir, 'viasocket.mcp.ids.json'))

  const moved = runMcp([], fake, mcp, dir)
  assert.equal(await moved.exited, 1)
  assert.match(moved.output.text, /Moved it to viasocket\.mcp\.ids\.json, so the next run updates server/)
  assert.match(moved.output.text, /with "slug": "taskpad" to keep the URL/)
  assert.equal(JSON.parse(readFileSync(join(dir, 'viasocket.mcp.ids.json'), 'utf8')).server, ids.server)
  assert.ok(!existsSync(join(dir, 'viasocket.mcp.json')))

  // the definition comes back: same server, same tools, and the skill on the server is found by its name
  writeFileSync(join(dir, 'viasocket.mcp.json'), JSON.stringify(DEFINITION))
  const after = runMcp([], fake, mcp, dir)
  assert.equal(await after.exited, 0, after.output.text)
  assert.match(after.output.text, /server updated; tool list_tasks updated; tool create_task updated; skill daily_review updated/)
  assert.equal(Object.keys(mcp.state.servers).length, 1)
  assert.equal(Object.keys(mcp.state.skills).length, 1, 'the skill was made twice')
  assert.equal(JSON.parse(readFileSync(join(dir, 'viasocket.mcp.ids.json'), 'utf8')).skills.daily_review, ids.skills.daily_review)
})
