# In their own apps: one action now, or a workflow

Part of the viaSocket skill: https://viasocket.com/docs/skill.md.

Contents: The calls; One action now; Building a workflow; Step code; Finished when

The person you work for wants something done in their own apps: a message in their Slack now, a row in their sheet,
or a workflow that does it for them every morning, on every new lead, or whenever their own code calls. viaSocket
does it on their own account, through the apps they have connected: the sign-in to each app, the tokens and each
app's quirks are already handled, and every run is kept in their history, under Automations at
https://flow.viasocket.com.

This page does two things:

- **One action, once** (Run Action Once): it runs now on their account, and the work ends there. Read "The calls",
  then "One action now".
- **A workflow**, which the calls name a flow: one trigger (an app's event, a schedule, or a web address their own
  code calls) and ordered JavaScript steps that call actions in their apps. viaSocket runs it and keeps its history.
  Read "The calls", then "Building a workflow".

Automations a product runs for each of its users are not this page: that is
https://viasocket.com/docs/automations.md. Here there is no product: the person is the user, and the work lives in
their own account.

After the plan's yes, their account is signed in as the skill's "Sign in" says, and the check of
agent-access.md passes. The three catalog reads below need no sign-in; every other
call does.

## The calls

Sixteen calls, each with `Content-Type: application/json`, the JSON body shown, and
`Authorization: <VIASOCKET_AGENT_TOKEN>` (through the MCP: `call_any_api_of_viasocket` for a POST,
`call_any_read_api_of_viasocket` for a GET, `Authorization` empty; a server whose own tools are `create_empty_flow`,
`save_trigger`, `save_steps` and `get_flow_by_id` uses those for the four flow calls). Nine are `POST https://flow.sokt.io/func/<id>`
and answer HTTP 200 even when refused: the refusal is in the body (`success: false`, or `error`). The seven that
build and test a flow are routes on `flow-api.viasocket.com` and answer real statuses: 400 names the field, 401 is a
missing or wrong token, 403 another user's flow or connection, 404 an id that names nothing. Reads change nothing;
writes need their yes.

