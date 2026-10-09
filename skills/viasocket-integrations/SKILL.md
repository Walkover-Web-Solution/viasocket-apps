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
  version: '2026-10-09'
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
line. **There is no viaSocket login in this work: never ask the developer for, or look for, a login
token.**

**If this environment's network blocks a viaSocket host** (a sandbox allowlist, `host_not_allowed`),
ask the developer once to allow all three: `flow.viasocket.com`, `flow-api.viasocket.com`,
`flow.sokt.io`. Name all three in one message, not one per failure. Until they are allowed, ask the
developer to run each request and paste the response. Never guess an id.

## Two ways in, and they combine

**The Apps API** is this product's own screens and code calling viaSocket per user: a connect
button, pickers, actions, event subscriptions — each one a call the app's document spells out, or
the catalog API when the apps are not fixed in advance, or the Automation API when the product wants
a whole flow — trigger and steps — run on viaSocket. **The prebuilt UI** is viaSocket's screens
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
| a whole automation built from code — a trigger and steps across apps, run on viaSocket's VM    | `https://flow.viasocket.com/documentation/automations.md?org=<org_id>&project=<project_id>`              |
| the prebuilt UI: mounting it, every config key, opening on an app / an action / a flow, events | `https://flow.viasocket.com/documentation/embed.md?org=<org_id>&project=<project_id>`                    |
| administering the workspace from a shell with the developer's own login (not integration work) | `https://flow.viasocket.com/documentation/workspace-api.md`                                              |

## The pieces

Every integration is some of these seven; they combine freely.

| Piece       | It is for…                                                                                                                                                                                                                                               | The call                                                                                                                                      | The end user sees                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Connect     | the account of this product's own user, the one who configures. In a two-sided product (a bot builder, a marketplace, a helpdesk) that is this product's customer, never their visitor                                                                   | the connect popup → `auth_id`: the app's own sign-in, asking only for the scopes of the actions named                                         | Your Connect button                            |
| Pick        | a choice from the user's account: a channel, a sheet, a board — searchable                                                                                                                                                                               | `list-options` on that field                                                                                                                  | Your dropdown                                  |
| Act         | this product doing something in the app                                                                                                                                                                                                                  | `enable` once → run on the app's per-user `script_id`, no token needed                                                                        | Your form, your button                         |
| React       | something happening in the app that this product, or another app, responds to; chaining apps is the handler running another app's action                                                                                                                 | `subscribe-event` with a `code` handler: JavaScript viaSocket runs per event — no server here, nothing public                                 | A toggle, or nothing                           |
| Catalog     | apps or actions not fixed in advance — the user, or this product's agent, picks them; an action's `input_schema` is also a tool definition, and a tool call runs it on the user's `script_id`                                                            | catalog API + one form renderer over `input_schema`                                                                                           | Your integrations page; your assistant, acting |
| Automate    | a whole automation — a trigger (an app event, a schedule, or a webhook this product calls) and ordered steps across the user's apps — written by this product's code or its agent and run in viaSocket's isolated VM; no scheduler, queue or worker here | three calls — create flow, set trigger, save steps — in its own document (above); they take `action_id`s and `trigger_id`s, never version ids | Nothing — or the results in their apps         |
| Prebuilt UI | viaSocket's screens instead of ones built here — the whole catalog, a chosen set, one app, or one action's form                                                                                                                                          | `viaSocket.mount` + `embed.on("flow")`, its own section below                                                                                 | Our screen, inside your page                   |

How they combine — worked examples:

