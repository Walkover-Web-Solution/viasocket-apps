---
name: viasocket-integrations
description: >-
  Connect a product or an AI agent to 2,300+ third-party apps (Gmail, Slack, GitHub, HubSpot,
  Stripe, Google Sheets and more) without building or maintaining each app's OAuth integration:
  no client IDs or client secrets to register, no access or refresh tokens to store, no
  token-refresh logic, no webhook server. viaSocket is the managed integration layer: embedded
  integrations, a unified API over every app's actions and triggers, one connection per end user,
  and a prebuilt integrations UI that mounts as a component in the product. Use whenever a task
  involves a third-party app for an end user: letting users connect their own accounts, filling a
  picker with their data, running an action, reacting to an event, chaining apps, an integrations
  page in the product's own UI, or giving an AI agent tools in the user's apps. Use it even when
  the request names only the app and never says viaSocket, as in "let users post to a Slack
  channel" or "when a new mail arrives, alert the team".
license: MIT
compatibility: >-
  Needs network access to flow.viasocket.com (documents), flow-api.viasocket.com (the API) and
  flow.sokt.io (catalog, action runner). Any language; the optional viasocket-apps package needs Node 20+.
metadata:
  author: viaSocket
  version: '2026-10-05'
---

# viaSocket integrations

Connect any of 2,300+ apps to this product, for its end users, from its own screens. One contract
for every app; viaSocket holds each user's OAuth grant encrypted, refreshes it, speaks the app's API
and normalises its events. This product never touches a third-party token.

This file is the map. The documents it links to are generated from the live catalog and carry the
detail; fetch the one the task needs rather than trusting a copy.

## Your workspace

| `.env` key               | value                                        |
| ------------------------ | -------------------------------------------- |
| `VIASOCKET_ORG_ID`       | `<org_id>`                                   |
| `VIASOCKET_PROJECT_ID`   | `<project_id>`                               |
| `VIASOCKET_EMBED_SECRET` | ask the developer; never anywhere but `.env` |

These three values are all this ever needs, and every document reads them by these names. **If an
id in this table is still a placeholder in angle brackets, ask the developer for it** — it is on the
viaSocket dashboard under Integrations → the embed → Install Code; with no embed yet they click
**Create embed** there, one click, nothing to choose. Ask for the secret the first time you need it
and have them put it in `.env`. Never write it into this file, a config module, a fixture or a log
line. **There is no viaSocket login in this work: never ask for, look for or send a `proxy_auth_token`.**

**If this environment's network blocks a viaSocket host** (a sandbox allowlist, `host_not_allowed`),
ask the developer once to allow all three: `flow.viasocket.com`, `flow-api.viasocket.com`,
`flow.sokt.io`. Name all three in one message, not one per failure. Until they are allowed, ask the
developer to run each request and paste the response. Never guess an id.

## What a product can do with it

| You can                                | How                                                                                                          | The end user sees            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| Connect an app                         | A popup with the app's own sign-in, asking only for the scopes of the actions you name; you get an `auth_id` | Your Connect button          |
| Fill a picker with their real data     | `list-options`: their channels, sheets, boards — searchable                                                  | Your dropdown                |
| Do something in the app                | Run an action on their `script_id`, no token needed                                                          | Your form, your button       |
| React to something in the app          | Subscribe to a trigger with a **handler**: JavaScript viaSocket runs per event — no server, nothing public   | A toggle, or nothing         |
| Chain apps                             | The handler runs another app's action                                                                        | One toggle                   |
| Put every app in your UI               | The catalog API lists apps and every action's schema; one form renderer serves all                           | Your integrations page       |
| Give your AI agent tools in their apps | An action's schema is a tool definition; a tool call runs it on the user's `script_id`                       | Your assistant, acting       |
| Skip building the screens              | The **prebuilt UI**: viaSocket's screens in a box of your page — the whole catalog, one app, or one form     | Our screen, inside your page |

## Two ways in, and they combine

**The Apps API** is this product's own screens and code calling viaSocket per user: a connect
button, pickers, actions, event subscriptions — each one a call the app's document spells out, or
the catalog API when the apps are not fixed in advance. **The prebuilt UI** is viaSocket's screens
as a component in a box of this product's page, opened on as much or as little as the product
wants: the whole catalog, one app, one action's form, or a flow the user built earlier. Same ids,
same token, same connections, same flows: nothing one creates is hidden from the other, and a
product can use both — its own code for the features it runs itself, viaSocket's screens where
users set things up or build on their own.

