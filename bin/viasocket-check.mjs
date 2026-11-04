#!/usr/bin/env node
/* global process, console, fetch */
/**
 * viasocket-check.mjs — checks a viaSocket integration's code for what reading it cannot show.
 *
 *   curl -fsSL https://flow.viasocket.com/viasocket-check.mjs -o viasocket-check.mjs
 *   node viasocket-check.mjs [folder or file ...]      defaults to the current folder
 *
 * It finds every viaSocket slug, key, id and URL the code hard-codes and checks each against viaSocket:
 *   - a slug handed to an app call (enableApp, listActions, listOptions, user.enable, …) names a real app
 *     (slugs are case-sensitive)
 *   - an action's or trigger's key handed to listOptions, subscribeEvent, runAction or user.subscribe is one
 *     of that app's keys (keys are case-sensitive; the page path `send-email` is not the key)
 *   - a service_id names a real app — not the app's name, its slug, or the id with a name joined on
 *   - an action's or trigger's id sits where the call takes that kind of id (the two ids look alike:
 *     the id-based run, list-options and subscribe-event take the version id; everything else the plain one)
 *   - every viasocket URL is a published endpoint — never a popup or auth-page URL built by hand
 *   - the embed secret is not a string literal in source
 *   - the connect script is reachable; the embed token works (VIASOCKET_TEST_EMBED_TOKEN, optional)
 *
 * No dependencies, Node 18+. Exits 1 on any FAIL, so it works as a test (`npm test`) or a CI step.
 * It never reads a .env file, sends only the slugs, keys and ids it finds to viaSocket, and prints
 * no line of code — only file:line and the slug, key, id or URL.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'

/** The public catalog: `/<slug or id>` is the app, `/<slug or id>/actions` the app with its actions and triggers. */
const CATALOG = process.env.VIASOCKET_CATALOG_URL || 'https://plug-service.viasocket.com/api/v1/plugins'
const SEARCH_HINT = "find the app's slug with searchApps(name) — https://viasocket.com/docs/apps-api.md — and copy its appslugname exactly"
const CONNECT_SCRIPT = process.env.VIASOCKET_CONNECT_SCRIPT || 'https://flow.viasocket.com/connect.js'
const API = process.env.VIASOCKET_API_URL || 'https://flow-api.viasocket.com'
const EMBED_TOKEN = process.env.VIASOCKET_TEST_EMBED_TOKEN

const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', 'dist', 'build', '.next', 'coverage', 'vendor', '.venv', '__pycache__'])
const EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.vue',
  '.svelte',
  '.html',
  '.py',
  '.rb',
  '.php',
  '.go',
  '.java',
  '.kt',
  '.cs',
  '.json',
  '.yaml',
  '.yml'
])
const MAX_FILE_BYTES = 2 * 1024 * 1024

/** What a product may call or load. Any other URL on a viasocket host was built by hand. */
const KNOWN_URL_PREFIXES = [
  'https://flow-api.viasocket.com/',
  'https://dev-api.viasocket.com/',
  'https://flow.sokt.io/func/',
  'https://dev-flow.sokt.io/func/',
  'https://flow.viasocket.com/connect.js',
  'https://dev-flow.viasocket.com/connect.js',
  'https://flow.viasocket.com/viasocket-check.mjs',
  'https://viasocket.com/docs/',
  'https://flow.viasocket.com/documentation/',
  'https://dev-flow.viasocket.com/documentation/',
  'https://embed.viasocket.com/',
  'https://memory-api.viasocket.com/',
  // the product's own MCP server (the skill's mcp.md): its management API, its address and its reference
  'https://mcp.viasocket.com/api/',
  'https://mcp.viasocket.com/connector/',
  'https://mcp.viasocket.com/mcp/',
  'https://mcp.viasocket.com/api-reference.md',
  // the redirect URI a product registers for its MCP server's OAuth login (https://mcp.viasocket.com/oauth/<id>/callback)
  'https://mcp.viasocket.com/oauth/',
  'https://flow.viasocket.com/viasocket-login.mjs',
  'https://plug-service.viasocket.com/api/v1/plugins/',
  'https://plug-service.viasocket.com/plugins/search',
  'https://viasocket.com/',
  'https://www.viasocket.com/'
]

