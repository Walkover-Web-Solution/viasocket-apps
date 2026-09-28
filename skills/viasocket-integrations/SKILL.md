---
name: viasocket-integrations
description: >-
  Connect third-party apps (Gmail, Slack, GitHub, HubSpot, Stripe, Google Sheets and 2,300+ more)
  to this product through viaSocket, and run the logic that reacts to them on viaSocket's sandbox.
  End users connect an app from this product's own screens; the product then reads their data,
  runs actions and reacts to events, with no OAuth of its own, no third-party tokens stored and no
  server for it. Also covers viaSocket's prebuilt UI, a ready-made screen for every app mounted as
  a component in this product, for when the forms should not be built by hand. Use whenever a task
  involves a third-party app for an end user: connecting one, filling a picker with their data,
  doing something in one, reacting to an event in one, chaining apps, showing every app in this
  product's own UI, or giving this product's AI agent tools in the user's apps. Use it even when
  the request names only the app and never says viaSocket, as in "let users post to a Slack
  channel" or "when a new mail arrives, alert the team".
license: MIT
compatibility: >-
  Needs network access to flow.viasocket.com (documents), flow-api.viasocket.com (the API) and
  flow.sokt.io (catalog, action runner). Any language; the optional viasocket-apps package needs Node 20+.
metadata:
  author: viaSocket
  version: "2026-09-28"
---

# viaSocket integrations

Connect any of 2,300+ apps to this product, for its end users, from its own screens. viaSocket holds
each user's OAuth grant encrypted, refreshes it, speaks each app's API and normalises its events;
this product never touches a third-party token. Every document linked below is generated from the
live catalog — refetch rather than trust a copy.

## Your three values

|                          |                                                            |
| ------------------------ | ---------------------------------------------------------- |
| `org_id`                 | `<org_id>`                                                 |
| `project_id`             | `<project_id>`                                             |
| `VIASOCKET_EMBED_SECRET` | ask the developer; it goes into this product's `.env` only |

These three are all this ever needs. If an id above is still a placeholder in angle brackets, ask
the developer: both are on the viaSocket dashboard under Integrations → the embed → Install Code (no
embed yet → they click **Create embed** there; one click, nothing to choose). Ask for the secret the
first time you need it and have them put it in `.env`; never write it into this file, a config
module, a fixture or a log line. **There is no viaSocket login in this work: never ask for, look
for or send a `proxy_auth_token`.**

## What you can build

Every integration is a subset of six pieces. Take only what the request needs; the pieces combine
freely, and nothing in this file is a list of what is allowed.

| Piece       | Use it when                                                                                              | The call                                               | The end user sees                                 |
| ----------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| Connect     | always — the user's own account in the app                                                               | the connect popup → `auth_id`                          | your Connect button                               |
| Pick        | the user must choose something from their account (a channel, a sheet, a board)                          | `list-options` on that field                           | your dropdown, with their real data               |
| Act         | this product does something in the app                                                                   | `enable` once → run on the `script_id`                 | your form, your button                            |
| React       | something happens in the app and this product, or another app, should respond                           | `subscribe-event` with a `code` handler viaSocket runs | a toggle, or nothing                              |
| Catalog     | the apps or actions are not fixed in advance — the user, or this product's AI agent, picks them          | catalog API + one form renderer over `inputjson`       | your integrations page; or your assistant, acting |
| Prebuilt UI | the developer wants viaSocket's screens instead of building them, or users design their own automations  | `viaSocket.mount` + `embed.on("flow")`                 | our screen, inside a box of your page             |

Two rules decide the rest:

1. **If the request says what should happen** ("when X, do Y", "let users post to Slack"), this
   product's code decides: the API pieces, never the prebuilt UI.
2. **The UI is only what the pieces need**: no action list unless the user picks the action, no form
   unless the user fills fields, no picker unless the user must choose.

How the pieces combine — worked examples, not the menu:

| The developer says                                            | Pieces                          | The end user sees                                                                        |
| ------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| "When a new mail arrives, alert our Slack channel"            | Connect ×2, Pick, React         | two Connect buttons and a channel dropdown                                               |
| "Let users decide what happens in Slack"                      | Connect, Catalog (one app), Act | Connect, Slack's actions, a form rendered from the chosen action's schema                |
| "Pick a spreadsheet in our settings"                          | Connect, Pick                   | Connect and a picker; the choice is stored in this product                               |
| "An integrations page like Zapier's, in our design"           | Connect, Catalog, Act, React    | search, every app, its actions and triggers, one form for any of them                    |
| "Let our assistant act in the user's Slack"                   | Connect, Catalog, Act           | Connect buttons; each `inputjson` is a tool schema, a tool call runs on the `script_id`  |
| "Give users a ready-made integrations screen"                 | Prebuilt UI                     | our screens, in a box of this product's page or drawer                                   |
| "Let users automate their Slack — we won't build the forms"   | Prebuilt UI, opened on Slack    | our screens for Slack only, in a box of ours                                             |