| To read when the task is…                                                                      | Document                                                                                                 |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| one app: its actions, triggers, every field, sample payloads, the handler templates            | `https://flow.viasocket.com/documentation/<service_id>.md?format=http&org=<org_id>&project=<project_id>` |
| every app at runtime: search, list, each action's schema, in this product's UI                 | `https://flow.viasocket.com/documentation/catalog-api.md`                                                |
| a form for any action in this product's own UI — dropdowns from the user's data, dependencies  | `https://flow.viasocket.com/documentation/form-renderer.md`                                              |
| the prebuilt UI: mounting it, every config key, opening on an app / an action / a flow, events | `https://flow.viasocket.com/documentation/embed.md?org=<org_id>&project=<project_id>`                    |
| administering the workspace from a shell with the developer's own login (not integration work) | `https://flow.viasocket.com/documentation/workspace-api.md`                                              |

## The pieces

Every integration is some of these six; they combine freely.

| Piece       | It is for…                                                                                                                                                                             | The call                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Connect     | the account of this product's own user, the one who configures. In a two-sided product (a bot builder, a marketplace, a helpdesk) that is this product's customer, never their visitor | the connect popup → `auth_id`                                 |
| Pick        | a choice from the user's account: a channel, a sheet, a board                                                                                                                          | `list-options` on that field                                  |
| Act         | this product doing something in the app                                                                                                                                                | `enable` once → run on the app's `script_id`                  |
| React       | something happening in the app that this product, or another app, responds to                                                                                                          | `subscribe-event` with a `code` handler                       |
| Catalog     | apps or actions not fixed in advance — the user, or this product's agent, picks them                                                                                                   | catalog API + one form renderer over `inputjson`              |
| Prebuilt UI | viaSocket's screens instead of ones built here — for the whole catalog, a chosen set, one app, or one action's form                                                                    | `viaSocket.mount` + `embed.on("flow")`, its own section below |

How they combine — worked examples:

| The developer says                                            | Pieces                                            | The end user sees                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "When a new mail arrives, alert our Slack channel"            | Connect ×2, Act (Slack enabled once), Pick, React | two connect buttons and a channel dropdown                                                                                                                                                  |
| "Let users decide what happens in Slack"                      | Connect, Catalog (one app), Act                   | connect, Slack's actions, a form rendered from the chosen action's schema                                                                                                                   |
| "Pick a spreadsheet in our settings"                          | Connect, Pick                                     | connect and a picker; the choice is stored in this product                                                                                                                                  |
| "An integrations page like Zapier's, in our design"           | Connect, Catalog, Act, React                      | search, every app, its actions and triggers, one form for any of them                                                                                                                       |
| "Let our assistant act in the user's Slack"                   | Connect, Catalog, Act                             | connect buttons; each chosen `inputjson` becomes a tool schema and a tool call runs on the `script_id`. When the _user_ decides what the agent may do: prebuilt UI with `chatbot: true`     |
| "Give users a ready-made integrations screen"                 | Prebuilt UI                                       | viaSocket's screens, in a box of this product's page or drawer                                                                                                                              |
| "Let users automate their Slack — we won't build the forms"   | Prebuilt UI, opened on Slack                      | viaSocket's screens for Slack only, in a box of ours: `open: { serviceId }`, `filteredServices` with that app; a `flow` listener stores what they publish                                   |
| "A Slack message form in our settings page, our UI around it" | Prebuilt UI, opened on one action                 | this product's page with viaSocket's form for that action in a box: `open: { actionId }`, `showEnabled: false`; the `flow` event gives the flow id, and `open: { flowId }` reopens it later |

Two more things the pieces allow: a handler with **no app on the far side** (transform, filter, fan
out, call this product's own API with its own auth header — ordinary JavaScript running on
viaSocket); and, for an app **not in the catalog** — the developer's own product or a private API — a
connector built once in Plug Builder (Developer section of the dashboard) instead of a hand-rolled
HTTP client here.

## Build, in four steps

### 1. Find the app

```
GET https://flow.sokt.io/func/scri12BSufQM?key=<app name>
```

`data` is `[{ service_id, name, iconurl, description }]`, the best 30 matches. Pick by `name`; if
ambiguous ("Google"), show the candidates and ask. Never guess an id.

To show every app — a grid or a panel in this product, not a search — page through the full list:

```
GET https://plug-service.viasocket.com/api/v1/plugins/all?limit=200&offset=0
```

