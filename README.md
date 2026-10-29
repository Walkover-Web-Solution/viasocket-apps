# viasocket-apps

viaSocket, for the product you are building and for the coding agent building it. One signing
secret gives your product:

| what                 | your users get                                                                                                        | where                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **App integrations** | connect Slack, GitHub, Google Sheets or any of 2,300+ apps; your product runs their actions and reacts to their events | this package: [Server](#server), [Events](#events)     |
| **AI assistant**     | a chat assistant or AI behind a feature, any model, your own endpoints as its tools                                   | this package: [AI assistant](#ai-assistant)            |
| **AI memory**        | an AI that remembers each user's rules, facts and corrections; they can see and delete it                             | this package: [AI memory](#ai-memory)                  |
| **Login and orgs**   | sign-up, login, profile, team members and organisations with roles, no users table                                    | `viasocket.login` and the skill's login-and-orgs page  |
| **Automations**      | multi-step flows across their apps on an event, a schedule or a webhook, created by your product for each user        | the skill's automations page (plain HTTP)              |

The OAuth, token refresh, per-app request shapes, polling, retries and AI billing are viaSocket's
problem, not yours. The same skill also builds **your own automations** in your viaSocket workspace
and **plugs** (an app's integration) in the Developer Hub; see [For coding agents](#for-coding-agents),
`npx viasocket-apps login` to give an agent a way into your workspace, and `npx viasocket-apps mcp` to
create your product's MCP server from one file.

Zero dependencies. Node 20+, Bun, Deno and edge runtimes.

```sh
npm install viasocket-apps
```

The same calls are documented as plain HTTP in your viaSocket dashboard under
**Integrations → your Apps API integration → API reference**. Use whichever suits your stack;
this package is a thin, typed layer over those endpoints and adds nothing they don't have.

## For coding agents

[![skills.sh](https://skills.sh/b/Walkover-Web-Solution/viasocket-apps)](https://skills.sh/Walkover-Web-Solution/viasocket-apps)

This repo also carries the **viaSocket integrations skill** — what a coding agent reads to
integrate any app into your product, with or without this package. Install it into Claude Code,
Cursor, Codex, Copilot, Gemini CLI, Windsurf, Cline and 20+ other agents:

```sh
npx skills add Walkover-Web-Solution/viasocket-apps
```

Add `-g` to install it for every project. No install? Paste this into your agent:
`Read https://flow.viasocket.com/documentation/skill.md and follow it.`

The agent needs three values from the viaSocket dashboard (**Integrations → Create embed →
Install Code**): `org_id` and `project_id`, which the dashboard's "Copy prompt" hands it, and
`VIASOCKET_EMBED_SECRET`, which goes in your server's `.env`.
[skills/viasocket-integrations/SKILL.md](skills/viasocket-integrations/SKILL.md) is the install
file: the description that makes an agent load the skill, and one instruction — fetch the current
skill, `https://flow.viasocket.com/documentation/skill.md`, every time it is used — so an install
never goes stale.

Before you ship — with or without an agent — check the code against the live catalog:

```sh
curl -fsSL https://flow.viasocket.com/viasocket-check.mjs -o viasocket-check.mjs
node viasocket-check.mjs src
```

It finds every viaSocket id and URL in your code and says whether each names a real app, action or
trigger, is used where its call expects that kind of id (the two ids of an action look alike), and
whether any viasocket URL was built by hand. No dependencies; exits 1 on a failure, so it can be a
test. It reads no `.env` file and prints no line of code.

### Set up from the command line

Everything a product needs in `.env`, with one command and one click in the browser:

```sh
npx viasocket-apps setup
```

It signs you in (below), then reuses your workspace's embed project, creates one if there is none, or
asks which with `--project <id>` if there are several (`--new` makes a new one for this product), and writes `VIASOCKET_ORG_ID`,
`VIASOCKET_PROJECT_ID` and `VIASOCKET_EMBED_SECRET` next to `VIASOCKET_AGENT_TOKEN`. It never changes
billing, limits or an existing project's settings. The dashboard's **Install Code** page shows the same
values for anyone without Node.js.

### Log in from the command line

An agent working in your own viaSocket workspace (your automations, your plugs) acts as you and needs
your agent token. Instead of copying it from the dashboard:

```sh
npx viasocket-apps login
```

It is the OAuth sign-in the viaSocket MCP uses: it opens viaSocket's authorize page in your browser;
sign in, pick the workspace, click **Allow**, and the token is written to `.env` as
`VIASOCKET_AGENT_TOKEN` (and `VIASOCKET_ORG_ID`, if the file has none). The browser redirects only to
`127.0.0.1`, the exchange is PKCE-bound to this run, and nothing prints the token. `--no-open` prints the URL instead of opening a browser,
`--env <file>` picks another file, `--timeout <s>` changes the five-minute wait. Without the package:
`curl -fsSL https://flow.viasocket.com/viasocket-login.mjs -o viasocket-login.mjs && node viasocket-login.mjs`
is the same command.

### The product's MCP server from the command line

Describe the server once in `viasocket.mcp.json` (its name and slug, its login as `none`, `api-key` or
`oauth`, its tools as your own endpoints with a JSON Schema each, its skills and prompts; a secret goes in
as `"${ENV_NAME}"` and is read from `.env`), then:

```sh
npx viasocket-apps mcp
```

It mints `VIASOCKET_MCP_TOKEN` from your agent token (signing you in first if `.env` has none), creates
or updates the server, its tools, skills and prompts on `mcp.viasocket.com`, removes what the file no
longer lists, keeps every id in `viasocket.mcp.ids.json` (commit it: it is what makes a rerun update
instead of duplicate), and tests the URL with `tools/list` and `prompts/list`. `--call <tool> --args
'<json>'` calls one tool as a client would, with `--token <t>` on a login server. The file's shape and
every field: [flow.viasocket.com/documentation/skill/mcp.md](https://flow.viasocket.com/documentation/skill/mcp.md).

## Server

```js
import { ViaSocket } from 'viasocket-apps'

const viasocket = new ViaSocket({
  orgId: process.env.VIASOCKET_ORG_ID,
  projectId: process.env.VIASOCKET_PROJECT_ID,
  secret: process.env.VIASOCKET_EMBED_SECRET // server-side only
})

// Everything is done for one of your end users, identified by an id you choose.
const user = viasocket.user('user_123')

// 1. Your frontend needs a token to open the connect popup.
const embedToken = await user.token()

// The app by its slug, and the event by its action_id and the version your code was written for —
// both read from the live catalog, never copied ids. Each event's page lists them:
// https://flow.viasocket.com/documentation/google-sheets.md
const serviceId = await viasocket.catalog.serviceIdFor('google-sheets')
const actionVersionId = await viasocket.catalog.versionIdFor(serviceId, '<action_id>', '<version>')

// 2. After the popup posts back an auth_id: enable the app, once, to run actions. A paused app is
//    found too, and resumed with enableFlow rather than enabled twice.
const scriptId = (await user.findEnabled(serviceId)) ?? (await user.enable(serviceId, authId)).scriptId

// 3. Fill a dropdown with the user's real data.
const { options } = await user.listOptions(actionVersionId, {
  fieldKey: 'spreadsheet_Id',
  authId,
  existingFields: {}
})

// 4. Run an action. No token — the script_id is the credential.
const result = await viasocket.runAction(scriptId, actionVersionId, {
  spreadsheet_Id: options[0].value,
  grid_Id: '0',
  column_key: true
})

// 5. Or subscribe to an event. Needs only the connection, not enable(). `code` is a handler we
//    run on our servers when the event fires — see "Events" below. Save the scriptId it returns
//    together with the inputData and handler you sent: the flows list never returns those.
const subscription = await user.subscribe(triggerVersionId, {
  authId,
  inputData: { channel_id: ['C08SXCV3J85'] },
  code: handler,
  meta: { user_id: 'user_123' }
})
```

## Browser

```js
import { connect } from 'viasocket-apps/browser'

// embedToken comes from your backend (user.token()), signed for the signed-in user.
// actions (optional): the action_ids and trigger_ids you use — the popup then asks only
// for their scopes; skipActionSelection goes straight to the app's consent screen.
const { authId } = await connect({ embedToken, serviceId: 'rowbu58rc', actions: ['<action_id>'], skipActionSelection: true })
// Send authId to your backend, which enables the app and stores the script_id.

// When user.listConnections() shows a connection with isExpired: true, sign in to it again:
await connect({ embedToken, serviceId: 'rowbu58rc', authId }) // updates it in place; resolves with the same authId
```

`serviceId` is the app's `service_id` exactly as the catalog returns it — a bare id such as
`rowbu58rc`, never the app's name or slug, never the id with a name joined on. `connect()` loads
viaSocket's connect script from `https://flow.viasocket.com/connect.js` and lets it open the popup;
that script is the only supported way to open it, so never build a viasocket URL for it by hand.

`connect()` rejects with a `ViaSocketConnectError` whose `code` is `'closed'` (the user seems to
have given up), `'rejected'` (the app or viaSocket said no), `'invalid'` (`serviceId` is not a
service id) or `'script'` (the connect script did not load). `'closed'` is best-effort: once the
popup is on the app's own sign-in page a close can only be inferred, and arrives about a minute
later; if the user then finishes anyway, `onLateSuccess` is called with the same result a resolved
`connect()` gives. Treat `'closed'` as "nothing yet", not as a verdict.

## AI assistant

The assistant's tools are the product's own endpoints (`tools`) and any MCP servers (`mcpServers`: name, url,
headers), the product's own MCP server among them.

A chat assistant we run for each of your users: threads and history kept per user, your prompt per
call, your own endpoints as its tools — one of which can run an action in the user's apps. Backend
only, like everything else here: the prompt and the tools' headers are yours.

```js
const reply = await user.ai.send({
  threadId: 'support-7f3a9c', // your own string per conversation; omit to start one
  message: 'Where is the order for customer 4471?',
  prompt: 'You are an order assistant. Use lookup_order to fetch orders. Answer in one sentence.',
  tools: [
    {
      name: 'lookup_order',
      description: 'Fetches an order by customer id',
      url: 'https://api.your-product.com/orders/lookup',
      headers: { Authorization: `Bearer ${process.env.ORDERS_API_KEY}` },
      fields: { id: { type: 'string', description: 'Customer id to look up' } },
      requiredParams: ['id']
    }
  ]
})
reply.content // the answer; with responseType 'json_object' or 'json_schema', the parsed object

const threads = await user.ai.threads() // [{ threadId, title, updatedAt }] — title is null until the AI writes it
const page = await user.ai.history(threadId, { page: 1 }) // { messages, page, hasMore } — 40 exchanges a page, page 1 the latest
const socket = await user.ai.rtlayerToken() // for a chat UI: the browser subscribes with it, then you send with delivery: 'rtlayer'
```

The whole contract — tools, JSON answers, the websocket path and what arrives on it — is
[flow.viasocket.com/documentation/ai.md](https://flow.viasocket.com/documentation/ai.md).

## AI memory

What your AI remembers about each user — their rules, facts and corrections — and what a team or
customer account knows. Recall before answering, learn after:

```js
const user = viasocket.user('maya', { memorySpaces: { 'teams/acme': 'append' } }) // shared spaces: optional

const { me } = await user.memory.token() // the user's own space; viaSocket names it
const recalled = await user.memory.call('POST', '/search', { query: message })
const reply = await user.ai.send({ threadId, message, prompt: `${BASE_PROMPT}

${recalled.prompt}` })
await user.memory.call('POST', '/learn', {
  space: me,
  messages: [{ role: 'user', content: message }, { role: 'assistant', content: reply.content }],
  source: { type: 'thread', id: reply.threadId }
})
```

`memory.call` takes any path of the memory service and reuses one memory token until it runs out.
Every path, body and reply is in
[memory-api.viasocket.com/guide.md](https://memory-api.viasocket.com/guide.md).

## Login and organisations

Sign-up, login, profiles, team members and organisations with roles, from 36Blocks (free up to 1,000
users): its screens run in the browser, and your server makes these calls with the signed-in user's
`proxy_auth_token`, which the login callback hands you. Keep the token in an HTTP-only cookie.

```js
const me = await viasocket.login.details(proxyAuthToken)
// { id, name, email, companies: [{ id, name, roleId, roleName }], currentCompany: { id, role, permissions } }
const user = viasocket.user(String(me.id)) // the login decides whose connections and flows they are

const { jwt } = await viasocket.login.switchCompany(proxyAuthToken, companyId) // the session for that organisation
await viasocket.login.logout(proxyAuthToken) // then clear your cookie
```

The screens, the callback and the setup are in
[flow.viasocket.com/documentation/skill/login-and-orgs.md](https://flow.viasocket.com/documentation/skill/login-and-orgs.md).

## Methods

| Call | What it does |
| --- | --- |
| `viasocket.user(id, { memorySpaces })` | Scope every call below to one end user. `memorySpaces` grants shared AI-memory spaces (`{ 'teams/acme': 'append' }`); omit it for none. |
| `user.token()` | Signed embed token for that user; hand it to the frontend. |
| `user.enable(serviceId, authId)` | Turn a connection into a `scriptId` for running actions. Once per connection. |
| `user.findEnabled(serviceId)` | The `scriptId` if this app is already enabled, else `null`. Call before `enable`. |
| `user.listOptions(actionVersionId, { fieldKey, authId, existingFields })` | The values a field accepts, as `{ options, offset }`. Both response shapes normalised; an unreadable connection (revoked, another user's `auth_id`) throws a `ViaSocketError` with status 400 even though the API answers 200. |
| `viasocket.runAction(scriptId, actionVersionId, inputData)` | Run one action. Returns the app's own response. |
| `viasocket.catalog.search(key)` | The best 30 apps for what the user typed, as `{ serviceId, name, iconUrl, description }`. No token. |
| `viasocket.catalog.list({ limit, offset, category })` | Every app, most used first, 200 a page; an empty page ends it. Drop apps whose `versions()` is `null` or empty. No token. |
| `viasocket.catalog.versions(serviceId)` | One app and every published action and trigger of it, as `{ service, actions, triggers }`. Each action has `action_id` and `action_version_id`, each trigger `trigger_id` and `trigger_version_id`, named as the calls take them: the version id for `runAction`, `listOptions` and `subscribe`; the other for `connect`, automations and the prebuilt UI. `versionid` is the published version (`V107`). `input_schema` is the form schema. `null` for an unknown id. No token. |
| `viasocket.catalog.serviceIdFor(slug)` | The `service_id` of the app with this slug (`slack`, `google-sheets`). Exact and case-sensitive; an unknown slug throws. Cached. No token. |
| `viasocket.catalog.versionIdFor(serviceId, event, version?)` | The version id the calls take, for one event: `event` is its `action_id` / `trigger_id` (survives a rename) or its page path (`send-message`). When the app has published a version other than `version`, it warns and returns the published one. Cached 10 minutes. No token. |
| `viasocket.catalog.listBuiltIn()` | The built-in plugs (Run AI Model, Pause Workflow, Memory, scraping, GST…): every plug tagged `SDK`, with its actions and whether it needs a sign-in. No token. |
| `viasocket.sampleEvent(triggerId, authId, authType, inputData?)` | One real event of a trigger for one connection: what a handler reads at `context.req.body`. Takes the `trigger_id`; `authType` is `service.auth_type`. Map from this, never from `sample_output`. |
| `user.subscribe(triggerVersionId, { authId, inputData, code \| webhook, meta })` | Subscribe to an app event with a handler we run per event. Returns `{ scriptId, hookUrl, … }`. |
| `user.updateSubscription(scriptId, { code, meta })` | Change a live subscription in place. |
| `user.listFlows()` | Every enabled app, subscription and automation this user has, each `active`, `paused` or `deleted`. |
| `user.setFlowStatus(scriptId, n)` | Pause (`2`), resume or restore (`1`), or delete (`0`) one flow. Setting the state it is already in succeeds. |
| `user.disableFlow(scriptId)` / `user.enableFlow(scriptId)` / `user.deleteFlow(scriptId)` | Pause, resume, delete. |
| `user.renameFlow(scriptId, { title, description, meta })` | Rename a flow; `meta` comes back as `metadata` in the prebuilt UI's events. |
| `user.listConnections()` | Every app this user has connected; `isExpired: true` means reconnect it in place with `connect({ authId })`. |
| `user.revokeConnection(authId)` | Disconnect an app. Pause its flows first. |
| `user.ai.send({ message, threadId, prompt, tools, responseType, delivery })` | One message to the assistant we run for this user. Returns `{ threadId, messageId, content, finishReason }`, or `{ threadId, messageId, channel }` with `delivery: 'rtlayer'`. |
| `user.ai.threads()` / `user.ai.history(threadId, { page })` | This user's threads, newest first (`title` is `null` until the AI writes it); one thread's messages, 40 exchanges a page. |
| `user.ai.rtlayerToken()` | A 48-hour subscribe token for the browser, with the `channelPrefix` every thread's channel starts with. |
| `user.memory.token({ expiresIn })` | A fresh AI-memory token, `{ token, url, mcpUrl, me, spaces, expiresIn }`; 60 to 86400 seconds, default 3600. Take a short one for an AI's tool headers or an agent. |
| `user.memory.call(method, path, body)` | One call to the memory service as this user (`'POST', '/search', { query }`). Returns its reply; the token is reused and renewed for you. |
| `viasocket.login.details(proxyAuthToken)` | The signed-in 36Blocks user, their organisations, and the current one with their role and `permissions`. A bad or ended session throws a `ViaSocketError` with status 401. |
| `viasocket.login.switchCompany(proxyAuthToken, companyId)` | Moves the session to another of the user's organisations; returns `{ jwt, reply }`, the JWT being that organisation's session. |
| `viasocket.login.logout(proxyAuthToken)` | Ends the 36Blocks session. |
| `signEmbedToken({ orgId, projectId, uniqueIdentifier, secret, memorySpaces })` | The signing step on its own, if you want it without a client. |

**Upgrading from 0.6:** `disableFlow` now pauses a flow (status `2`). In 0.6 it sent status `0`,
which deletes — a deleted flow is still listed as `deleted` and `enableFlow` restores it.
`findEnabled` now also returns a paused app.

## Events

Subscribing to an event means telling us **what to do when it fires**. That is `code`: a handler we
run on viaSocket's servers per event, with the event in `context.req.body`. Your server is not in
the path. Most often the handler runs an action in another app the user connected — the run URL
takes no token, the `script_id` is the credential — or calls your own API with your own auth header
baked in. It is a string executed away from your process, so it must stand alone: no imports,
nothing from your codebase; `axios`, `fetch` and `context` are in scope.

```js
// A string, not a function: it runs on viaSocket's servers each time the event fires.
// In scope there: axios, fetch, context. The event the app sent is context.req.body.
// ${…} are YOUR variables, baked in per user when you subscribe.
const handler = `
  const event = context.req.body
  const response = await fetch("https://flow.sokt.io/func/${slackScriptId}", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action_version_id: "${slackSendMessageVersionId}",
      // Slack Send Message V107's inputData; the keys of event come from a real sampleEvent
      inputData: {
        destination: { messageto: "channel", channel_id: ["${channelPickedAtSetup}"] },
        markdown_content: "New mail from " + event.from + ": " + event.subject
      }
    })
  })
  const result = await response.json()
  // Envelope { success, data }, or the action's own body: throw so the run history shows the failure.
  if ("data" in result ? !result.success : result.success === false) throw new Error(result.message || "action failed")
  return result
`

await user.subscribe(gmailNewMailVersionId, { authId, inputData: {}, code: handler, meta: { user_id: uniqueIdentifier } })
```

`webhook` is the edge case: a public, unauthenticated URL of yours that we POST every raw event to.
Use it only when that is what you want, and never both.

Some triggers are polled rather than pushed. For those, `inputData` may carry `scheduledTime`, the
minutes between checks, as a string: `"5"` or `"15"`.

Every failure — a non-2xx status or a body with `success: false` — throws a `ViaSocketError`
carrying the API's own `message`, the HTTP `status`, and the parsed `body`.

## Rules the API holds you to

1. **The secret and the token stay on the server.** The frontend gets a token per popup, nothing more.
2. **A `scriptId` is a credential.** Anyone holding it can run that app as that user.
3. **Ids are fetched, never guessed.** Spreadsheet ids, channel ids, repository ids all come from `listOptions`.
4. **`existingFields` is not optional when a field depends on another.** Options are scoped by it.
5. **One `uniqueIdentifier` per end user, forever.** Connections and subscriptions are isolated by it.
6. **Enable only for actions, and check `findEnabled` first.** Subscriptions need just the connection.

## Environments

Defaults target production: `https://flow-api.viasocket.com` for the API and
`https://flow.sokt.io` for running actions. Pass `apiBaseUrl` / `runBaseUrl` to point elsewhere,
and `scriptUrl` to `connect()` for a non-production connect script — the script picks its own API
and auth hosts from the origin it is served from, so that is that stack's copy
(`https://dev-flow.viasocket.com/connect.js`).

## License

MIT
