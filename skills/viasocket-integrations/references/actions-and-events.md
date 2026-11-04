# Actions, options and events

Back to the skill: https://viasocket.com/docs/skill.md

Here the product acts in its users' apps and hears from them. With the user's `auth_id`
(connect.md) it reads options from their account, runs the app's actions and reacts
to its events. Every key decided on this page is a question the user is never asked twice, or an action that never
fails on a guessed value. Code names the app by its **slug** (`gmail`), an action or trigger by its **key**
(`Send_Email`) and a version by its number (`v55`): no row id is ever copied into code.

Every function named here (`findEnabledApp`, `runAction`, …) is defined in https://viasocket.com/docs/apps-api.md:
copy its module once.

## Find what to call

1. **The app:** `searchApps(name)`, apps whose name starts with the text (try the first word: "google", not
   "sheets"); its `appslugname` is the slug. Several matches? Show them and ask.
2. **Its page,** `https://viasocket.com/docs/<app_slug>.md`: its sign-in, its icon, and every action and trigger in one line
   (add `search=<words>` as a query parameter to filter them). Choose the action or trigger the task needs.
3. **The action's or trigger's page,** linked from the app's: its key and version, its `inputData` as a TypeScript type.
4. **At run time,** `listActions(userId, '<app_slug>')` is the same list from viaSocket itself: each event's `key`, its
   published `version` and every `versions` entry. Read keys from it or from the page, never from memory.

## The tags on an action's keys

The action's page tags some keys of `inputData`:

- **`PICK`**: the value must come from `listOptions`, an option the user chooses from a list (an id, never typed),
  or from the event or record that already names that thing (the pull request number in a pull-request event, the
  row id a list call answered).
- **`KEYS`**: an object whose keys are option `value`s from `listOptions`, one entry per chosen option.
- **`WHEN <condition>`**: send the key only while the condition holds.

## The order

Enabling an app creates one flow (its `script_id`) per user and app that runs any of that app's actions; do it once,
store the `script_id`, and run every action through it. Each id comes from the step before it.

A `script_id` is a credential. Running an action through it needs no token: the id alone acts as that user on that
app, which is why the server sends no embed token at run time. So the `auth_id`, the enabled app's `script_id` and
each subscription's `script_id` are stored on the server per user and app, like a password: never in the browser, a
URL, a log or client code, and never handed to another user. Before running an action, the product's endpoint checks
that the signed-in user owns the `script_id` it is about to use; a request naming someone else's id is refused.

```js
const slug = '<app_slug>'

// run an action (enable once per user and app)
const scriptId = (await findEnabledApp(userId, slug)) || (await enableApp(userId, slug, authId))
const { options } = await listOptions(userId, slug, '<action_key>', { fieldKey: '<dotted.key>', authId, existingFields }) // per PICK key
const result = await runAction(scriptId, '<action_key>', actionInput, { version: '<version>' })

// react to events (needs only the auth_id)
const { actions } = await listActions(userId, slug)
const trigger = actions.find((event) => event.key === '<trigger_key>')
const authType = (await listEvents(userId, slug)).service.auth_type
const event = await sampleEvent(trigger.action_id, authId, authType, triggerInput) // map the handler from this
const subscriptionId = await subscribeEvent(
  userId,
  slug,
  '<trigger_key>',
  authId,
  triggerInput,
  { code: handler },
  { version: '<version>' }
) // handler: Events below
```

`<action_key>` and `<trigger_key>` are the event's key as its page and the listing show it (`Send_Email`, exact, case-sensitive:
the page's path `send-email` is not the key); `<version>` its version (`v55`). `actionInput` is the action's `inputData`;
`triggerInput` is the trigger's own settings, from its page. A paused enabled app (`status: 'paused'` in the flow list)
is resumed with `setFlowStatus(userId, scriptId, 1)`, never
enabled again.

## Keys, versions and values

- **One key per event.** Running, options and subscribing name an action or trigger by its key, plus a version.
  The sample event, automations, the prebuilt UI and Connect's `filteredActions`
  take the plain `action_id` / `trigger_id` instead (`action_id` in the listing, on the event's page).
- **Pin the version when code fills the `inputData`.** A newer version may rename or add fields; the pinned one keeps
  the call working until the code is moved on purpose. Leave the version out when the user fills the form from the
  live schema, so they get the current fields. The listing says which version is published and which others exist;
  a version it does not list answers 404.
- **Copy keys, never type them.** Field keys are case-sensitive and differ between actions of one app (`spreadsheet_Id`,
  `spreadSheet_id`); nested keys are full dotted paths.
- **Decide every key.** Send it or leave it out on purpose; never drop a required one because it looks technical.
  - A `PICK` key, and any value that depends on the end user's own account (their workspace, personal or shared,
    admin or not): the end user chooses it on screen, from `listOptions`.
  - A value that differs on every run: the product's own data or its AI fills it.
  - A constant in code only when one value is right for every user; the report says why.
  - Never a text box for an id. Never the first option because it came first.
- **Once, or per run.** A `PICK` value that is the same for every run of one user (their site, property, workspace,
  team, calendar, account, board) is chosen **once, right after Connect**, not again in every action's form: show the
  list on the connection's own screen, store the choice with the `auth_id`, show it there and let them change it,
  and fill the key from it on every run. The app's page has a **Pickers** table for exactly this: for each such key,
  the event and `fieldKey` that list it before any action is chosen (`Get_Site` lists `siteUrl` for Search Console).
  A value that changes with the run (a message, a row, a date range, a recipient) is chosen in the action's own form
  or filled by the product. Say which in the plan table of app-integrations.md; the person you work for
  confirms it.

