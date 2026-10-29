#!/usr/bin/env node
/* global process, console, fetch, AbortSignal, URL, URLSearchParams, setTimeout */
/**
 * viasocket-login.mjs — signs in to viaSocket from the command line and sets up .env.
 *
 *   curl -fsSL https://flow.viasocket.com/viasocket-login.mjs -o viasocket-login.mjs
 *   node viasocket-login.mjs login [--env .env] [--no-open] [--timeout 300]
 *   node viasocket-login.mjs setup [--env .env] [--project <id> | --new] [--name <title>] [--no-open] [--timeout 300]
 *   node viasocket-login.mjs mcp [--file viasocket.mcp.json] [--ids viasocket.mcp.ids.json] [--call <tool> --args <json> --token <t>]
 *
 * The same commands ship in the viasocket-apps package: `npx viasocket-apps login` / `setup` / `mcp`.
 *
 * `login` is the OAuth 2.0 sign-in the viaSocket MCP uses (authorization code with PKCE, a client
 * registered on the spot): the command listens on a random port of 127.0.0.1, opens viaSocket's
 * authorize page in your browser — sign in, pick the workspace, click Allow — and the page sends
 * the code back to that port. The command swaps the code for the token, writes it to .env as
 * VIASOCKET_AGENT_TOKEN with VIASOCKET_ORG_ID, and prints the workspace. Nothing here prints a secret.
 *
 * `setup` is `login` (skipped when .env already holds a working token) plus what a product needs:
 * the workspace's one embed project — reused when there is one, created when there is none, asked
 * for with --project when there are several — and the workspace's embed signing secret, written as
 * VIASOCKET_PROJECT_ID and VIASOCKET_EMBED_SECRET. It never touches billing, limits or settings of
 * an existing project.
 *
 * `mcp` creates or updates the product's own MCP server on mcp.viasocket.com from one JSON file (the
 * server, its login, its tools, skills and prompts), keeps every id it made in an ids file so a rerun
 * updates instead of duplicating, and tests the URL with tools/list. It mints VIASOCKET_MCP_TOKEN
 * from the agent token (signing in first when .env has none) and keeps it in .env.
 *
 * No dependencies, Node 18+. Exit code 0 when .env is written, 1 when sign-in or a call failed,
 * 2 on bad usage, 3 when `setup` needs --project because the workspace has several embeds.
 */
import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const TOKEN_ENV = 'VIASOCKET_AGENT_TOKEN'
const ORG_ENV = 'VIASOCKET_ORG_ID'
const PROJECT_ENV = 'VIASOCKET_PROJECT_ID'
const SECRET_ENV = 'VIASOCKET_EMBED_SECRET'
/** The MCP server; its protected-resource metadata names the authorization server. */
const RESOURCE = process.env.VIASOCKET_OAUTH_RESOURCE || 'https://connect.viasocket.com/mcp'
/** Answers the org the token belongs to; the skill's agent-access page names the same call. */
const WHOAMI_URL = process.env.VIASOCKET_WHOAMI_URL || 'https://flow.sokt.io/func/scriDAYtpykg'
/** The dashboard's API: embed projects and the signing secret, with the token bare in Authorization. */
const API = (process.env.VIASOCKET_API_URL || 'https://flow-api.viasocket.com').replace(/\/+$/, '')
const DASHBOARD = 'https://flow.viasocket.com/agent-access'
const MCP_TOKEN_ENV = 'VIASOCKET_MCP_TOKEN'
/** The MCP server's management API; the servers it hosts are at the same host. */
const MCP_API = (process.env.VIASOCKET_MCP_API_URL || 'https://mcp.viasocket.com/api').replace(/\/+$/, '')
const MCP_HOST = MCP_API.replace(/\/api$/, '')

function usage(code) {
  console.log(
    [
      'usage: node viasocket-login.mjs <login | setup | mcp> [options]',
      '',
      '  login             sign in; writes VIASOCKET_AGENT_TOKEN and VIASOCKET_ORG_ID',
      '  setup             login if needed, then the embed project and signing secret a product needs:',
      '                    writes VIASOCKET_PROJECT_ID and VIASOCKET_EMBED_SECRET too',
      "  mcp               create or update the product's MCP server from viasocket.mcp.json, then test it",
      '',
      '  --file <file>     mcp: the definition (default viasocket.mcp.json)',
      '  --ids <file>      mcp: where the ids of what it made are kept (default viasocket.mcp.ids.json)',
      '  --call <tool>     mcp: after the sync, call this tool on the URL with --args <json> and, on a login server, --token <t>',
      '  --env <file>      the env file (default .env in the current folder)',
      '  --project <id>    setup: which embed project, when the workspace has several',
      '  --new             setup: a new embed project for this product, even when the workspace has others',
      '  --name <title>    setup: the name for the embed project it creates when there is none (default: this folder)',
      '  --no-open         print the URL instead of opening a browser (a remote shell, a sandbox)',
      '  --timeout <s>     how long to wait for the browser (default 300)',
      '  -h, --help        this text'
    ].join('\n')
  )
  process.exit(code)
}

