# In their own apps: one action now, or a workflow

Part of the viaSocket skill: https://viasocket.com/docs/skill.md.

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

Their account must be signed in first, as the skill's "Sign in" says, and the check of
agent-access.md must pass.

## The calls

Thirteen calls, each with `Content-Type: application/json`, the JSON body shown, and
`Authorization: <VIASOCKET_AGENT_TOKEN>` (through the MCP: `call_any_api_of_viasocket` for a POST,
`call_any_read_api_of_viasocket` for a GET, `Authorization` empty). Nine are `POST https://flow.sokt.io/func/<id>`
and answer HTTP 200 even when refused: the refusal is in the body (`success: false`, or `error`). The four that
build a flow are routes on `flow-api.viasocket.com` and answer real statuses: 400 names the field, 403 is another
user's flow. Reads change nothing; writes need their yes.

| call                   | id                                                                    | body                                                                                                                                                                                                                                         | kind                                                                                                                                         | returns                                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search Services        | `scriPdfrkbGo`                                                        | `{ "searchquery": "slack" }`                                                                                                                                                                                                                 | read, public catalog                                                                                                                         | `services[]` with `service_id`, `service_name`, `service_description`                                                                                                                                           |
| List Actions           | `scricjNm9JHL`                                                        | `{ "serviceId": "<service_id>" }` (camelCase)                                                                                                                                                                                                | read, public catalog                                                                                                                         | `actions[]` with `action_id`, `action_name`, `action_description`, `fields_for_action_details`, `sample_response_format`                                                                                        |
| List Triggers          | `scriSpsx1eK3`                                                        | `{ "service_id": "<service_id>" }` (snake_case)                                                                                                                                                                                              | read, public catalog                                                                                                                         | `triggers[]` with `trigger_id`, `trigger_name`, `description`, `sample_payload_to_flow` (what the flow receives)                                                                                                |
| List Connections       | `scridj7tAr3d`                                                        | `{}`                                                                                                                                                                                                                                         | read                                                                                                                                         | `auth_id`, `service_id`, `service_name`, `connection_label` (a JSON string: parse it before showing it)                                                                                                         |
| Create Connection Link | `scri5aQxBVDS`                                                        | `{ "service_ids": ["<service_id>"] }`                                                                                                                                                                                                        | read: only makes a sign-in URL                                                                                                               | `data[]` with `connection_url` per service                                                                                                                                                                      |
| List Flows             | `scri9AcTXQz6`                                                        | `{}`                                                                                                                                                                                                                                         | read                                                                                                                                         | `flows[]` with `script_id`, title and trigger type                                                                                                                                                              |
| Get Flow               | `GET https://flow-api.viasocket.com/automations/<script_id>`          | no body                                                                                                                                                                                                                                      | read                                                                                                                                         | `{ script_id, title, status, trigger, steps, variables, version, webhook_url_of_flow }`                                                                                                                         |
| Build Trigger Input    | `scriLeYwDcRh`                                                        | `{ "service_id": "<service_id>", "trigger_id": "<trigger_id>", "auth_id": "<auth_id>", "instructions": "<plain words>", "thread_id": "<your id>" }`                                                                                          | saves nothing                                                                                                                                | `inputData` (pass it to Save Trigger verbatim) and `trigger_response` (a sample payload the steps can read)                                                                                                     |
| Build Action Input     | `scri0xjrcFYO`                                                        | `{ "service_id": "<service_id>", "action_id": "<action_id>", "auth_id": "<auth_id>", "instructions": "<plain words>", "thread_id": "<your id>" }`                                                                                            | saves nothing, **runs the action once for real** to test it (a message is sent, a row is added): say so and get a yes when the action writes | `inputData` (paste it into the step code, replacing a `{{name}}` placeholder with the context path) and a sample result; the answer is text: read the JSON after `## inputData` and `## sample response format` |
| Create Empty Flow      | `POST https://flow-api.viasocket.com/automations`                     | `{ "title": "<title>", "description": "<one line>" }`                                                                                                                                                                                        | **write**                                                                                                                                    | `script_id`                                                                                                                                                                                                     |
| Save Trigger           | `POST https://flow-api.viasocket.com/automations/<script_id>/trigger` | `{ "triggerType": "plugin" \| "cron" \| "webhook", "trigger_id": "<trigger_id>", "auth_id": "<auth_id>", "inputData": {}, "cronStatement": "<cron>", "runOncePerItem": true, "arrayKey": "<key>" }` (only the fields the trigger type takes) | **write**, replaces the trigger                                                                                                              | the saved trigger                                                                                                                                                                                               |
| Save Steps             | `POST https://flow-api.viasocket.com/automations/<script_id>/steps`   | `{ "steps": [{ "stepname": "<name>", "code": "<js>", "service_action_functions": [{ "name": "<what the code calls>", "auth_id": "<auth_id, or NoAuth for an app without sign-in>", "action_id": "<action_id>" }] }] }`                       | **write**, replaces all steps and publishes                                                                                                  | the flow, as Get Flow answers it                                                                                                                                                                                |
| Run Action Once        | `scri5SwnfYyK`                                                        | `{ "service_id": "<service_id>", "action_id": "<action_id>", "auth_id": "<auth_id>", "instructions": "<plain words>", "thread_id": "<your id>" }`                                                                                            | **runs a real action**                                                                                                                       | the action's result                                                                                                                                                                                             |