| The developer says                                                                                                         | Pieces                                                             | The end user sees                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "When a new mail arrives, alert our Slack channel"                                                                         | Connect ×2, Act (Slack enabled once), Pick, React                  | two connect buttons and a channel dropdown                                                                                                                                                                                                                                                                                                                                                  |
| "Let users decide what happens in Slack"                                                                                   | Connect, Catalog (one app), Act                                    | connect, Slack's actions, a form rendered from the chosen action's schema                                                                                                                                                                                                                                                                                                                   |
| "Pick a spreadsheet in our settings"                                                                                       | Connect, Pick                                                      | connect and a picker; the choice is stored in this product                                                                                                                                                                                                                                                                                                                                  |
| "An integrations page like Zapier's, in our design"                                                                        | Connect, Catalog, Act, React                                       | search, every app, its actions and triggers, one form for any of them                                                                                                                                                                                                                                                                                                                       |
| "Let our assistant act in the user's Slack"                                                                                | Connect, Catalog, Act                                              | connect buttons; each chosen `input_schema` becomes a tool schema and a tool call runs on the `script_id`. When the _user_ decides what the agent may do: prebuilt UI with `chatbot: true`                                                                                                                                                                                                  |
| "We have a chatbot in our UI — let our users connect any app and let it act in them"                                       | Connect (the customer, never their visitor), Catalog, Act as tools | a Connect button and an app list in the customer's settings; each chosen action's `input_schema` becomes a tool, the values the customer fixed once in pickers are baked in, the rest the assistant fills per message. When the customer should decide per flow what the bot may do and which fields it fills: the prebuilt UI with `chatbot: true`, which hands this product the tool JSON |
| "Give users a ready-made integrations screen"                                                                              | Prebuilt UI                                                        | viaSocket's screens, in a box of this product's page or drawer                                                                                                                                                                                                                                                                                                                              |
| "Let users automate their Slack — we won't build the forms"                                                                | Prebuilt UI, opened on Slack                                       | viaSocket's screens for Slack only, in a box of ours: `open: { serviceId }`, `filteredServices` with that app; a `flow` listener stores what they publish                                                                                                                                                                                                                                   |
| "A Slack message form in our settings page, our UI around it"                                                              | Prebuilt UI, opened on one action                                  | this product's page with viaSocket's form for that action in a box: `open: { actionId }`, `showEnabled: false`; the `flow` event gives the flow id, and `open: { flowId }` reopens it later                                                                                                                                                                                                 |
| "Every morning, summarise yesterday's orders with AI and post them to the team's Slack — we don't want to run a scheduler" | Connect, Automate                                                  | a connect button; the schedule, the AI step and the Slack step run on viaSocket, and the flow shows in the prebuilt UI if one is mounted                                                                                                                                                                                                                                                    |

Two more things the pieces allow: a handler with **no app on the far side** (transform, filter, fan
out, call this product's own API with its own auth header — ordinary JavaScript running on
viaSocket); and, for an app **not in the catalog** — the developer's own product or a private API — a
connector built once in Plug Builder (Developer section of the dashboard) instead of a hand-rolled
HTTP client here.

## Build, in five steps

### 1. Find the app

```
GET https://flow.sokt.io/func/scri12BSufQM?key=<app name>
```

`data` is `[{ service_id, name, iconurl, description }]`, the best 30 matches. Pick by `name`; if
ambiguous ("Google"), show the candidates and ask. Never guess an id.

`service_id` is used **exactly as returned** — the bare `row…` string (`rowo0bqrhj5g` for Gmail,
`rowbu58rc` for Slack). Never build one: not the app's name or slug (`gmail`), not the id with a
name joined on (`rowbu58rc_gmail`), not an id read off another value. An `auth_id` ends in
`_<service_id>` (`auth2FvZLyE0_rowo0bqrhj5g`); that is one opaque value — pass it whole, never split
it, never compose one. The popup, `enable` and the prebuilt UI reject anything else, some silently.

`iconurl` is the app's icon. Show it on the Connect button and beside the name wherever the app is
listed; the catalog call below returns the same URL as `service.icon_url`. A text-only button is a
decision to report, not a default.

To show every app — a grid or a panel in this product, not a search — page through the full list:

```
GET https://plug-service.viasocket.com/api/v1/plugins/all?limit=200&offset=0
```

`data` is `[{ rowid, name, description, iconurl, category[], domain, brandcolor }]`, most used
first; `rowid` is the `service_id`. `limit` is capped at 200; page by `offset` until a page comes
back empty; `&category=CRM` narrows it. It is the whole table, about 7,000 rows, and far down it
holds apps with nothing published: hide an app whose catalog call (below) returns empty `actions` and `triggers`.