function parseArgs(argv) {
  const options = {
    command: 'login',
    env: '.env',
    open: true,
    timeout: 300,
    project: '',
    newProject: false,
    name: '',
    file: 'viasocket.mcp.json',
    ids: 'viasocket.mcp.ids.json',
    call: '',
    args: '{}',
    token: ''
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      const value = argv[++i]
      if (value === undefined) usage(2)
      return value
    }
    if (arg === 'login' || arg === 'setup' || arg === 'mcp') options.command = arg
    else if (arg === '--env') options.env = next()
    else if (arg === '--file') options.file = next()
    else if (arg === '--ids') options.ids = next()
    else if (arg === '--call') options.call = next()
    else if (arg === '--args') options.args = next()
    else if (arg === '--token') options.token = next()
    else if (arg === '--project') options.project = next()
    else if (arg === '--new') options.newProject = true
    else if (arg === '--name') options.name = next()
    else if (arg === '--no-open') options.open = false
    else if (arg === '--timeout') options.timeout = Number(next())
    else if (arg === '-h' || arg === '--help') usage(0)
    else {
      console.error(`unknown option: ${arg}`)
      usage(2)
    }
  }
  if (!Number.isFinite(options.timeout) || options.timeout <= 0) usage(2)
  return options
}

/** Opens `url` in the default browser; a failure is not an error, the URL is printed anyway. */
function openBrowser(url) {
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url.replace(/&/g, '^&')]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]]
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true })
    child.on('error', () => {})
    child.unref()
  } catch {
    /* printed below */
  }
}

// ---- the env file ---------------------------------------------------------------------------------

const envLines = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : [])
const keyOf = (line) =>
  line
    .replace(/^export\s+/, '')
    .split('=')[0]
    .trim()

/** The value of `key` in the env file, unquoted, or '' when absent. */
function getEnv(file, key) {
  const line = envLines(file).find((entry) => keyOf(entry) === key)
  if (!line) return ''
  return line
    .slice(line.indexOf('=') + 1)
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2')
}

/** Sets `key=value` in the env file: replaces the line if there is one, appends otherwise. */
function setEnv(file, key, value) {
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const eol = existing.includes('\r\n') ? '\r\n' : '\n'
  const lines = existing.split(/\r?\n/)
  while (lines.length && lines[lines.length - 1] === '') lines.pop() // the trailing newline, re-added below
  const index = lines.findIndex((entry) => keyOf(entry) === key)
  if (index >= 0) lines[index] = `${key}=${value}`
  else lines.push(`${key}=${value}`)
  writeFileSync(file, `${lines.join(eol)}${eol}`)
}

/** Says so when the env file sits in a git repository and is not ignored: it holds secrets and would be committed. */
function warnIfNotIgnored(file) {
  const result = spawnSync('git', ['check-ignore', '-q', file], { cwd: dirname(file), stdio: 'ignore' })
  // 0 ignored, 1 not ignored, 128 not a repository (or no git): only 1 is a problem
  if (result.status === 1)
    console.error(`Warning: ${file} is not git-ignored. Add it to .gitignore before the next commit: it holds secrets.`)
}

// ---- the sign-in ----------------------------------------------------------------------------------

const getJson = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response.json()
}

/**
 * The authorization server behind the MCP, found the way an MCP client finds it: the resource's
 * metadata names the server, the server's metadata (RFC 8414, path-aware) names its endpoints.
 */
async function discover(resource) {
  const resourceUrl = new URL(resource)
  const protectedResource = await getJson(`${resourceUrl.origin}/.well-known/oauth-protected-resource${resourceUrl.pathname}`)
  const issuer = protectedResource?.authorization_servers?.[0]
  if (!issuer) throw new Error(`no authorization server in ${resourceUrl.origin}'s metadata`)
  const issuerUrl = new URL(issuer)
  const path = issuerUrl.pathname.replace(/\/$/, '')
  const metadata = await getJson(`${issuerUrl.origin}/.well-known/oauth-authorization-server${path}`)
  for (const key of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint'])
    if (!metadata?.[key]) throw new Error(`the authorization server has no ${key}`)
  return metadata
}

/** A client for this run only: the server registers it, so nothing is shipped in this file. */
async function registerClient(registrationEndpoint, redirectUri) {
  const response = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'viasocket-apps login',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    }),
    signal: AbortSignal.timeout(15000)
  })
  const client = await response.json().catch(() => null)
  if (!response.ok || !client?.client_id) throw new Error(`client registration answered ${response.status}`)
  return client
}

const base64url = (buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Swaps the code for the token; the client secret goes along only when the server issued one. */
async function exchangeCode({ tokenEndpoint, client, code, redirectUri, verifier, resource }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: client.client_id,
    code_verifier: verifier,
    resource
  })
  if (client.client_secret) body.set('client_secret', client.client_secret)
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15000)
  })
  const token = await response.json().catch(() => null)
  if (!response.ok || typeof token?.access_token !== 'string')
    throw new Error(`the token endpoint answered ${response.status}${token?.error ? `: ${token.error}` : ''}`)
  return token
}

