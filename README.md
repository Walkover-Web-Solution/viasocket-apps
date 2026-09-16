# viasocket-apps

Server-side client for the viaSocket Apps API. Let your users connect Slack, GitHub, Google
Sheets or any of 2,300+ apps from your own product, then run actions and receive events through
one API — with the OAuth, token refresh, per-app request shapes, polling and retries handled for
you.

Zero dependencies. Node 20+, Bun, Deno and edge runtimes.

```sh
npm install viasocket-apps
```

The same calls are documented as plain HTTP in your viaSocket dashboard under
**Integrations → your Apps API integration → API reference**. Use whichever suits your stack;
this package is a thin, typed layer over those endpoints and adds nothing they don't have.

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

// 2. After the popup posts back an auth_id: enable the app, once, to run actions.
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

// 5. Or subscribe to an event. Needs only the connection, not enable().
const subscription = await user.subscribe(triggerVersionId, {
  authId,
  inputData: { channel_id: ['C08SXCV3J85'] },
  webhook: 'https://your-app.com/webhooks/viasocket',
  meta: { userId: 'user_123' }
})
```

## Browser

```js
import { connect } from 'viasocket-apps/browser'

// embedToken comes from your backend (user.token()), signed for the signed-in user.
const { authId } = await connect({ embedToken, serviceId: 'rowbu58rc' })
// Send authId to your backend, which enables the app and stores the script_id.
```

`connect()` rejects with a `ViaSocketConnectError` whose `code` is `'closed'` (the user gave up),
`'rejected'` (the app said no) or `'script'` (the connect script did not load).

## Methods

| Call | What it does |
| --- | --- |
| `viasocket.user(id)` | Scope every call below to one end user. |
| `user.token()` | Signed embed token for that user; hand it to the frontend. |
| `user.enable(serviceId, authId)` | Turn a connection into a `scriptId` for running actions. Once per connection. |
| `user.findEnabled(serviceId)` | The `scriptId` if this app is already enabled, else `null`. Call before `enable`. |
| `user.listOptions(actionVersionId, { fieldKey, authId, existingFields })` | The values a field accepts, as `{ options, offset }`. Both response shapes normalised. |
| `viasocket.runAction(scriptId, actionVersionId, inputData)` | Run one action. Returns the app's own response. |
| `user.subscribe(triggerVersionId, { authId, inputData, webhook \| code, meta })` | Subscribe to an app event. Returns `{ scriptId, hookUrl, … }`. |
| `user.updateSubscription(scriptId, { code, meta })` | Change a live subscription in place. |

`webhook` is a URL of yours that we POST each event to. `code` is the alternative: a script we run
on viaSocket's servers each time the event fires. It is a string, executed away from your process,
so it must stand alone — no imports, nothing from your codebase. In scope there are `axios`, `fetch`
and `context`, and the event the app sent is `context.req.body`:

```js
await user.subscribe(triggerVersionId, {
  authId,
  inputData,
  code: `
    const event = context.req.body
    await axios.post("https://your-app.com/webhooks/viasocket", { event, user_id: "${endUserId}" })
    return { forwarded: true }
  `
})
```
| `user.listFlows()` | Every enabled app and subscription this user has. |
| `user.disableFlow(scriptId)` / `user.enableFlow(scriptId)` | Turn a flow off or back on. Disabling a subscription ends it. |
| `user.listConnections()` | Every app this user has connected. |
| `user.revokeConnection(authId)` | Disconnect an app. Disable its flows first. |
| `signEmbedToken({ orgId, projectId, uniqueIdentifier, secret })` | The signing step on its own, if you want it without a client. |

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
and `scriptUrl` to `connect()` for a non-production connect script.

## License

MIT