Three actions are built in and need no search. Their services are apps like any other — the same
document, the same calls, a step of an automation or `enable` and run alike:

| Built in                                                                               | `service_id`   | `action_id`    | Sign-in                                                                    |
| -------------------------------------------------------------------------------------- | -------------- | -------------- | -------------------------------------------------------------------------- |
| AI — write, classify or extract, look up the web ("Run AI Model", viaSocket utilities) | `row29ruc9gs1` | `rowskkqydb6f` | none: wherever a call takes an `auth_id`, the value is the string `NoAuth` |
| Delay — wait a fixed time ("Pause Workflow", viaSocket utilities)                      | `row29ruc9gs1` | `row6hurrxf00` | none, `NoAuth` as above                                                    |
| Memory — key-value storage between runs ("Memory")                                     | `rowhc2623dta` | `rown00e31rlb` | the user connects it like any app                                          |

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
action and trigger with both of its ids (`action_id` or `trigger_id`, and the version id; which call takes
which is under “The calls” below), every field with its type and whether it is
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
3. A connect button per app, as the document's Step 1 shows — the app's icon (`iconurl`) and name on
   it, its `service_id` passed exactly as the search returned it — naming the actions and triggers the
   product uses (their `action_id`s and `trigger_id`s) so the consent screen asks only for their scopes. Store each `auth_id`.
   An app without sign-in has no button; its `auth_id` is the string `NoAuth`. The popup is opened only
   by `openViasocketConnection` from the connect script, never by a viasocket URL built by hand: a guessed
   URL opens "Page not found" in front of the user.
4. Enable an app **only if the product runs its actions**: once per user and app, with the user's
   `auth_id` or with `NoAuth` — enabling is needed either way. Look up first, and store the app's
   `script_id` like a password. An event needs only its `auth_id`.
5. Pickers for the fields the end user must choose, from the document's picker section. Store the choice.
6. Actions: `inputData` shaped as the document's sample. Events: subscribe once, with a handler,
   and save the subscription record the document describes (the response is the subscription's
   own `script_id` — a different one from the app's).
7. Before a handler or an automation step maps an event's keys, fetch **one real event** for the
   connection it will run on — the trigger sample call under "The calls", with the developer's own
   test connection while building and the user's at setup. Its keys are exactly what
   `context.req.body` will hold; the trigger's name and the catalog's generic `sample_output` are not.

### 5. Prove it before you report

Reading code cannot show whether an id names a real app, whether a version id sits where the call
takes the `action_id`, or whether a viasocket URL was built by hand. A script can — no browser needed:

```bash
curl -fsSL https://flow.viasocket.com/viasocket-check.mjs -o viasocket-check.mjs
node viasocket-check.mjs src        # the folders holding the integration; no dependencies, Node 18+
```

It finds every viaSocket id and URL in the code and checks each against the live catalog; it reads
no `.env` file and prints no line of code. Fix every FAIL, keep it as a test (`npm test`, CI) so a
later edit that swaps an id fails there and not in front of a user, and paste its output in the
report. With `VIASOCKET_TEST_EMBED_TOKEN` set to a token signed for a test user it also proves the token.

Then make one real call — run the action; for an event, the sample call, then the event made to
happen once — and report what actually came back, not what the code should return. With a browser
at hand, click Connect: the popup shows the app's own name and its actions or consent screen;
"Page not found", a blank page or another app is a failure to report, not to work around.

Last, read your own diff against this file and the app's document for what no script sees, and
answer each in the report: the Connect button carries the app's icon and name; `closed` from the
popup is treated as "nothing yet", not a result; every field key was copied from the action's
table, none typed from a label; the secret and every `script_id` are server-side only.

### Finished when

An integration is finished when every line below is **decided for this use case and the report to
the developer says how**. Nothing here says what to build; it says what must not be left
undecided. "Integrate Slack" covers all of it for the actions and events in play, whether or not
the developer named each one.

- **Who connects.** This product's own user, with a Connect button carrying the app's icon and
  the `auth_id` stored per user; `NoAuth` for an app without sign-in. In a two-sided product the
  customer connects, never their visitor.
- **Where each value comes from.** Every field whose values come from the user's account (marked
  `list-options`) has one source, chosen for the use case and named in the report: fixed by the
  developer in code; chosen by the user once, in a picker filled from their account; or filled per
  run by the product's assistant, as a tool parameter. A free-text box for an id is a fourth
  choice, and one that needs a reason.