/** The org the token belongs to, with the header the skill uses (the bare token), or null when refused. */
async function whoami(token) {
  try {
    const response = await fetch(WHOAMI_URL, { headers: { Authorization: token }, signal: AbortSignal.timeout(15000) })
    if (!response.ok) return null
    // Live shape: { user_id, org: { id }, company_id, viasocket_token, iat }; the others are tolerated.
    const body = await response.json()
    const id = body?.org?.id ?? body?.data?.org?.id ?? body?.data?.id ?? body?.id
    const name = body?.org?.name ?? body?.data?.name ?? body?.name
    return id || name ? { id: id ? String(id) : '', name: name ? String(name) : '' } : null
  } catch {
    return null
  }
}

const page = (title, text) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;margin:3em auto;max-width:34em;text-align:center"><h1>${title}</h1><p>${text}</p></body>`

/** Listens on 127.0.0.1 for the browser's redirect; resolves with the code, or null on timeout or refusal. */
function waitForCode({ state, timeout, onReady }) {
  // onReady gets the port and a `fail` that closes the listener and resolves null (registration failed).
  return new Promise((resolveCode) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url, 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        response.writeHead(404, { 'Content-Type': 'text/plain' })
        response.end('viasocket login is waiting for the browser.\n')
        return
      }
      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      const good = Boolean(code) && url.searchParams.get('state') === state
      response.writeHead(good ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(
        good
          ? page('Signed in', 'You can close this tab and go back to your terminal.')
          : page('Sign-in failed', error ? `viaSocket answered: ${error}.` : 'The reply did not match this sign-in. Run the command again.')
      )
      if (good || error) {
        server.close()
        resolveCode(good ? code : null)
      }
    })
    const fail = () => {
      server.close()
      resolveCode(null)
    }
    server.listen(0, '127.0.0.1', () => onReady(server.address().port, fail))
    setTimeout(() => {
      server.close()
      resolveCode(null)
    }, timeout * 1000).unref()
  })
}

/** The whole sign-in: returns the access token, or null after printing why. */
async function signIn(options) {
  const metadata = await discover(RESOURCE)
  const state = randomBytes(16).toString('hex')
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())

  let redirectUri = ''
  let client = null
  let registrationFailed = false
  const code = await waitForCode({
    state,
    timeout: options.timeout,
    onReady: async (port, fail) => {
      redirectUri = `http://127.0.0.1:${port}/callback`
      try {
        client = await registerClient(metadata.registration_endpoint, redirectUri)
      } catch (error) {
        console.error(error.message)
        registrationFailed = true
        fail()
        return
      }
      const url = new URL(metadata.authorization_endpoint)
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: client.client_id,
        redirect_uri: redirectUri,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        resource: RESOURCE
      }).toString()
      console.log(`Sign in to viaSocket, pick the workspace and click Allow (waiting ${options.timeout}s):\n\n  ${url}\n`)
      if (options.open) openBrowser(url.toString())
    }
  })
  if (!code) {
    if (registrationFailed) return null
    console.error(
      `No sign-in arrived in ${options.timeout}s. Run the command again, or copy the token from ${DASHBOARD} into ${options.env} as ${TOKEN_ENV}.`
    )
    return null
  }
  const token = await exchangeCode({ tokenEndpoint: metadata.token_endpoint, client, code, redirectUri, verifier, resource: RESOURCE })
  return token.access_token
}

/** A working token and its org: the one in .env when it still works, else a fresh sign-in. */
async function ensureToken(options, envFile) {
  const saved = getEnv(envFile, TOKEN_ENV)
  if (saved) {
    const org = await whoami(saved)
    if (org) return { token: saved, org, fresh: false }
    console.log(`The ${TOKEN_ENV} in ${options.env} no longer works; signing in again.`)
  }
  const token = await signIn(options)
  if (!token) return null
  const org = await whoami(token)
  setEnv(envFile, TOKEN_ENV, token)
  if (org?.id) setEnv(envFile, ORG_ENV, org.id)
  if (!org)
    console.error(
      `Warning: viaSocket's workspace check refused this token. Saved it anyway; report it to viaSocket if the agent's calls fail.`
    )
  return { token, org, fresh: true }
}

// ---- the product's embed project and secret --------------------------------------------------------

/** One dashboard API call with the token bare in Authorization; the envelope's `data`, or a thrown status. */
async function api(token, method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: token, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  })
  const json = await response.json().catch(() => null)
  if (!response.ok || json?.success === false)
    throw new Error(`${method} ${path} answered ${response.status}${json?.message ? `: ${json.message}` : ''}`)
  return json?.data
}

/**
 * The body every new embed is created with: the same defaults the dashboard's "Create embed" uses
 * (`universal`, `appsApi`, a webhook placeholder connector, the prebuilt UI's default config).
 * Nothing about billing or limits: those stay at the workspace's defaults.
 */