| call | id | body | kind | returns |
| --- | --- | --- | --- | --- |
| Search Services | `scriPdfrkbGo` | `{ "searchquery": "slack" }` | read, public catalog | `services[]` with `service_id`, `service_name`, `service_description` |
| List Actions | `scricjNm9JHL` | `{ "serviceId": "<service_id>" }` (camelCase) | read, public catalog | `actions[]` with `action_id`, `action_name`, `action_description`, `fields_for_action_details`, `sample_response_format` |
| List Triggers | `scriSpsx1eK3` | `{ "service_id": "<service_id>" }` (snake_case) | read, public catalog | `triggers[]` with `trigger_id`, `trigger_name`, `description`, `sample_payload_to_flow` (what the flow receives) |
| List Connections | `scridj7tAr3d` | `{}` | read | `auth_id`, `service_id`, `service_name`, `connection_label` (a JSON string: parse it before showing it) |
| Create Connection Link | `scri5aQxBVDS` | `{ "service_ids": ["<service_id>"] }` | read: only makes a sign-in URL | `data[]` with `connection_url` per service |
| List Flows | `scri9AcTXQz6` | `{}` | read | `flows[]` with `script_id`, title and trigger type |
| Get Flow | `GET https://flow-api.viasocket.com/automations/<script_id>` | no body | read | `{ script_id, title, status, trigger, steps, variables, version, webhook_url_of_flow }` |
| Options | `POST https://flow-api.viasocket.com/automations/options` | `{ "action_id": "<action_id>" or "trigger_id": "<trigger_id>", "auth_id": "<auth_id>", "fieldKey": "<the PICK key, its full dotted path>", "existingFields": { <the keys picked so far> }, "search": "<typed text, optional>", "paginate": <the last answer's paginate, optional> }` | read: runs the field's own lookup on the connection | `data.options[]` with `label` and `value`; `data.has_more`, `data.paginate` (send it back for the next page), `data.message` |
| Run Action | `POST https://flow-api.viasocket.com/automations/run-action` | `{ "action_id": "<action_id>", "auth_id": "<auth_id>", "inputData": { <every key decided> }, "version": "<v3, optional: pins the version the page shows>" }` | **runs a real action**, once, with exactly that input | `data`: what the app answered; a refusal carries the app's own status and message |
| Sample Event | `POST https://flow-api.viasocket.com/automations/sample-event` | `{ "trigger_id": "<trigger_id>", "auth_id": "<auth_id>", "inputData": { <the trigger's keys> } }` | read: the app lists its latest events | `data`: one event, as `context.req.body` holds it on a run; 404 when the app lists none yet |
| Build Trigger Input | `scriLeYwDcRh` | `{ "service_id": "<service_id>", "trigger_id": "<trigger_id>", "auth_id": "<auth_id>", "instructions": "<plain words>", "thread_id": "<your id>" }` | saves nothing | `inputData` (pass it to Save Trigger verbatim) and `trigger_response` (a sample payload the steps can read) |
| Build Action Input | `scri0xjrcFYO` | `{ "service_id": "<service_id>", "action_id": "<action_id>", "auth_id": "<auth_id>", "instructions": "<plain words>", "thread_id": "<your id>" }` | saves nothing, **runs the action once for real** to test it (a message is sent, a row is added): say so and get a yes when the action writes | `inputData` (paste it into the step code, replacing a `{{name}}` placeholder with the context path) and a sample result; the answer is text: read the JSON after `## inputData` and `## sample response format` |
| Create Empty Flow | `POST https://flow-api.viasocket.com/automations` | `{ "title": "<title>", "description": "<one line>" }` | **write** | `script_id` |
| Save Trigger | `POST https://flow-api.viasocket.com/automations/<script_id>/trigger` | `{ "triggerType": "plugin" \| "cron" \| "webhook", "trigger_id": "<trigger_id>", "auth_id": "<auth_id>", "inputData": {}, "cronStatement": "<cron>", "timezone": "<zone, optional>", "runOncePerItem": true, "arrayKey": "<key>" }` (only the fields the trigger type takes) | **write**, replaces the trigger | the saved trigger |
| Save Steps | `POST https://flow-api.viasocket.com/automations/<script_id>/steps` | `{ "steps": [{ "stepname": "<name>", "code": "<js>", "service_action_functions": [{ "name": "<what the code calls>", "auth_id": "<auth_id, or NoAuth for an app without sign-in>", "action_id": "<action_id>" }] }] }` | **write**, replaces all steps and publishes | the flow, as Get Flow answers it |
| Run Action Once | `scri5SwnfYyK` | `{ "service_id": "<service_id>", "action_id": "<action_id>", "auth_id": "<auth_id>", "instructions": "<plain words>", "thread_id": "<your id>" }` | **runs a real action** | the action's result |

**The fields of an event** are on its page, `https://viasocket.com/docs/<service_id>/<event>.md` (the app's slug
works too): its `inputData` as a type, each key the person chooses from a list marked `PICK`; `.details.md` adds the
labels, the fixed choices and a sample; `https://viasocket.com/docs/<service_id>.md?search=<words>` finds the event.
`action_id` and `trigger_id` are the ids List Actions, List Triggers and that page give, never a version id. Options,
Run Action and Sample Event are how an `inputData` is built and proven here; the three builders below do that work
through an AI, from plain words, and are for a client whose only viaSocket tools are `build_trigger_input`,
`build_action_input` and `run_action_once` (no `call_any_api_of_viasocket`, no HTTP call): slower, and Build Action
Input runs the action once for real with the text it guesses, so it needs the same yes as Run Action.

`thread_id`: one id you make per trigger or step (`slack-send-message-sales`), reused for later changes to the same
step, so the builder keeps its context.

Field docs and samples: `https://app.docstar.io/p/automations/llms.txt?collectionId=eInXd9-ETenX` and
`https://app.docstar.io/p/app-catalog-and-connections/llms.txt?collectionId=eInXd9-ETenX` (each endpoint links its
`.openapi.yml`). Fetch raw.

**An empty answer is not proof.** Every `flow.sokt.io/func` call answers HTTP 200: a missing or wrong token gives
`{ "flows": [] }`, `{ "error": {} }` or `null`, and List Actions sent `service_id` instead of `serviceId` gives
`{ "actions": [] }`. Before you conclude there is nothing, run the agent-access check and confirm the id and its key
spelling came from the right list call (`serviceId` for List Actions, `service_id` for List Triggers). The
`flow-api.viasocket.com` routes answer `401` to a missing or wrong token.

Never put the agent token in a step, an `inputData` or a log.

## One action now

"Post this in my Slack", "add this to my sheet": one action, run once, on their own account.

1. **The app and the action:** Search Services with the app's name → `service_id`; List Actions → `action_id`. No
   match → report `kind: missing_capability`, `source: plug`, `refs.app`, and tell them.