`thread_id`: one id you make per trigger or step (`slack-send-message-sales`), reused for later changes to the same
step, so the builder keeps its context.

Field docs and samples: `https://app.docstar.io/p/automations/llms.txt?collectionId=eInXd9-ETenX` and
`https://app.docstar.io/p/app-catalog-and-connections/llms.txt?collectionId=eInXd9-ETenX` (each endpoint links its
`.openapi.yml`). Fetch raw.

**An empty answer is not proof.** Every `flow.sokt.io/func` call answers HTTP 200: a missing or wrong token gives `{ "flows": [] }`,
`{ "error": {} }` or `null`, and List Actions sent `service_id` instead of `serviceId` gives `{ "actions": [] }`.
Before you conclude there is nothing, run the agent-access check and confirm the id and its key spelling came from
the right list call (`serviceId` for List Actions, `service_id` for List Triggers).

Never put the agent token in a step, an `inputData` or a log.

## One action now

"Post this in my Slack", "add this to my sheet": one action, run once, on their own account.

1. **The app and the action:** Search Services with the app's name → `service_id`; List Actions → `action_id`. No
   match → report `kind: missing_capability`, `source: plug`, `refs.app`, and tell them.
2. **Their connection:** List Connections and match on `service_id` → `auth_id`. Several accounts for one app → ask
   which. None → Create Connection Link with the `service_ids`, give them the `connection_url`, wait until they say
   they signed in, List Connections again. Nothing runs until the `auth_id` is there.
3. **Say exactly what it will do, and wait for their yes.** Run Action Once runs a real action on their real account:
   it sends the message, it adds the row.
4. **Run Action Once** with `instructions` in plain words (what to do and where: the channel, the sheet, the label)
   and a `thread_id`. Tell them what happened, from the action's result.

## Building a workflow

1. **List Flows first,** after the check of agent-access.md passed: a missing or
   wrong token also answers `{ "flows": [] }`. A flow that already does the job, or a request that is really an edit,
   goes to that flow (Get Flow, then change it); never a second flow for the same automation.
2. **Each app they name:** Search Services → `service_id`; then List Triggers or List Actions, to be sure it can do
   the job before anyone signs in to anything. No match → report `kind: missing_capability`, `source: plug`,
   `refs.app`, and tell them.
3. **The plan, then their yes,** as the skill's "The person you work for" says: what starts the workflow and what
   happens, before any app asks them to sign in.
4. **Connections:** List Connections and match on `service_id` → `auth_id`. Several accounts for one app → ask which.
   None → Create Connection Link with the `service_ids`, give them each `connection_url`, one per message, wait until
   they say they signed in, List Connections again. Don't build on until the `auth_id` is there. Then Create Empty
   Flow once and keep `script_id`.