const NEW_EMBED_SETTINGS = {
  serviceType: 'trigger',
  serviceName: 'webhook',
  serviceId: 'webhook',
  permittedEvents: 'all',
  unpermittedEvents: [],
  response: { status: 'notdefined', type: 'custom' },
  config: {
    buttonName: 'Integrations',
    buttonType: 'custom',
    height: '100',
    heightUnit: '%',
    widthUnit: '%',
    width: '100',
    type: 'all_space',
    showEnabled: true,
    filterTrigger: false,
    filterAction: false,
    showServices: true,
    directFlow: false,
    featuredCombinations: {},
    featuredCombinationType: 'default',
    chatbot: false,
    filteredServices: {},
    categories: [],
    universal: true,
    appsApi: true
  }
}

/** The embed project to use: --project, the one already in .env, the workspace's only one, or a new one. */
async function chooseProject({ token, orgId, options, envFile }) {
  const list = await api(token, 'GET', `/orgs/${orgId}/projects?type=embed`)
  const projects = (list?.projects || []).filter((project) => project.status !== 0 && project.status !== '0')
  const byId = (id) => projects.find((project) => String(project.id) === String(id))
  if (options.project) {
    const chosen = byId(options.project)
    if (!chosen) throw new Error(`no embed project ${options.project} in workspace ${orgId}`)
    return { project: chosen, how: 'chosen with --project' }
  }
  const saved = getEnv(envFile, PROJECT_ENV)
  if (!options.newProject && saved && byId(saved)) return { project: byId(saved), how: `already in ${options.env}` }
  if (!options.newProject && projects.length === 1) return { project: projects[0], how: "the workspace's only embed" }
  if (options.newProject || projects.length === 0) {
    const title = (options.name || basename(process.cwd()) || 'Integrations').slice(0, 50)
    const created = await api(token, 'POST', `/orgs/${orgId}/projects`, {
      title,
      org_id: orgId,
      type: 'embed',
      settings: NEW_EMBED_SETTINGS
    })
    const id = created?.id || created?.payload?.id
    if (!id) throw new Error('the project was created but its id was not in the reply')
    return { project: { id, title }, how: 'created' }
  }
  console.error(
    `Workspace ${orgId} has ${projects.length} embed projects. Run again with --project <id>, one of these, or --new for a new one:`
  )
  for (const project of projects) console.error(`  ${project.id}  ${project.title || ''}`)
  process.exitCode = 3
  return null
}

/**
 * The embed signing secret: the project's own (created when the project has none), or, on a backend
 * without the per-project route, the workspace's (a bare string). The API's middleware turns
 * `data: null` into `{}`, so "no secret yet" arrives as an empty object.
 */
async function embedSecret(token, orgId, projectId) {
  try {
    const existing = await api(token, 'GET', `/projects/${projectId}/secret`)
    const secret = existing?.secret || (await api(token, 'POST', `/projects/${projectId}/secret`))?.secret
    if (typeof secret !== 'string' || !secret) throw new Error(`the project's secret endpoint answered without a secret`)
    return { secret, scope: 'project' }
  } catch (error) {
    if (!/answered 404/.test(error?.message || '')) throw error
  }
  const data = await api(token, 'GET', `/orgs/${orgId}/token`)
  const secret = typeof data === 'string' ? data : data?.secret || data?.token
  if (typeof secret !== 'string' || !secret)
    throw new Error('the workspace has no embed signing secret; create one on the embed’s Install Code page')
  return { secret, scope: 'workspace' }
}

// ---- the product's MCP server ----------------------------------------------------------------------