/** Origins a product compares against, never calls: the prebuilt UI posts its messages from this one. */
const KNOWN_ORIGINS = ['https://embedfrontend.viasocket.com', 'https://dev-embedfrontend.viasocket.com']
/** Where the connect script may be loaded from. */
const KNOWN_CONNECT_SCRIPTS = ['https://flow.viasocket.com/connect.js', 'https://dev-flow.viasocket.com/connect.js']
/** A connect script's address in a script tag or a loader, on any host (a copied localhost or proxy URL included). */
const CONNECT_SCRIPT_URL = /https?:\/\/[^\s'"`<>)]+\/connect\.js(?![A-Za-z0-9_])/g

const ID = /(?<![A-Za-z0-9_])row[a-z0-9]{6,9}(?![A-Za-z0-9_])/g
const COMPOSED_ID = /(["'`])(row[a-z0-9]{6,9}[_-][A-Za-z0-9_-]+)\1/g
const VIASOCKET_URL = /https?:\/\/[a-z0-9.-]*(?:viasocket\.com|sokt\.io)[^\s'"`<>)]*/gi
const SECRET_LITERAL = /VIASOCKET_EMBED_SECRET\s*[=:]\s*["'][^"'\n]{6,}["']/
const EXPECTS_VERSION = /list-options|subscribe-event|update-subscribed-event|version/i
const EXPECTS_PLAIN = /filteredActions|filteredServices|service_action_functions|action_id|trigger_id|actionId|triggerId|open\s*:/
const EXPECTS_SERVICE = /service_id|serviceId(?!For)|\/enable\//
/** A slug the code names: serviceIdFor('slack'), serviceIds['slack'], listEvents('slack'), the slug argument of
 * findEnabledApp / enableApp, slug: 'slack', VIASOCKET_APP_SLUG = 'slack'. A bare `slug` names an app for sure only in a
 * project where some file hands a slug to one of those calls (apps are often listed in one file and looked up in
 * another); in a project with no such call it may be the product's own (a page, a repository), so an unknown one
 * only warns. Inside the product's own MCP server (an object that also has instructions, tools or
 * branding; the skill's mcp.md) it is that server's address and is not looked up. */
const SLUG_USE =
  /(?:serviceIdFor\s*\(\s*|versionIdFor\s*\(\s*|serviceIds\s*\[\s*|listEvents\s*\(\s*|(?:findEnabledApp|enableApp|listActions|serviceIdFor|listEvents|listOptions|subscribeEvent)\s*\([^()'"`]*?,\s*|\buser\.(?:enable|findEnabled|listActions|serviceIdFor|listOptions|subscribe)\s*\(\s*|\bslug\s*[:=]\s*|APP_SLUG\s*[:=]\s*)(["'`])([A-Za-z0-9_-]+)\1/g
/** listOptions(userId, 'slack', 'Send_Message', …), subscribeEvent(userId, 'slack', 'New_Message', …), user.listOptions('slack', 'Send_Message', …), user.subscribe('slack', 'New_Message', …): the key is checked against the app's listing. */
const KEY_USE =
  /(?:(?:listOptions|subscribeEvent)\s*\([^()'"`]*?,\s*|\buser\.(?:listOptions|subscribe)\s*\(\s*)(["'`])([A-Za-z0-9_-]+)\1\s*,\s*(["'`])([A-Za-z0-9_-]+)\3/g
/** runAction(scriptId, 'Send_Message', …) names only the key; it is checked against every app the code names. */
const RUN_KEY_USE = /\brunAction\s*\([^()'"`]*?,\s*(["'`])([A-Za-z0-9_-]+)\1/g
/** versionIdFor('slack', 'send-message', 'V107'): checked against the version the catalog publishes. */
const VERSION_USE = /versionIdFor\s*\(\s*(["'`])([A-Za-z0-9_-]+)\1\s*,\s*(["'`])([A-Za-z0-9_-]+)\3\s*,\s*(["'`])([^"'`]+)\5/g
/** The event argument of versionIdFor(serviceId or slug, event, …): a plain action_id / trigger_id, or a page path. */
const EVENT_ARG = /versionIdFor\s*\([^,()]*(?:\([^()]*\))?[^,()]*,\s*(["'`])([A-Za-z0-9_-]+)\1/g
/** A slug variable or property handed to a call that takes an app's slug: serviceIdFor(slug), enableApp(userId, app.slug, …). */
const SLUG_INTO_APP_CALL =
  /(?:(?:serviceIdFor|versionIdFor|listEvents)\s*\(\s*|serviceIds\s*\[\s*|(?:findEnabledApp|enableApp|listActions|serviceIdFor|listEvents|listOptions|subscribeEvent)\s*\([^()'"`]*?,\s*|\buser\.(?:enable|findEnabled|listActions|serviceIdFor|listOptions|subscribe)\s*\(\s*)[\w$.]*slug\b/i
/** The token endpoint's ?apps=slack,google-sheets */
const SLUG_LIST = /[?&]apps=([A-Za-z0-9_,-]+)/g
/** The product's own MCP server: its definition and its ids (mcp.md). No slug in them names an app. */
const MCP_FILES = new Set(['viasocket.mcp.json', 'viasocket.mcp.ids.json'])
const MCP_SERVER_KEYS = new Set(['instructions', 'tools', 'branding'])
/** A line that says its `slug` is the product's own, not an app's. */
const NOT_AN_APP = /viasocket-check:\s*not an app/

/** For each `{` of a file, its span and whether its own keys make it an MCP server definition. Strings and comments are
 * skipped; a quote other than a backtick ends at its line, so an apostrophe in a comment of another language stays local. */
const objectsOf = (text) => {
  const objects = []
  const open = [] // { start, brace, keys }
  let quote = null
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote || (c === '\n' && quote !== '`')) quote = null
    } else if (c === '"' || c === "'" || c === '`') quote = c
    else if (c === '/' && text[i + 1] === '/') i = text.indexOf('\n', i) < 0 ? text.length : text.indexOf('\n', i)
    else if (c === '/' && text[i + 1] === '*') i = text.indexOf('*/', i + 2) < 0 ? text.length : text.indexOf('*/', i + 2) + 1
    else if (c === '{' || c === '[') open.push({ start: i, brace: c === '{', keys: [] })
    else if (c === '}' || c === ']') {
      const object = open.pop()
      if (object?.brace) objects.push({ start: object.start, end: i, mcp: object.keys.some((key) => MCP_SERVER_KEYS.has(key)) })
    } else if (c === ':' && open.at(-1)?.brace) {
      const key = /["']?([A-Za-z_$][\w$]*)["']?\s*$/.exec(text.slice(Math.max(0, i - 80), i))
      if (key) open.at(-1).keys.push(key[1])
    }
  }
  return objects
}
/** Whether the innermost object around `index` is an MCP server definition. */
const inMcpServer = (objects, index) =>
  objects.filter((object) => object.start < index && index < object.end).sort((a, b) => b.start - a.start)[0]?.mcp === true

const findings = { FAIL: 0, WARN: 0 }
const say = (level, where, text) => {
  if (level in findings) findings[level] += 1
  console.log(`${level.padEnd(4)} ${where ? `${where}  ` : ''}${text}`)
}

async function* walk(target) {
  const info = await stat(target).catch(() => null)
  if (!info) return
  if (info.isFile()) {
    yield target
    return
  }
  for (const entry of await readdir(target, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(join(target, entry.name))
    } else if (entry.isFile()) yield join(target, entry.name)
  }
}

const scannable = (file) => {
  const name = basename(file)
  // viaSocket's own scripts, downloaded into the product's folder as the skill says
  if (name.startsWith('.env') || name === 'viasocket-check.mjs' || name === 'viasocket-login.mjs') return false
  return EXTENSIONS.has(extname(name))
}

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['.']
const ids = new Map() // id → [{ where, expects }]
const urls = []
const connectScriptUrls = [] // { where, url }: every connect.js the code loads, whatever its host
const slugs = new Map() // slug → [{ where, bare }]; bare: a `slug:` or `slug =`, not a call that takes an app's slug
let handsSlugToApp = false // some file passes a slug variable to an app call: a bare slug anywhere then names an app
const versionUses = [] // { slug, event, version, where }
const keyUses = [] // { slug, key, where }: a key named with its app
const runKeyUses = [] // { key, where }: a key named alone, in runAction
let filesScanned = 0
let mentionsConnect = false

for (const root of roots) {
  for await (const file of walk(root)) {
    if (!scannable(file)) continue
    const info = await stat(file)
    if (info.size > MAX_FILE_BYTES) continue
    const text = await readFile(file, 'utf8')
    filesScanned += 1
    const where = relative(process.cwd(), file) || file
    if (SECRET_LITERAL.test(text))
      say('FAIL', where, 'VIASOCKET_EMBED_SECRET is a string literal in source — it lives in .env and nowhere else')
    if (/openViasocketConnection|connect\.js/.test(text)) mentionsConnect = true
    const mcpFile = MCP_FILES.has(basename(file))
    if (SLUG_INTO_APP_CALL.test(text)) handsSlugToApp = true
    let objects = null // read only when the file names a bare slug
    let lineStart = 0
    text.split('\n').forEach((line, index) => {
      const at = `${where}:${index + 1}`
      const offset = lineStart
      lineStart += line.length + 1
      for (const match of line.matchAll(COMPOSED_ID)) {
        say(
          'FAIL',
          at,
          `'${match[2]}' is an id with something joined on — a service_id is the bare id (${match[2].split(/[_-]/)[0]}?); ${SEARCH_HINT}`
        )
      }
      for (const match of line.matchAll(SLUG_USE)) {
        const bare = match[0].startsWith('slug')
        if (bare) {
          if (mcpFile || NOT_AN_APP.test(line)) continue
          objects ||= objectsOf(text)
          if (inMcpServer(objects, offset + match.index)) continue
        }
        if (!slugs.has(match[2])) slugs.set(match[2], [])
        slugs.get(match[2]).push({ where: at, bare })
      }
      for (const match of line.matchAll(VERSION_USE)) versionUses.push({ slug: match[2], event: match[4], version: match[6], where: at })
      for (const match of line.matchAll(KEY_USE)) keyUses.push({ slug: match[2], key: match[4], where: at })
      for (const match of line.matchAll(RUN_KEY_USE))
        if (!/^row[a-z0-9]{6,9}$/.test(match[2])) runKeyUses.push({ key: match[2], where: at })
      for (const match of line.matchAll(SLUG_LIST)) {
        for (const slug of match[1].split(',').filter(Boolean)) {
          if (!slugs.has(slug)) slugs.set(slug, [])
          slugs.get(slug).push({ where: at, bare: false })
        }
      }
      for (const match of line.matchAll(ID)) {
        // A few slugs look like ids (rowzffkpcszo); one handed to serviceIdFor is a slug, checked below.
        if ([...line.matchAll(SLUG_USE)].some((use) => use[2] === match[0])) continue
        // versionIdFor(app, 'row1jrbor', 'V107') names the event by its plain id; the version id is what it returns.
        const eventArg = [...line.matchAll(EVENT_ARG)].some((use) => use[2] === match[0])
        const version = !eventArg && EXPECTS_VERSION.test(line)
        const plain = eventArg || EXPECTS_PLAIN.test(line)
        const expects =
          EXPECTS_SERVICE.test(line) && !version && !plain ? 'service' : version && !plain ? 'version' : plain && !version ? 'plain' : null
        if (!ids.has(match[0])) ids.set(match[0], [])
        ids.get(match[0]).push({ where: at, expects })
      }
      for (const match of line.matchAll(VIASOCKET_URL)) urls.push({ where: at, url: match[0] })
      for (const match of line.matchAll(CONNECT_SCRIPT_URL)) connectScriptUrls.push({ where: at, url: match[0] })
    })
  }
}

if (!filesScanned) {
  say('FAIL', '', `nothing to scan under ${roots.join(', ')} — pass the folder that holds the integration`)
}

// ---- URLs -----------------------------------------------------------------------------------
for (const { where, url } of urls) {
  // A base URL in a constant (`https://flow-api.viasocket.com`) counts as its prefix.
  if (KNOWN_URL_PREFIXES.some((prefix) => `${url}/`.startsWith(prefix))) continue
  // A bare origin is a base constant (the apps module's `https://flow.sokt.io`) or an origin compared against a
  // message's (`https://embedfrontend.viasocket.com`): fine when it is a known origin or a known prefix starts with it.
  const origin = /^https?:\/\/[^/]+\/?$/.test(url) ? url.replace(/\/$/, '') : ''
  if (origin && (KNOWN_ORIGINS.includes(origin) || KNOWN_URL_PREFIXES.some((prefix) => prefix.startsWith(`${origin}/`)))) continue
  say(
    'FAIL',
    where,
    `${url} is a viasocket URL built by hand — the connect popup is opened only by connect() from viasocket-apps/browser or openViasocketConnection from ${CONNECT_SCRIPT}; the prebuilt UI by viaSocket.mount; the API is ${API}; AI memory is https://memory-api.viasocket.com; the product's MCP server is https://mcp.viasocket.com/api and /connector/<slug>`
  )
}

// ---- where the connect script is loaded from --------------------------------------------------
for (const { where, url } of connectScriptUrls) {
  if (url === CONNECT_SCRIPT || KNOWN_CONNECT_SCRIPTS.includes(url)) continue
  say('FAIL', where, `the connect script is loaded from ${url}: load it from ${CONNECT_SCRIPT} and nowhere else`)
}

// ---- ids, against the live catalog ------------------------------------------------------------
const lookup = async (serviceId) => {
  try {
    const res = await fetch(`${CATALOG}/${encodeURIComponent(serviceId)}/actions`)
    if (res.status === 404) return null
    const body = await res.json()
    return body?.service?.name ? body : null
  } catch (error) {
    say('WARN', '', `catalog unreachable (${error?.message}) — ids could not be checked`)
    return null
  }
}

// ---- slugs, resolved the way the calls resolve them: the public catalog, which knows every listed app ----
const resolveSlug = async (slug) => {
  try {
    const res = await fetch(`${CATALOG}/${encodeURIComponent(slug)}/actions`)
    if (res.status === 404) return { serviceId: null }
    const body = await res.json()
    if (!res.ok || !body?.service?.service_id) return { error: new Error(body?.error || `status ${res.status}`) }
    const keys = [...(body.actions || []), ...(body.triggers || [])].map((event) => event.key).filter(Boolean)
    return { serviceId: body.service.service_id, keys, app: body }
  } catch (error) {
    return { error }
  }
}
const slugServiceIds = new Set()
const serviceIdOfSlug = new Map()
const keysOfSlug = new Map() // slug → its keys
const services = new Map() // service_id → { service, actions, triggers }
for (const [slug, places] of slugs) {
  const { serviceId, keys, app, error } = await resolveSlug(slug)
  const strict = places.find((place) => !place.bare || handsSlugToApp)
  if (error) say('WARN', places[0].where, `slug '${slug}' could not be checked (${error?.message})`)
  else if (!serviceId && strict)
    say(
      'FAIL',
      strict.where,
      `'${slug}' is no app's slug — slugs are case-sensitive and copied exactly; ${SEARCH_HINT}${
        strict.bare ? ". If it is the product's own slug, not an app's, end that line with the comment `viasocket-check: not an app`" : ''
      }`
    )
  else if (!serviceId)
    say(
      'WARN',
      places[0].where,
      `'${slug}' is no app's slug — fine if it is the product's own (a page, a repository); if it names an app, ${SEARCH_HINT}`
    )
  else {
    say('PASS', '', `slug ${slug} resolves to ${serviceId} (${places.length} place${places.length === 1 ? '' : 's'})`)
    slugServiceIds.add(serviceId)
    serviceIdOfSlug.set(slug, serviceId)
    keysOfSlug.set(slug, keys)
    services.set(serviceId, app)
  }
}

// ---- keys named in code: each is a key of its app ------------------------------------------------------
for (const use of keyUses) {
  const keys = keysOfSlug.get(use.slug)
  if (!keys) continue // the slug itself was reported above, or keys could not be read
  if (keys.includes(use.key)) say('PASS', '', `${use.slug}/${use.key} is a key of the app`)
  else {
    const near = keys.find(
      (key) => key.toLowerCase() === use.key.toLowerCase() || key.toLowerCase().replace(/_/g, '-') === use.key.toLowerCase()
    )
    say(
      'FAIL',
      use.where,
      `'${use.key}' is no key of ${use.slug}${near ? ` — did you mean '${near}'? Keys are case-sensitive and the page path is not the key` : ": copy it from the app's page or from listActions"}`
    )
  }
}
for (const use of runKeyUses) {
  if (!keysOfSlug.size) continue
  const owners = [...keysOfSlug].filter(([, keys]) => keys.includes(use.key)).map(([slug]) => slug)
  if (owners.length) say('PASS', '', `runAction key ${use.key} belongs to ${owners.join(', ')}`)
  else
    say(
      'WARN',
      use.where,
      `'${use.key}' is no key of ${[...keysOfSlug.keys()].join(', ')} — a typo, or an app whose slug is missing from the code`
    )
}

const batch = [...new Set([...ids.keys(), ...slugServiceIds])].filter((id) => !services.has(id))
for (let i = 0; i < batch.length; i += 6) {
  const results = await Promise.all(batch.slice(i, i + 6).map((id) => lookup(id).then((app) => [id, app])))
  for (const [id, app] of results) if (app) services.set(id, app)
}
const kinds = new Map() // id → { kind, app, pair }
for (const [serviceId, app] of services) {
  if (ids.has(serviceId)) kinds.set(serviceId, { kind: 'service', app: app.service.name })
  for (const action of app.actions || []) {
    kinds.set(action.action_id, {
      kind: 'plain',
      what: 'action_id',
      app: app.service.name,
      name: action.name,
      pair: action.action_version_id
    })
    kinds.set(action.action_version_id, {
      kind: 'version',
      what: 'action_version_id',
      app: app.service.name,
      name: action.name,
      pair: action.action_id
    })
  }
  for (const trigger of app.triggers || []) {
    kinds.set(trigger.trigger_id, {
      kind: 'plain',
      what: 'trigger_id',
      app: app.service.name,
      name: trigger.name,
      pair: trigger.trigger_version_id
    })
    kinds.set(trigger.trigger_version_id, {
      kind: 'version',
      what: 'trigger_version_id',
      app: app.service.name,
      name: trigger.name,
      pair: trigger.trigger_id
    })
  }
}

// ---- versions named in code: the event exists and the version is the published one ---------------
const eventPath = (name) =>
  `${name || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
for (const use of versionUses) {
  const app = services.get(serviceIdOfSlug.get(use.slug))
  if (!app) continue // the slug itself was reported above
  const all = [...(app.actions || []), ...(app.triggers || [])]
  const byId = all.filter((e) => e.action_id === use.event || e.trigger_id === use.event)
  const found = byId.length ? byId : all.filter((e) => eventPath(e.name) === use.event)
  if (found.length !== 1) say('FAIL', use.where, `'${use.event}' is no single event of ${use.slug}: use the path or id its app page lists`)
  else if (found[0].versionid && found[0].versionid !== use.version)
    say(
      'FAIL',
      use.where,
      `${use.slug}/${use.event} is published as ${found[0].versionid}, not ${use.version}: reread its page and update the code`
    )
  else say('PASS', '', `${use.slug}/${use.event} ${use.version} is the published version`)
}

const appNames = [...services.values()].map((app) => app.service.name)
for (const [id, uses] of ids) {
  const known = kinds.get(id)
  if (!known) {
    const serviceUse = uses.find((use) => use.expects === 'service')
    if (serviceUse) say('FAIL', serviceUse.where, `'${id}' names no app — ${SEARCH_HINT}`)
    else
      say(
        'WARN',
        uses[0].where,
        `'${id}' is not an id of ${appNames.length ? appNames.join(', ') : 'any app whose slug or service_id appears in the code'} — a typo, or an app whose slug is missing from the code (used in ${uses.length} place${uses.length === 1 ? '' : 's'})`
      )
    continue
  }
  if (known.kind === 'service') {
    say('PASS', '', `${id} is ${known.app} (service_id, ${uses.length} place${uses.length === 1 ? '' : 's'})`)
    for (const use of uses) {
      if (use.expects === 'plain' || use.expects === 'version')
        say('FAIL', use.where, `'${id}' is ${known.app}'s service_id, but this line takes an action's or trigger's id`)
    }
    continue
  }
  say('PASS', '', `${id} is ${known.app}'s ${known.what} for "${known.name}"`)
  for (const use of uses) {
    if (!use.expects || use.expects === known.kind) continue
    if (use.expects === 'service') say('FAIL', use.where, `'${id}' is ${known.app}'s ${known.what}, but this line takes the service_id`)
    else
      say(
        'FAIL',
        use.where,
        `'${id}' is ${known.app}'s ${known.what}, but this line takes the ${known.kind === 'plain' ? 'version id' : 'plain id'} — for "${known.name}" that is ${known.pair}`
      )
  }
}

// ---- the connect script and the token ----------------------------------------------------------
if (mentionsConnect) {
  try {
    const res = await fetch(CONNECT_SCRIPT)
    const text = res.ok ? await res.text() : ''
    if (text.includes('openViasocketConnection')) say('PASS', '', `the connect script answers at ${CONNECT_SCRIPT}`)
    else
      say(
        'FAIL',
        '',
        `${CONNECT_SCRIPT} answered ${res.status} without openViasocketConnection — load the connect script from this URL and nowhere else`
      )
  } catch (error) {
    say('WARN', '', `connect script unreachable (${error?.message})`)
  }
}

if (EMBED_TOKEN) {
  try {
    const res = await fetch(`${API}/embed/authentications`, { headers: { authorization: EMBED_TOKEN } })
    if (res.status === 200) say('PASS', '', 'embed token accepted by /embed/authentications')
    else say('FAIL', '', `embed token refused (${res.status}) — the secret or the org/project ids are wrong`)
  } catch (error) {
    say('WARN', '', `${API} unreachable (${error?.message})`)
  }
} else say('INFO', '', 'VIASOCKET_TEST_EMBED_TOKEN not set — token check skipped')

console.log(
  findings.FAIL
    ? `${findings.FAIL} FAIL, ${findings.WARN} WARN — fix every FAIL; paste this output in your report`
    : `0 FAIL, ${findings.WARN} WARN over ${filesScanned} file${filesScanned === 1 ? '' : 's'} — paste this output in your report`
)
// exitCode, not process.exit(): Node 24 on Windows aborts when exit() runs while a fetch handle is closing
process.exitCode = findings.FAIL ? 1 : 0