5. **The trigger.** An app event: Build Trigger Input (`instructions` naming the channel, sheet, label in plain words;
   it resolves the ids itself) → Save Trigger with `triggerType: "plugin"`, `trigger_id`, `auth_id` and the returned
   `inputData` verbatim. A schedule: Save Trigger with `triggerType: "cron"` and `cronStatement` (five-field cron or
   plain words; unreadable text is refused). A call from their own code, a webhook: Save Trigger with
   `triggerType: "webhook"` (add `runOncePerItem: true`, and `arrayKey` when the array sits under a key, to run once
   per item of what the caller posts); the flow then runs on each `POST https://flow.sokt.io/func/<script_id>` and the
   caller gets the last step's return value. Anyone with that address can run the flow, so the product keeps it on
   its server and sends a key of its own in a header (`X-Flow-Key`, a long random value in the product's `.env`). A
   step's return does not stop the steps after it, so a first step only checks the key, and every later step that
   acts goes on only when it passed:

   ```js
   // the first step, named check_key
   return { ok: context?.req?.headers?.['x-flow-key'] === '<the key>' }
   // the first line of every later step
   if (!context?.res?.check_key?.ok) return { skipped: 'refused' }
   ```

   The values the caller sends are at `context.req.body`; name them in Build Action Input's `instructions` ("the
   order id from the request") and read them by that path in the step.

6. **The steps.** For each app action: Build Action Input → its `inputData` goes into the step's code; then Save Steps
   with `scriptId` and the **whole** `steps` array: `stepname`, `code`, `service_action_functions: [{ name, auth_id,
action_id }]` (one per action the code calls; `name` is what the step code calls, `sendMessage`, as Build Action
   Input's sample shows; `[]` for a step that only decides or transforms).
7. **Run it once** if they agree (POST the webhook, cause the event, or wait for the schedule), check it ran, and
   tell them the flow is in their viaSocket account (under Automations at https://flow.viasocket.com) and what it
   does.

After it is saved, three calls on `flow-api.viasocket.com`, header `Authorization: <VIASOCKET_AGENT_TOKEN>` (through
the MCP: `Authorization` empty), `<project_id>` being `proj<VIASOCKET_ORG_ID>` unless Get Flow says another:

| to                                                                | call                                                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| the last run and each step's result (about a minute after it ran) | `GET /logs/scriptid/<script_id>/recent`                                                                                 |
| every run, newest first                                           | `GET /logs/orgId/<VIASOCKET_ORG_ID>?projectId=<project_id>&scriptId=<script_id>&page=1&limit=40` → `data.finalResponse` |
| pause, resume, delete                                             | `PUT /projects/<project_id>/scripts/<script_id>/status?status=2`, `1`, `0`                                              |

A `plugin` trigger is subscribed with the app the moment Save Trigger answers, draft or not: delete the flow to
stop it. A cron runs in the workspace's timezone unless Save Trigger gets `timezone` ("Asia/Kolkata").

**Edit** = Get Flow → change → Save Steps with every step. A step left out is deleted. If Get Flow answers
`steps: []` for a flow you know has steps, the read failed: do not Save Steps; check the sign-in and read again.

Before Create Empty Flow, Save Trigger and Save Steps, say what will be saved and wait for the yes. The reads and the
two Build calls need no confirmation.

While building a workflow, Run Action Once is not a way to resolve names: Build Trigger Input and Build Action Input
already resolve names to ids. Only when they can't, offer it, say exactly what it will do (it runs a real action on
their real account), and call it after a yes.

## Step code

The same rules as a flow built for a product (https://viasocket.com/docs/automations.md, "The steps" and "The VM"):
one JavaScript string per step, its `return` read by later steps at `context.res.<stepname>`, the trigger payload at
`context.req.body`, no `try/catch`, no `import`, 58 seconds, `console.log` lines in markdown. Here the
`inputData` comes from Build Action Input, with context values interpolated:

```js
// a step: the action registered as sendMessage, inputData from Build Action Input
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
is theirs, it ran once (or they declined the run), and the report names the flow and what each step does. Nothing
was created twice, and nothing was saved before they said yes.

END OF PAGE