/** One management API call with the MCP token; the envelope's `data`, or a thrown status. */
async function mcpApi(token, method, path, body) {
  const response = await fetch(`${MCP_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  })
  const json = await response.json().catch(() => null)
  if (!response.ok || json?.success === false) {
    const reason = json?.message || json?.error
    const error = new Error(`${method} ${path} answered ${response.status}${reason ? `: ${reason}` : ''}`)
    error.status = response.status
    throw error
  }
  return json?.data
}

/** The MCP token: the one in .env while it works, else a new one minted with the agent token (signing in first if needed). */
async function ensureMcpToken(options, envFile) {
  const saved = getEnv(envFile, MCP_TOKEN_ENV)
  if (saved) {
    const works = await mcpApi(saved, 'GET', '/mcp').then(
      () => true,
      (error) => error.status !== 401
    )
    if (works) return saved
    console.log(`The ${MCP_TOKEN_ENV} in ${options.env} has expired; getting a new one.`)
  }
  const ensured = await ensureToken(options, envFile)
  if (!ensured) return null
  const minted = await api(ensured.token, 'GET', '/mcp/agent-token')
  if (typeof minted?.token !== 'string' || !minted.token) throw new Error('viaSocket answered without an MCP token')
  setEnv(envFile, MCP_TOKEN_ENV, minted.token)
  return minted.token
}

/** `${NAME}` in any string of the definition is read from the environment or the env file; a missing one is an error. */
function fillEnv(value, envFile, path = '') {
  if (typeof value === 'string')
    return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, name) => {
      const found = process.env[name] ?? getEnv(envFile, name)
      if (!found) throw new Error(`${path || 'the definition'} needs ${name}, which is neither in the environment nor in the env file`)
      return found
    })
  if (Array.isArray(value)) return value.map((item, index) => fillEnv(item, envFile, `${path}[${index}]`))
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fillEnv(item, envFile, path ? `${path}.${key}` : key)]))
  return value
}

const MCP_NAME = /^[a-z0-9_]{1,45}$/
const MCP_SLUG = /^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])$/
const MCP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

/**
 * The skill's MCP page before 2026-10-29.2 told products to keep the ids of a server made by hand in
 * viasocket.mcp.json: `{ "server" (or "mcpServerId"): "<_id>", "slug", "url", "tools": { "<name>": "<_id>" } }`.
 * Such a file is the ids file under the old name: its ids, in the ids file's shape, or null for a definition.
 */
function legacyIds(raw) {
  const server = raw?.server ?? raw?.mcpServerId
  const tools = raw?.tools
  const toolIds = Boolean(tools) && typeof tools === 'object' && !Array.isArray(tools)
  // A definition has no server id, and its tools are a list of objects, never names mapped to ids.
  const namedIds = toolIds && Object.keys(tools).length > 0 && Object.values(tools).every((id) => typeof id === 'string')
  if (typeof server !== 'string' && !namedIds) return null
  const ids = { ...raw, tools: toolIds ? tools : {} }
  delete ids.mcpServerId
  if (typeof server === 'string') ids.server = server
  return ids
}

/** An ids-only definition file: moved to the ids file when there is none, so the next run updates that server instead of making a second. */
function moveLegacyIds(file, ids, options) {
  const idsFile = resolve(process.cwd(), options.ids)
  const what = `${options.file} holds the ids of a server made before the mcp command (the MCP page's earlier layout), not a definition`
  if (existsSync(idsFile)) {
    const other = JSON.parse(readFileSync(idsFile, 'utf8'))
    throw new Error(
      `${what}, and ${options.ids} exists too (server ${other.server || 'none'}; ${options.file} names ${ids.server || 'none'}). ` +
        `Keep the ids of the server the product's users have in ${options.ids}, then replace ${options.file} with the definition the MCP page shows, and rerun.`
    )
  }
  const slug = ids.slug || /\/connector\/([^/?#]+)/.exec(String(ids.url || ''))?.[1]
  if (!ids.server)
    throw new Error(
      `${what}, without the server's id. Move it to ${options.ids} with "server": "<the server's _id>", then write the definition the MCP page shows in ${options.file}, and rerun.`
    )
  writeFileSync(idsFile, `${JSON.stringify(ids, null, 2)}\n`)
  unlinkSync(file)
  throw new Error(
    [
      `${what}. Moved it to ${options.ids}, so the next run updates server ${ids.server} instead of creating a second one.`,
      `Now write the definition in ${options.file} as the MCP page shows${slug ? `, with "slug": "${slug}" to keep the URL` : ''}, and rerun.`,
      `A tool of ${options.ids} that the definition does not name is removed on that run; use the same tool names to keep them.`,
      `Skills and prompts the server already has are kept when the definition uses their names.`
    ].join('\n')
  )
}

/** The definition file, checked: what is wrong is said by its key, before anything is created. */
function readDefinition(options, envFile) {
  const file = resolve(process.cwd(), options.file)
  if (!existsSync(file)) throw new Error(`no definition at ${file}; write one as the skill's MCP page shows, or pass --file`)
  let raw
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${options.file} is not valid JSON: ${error.message}`)
  }
  const legacy = legacyIds(raw)
  if (legacy) moveLegacyIds(file, legacy, options)
  const definition = fillEnv(raw, envFile)
  const fail = (what) => {
    throw new Error(`${options.file}: ${what}`)
  }
  if (!definition.name || typeof definition.name !== 'string') fail('"name" (the product, shown to users) is required')
  if (definition.slug !== undefined && !MCP_SLUG.test(String(definition.slug)))
    fail('"slug" must be 2 to 63 lowercase letters, digits, _ or -, starting and ending with a letter or digit')
  const login = definition.login || { mode: 'none' }
  if (!['none', 'api-key', 'oauth'].includes(login.mode)) fail('"login.mode" must be "none", "api-key" or "oauth"')
  if (login.mode !== 'none' && !login.validationUrl)
    fail('"login.validationUrl" (an endpoint that answers 200 for a valid token) is required')
  if (login.mode === 'oauth')
    for (const key of ['loginUrl', 'tokenUrl', 'clientId', 'clientSecret'])
      if (!login[key]) fail(`"login.${key}" is required for an OAuth login (use "\${ENV_NAME}" for the secret)`)
  if (login.method && !['GET', 'POST'].includes(login.method)) fail('"login.method" must be GET or POST')
  const tools = definition.tools || []
  if (!Array.isArray(tools) || !tools.length) fail('"tools" needs at least one tool')
  const names = new Set()
  tools.forEach((tool, index) => {
    const at = `tools[${index}]`
    if (!MCP_NAME.test(String(tool.name || ''))) fail(`${at}.name must be snake_case, at most 45 characters`)
    if (names.has(tool.name)) fail(`${at}.name "${tool.name}" is used twice`)
    names.add(tool.name)
    if (!tool.description) fail(`${at}.description (one sentence on when the AI should use it) is required`)
    if (!tool.api?.url || !/^https:\/\//.test(tool.api.url)) fail(`${at}.api.url must be an https URL of the product's API`)
    if (tool.api.method && !MCP_METHODS.includes(String(tool.api.method).toUpperCase()))
      fail(`${at}.api.method must be one of ${MCP_METHODS.join(', ')}`)
    if (tool.inputSchema && (typeof tool.inputSchema !== 'object' || tool.inputSchema.type !== 'object'))
      fail(`${at}.inputSchema must be a JSON Schema object with "type": "object"`)
    const headerNames = Object.keys(tool.api.headers || {}).map((name) => name.toLowerCase())
    if (login.mode !== 'none' && headerNames.includes((tool.api.tokenHeader || 'Authorization').toLowerCase()))
      fail(`${at}.api.headers sets the token header itself, so the user's token would never reach it; drop that header or set tokenHeader`)
  })
  ;(definition.skills || []).forEach((skill, index) => {
    const at = `skills[${index}]`
    if (!MCP_NAME.test(String(skill.name || ''))) fail(`${at}.name must be snake_case, at most 45 characters`)
    if (!skill.description) fail(`${at}.description (one sentence on when to load it) is required`)
    if (!skill.content && !skill.file) fail(`${at} needs "content" (markdown) or "file" (a markdown file next to the definition)`)
    if (skill.file) {
      const skillFile = resolve(file, '..', skill.file)
      if (!existsSync(skillFile)) fail(`${at}.file ${skill.file} does not exist`)
      skill.content = readFileSync(skillFile, 'utf8')
    }
  })
  ;(definition.prompts || []).forEach((prompt, index) => {
    const at = `prompts[${index}]`
    if (!MCP_NAME.test(String(prompt.name || ''))) fail(`${at}.name must be snake_case, at most 45 characters`)
    if (!prompt.content) fail(`${at}.content (the request, with {{argument}} placeholders) is required`)
    for (const argument of prompt.arguments || [])
      if (!argument?.name || !prompt.content.includes(`{{${argument.name}}}`))
        fail(`${at}: argument "${argument?.name}" is not used as {{${argument?.name}}} in content`)
  })
  return { ...definition, login, tools, skills: definition.skills || [], prompts: definition.prompts || [] }
}

/** What the management API gets for the server: its login and branding, from the definition's plain words. */
function serverBody(definition) {
  const { login } = definition
  const externalAuth =
    login.mode === 'none'
      ? null
      : {
          validationUrl: login.validationUrl,
          headerName: login.headerName || 'Authorization',
          method: login.method || 'GET',
          ...(login.mode === 'oauth'
            ? { loginUrl: login.loginUrl, tokenUrl: login.tokenUrl, clientId: login.clientId, clientSecret: login.clientSecret }
            : {})
        }
  const branding = {
    name: definition.slug || definition.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title: definition.branding?.title || definition.name,
    ...(definition.branding?.websiteUrl ? { websiteUrl: definition.branding.websiteUrl } : {}),
    ...(definition.branding?.iconUrl ? { iconUrl: definition.branding.iconUrl } : {}),
    ...(definition.instructions ? { instructions: definition.instructions } : {})
  }
  return {
    name: definition.name,
    ...(definition.slug ? { slug: definition.slug } : {}),
    // "always": every request needs the token. "needed" (OAuth only): open to connect; sign-in when a tool's API answers 401.
    isAuthenticationEnabled: login.mode !== 'none' && login.when !== 'needed',
    externalAuth,
    branding
  }
}

/** One JSON-RPC request to the MCP URL, as a client sends it; the result, or a thrown status. */
async function mcpRequest(url, method, params, token) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(40000)
  })
  if (response.status === 401) {
    const error = new Error('401')
    error.status = 401
    throw error
  }
  const text = await response.text()
  const line = text.split(/\r?\n/).find((entry) => entry.startsWith('data:'))
  const message = JSON.parse(line ? line.slice(5).trim() : text)
  if (message.error) throw new Error(`${method} answered an error: ${message.error.message || JSON.stringify(message.error)}`)
  return message.result
}