## Options

- `fieldKey` is the full dotted path (`destination.channel_id`).
- `existingFields` holds the values chosen so far, nested like `inputData`; clear a key when what it depends on
  changes.
- **Search:** the user's typed text goes in `search`, debounced (~300 ms). A field that supports search (the page
  marks it `searchable`) filters on viaSocket's side; the others ignore it, so filter their list in the product. A
  new text starts a new list, without `paginate`.
- **Pagination:** a field that pages answers `hasMore: true` and a `paginate` value. Send that value back, with the same
  `search` and `existingFields`, to get the next page, and append; `paginate` is `null` when there is no more. The
  value is opaque: a page number for one app, a cursor for another. Page as the user scrolls or clicks "more";
  never load every page of a long list to render the first.
- A field can answer a `message` with its list, for the user to see (why it is empty, what to choose first). Show it.
- Show `label`, send `value` verbatim. A `KEYS` key takes one entry per option `value`.
- A once-after-Connect list (the app page's Pickers table) is read the same way, from the event the table names;
  `existingFields` holds the keys its "needs first" column lists:

```js
// right after Connect: the user's Search Console sites, once, stored with the auth_id
const { options } = await listOptions(userId, slug, 'Get_Site', { fieldKey: 'siteUrl', authId }) // from the app page's Pickers table

// a long, searchable list, as the user types and scrolls
const page = await listOptions(userId, slug, '<action_key>', {
  fieldKey: 'spreadsheet_id',
  authId,
  existingFields,
  search: typed,
  paginate: lastPage?.paginate
})
// page.options, page.hasMore, page.paginate, page.message
```

## Your own code with the user's connection

For an API the app's actions do not cover, `runCode(scriptId, code, inputData, { action })`
runs a string of JavaScript where the action would run: `context.inputData` is the input, `context.authData` the
connection's credentials, and `axios` and `fetch` attach them to calls to the app's own domains; `return` the value
the caller gets. Name an `action` and its helper functions are in scope. Prefer an action whenever one exists:
the code is the product's to keep working when the app's API changes, and it is listed as such in the report.

## Events

A subscription runs a **handler** on viaSocket once per event: a string of JavaScript with `context`, `fetch` and
`axios` in scope and the event at `context.req.body`, no imports. The handler string is built on the server at
subscribe time and lives on viaSocket, so it may contain what it needs to act: another app's `script_id`, an action
key and version, or a bearer token the product's own events endpoint accepts for this user. It is never committed or
logged. Map its keys from a real event (`sampleEvent`) for the same connection; it wins over the page's sample.

Send the event to the product's own API, with its own auth header, so the endpoint stays protected:

```js
const handler = `await axios.post("https://your-app.com/api/viasocket-events", { event: context.req.body, user: "${userId}" },
  { headers: { authorization: "Bearer ${apiKeyForThisUser}" } })`
```

Or run another app's action, with no server of the product involved. Before subscribing, enable that app for this
user (its `script_id`); the key and the version are baked into the string, so update the handler when the code moves
to a newer version:

```js
const handler = `
const body = context.req.body
const res = await axios.post("https://flow.sokt.io/func/${otherScriptId}", {
  action: "${otherActionKey}",
  version: "${otherActionVersion}",
  inputData: { /* built from body: keys from a real sampleEvent, values decided as above */ }
})
const out = res.data
const failed = typeof out?.success === "boolean" && "data" in out ? !out.success : out?.success === false
if (failed) throw new Error(out?.errorMsg?.message || out?.message || "action failed")  // shows in the run history
return out`
```

- Save `{ userId, app, trigger_key, version, script_id, auth_id, inputData, handler }` in the product's database in
  the same write that records the subscribe call's result: the flow list returns neither `inputData` nor the handler,
  so this record is the only copy.
- A polled trigger takes `scheduledTime` (minutes, as a string) in `inputData`.
- `{ webhook: url }` instead of `{ code }` only when the person you work for asks for exactly that.

## When it goes wrong

| symptom                                                     | cause                                                                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401 / invalid token                                         | Wrong secret, a claim missing, or a `Bearer` prefix.                                                                                                    |
| 404 unknown app, action or version                          | A slug, key or version typed from memory: copy it from the page or the listing. Keys are case-sensitive; the page's path (`send-email`) is not the key. |
| Empty option list                                           | `fieldKey` is the leaf, `existingFields` is flat or misses a dependency; or the field answered a `message`: show it.                                    |
| Options throw `Auth data not found`                         | The connection is revoked or belongs to another user. Reconnect.                                                                                        |
| The app rejects the action                                  | An invented value for a `PICK` key, or a `WHEN` key sent while its condition is false.                                                                  |
| A run fails with the app's message                          | The reply is `400` with `errorMsg: { status, message, data }`: the app's own status and message are in there.                                           |
| The user is asked the same thing in every action            | A once-per-user `PICK` (site, property, workspace) built per run: choose it once after Connect.                                                         |
| Code reads `undefined` from a result or an event            | The shape came from a sample, not from a real run or a real event.                                                                                      |
| `sampleEvent` answers `"No response"`                       | It got a version id or a key; it takes the plain `trigger_id` (`actionId` in the listing).                                                              |
| The fields changed under the code                           | The app published a newer version and the code names none: pin the version, or reread the page.                                                         |
| The same event fires twice, or two `script_id`s for one app | Subscribed or enabled twice: check the saved record and the enabled app first.                                                                          |
| A user's connections seem lost                              | A different `userId` (`unique_identifier`) for the same person.                                                                                         |

END OF PAGE