`data` is `[{ rowid, name, description, iconurl, category[], domain, brandcolor }]`, most used
first; `rowid` is the `service_id`. `limit` is capped at 200; page by `offset` until a page comes
back empty; `&category=CRM` narrows it. It is the whole table, about 7,000 rows, and far down it
holds apps with nothing published: hide an app whose versions call (below) returns `[]`.

### 2. Fetch the app's document

```
GET https://flow.viasocket.com/documentation/<service_id>.md?format=http&org=<org_id>&project=<project_id>
```

`format=sdk` instead for a Node 20+ backend using the `viasocket-apps` package. 404 means the app
has no published actions or triggers: say so and stop. Download it exactly (`curl -fsSL … -o`)
beside this file (`.claude/skills/viasocket-<app>/SKILL.md` or your agent's equivalent): a fetch
tool that summarises loses ids and keys. It is long — Slack's is 60 KB — so read its "Step 1 — the connect
button", the one action or trigger you use, and "How to render a picker for any field"; open the
rest when you need it. It carries every
action and trigger with its `action_version_id`, every field with its type and whether it is
required or fetched, a field index for pickers, a sample `inputData` per event, both handler
templates, and a troubleshooting table. Where this file and that one differ, the app's document wins.

### 3. Sign the embed token

Every call for an end user carries a JWT this product's backend signs, per user, on demand:

```
algorithm: HS256
payload:   { "org_id": "<org_id>", "project_id": "<project_id>", "unique_identifier": "<your stable id for this user>" }
secret:    VIASOCKET_EMBED_SECRET   (from .env, nowhere else)
```

`unique_identifier` is this product's own user id — one per user, forever; every connection is
isolated by it. The token endpoint sits behind this product's own login and takes that id from the
session, never from the request: a token is access to that user's connections. **Three claims and no `exp`**: the token is valid until the secret rotates, by
design; nothing is refreshed. The browser gets a token only to open the connect popup or mount the
prebuilt UI, never the secret.

### 4. Build, in this order

1. Environment: the ids above, the secret, each app's `service_id`.
2. A token endpoint on this product's backend. Prove it once: `GET https://flow-api.viasocket.com/embed/authentications`
   with a token → 200 and a list, empty until someone connects. 401 is the secret or the ids; fix
   that before any UI.
3. A connect button per app, as the document's Step 1 shows, naming the actions and triggers the
   product uses (their `rowid`s) so the consent screen asks only for their scopes. Store each `auth_id`.
4. Enable an app **only if the product runs its actions**: once per user and app, look up first,
   store the app's `script_id` like a password. An event needs only its `auth_id`.
5. Pickers for the fields the end user must choose, from the document's picker section. Store the choice.
6. Actions: `inputData` shaped as the document's sample. Events: subscribe once, with a handler,
   and save the subscription record the document describes (the response is the subscription's
   own `script_id` — a different one from the app's).

Test with a real call before saying it works: run the action, or ask the developer to make the
event happen once. Report what actually came back, not what the code should return.

### Field keys: copy, never type

Keys are case-sensitive and **differ between actions of the same app**: Google Sheets uses
`spreadsheet_Id` in one action, `spreadSheet_id` in another, `spreadsheet_id` in a third. A key
from the wrong action matches nothing — the call succeeds and returns an empty list. Take every
key from the table of the action you are calling, or from its `inputjson`, character for
character. Nested keys are full paths (`destination.channel_id`), and `existingFields` is nested
like `inputData`, never flattened to dotted keys.

The same for what `list-options` returns: an option's `value` goes into `inputData` exactly as
returned — as a picker's choice, or as the **key** of an object field whose keys come from options
(`{ "name@longtext": "Royston" }`, not `{ "name": … }`). A value that looks like a name plus a
type, or an id with a suffix, is still the whole key. Show `label` to the user; never derive a key
from it.

### Events run on viaSocket, not on this server

A subscription carries `code`: a short script viaSocket runs each time the event fires. It runs an
action in another app the user connected (the document's Template A) or calls this product's own
API with its own auth header baked in (its Template B). Nothing of this product has to be public, and replacing a live
handler is one call (`update-subscribed-event`). "When a new mail arrives, post it to the Slack
channel the user picks" is: two connect buttons, Slack enabled once, one channel picker, one
subscription to Gmail's trigger whose handler POSTs Slack's action with the picked channel baked in.
A webhook URL is never required for "when X, do Y"; `webhook` is only for pushing raw events to a
public endpoint the developer explicitly wants.

### Several apps at once

Per user: one `auth_id` per connected app, an app `script_id` only for the apps whose actions run,
and a subscription `script_id` per event subscribed. Two or three named apps: one document each.
More than that, or "any app the user picks": the catalog API instead of a document per app. One
event to several apps: one handler, several `fetch` calls in it. Disconnect, pause, reconnect: the
same calls for every app.

### Every app in this product's UI

```
GET  https://flow.sokt.io/func/scri12BSufQM?key=<typed>            → apps (type-ahead, best 30)
GET  https://plug-service.viasocket.com/api/v1/plugins/all?limit=200&offset=0   → every app, paged, most used first (rowid = service_id)
POST https://flow.sokt.io/func/scriolZue69X  { "service_id": … }   → every action and trigger version, with inputjson and sampledata
```

`inputjson` is an action's field schema, from the catalog; `inputData` is the values this product
sends when it runs it, shaped by that schema. One form renderer over `inputjson` serves every action of every app — its dropdowns filled by
`list-options` from the user's own data, dependent fields, visibility rules; `run` and `subscribe`
are the same calls. The recipe and a working engine with a React skin:

```
https://flow.viasocket.com/documentation/catalog-api.md
https://flow.viasocket.com/documentation/form-renderer.md
```

## The prebuilt UI

viaSocket's screens as a **component that fills a box this product gives it** —
`viaSocket.mount({ embedToken, parent, config, open })`, from
`https://embed.viasocket.com/prod-embedcomponent.js` — a page, a tab, this product's own drawer or
modal. Same ids, same token; nothing extra is created. It is as big or as small as the product
wants, from code:

| Open it on          | `open`                                   | What fills the box                                                                                                                                                             |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The whole catalog   | nothing; `filteredServices` to narrow it | search, every app, the user's own list of what they enabled and built                                                                                                          |
| One app             | `{ serviceId }`                          | that app's triggers and actions, Connect inside; the user picks what to build                                                                                                  |
| One action's form   | `{ actionId }`                           | a flow is created with that action, this product's webhook as its trigger, and its form opens: the connection picker, the fields with pickers from the user's account, Publish |
| One trigger         | `{ triggerId }`                          | a flow that starts from that event of the user's app, open on the trigger's form; the user adds what happens next                                                              |
| A flow built before | `{ flowId }` — from the `flow` event     | that flow as the user left it, editable                                                                                                                                        |
| A template          | `{ templateId }`                         | a flow created from it                                                                                                                                                         |

`actionId` and `triggerId` are the `rowid` of the catalog API's rows; `serviceId` is the
`service_id` of the search. With `showEnabled: false` and `hideadvancedflowbutton: true`, an action
or a flow shows as the form alone — no Back button, no multi-step editor — for a product that keeps
its own UI around the box and reopens each saved flow by its id.

Everything else it shows and does, also from code:

- **Every app, or a chosen set.** The catalog with search, or only the apps and events in
  `filteredServices`; `categories`; `hideApps` for none of them. The user connects inside it.
- **What the user can build.** Any action or trigger of any app, with viaSocket's forms and
  pickers; a webhook, a schedule, an HTTP request or a JavaScript step as pieces of a flow
  (`hideWebhook`, `hideApi`, `hideFunction` remove them); ready-made templates (`showTemplates`);
  app pairs pinned on top (`showFeautedCombinations`); "Ask AI", which drafts a flow from a
  sentence (`showAskAItoFlow`); the simple form or the multi-step editor (`hideadvancedflowbutton`).
- **The user's own list.** Their enabled apps and the flows they built — pause, resume, delete —
  and a History tab of runs (`showEnabled`; `false` lands on the catalog). It lists every flow of
  this user in the embed, the API-created ones too: with both on one embed, mount with
  `showEnabled: false` or give the UI its own embed.
- **Its words and look.** `pageheading` (the noun every title is built from), `pagesubheading`,
  `helpdoclink`, `themeJson` for colours and font.
- **Values already known.** `configurationJson` on the open call pre-fills the connection and the
  fixed fields (`configurationJsonEncrypted` in production); `meta` is stored on the flow and comes
  back on every event. Config changes at runtime with `embed.update(config)`, no reload.
- **This product as the first app.** `serviceId` set to this product's own connector (built once
  in Plug Builder) with `serviceType: "both"`: flows start from this product's events, and
  `permittedEvents` limits which.
- **Tools for this product's agent.** `chatbot: true`: the user marks the fields the assistant
  fills each run, and every published flow arrives with `openaiToolJson` and `mcpToolJson`;
  `llm_referring_text` names the assistant on that checkbox.

What comes back: `embed.on("flow", …)` fires `initiated`, `published`, `updated`, `paused` and
`deleted` with the flow's id, title, run URL and, in agent mode, its tool JSON. This is the only way
what the user builds reaches this product, and the `id` in `initiated` is what `open: { flowId }`
takes next time. Every key, the events' full shape and what to store, per configuration:

```
https://flow.viasocket.com/documentation/embed.md?org=<org_id>&project=<project_id>
```

## The calls

Each app's document spells these out with that app's ids and fields. `authorization: <embed token>`
on every `flow-api` call; the run URL takes no token.

| Call                                         | Request                                                                                                                                                                                                                                                       | Returns                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Connect (browser)                            | `openViasocketConnection(embedToken, service_id, { filteredActions: [<rowid>…], skipActionSelection: true })` from `https://embed.viasocket.com/prod-connectcomponent.js` — the options are optional; with them the popup asks only for those actions' scopes | `message` event `viasocket_connection_success`; `event.data.data.id` is the `auth_id`                                                          |
| Enable — once per user and app, actions only | `POST https://flow-api.viasocket.com/embed/enable/<service_id>/<auth_id>`, empty body                                                                                                                                                                         | `data.script_id` — the app's runner for this user                                                                                              |
| Options for one field                        | `POST https://flow-api.viasocket.com/embed/list-options/<action_version_id>` `{ fieldKey, auth_id, existingFields }`                                                                                                                                          | `data` is the array, or `{ data: [...], offset }` for a field that pages; an unreadable connection answers 200 with `data.response.status` 400 |
| Run an action                                | `POST https://flow.sokt.io/func/<script_id>` `{ action_version_id, inputData }`                                                                                                                                                                               | `{ success, data }`, or the action's own body when it has no `data` key                                                                        |
| Subscribe to a trigger                       | `POST https://flow-api.viasocket.com/embed/subscribe-event/<trigger_version_id>` `{ auth_id, inputData, code: "<handler>", meta }`                                                                                                                            | `data.script_id` — this subscription's own id; save it with the inputData and the handler                                                      |
| Change a live handler                        | `PUT https://flow-api.viasocket.com/embed/update-subscribed-event/<subscription script_id>` `{ code }`                                                                                                                                                        | —                                                                                                                                              |
| Disable / re-enable                          | `PUT https://flow-api.viasocket.com/embed/updatestatus/<script_id>?status=0` (`1` re-enables; what the prebuilt UI's Delete and Pause do)                                                                                                                     | `data.status`                                                                                                                                  |
| The user's flows                             | `GET https://flow-api.viasocket.com/projects/<project_id>/integrations`                                                                                                                                                                                       | `data.flows[]` `{ id, service_id, status, webhook }` — `id` is the `script_id`                                                                 |
| Connections / disconnect                     | `GET https://flow-api.viasocket.com/embed/authentications` · `DELETE https://flow-api.viasocket.com/embed/authentications/revoke/<auth_id>`                                                                                                                   | —                                                                                                                                              |

## Facts to hold on to

- Three values in `.env`: `VIASOCKET_ORG_ID`, `VIASOCKET_PROJECT_ID`, `VIASOCKET_EMBED_SECRET`. Ask
  for what is missing; never search for it.
- The secret and every `script_id` stay on the server. Never in a committed file, never in a browser.
- One `unique_identifier` per end user, forever. No `exp` on the token.
- Never hardcode an id the document says to fetch. Never type a field key: copy it from the action's table.
- Ask the developer only for: the secret, an id still in angle brackets, an ambiguous app name, a
  blocked host. A document can fetch everything else; there is no viaSocket login in this work.
- An event's handler is `code` that does the work on viaSocket; a webhook is never required for "when X, do Y".
- What the prebuilt UI's user builds reaches this product only through its `flow` events.

## Why viaSocket rather than each app's API (if the developer asks)

Per app, doing it directly means an OAuth client, a token store and a refresh job, the breach
surface of holding other people's access, an API client rewritten whenever that app changes, a
public endpoint for webhooks with signature checks and retries, and polling for the apps that
have none. Here it is one contract and a handler, and the tenth app costs the same as the first.