const ignore404 = (error) => {
  if (error.status !== 404) throw error
}

/** Creates or updates the product's MCP server from the definition; every id goes to the ids file. */
async function syncMcpServer({ token, definition, idsFile, options }) {
  const ids = existsSync(idsFile) ? JSON.parse(readFileSync(idsFile, 'utf8')) : {}
  ids.tools ||= {}
  ids.skills ||= {}
  ids.prompts ||= {}
  const save = () => writeFileSync(idsFile, `${JSON.stringify(ids, null, 2)}\n`)
  const body = serverBody(definition)
  const changes = []

  if (!ids.server) {
    const created = await mcpApi(token, 'POST', '/mcp', {
      name: body.name,
      ...(body.slug ? { slug: body.slug } : {}),
      isAuthenticationEnabled: body.isAuthenticationEnabled,
      ...(body.externalAuth ? { externalAuth: body.externalAuth } : {})
    })
    if (!created?._id) throw new Error('the server was created but its id was not in the reply')
    ids.server = String(created._id)
    ids.url = created.url || `${MCP_HOST}/mcp/${created._id}`
    save()
    changes.push('server created')
  } else changes.push('server updated')
  await mcpApi(token, 'PUT', `/mcp/${ids.server}`, body)
  if (body.slug) ids.url = `${MCP_HOST}/connector/${body.slug}`
  save()

  for (const tool of definition.tools) {
    const known = ids.tools[tool.name]
    const saved = await mcpApi(token, 'POST', '/tool', {
      type: 'custom',
      mcpServerId: ids.server,
      ...(known ? { toolId: known } : {}),
      title: tool.name,
      desc: tool.description,
      apiConfig: { ...tool.api, method: String(tool.api.method || 'POST').toUpperCase() },
      payload: {
        inputSchema: tool.inputSchema || { type: 'object', properties: {} },
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {})
      },
      ...(tool.annotations ? { annotations: tool.annotations } : {})
    })
    if (!saved?._id) throw new Error(`tool ${tool.name} was saved but its id was not in the reply`)
    ids.tools[tool.name] = String(saved._id)
    save()
    changes.push(`tool ${tool.name} ${known ? 'updated' : 'created'}`)
  }
  for (const [name, id] of Object.entries(ids.tools)) {
    if (definition.tools.some((tool) => tool.name === name)) continue
    await mcpApi(token, 'DELETE', `/tool/id/${id}`).catch(ignore404)
    delete ids.tools[name]
    save()
    changes.push(`tool ${name} removed (no longer in ${options.file})`)
  }

  const syncWords = async (kind, items, toBody) => {
    const known = ids[`${kind}s`]
    // A skill or prompt this server already has but the ids file lacks (a lost ids file, or one from the page's earlier
    // layout) is reused by name, so it is updated instead of made twice. Only this server's: another product's skill of
    // the same name is never taken over (skill names are unique in the workspace, so creating one then fails, and says so).
    const onServer = items.some((item) => !known[item.name]) ? await mcpApi(token, 'GET', `/${kind}s/${ids.server}`).catch(() => []) : []
    for (const item of items) {
      if (!known[item.name]) {
        const same = (Array.isArray(onServer) ? onServer : []).find((entry) => entry?.name === item.name && entry?._id)
        if (same) {
          known[item.name] = String(same._id)
          save()
        }
      }
      const payload = toBody(item)
      const existed = Boolean(known[item.name])
      if (existed) await mcpApi(token, 'PUT', `/${kind}/${known[item.name]}`, payload)
      else {
        const created = await mcpApi(token, 'POST', `/${kind}`, payload).catch((error) => {
          if (kind === 'skill' && (error.status === 409 || /exist|unique|duplicate/i.test(error.message)))
            throw new Error(
              `a skill named ${item.name} already exists in this workspace for another server; give this one another name (${error.message})`
            )
          throw error
        })
        if (!created?._id) throw new Error(`${kind} ${item.name} was created but its id was not in the reply`)
        known[item.name] = String(created._id)
        save()
      }
      await mcpApi(token, 'POST', `/mcp/${ids.server}/${kind}/${known[item.name]}`)
      changes.push(`${kind} ${item.name} ${existed ? 'updated' : 'created'}`)
    }
    for (const [name, id] of Object.entries(known)) {
      if (items.some((item) => item.name === name)) continue
      await mcpApi(token, 'DELETE', `/mcp/${ids.server}/${kind}/${id}`).catch(ignore404)
      await mcpApi(token, 'DELETE', `/${kind}/${id}`).catch(ignore404)
      delete known[name]
      save()
      changes.push(`${kind} ${name} removed (no longer in ${options.file})`)
    }
  }
  await syncWords('skill', definition.skills, (skill) => ({ name: skill.name, description: skill.description, content: skill.content }))
  await syncWords('prompt', definition.prompts, (prompt) => ({
    name: prompt.name,
    title: prompt.title || prompt.name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
    description: prompt.description || '',
    arguments: prompt.arguments || [],
    content: prompt.content
  }))
  return { ids, changes }
}