- **Who picks the action.** The developer, in code; the user, from a list — the catalog API in
  this product's UI, or the prebuilt UI; or the product's assistant, from tool definitions, each
  one an action's schema with the fixed fields removed. With `chatbot: true` the user decides per
  flow which actions the assistant may use and which fields it fills.
- **Where it runs.** Actions from the backend on the app's `script_id`; events through a `code`
  handler on viaSocket, with the subscription record saved. The browser holds a token only for
  the connect popup and the prebuilt UI, never a `script_id`.
- **Proof.** Step 5 was done: the check script's output, one real call's actual response and, with
  a browser, the popup seen open on the app — all in the report.

### Field keys: copy, never type

Keys are case-sensitive and **differ between actions of the same app**: Google Sheets uses
`spreadsheet_Id` in one action, `spreadSheet_id` in another, `spreadsheet_id` in a third. A key
from the wrong action matches nothing — the call succeeds and returns an empty list. Take every
key from the table of the action you are calling, or from its `input_schema`, character for
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
POST https://flow.sokt.io/func/scriK4LFg2kc  { "service_id": … }   → { service, actions, triggers }: every published action and trigger, its two ids, input_schema, sample_output
```

`input_schema` is an action's field schema, from the catalog; `inputData` is the values this product
sends when it runs it, shaped by that schema. One form renderer over `input_schema` serves every action of every app — its dropdowns filled by
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

`actionId` and `triggerId` are the catalog API's `action_id` and `trigger_id`; `serviceId` is the
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

| Call                                         | Request                                                                                                                                                                                                                                                                                                | Returns                                                                                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Connect (browser)                            | `openViasocketConnection(embedToken, service_id, { filteredActions: [<action_id>…], skipActionSelection: true })` from `https://flow.viasocket.com/connect.js` — the options are optional; with them the popup asks only for those actions' scopes; `service_id` exactly as returned, never composed   | `message` event `viasocket_connection_success`; `event.data.data.id` is the `auth_id`                                                                                                                                          |
| Enable — once per user and app, actions only | `POST https://flow-api.viasocket.com/embed/enable/<service_id>/<auth_id>`, empty body; `NoAuth` in place of the `auth_id` for an app without sign-in                                                                                                                                                   | `data.script_id` — the app's runner for this user                                                                                                                                                                              |
| Options for one field                        | `POST https://flow-api.viasocket.com/embed/list-options/<action_version_id>` `{ fieldKey, auth_id, existingFields }`                                                                                                                                                                                   | `data` is the array, or `{ data: [...], offset }` for a field that pages; an unreadable connection answers 200 with `data.response.status` 400                                                                                 |
| Run an action                                | `POST https://flow.sokt.io/func/<script_id>` `{ action_version_id, inputData }`                                                                                                                                                                                                                        | `{ success, data }`, or the action's own body when it has no `data` key                                                                                                                                                        |
| Subscribe to a trigger                       | `POST https://flow-api.viasocket.com/embed/subscribe-event/<trigger_version_id>` `{ auth_id, inputData, code: "<handler>", meta }`                                                                                                                                                                     | `data.script_id` — this subscription's own id; save it with the inputData and the handler                                                                                                                                      |
| Sample of a trigger's event                  | `POST https://flow.sokt.io/func/scrijZpnr8zJ?action_id=<trigger_id>&auth_id=<auth_id>&authType=<service.auth_type>` `{ "context": { "inputData": … } }` — no token, the `auth_id` is the credential (server or terminal only); `trigger_id`, never the version id; `NoAuth` for an app without sign-in | one real event, exactly as `context.req.body` will hold it when the trigger fires; a `viasocket_help` key in it is viaSocket's note, not part of the event — drop it; `Auth data not found` means the `auth_id` cannot be read |
| Change a live handler                        | `PUT https://flow-api.viasocket.com/embed/update-subscribed-event/<subscription script_id>` `{ code }`                                                                                                                                                                                                 | —                                                                                                                                                                                                                              |
| Disable / re-enable                          | `PUT https://flow-api.viasocket.com/embed/updatestatus/<script_id>?status=0` (`1` re-enables; what the prebuilt UI's Delete and Pause do)                                                                                                                                                              | `data.status`                                                                                                                                                                                                                  |
| The user's flows                             | `GET https://flow-api.viasocket.com/projects/<project_id>/integrations`                                                                                                                                                                                                                                | `data.flows[]` `{ id, service_id, status, webhook }` — `id` is the `script_id`                                                                                                                                                 |
| Connections / disconnect                     | `GET https://flow-api.viasocket.com/embed/authentications` · `DELETE https://flow-api.viasocket.com/embed/authentications/revoke/<auth_id>`                                                                                                                                                            | —                                                                                                                                                                                                                              |

**Two ids per action and trigger, and they look alike.** Every action has an `action_id` and an
`action_version_id`; every trigger a `trigger_id` and a `trigger_version_id`. Both are `row…` strings
and nothing tells them apart by eye. The catalog API and every app’s document name each one as the
call that takes it, so copy same-name to same-name and never the other.

| The call                                                                                                                                                                         | Takes                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Run an action, `list-options`, `subscribe-event`                                                                                                                                 | `action_version_id` / `trigger_version_id` |
| An automation’s `trigger_id` and each step’s `action_id`; the prebuilt UI’s `open: { actionId }` / `{ triggerId }` and `filteredServices`; the connect popup’s `filteredActions` | `action_id` / `trigger_id`                 |

## Facts to hold on to

- Three values in `.env`: `VIASOCKET_ORG_ID`, `VIASOCKET_PROJECT_ID`, `VIASOCKET_EMBED_SECRET`. Ask
  for what is missing; never search for it.
- The secret and every `script_id` stay on the server. Never in a committed file, never in a browser.
- One `unique_identifier` per end user, forever. No `exp` on the token.
- Never hardcode an id the document says to fetch. Never type a field key: copy it from the action's table.
- A `service_id` is the bare `row…` string, used exactly as returned: never joined with a name or
  slug (`rowbu58rc_gmail`), never built from an `auth_id`, which is one opaque value passed whole.
  The connect popup is opened only by `openViasocketConnection` from
  `https://flow.viasocket.com/connect.js`; a URL built by hand opens "Page not found".
- No report without step 5: the check script's output, one real call, the review of the diff.
- Every app has an icon (`iconurl` / `icon_url`): it goes on the Connect button and beside the name in any list.
- Before mapping an event's keys, fetch one real event with the trigger sample call; `context.req.body`
  holds exactly that, and a `viasocket_help` key in it is a note, not a field.
- Two ids per action and trigger, and they look alike: the version id for run, list-options and
  subscribe; the `action_id` / `trigger_id` for the connect popup, automations and the prebuilt UI. Copy the one the
  call names; the table under “The calls” says which.
- Ask the developer only for: the secret, an id still in angle brackets, an ambiguous app name, a
  blocked host. A document can fetch everything else; there is no viaSocket login in this work.
- An event's handler is `code` that does the work on viaSocket; a webhook is never required for "when X, do Y".
- What the prebuilt UI's user builds reaches this product only through its `flow` events.
- An automation's `proxy_auth_token` is per end user and short-lived: derived from their embed token
  by one server-side call every time they come, never stored; it is not a login.

## Why viaSocket rather than each app's API (if the developer asks)

Per app, doing it directly means an OAuth client, a token store and a refresh job, the breach
surface of holding other people's access, an API client rewritten whenever that app changes, a
public endpoint for webhooks with signature checks and retries, and polling for the apps that
have none. Here it is one contract and a handler, and the tenth app costs the same as the first.