2. **Say exactly what it will do, and wait for their yes.** Run Action runs a real action on their real account:
   it sends the message, it adds the row.
3. **Their connection,** after the yes and the sign-in: List Connections and match on `service_id` → `auth_id`.
   Several accounts for one app → ask which. None → Create Connection Link with the `service_ids`, give them the
   `connection_url`, wait until they say they signed in, List Connections again. Nothing runs until the `auth_id` is
   there.
4. **Build the `inputData`** from the action's page: each `PICK` key from Options (match its label to what they said;
   several match, or none → ask), the rest from their words, every key decided on purpose. Then **Run Action** with
   it. Tell them what happened, from what the app answered.

## Building a workflow

1. **Each app they name:** Search Services → `service_id`; then List Triggers or List Actions, to be sure it can do
   the job before anyone signs in to anything. No match → report `kind: missing_capability`, `source: plug`,
   `refs.app`, and tell them.
2. **The plan, then their yes,** as the skill's "Plan, then a yes" says: what starts the workflow and what
   happens, before any sign-in.
3. **Sign in, then List Flows:** after the yes, sign in as the skill's "Sign in" says; once the check of
   agent-access.md passed (a missing or wrong token also answers `{ "flows": [] }`),
   List Flows. A flow that already does the job, or a request that is really an edit, goes to that flow (Get Flow,
   then change it); never a second flow for the same automation.
4. **Connections:** List Connections and match on `service_id` → `auth_id`. Several accounts for one app → ask which.
   None → Create Connection Link with the `service_ids`, give them each `connection_url`, one per message, wait until
   they say they signed in, List Connections again. Don't build on until the `auth_id` is there. Then Create Empty
   Flow once and keep `script_id`.