/** The command: sync, then the test every client would do first. */
async function mcpCommand(options, envFile) {
  const definition = readDefinition(options, envFile)
  const token = await ensureMcpToken(options, envFile)
  if (!token) {
    process.exitCode = 1
    return
  }
  const idsFile = resolve(process.cwd(), options.ids)
  const { ids, changes } = await syncMcpServer({ token, definition, idsFile, options })
  console.log(`${changes.join('; ')}.`)
  console.log(`Ids kept in ${idsFile} (commit it; it holds no secret).`)
  warnIfNotIgnored(envFile)

  const loginOn = definition.login.mode !== 'none' && definition.login.when !== 'needed'
  const clientToken = options.token
  let listed = null
  try {
    listed = await mcpRequest(ids.url, 'tools/list', {}, clientToken)
  } catch (error) {
    if (error.status === 401 && loginOn && !clientToken) {
      console.log(
        'tools/list without a token answered 401: right, the login is on. Pass --token <a token your validationUrl accepts> to test the tools.'
      )
    } else {
      console.error(`tools/list on ${ids.url} failed: ${error.message}`)
      process.exitCode = 1
    }
  }
  if (listed) {
    const names = (listed.tools || []).map((tool) => tool.name)
    const missing = definition.tools.map((tool) => tool.name).filter((name) => !names.includes(name))
    console.log(`tools/list: ${names.length} tools (${names.join(', ')})${missing.length ? `; MISSING: ${missing.join(', ')}` : ''}.`)
    if (missing.length) process.exitCode = 1
    if (definition.prompts.length) {
      const prompts = await mcpRequest(ids.url, 'prompts/list', {}, clientToken).catch(() => null)
      console.log(`prompts/list: ${(prompts?.prompts || []).map((prompt) => prompt.name).join(', ') || 'none'}.`)
    }
  }
  if (options.call) {
    let args
    try {
      args = JSON.parse(options.args)
    } catch {
      throw new Error('--args must be JSON, such as {"userId":1}')
    }
    const result = await mcpRequest(ids.url, 'tools/call', { name: options.call, arguments: args }, clientToken)
    const text = (result?.content || []).map((part) => part.text ?? JSON.stringify(part)).join('\n')
    console.log(`tools/call ${options.call}${result?.isError ? ' FAILED' : ''}:\n${text.slice(0, 2000)}`)
    if (result?.isError) process.exitCode = 1
  }
  console.log(`\nMCP URL: ${ids.url}`)
  console.log(
    loginOn && definition.login.mode === 'api-key'
      ? 'Users add it with the header Authorization: Bearer <their key>. Claude.ai and ChatGPT connectors have no header setting: they need an OAuth login.'
      : loginOn
        ? "Users add it to Claude, ChatGPT, Cursor or Claude Code and sign in with the product's login."
        : 'Users add it to Claude, ChatGPT, Cursor or Claude Code; no sign-in.'
  )
  if (process.exitCode === undefined) process.exitCode = 0
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const envFile = resolve(process.cwd(), options.env)

  if (options.command === 'mcp') return mcpCommand(options, envFile)

  if (options.command === 'login') {
    // An explicit login always signs in: that is how a developer switches workspace.
    const token = await signIn(options)
    if (!token) {
      process.exitCode = 1
      return
    }
    const org = await whoami(token)
    setEnv(envFile, TOKEN_ENV, token)
    if (org?.id) setEnv(envFile, ORG_ENV, org.id)
    if (!org)
      console.error(
        `Warning: viaSocket's workspace check refused this token. Saved it anyway; report it to viaSocket if the agent's calls fail.`
      )
    const who = org ? ` for workspace ${org.name || org.id}${org.name && org.id ? ` (${org.id})` : ''}` : ''
    console.log(`Saved ${TOKEN_ENV}${org?.id ? ` and ${ORG_ENV}=${org.id}` : ''} to ${envFile}${who}.`)
    console.log(`Never commit that file. Revoke the token any time at ${DASHBOARD}.`)
    warnIfNotIgnored(envFile)
    process.exitCode = 0
    return
  }

  const ensured = await ensureToken(options, envFile)
  if (!ensured) {
    process.exitCode = 1
    return
  }
  const { token, org } = ensured
  const orgId = org?.id || getEnv(envFile, ORG_ENV)
  if (!orgId) {
    console.error(`No workspace id: the token was refused. Run \`login\` again.`)
    process.exitCode = 1
    return
  }
  setEnv(envFile, ORG_ENV, orgId)
  const chosen = await chooseProject({ token, orgId, options, envFile })
  if (!chosen) return
  const { project, how } = chosen
  const { secret, scope } = await embedSecret(token, orgId, project.id)
  setEnv(envFile, PROJECT_ENV, String(project.id))
  setEnv(envFile, SECRET_ENV, secret)
  console.log(`Workspace ${orgId}; embed project ${project.id}${project.title ? ` "${project.title}"` : ''} (${how}); ${scope} secret.`)
  console.log(`Saved ${TOKEN_ENV}, ${ORG_ENV}, ${PROJECT_ENV} and ${SECRET_ENV} to ${envFile}. Never commit that file.`)
  warnIfNotIgnored(envFile)
  process.exitCode = 0
  return
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
