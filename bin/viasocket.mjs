#!/usr/bin/env node
/* global process, console, fetch, AbortSignal, URL, URLSearchParams, setTimeout */
/**
 * viasocket-login.mjs — signs in to viaSocket from the command line and sets up .env.
 *
 *   curl -fsSL https://flow.viasocket.com/viasocket-login.mjs -o viasocket-login.mjs
 *   node viasocket-login.mjs login [--env .env] [--no-open] [--timeout 300]
 *   node viasocket-login.mjs setup [--env .env] [--project <id>] [--name <title>] [--no-open] [--timeout 300]
 *
 * The same two commands ship in the viasocket-apps package: `npx viasocket-apps login` / `setup`.
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
 * No dependencies, Node 18+. Exit code 0 when .env is written, 1 when sign-in or a call failed,
 * 2 on bad usage, 3 when `setup` needs --project because the workspace has several embeds.
 */
import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { spawn } from 'node:child_process'

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

function usage(code) {
  console.log(
    [
      'usage: node viasocket-login.mjs <login | setup> [options]',
      '',
      '  login             sign in; writes VIASOCKET_AGENT_TOKEN and VIASOCKET_ORG_ID',
      '  setup             login if needed, then the embed project and signing secret a product needs:',
      '                    writes VIASOCKET_PROJECT_ID and VIASOCKET_EMBED_SECRET too',
      '',
      '  --env <file>      the env file (default .env in the current folder)',
      '  --project <id>    setup: which embed project, when the workspace has several',
      '  --name <title>    setup: the name for the embed project it creates when there is none (default: this folder)',
      '  --no-open         print the URL instead of opening a browser (a remote shell, a sandbox)',
      '  --timeout <s>     how long to wait for the browser (default 300)',
      '  -h, --help        this text'
    ].join('\n')
  )
  process.exit(code)
}

function parseArgs(argv) {
  const options = { command: 'login', env: '.env', open: true, timeout: 300, project: '', name: '' }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      const value = argv[++i]
      if (value === undefined) usage(2)
      return value
    }
    if (arg === 'login' || arg === 'setup') options.command = arg
    else if (arg === '--env') options.env = next()
    else if (arg === '--project') options.project = next()
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
  if (saved && byId(saved)) return { project: byId(saved), how: `already in ${options.env}` }
  if (projects.length === 1) return { project: projects[0], how: "the workspace's only embed" }
  if (projects.length === 0) {
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
  console.error(`Workspace ${orgId} has ${projects.length} embed projects. Run again with --project <id>, one of:`)
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

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const envFile = resolve(process.cwd(), options.env)

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
  process.exitCode = 0
  return
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