5. **The trigger.** An app event: build the trigger's `inputData` from its page (`PICK` keys from Options with the
   `trigger_id`; a choice left at its default that they did not ask for is wrong), then Sample Event with it: the
   event it answers is what `context.req.body` holds on each run, so every path a step reads comes from it (a 404:
   cause one event in the app, then call again). Then Save Trigger with `triggerType: "plugin"`, `trigger_id`,
   `auth_id` and that `inputData`; it answers the same event as `sampleData` (Get Flow shows it too), the one the
   flow builder shows for the trigger. A schedule: Save Trigger with `triggerType: "cron"` and `cronStatement` (five-field
   cron or plain words; unreadable text is refused). A call from their own code, a webhook: Save Trigger with
   `triggerType: "webhook"` (add `runOncePerItem: true`, and `arrayKey` when the array sits under a key, to run once
   per item of what the caller posts); the flow then runs on each `POST https://flow.sokt.io/func/<script_id>` and the
   caller gets the last step's return value (one run per POST). Anyone with that address can run the flow, so the product keeps it on
   its server and sends a key of its own in a header (`X-Flow-Key`, a long random value in the product's `.env`). A
   step's return does not stop the steps after it, so a first step only checks the key, and every later step that
   acts goes on only when it passed:

   ```js
   // the first step, named check_key
   return { ok: context?.req?.headers?.['x-flow-key'] === '<the key>' }
   // the first line of every later step
   if (!context?.res?.check_key?.ok) return { skipped: 'refused' }
   ```

   With `runOncePerItem`, the caller gets `Flow Queued` and each item runs on its own, in the history, with the item
   as `context.req.body` and none of the caller's headers: check the key in the trigger's `transformCode` instead,
   which runs once on the caller's request and answers the items to run (`arrayKey` is then not needed), and leave
   the first step out:

   ```js
   // Save Trigger, transformCode
   if (context?.req?.headers?.['x-flow-key'] !== '<the key>') return []
   return context?.req?.body?.items
   ```

   The values the caller sends are at `context.req.body`; the step reads them by that path, and the test run of its
   action uses a value of the same shape.

6. **The steps.** For each app action: build its `inputData` from the action's page (`PICK` keys from Options), then
   Run Action with it once, on something made for the test (a message to themselves, a sheet named "viaSocket
   test"), after their yes when it writes: what the app answers is the shape the next step reads. That `inputData`
   goes into the step's code, with context values interpolated; then Save Steps on that `script_id` with the **whole**
   `steps` array: `stepname`, `code`, `service_action_functions: [{ name, auth_id, action_id }]` (one per action the
   code calls; `name` is what the step code calls, `sendMessage`; `[]` for a step that only decides or transforms).
7. **Run it once** if they agree (POST the webhook, cause the event, or wait for the schedule), check it ran, and
   tell them the flow is in their viaSocket account (under Automations at https://flow.viasocket.com) and what it
   does.

After it is saved, three calls on `flow-api.viasocket.com`, header `Authorization: <VIASOCKET_AGENT_TOKEN>` (through
the MCP: `Authorization` empty). `<org_id>` is the org id the sign-in check answers (`VIASOCKET_ORG_ID` after `login`).
`<project_id>` is `proj<org_id>`, the collection Create Empty Flow puts the flow in; Get Flow does not answer it, and a
flow moved to another collection is found with `GET /orgs/<org_id>/projects?type=flow&bringflows=true`, whose
`data.flows[]` lists every flow with its `id` and `project_id`:

| to | call |
| --- | --- |
| the last run and each step's result (about a minute after it ran) | `GET /logs/scriptid/<script_id>/recent` |
| every run, newest first | `GET /logs/orgId/<org_id>?projectId=<project_id>&scriptId=<script_id>&page=1&limit=40` → `data.finalResponse` |
| pause (`status=2`), resume (`1`), delete (`0`) | `PUT /projects/<project_id>/scripts/<script_id>/status?status=2`, `1`, `0` |

A `plugin` trigger is subscribed with the app the moment Save Trigger answers, draft or not: delete the flow to
stop it. A cron runs in the workspace's timezone unless Save Trigger gets `timezone` ("Asia/Kolkata"). Save Trigger
takes the same body as `setTrigger` on https://viasocket.com/docs/automations.md ("The trigger"), so a webhook trigger
may also carry `transformCode` and `customResponse`; a run in the history list has the fields that page's "Run
history" describes.

**Edit** = Get Flow → change → Save Steps with every step. A step left out is deleted. If Get Flow answers
`steps: []` for a flow you know has steps, the read failed: do not Save Steps; check the sign-in and read again.

The plan's yes covers Create Empty Flow, Save Trigger, Save Steps and Run Action's one test run when the plan said
what is saved and what the test sends; ask again only for what it did not say. The reads, Options and Sample Event
need no confirmation. The real run of the finished flow is the click left in the report.

Names become ids through Options, never through Run Action Once. With only the builders (no HTTP call), Build
Trigger Input and Build Action Input resolve the names from plain words; only when they can't, offer Run Action
Once, say exactly what it will do (it runs a real action on their real account), and call it after a yes.

## Step code

The same rules as a flow built for a product (https://viasocket.com/docs/automations.md, "The steps" and "The VM"):
one JavaScript string per step, its `return` read by later steps at `context.res.<stepname>`, the trigger payload at
`context.req.body`, no `try/catch`, no `import`, 58 seconds, `console.log` lines in markdown. **Every path a step
reads is copied from a real answer:** `context.req.body.<path>` from the event Sample Event gave (a webhook: the body
you posted in the test), `context.res.<stepname>.<path>` from what Run Action answered for that step (its `return`),
always with `?.`; never from the catalog's sample or from a guess. `undefined` at run time means a path that was
guessed.

Which AI action for which job, and a step whose reply comes later: ai-steps.md. Here
the `inputData` is the one Run Action accepted, with context values interpolated:

```js
// a step: the action registered as sendMessage, its inputData already run once through Run Action
if (context?.res?.fetch_news?.error) return { skipped: true }
const sent = await sendMessage({
  inputData: {
    destination: { messageto: 'channel', channel_id: ['C0123ABCD'] },
    markdown_content: `Today: ${context?.res?.fetch_news?.content}`
  }
})
console.log('### Posted to #news: ' + (sent?.ts || 'no ts'))
return sent
```

## Finished when

One action: it ran once, after their yes, on their own connection, and the report says what it did and what the
action answered.

A workflow: the flow exists in their viaSocket account with the trigger and every step saved, each connection it uses
is theirs, each step's `inputData` ran once through Run Action and a `plugin` trigger's paths come from Sample
Event, and it ran once (a webhook posted, an event caused). A schedule or an app event that has not fired yet is
not UNTESTED when every step ran through Run Action: the report says the first run is the thing left, and when.
Declined the run: the report lists the flow as **UNTESTED**, says it is already live after Save Trigger or Save
Steps, and does not call it done. The report names the flow and what each step does. Nothing was created twice, and nothing was saved before they said yes.

END OF PAGE