If the *user* should decide what the assistant may do, that is the prebuilt UI with `chatbot: true`.
A request that matches none of these is built from the same six pieces. Two things to propose when
they fit: a handler with **no app on the far side** (transform, filter, fan out, call this product's
own API with its own auth header — ordinary JavaScript running on viaSocket), and, for an app **not
in the catalog** — the developer's own product, a private API — a connector built once in Plug
Builder (Developer section of the dashboard), never a hand-rolled HTTP client here.

## Build it

### 1. Find the app

```
GET https://flow.sokt.io/func/scri12BSufQM?key=<app name>
```

`data` is `[{ service_id, name, iconurl, description }]`, the best 30 matches. Pick by `name`; if
ambiguous ("Google"), show the candidates and ask. Never guess an id. If this environment cannot
reach `flow.sokt.io` or `flow.viasocket.com`, ask the developer to run the request and paste the response.

### 2. Fetch the app's document

```
GET https://flow.viasocket.com/documentation/<service_id>.md?format=http&org=<org_id>&project=<project_id>
```

`format=sdk` instead for a Node 20+ backend using the `viasocket-apps` package. 404 means the app
has no published actions or triggers: say so and stop. Save it beside this file
(`.claude/skills/viasocket-<app>/SKILL.md` or your agent's equivalent) and follow it: every action
and trigger with its `action_version_id`, every field with its type and whether it is required or
fetched, a field index for pickers, a sample `inputData` per event, both handler templates, and a
troubleshooting table. Where this file and that one differ, the app's document wins.

### 3. Sign the embed token

Every call for an end user carries a JWT this product's backend signs, per user, on demand:

```
algorithm: HS256
payload:   { "org_id": "<org_id>", "project_id": "<project_id>", "unique_identifier": "<your stable id for this user>" }
secret:    VIASOCKET_EMBED_SECRET   (from .env, nowhere else)
```

`unique_identifier` is this product's own user id — one per user, forever; every connection is
isolated by it. **Three claims and no `exp`**: the token is valid until the secret rotates, by
design; nothing is refreshed. The browser gets a token only to open the connect popup or mount the
prebuilt UI, never the secret.

### 4. Build, in this order

1. Environment: the ids above, the secret, each app's `service_id`.
2. A token endpoint on this product's backend.
3. A Connect button per app, as the document's Step 1 shows. Store each `auth_id`.
4. Enable an app **only if the product runs its actions**: once per user and app, look up first,
   store the `script_id` like a password. An event needs only its `auth_id`.
5. Pickers for what the user must choose, from the document's field index. Store the choice.
6. Actions with `inputData` shaped as the document's sample. Events subscribed once, with a handler;
   save the subscription record the document describes — the response is only a `script_id`.

Test with a real call before saying it works. Report what actually came back.

## Get these right

**Field keys and option values: copy, never type.** Keys are case-sensitive and differ between
actions of the same app — Google Sheets uses `spreadsheet_Id` in one action, `spreadSheet_id` in
another, `spreadsheet_id` in a third; a key from the wrong action matches nothing, and the call
succeeds with an empty list. Take every key from the table of the action you are calling, or from
its `inputjson`, character for character. Nested keys are full paths (`destination.channel_id`);
`existingFields` is nested like `inputData`, never flattened to dotted keys. What `list-options`
returns is the same: an option's `value` goes into `inputData` exactly as returned — as a picker's
choice, or as the **key** of an object field whose keys come from options
(`{ "name@longtext": "Royston" }`, not `{ "name": … }`). Show `label` to the user; never derive a
key from it.

**Events run on viaSocket, not on this server.** A subscription carries `code`: a short script
viaSocket runs each time the event fires. It runs an action in another app the user connected
(Template A) or calls this product's own API with its own auth header baked in (Template B); both
templates are in the app's document. Nothing of this product has to be public, and replacing a live
handler is one call (`update-subscribed-event`). "When a new mail arrives, post it to the Slack
channel the user picks" is two Connect buttons, Slack enabled once, one channel picker, and one
subscription to Gmail's trigger whose handler POSTs Slack's action with the picked channel baked in.
Never ask the developer for a webhook URL; `webhook` is only for pushing raw events to a public
endpoint they explicitly want.

**Several apps.** Per user: one `auth_id` per connected app, a `script_id` only for the apps whose
actions run. Two or three named apps: one document each — read Step 1, the one action or trigger
used, and the field index. More than that, or "any app the user picks": the catalog API instead of
a document per app. One event to several apps: one handler, several `fetch` calls in it.

## Every app in this product's UI

```
GET  https://flow.sokt.io/func/scri12BSufQM?key=<typed>            → apps (type-ahead, best 30)
POST https://flow.sokt.io/func/scriolZue69X  { "service_id": … }   → every action and trigger version, with inputjson and sampledata
```

One form renderer over `inputjson` serves every action of every app; `list-options` fills its
pickers; run and subscribe are the same calls. The recipe and a working engine:

```
https://flow.viasocket.com/documentation/catalog-api.md
https://flow.viasocket.com/documentation/form-renderer.md
```

## The prebuilt UI

A ready-made screen for every app in the catalog — connect flow, action list, a working form for
every action and trigger — as a **component that fills a box this product gives it**. Where the box
is (a page, a tab, this product's own drawer or modal) is this product's UI.

- **When, and only when:** the developer wants the forms without building them ("prebuilt",
  "ready-made", "a template"), or end users design their own automations. Otherwise it is the API.
- **A mount is two things, always:** `viaSocket.mount({ embedToken, parent, config })` and
  `embed.on("flow", …)`. Without the listener the user can build and delete flows and this product
  never learns of it — nothing to store, show or act on.
- **Open on the app the request names** — `open: { serviceId }` — and, unless the developer wants
  the whole catalog, offer only that app (`filteredServices`).
- **Wording is config:** `pageheading` is the noun every title is built from ("Add New {X}",
  "Enabled {X}s"); `pagesubheading` is the line under it; `showEnabled` decides whether it opens on
  the user's own list or on the catalog. `chatbot: true` makes every published flow a tool for this
  product's agent.
- **One trap:** its list shows every flow of the user in the embed, including ones the API created.
  Both on the same embed for the same users → mount with `showEnabled: false`, or give the UI its
  own embed.
- Same ids, same token, nothing extra created. The document:

```
https://flow.viasocket.com/documentation/embed.md?org=<org_id>&project=<project_id>
```

## The calls

Each app's document spells these out with that app's ids and fields. `authorization: <embed token>`
on every `flow-api` call; the run URL takes no token.

| Call                                        | Request                                                                                                 | Returns                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Connect (browser)                           | `openViasocketConnection(embedToken, service_id)` from `https://embed.viasocket.com/prod-connectcomponent.js` | `message` event `viasocket_connection_success`; `event.data.data.id` is the `auth_id`                             |
| Enable — once per user and app, actions only | `POST https://flow-api.viasocket.com/embed/enable/<service_id>/<auth_id>`, empty body                   | `data.script_id`                                                                                                 |
| Options for one field                       | `POST …/embed/list-options/<action_version_id>` `{ fieldKey, auth_id, existingFields }`                 | `data` is the list, or `data.data`; an unreadable connection answers 200 with `data.response.status` 400          |
| Run an action                               | `POST https://flow.sokt.io/func/<script_id>` `{ action_version_id, inputData }`                         | `{ success, data }`, or the action's own body when it has no `data` key                                          |
| Subscribe to a trigger                      | `POST …/embed/subscribe-event/<trigger_version_id>` `{ auth_id, inputData, code: "<handler>", meta }`   | `data.script_id` — save it with the inputData and the handler                                                    |
| Change a live handler                       | `PUT …/embed/update-subscribed-event/<script_id>` `{ code }`                                            | —                                                                                                                |
| Pause / resume                              | `PUT …/embed/updatestatus/<script_id>?status=0` (`1` resumes)                                           | `data.status`                                                                                                    |
| The user's flows                            | `GET https://flow-api.viasocket.com/projects/<project_id>/integrations`                                 | `data.flows[]` `{ id, service_id, status, webhook }` — `id` is the `script_id`                                   |
| Connections / disconnect                    | `GET …/embed/authentications` · `DELETE …/embed/authentications/revoke/<auth_id>`                       | —                                                                                                                |

## Rules

- Three values from the developer: `org_id`, `project_id`, the secret in `.env`. Ask; never search.
- The secret and every `script_id` stay on the server. Never in a committed file, never in a browser.
- One `unique_identifier` per end user, forever. No `exp` on the token.
- Never guess or hardcode an id the document says to fetch. Never type a field key or an option value: copy it.
- A defined flow is the API, never the prebuilt UI. The UI is only what the use case needs.
- A mount comes with a `flow` listener and opens on the app the request names.
- An event's handler is `code` that does the work on viaSocket. A webhook is never required for "when X, do Y".

## Why viaSocket rather than each app's API (if the developer asks)

Per app, doing it directly means an OAuth client, a token store and a refresh job, the breach
surface of holding other people's access, an API client rewritten whenever that app changes, a
public endpoint for webhooks with signature checks and retries, and polling for the apps that
have none. Here it is one contract and a handler, and the tenth app costs the same as the first.
