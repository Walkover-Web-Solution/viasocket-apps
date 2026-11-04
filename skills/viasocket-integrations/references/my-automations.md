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

Thirteen functions, all `POST https://flow.sokt.io/func/<id>` with `Content-Type: application/json`, the JSON body
shown, and `Authorization: <VIASOCKET_AGENT_TOKEN>` (through the MCP: `call_any_api_of_viasocket`, `method: "POST"`,
`Authorization` empty). A refused call still answers HTTP 200: the refusal is in the body (`success: false`, or
`error`). Reads change nothing; writes need their yes.

| call                   | id             | body                                                                                                                                                                                                                        | kind                            | returns                                                                                                                  |
| ---------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Search Services        | `scriPdfrkbGo` | `{ "searchquery": "slack" }`                                                                                                                                                                                                | read, public catalog            | `services[]` with `service_id`, `service_name`, `service_description`                                                    |
| List Actions           | `scricjNm9JHL` | `{ "serviceId": "<service_id>" }` (camelCase)                                                                                                                                                                               | read, public catalog            | `actions[]` with `action_id`, `action_name`, `action_description`, `fields_for_action_details`, `sample_response_format` |
| List Triggers          | `scriSpsx1eK3` | `{ "service_id": "<service_id>" }` (snake_case)                                                                                                                                                                             | read, public catalog            | `triggers[]` with `trigger_id`, `trigger_name`, `description`, `sample_payload_to_flow` (what the flow receives)         |
| List Connections       | `scridj7tAr3d` | `{}`                                                                                                                                                                                                                        | read                            | `auth_id`, `service_id`, `service_name`, `connection_label` (a JSON string: parse it before showing it)                  |
| Create Connection Link | `scri5aQxBVDS` | `{ "service_ids": ["<service_id>"] }`                                                                                                                                                                                       | read: only makes a sign-in URL  | `data[]` with `connection_url` per service                                                                               |
| List Flows             | `scri9AcTXQz6` | `{}`                                                                                                                                                                                                                        | read                            | `flows[]` with `script_id`, title and trigger type                                                                       |
| Get Flow               | `scriiyjwEBCw` | `{ "script_id": "<script_id>" }`                                                                                                                                                                                            | read                            | the trigger and the full `steps[]`                                                                                       |
| Build Trigger Input    | `scriLeYwDcRh` | `{ "service_id": "<service_id>", "trigger_id": "<trigger_id>", "auth_id": "<auth_id>", "instructions": "<plain words>", "thread_id": "<your id>" }`                                                                         | saves nothing                   | `inputData` (pass it to Save Trigger verbatim) and `trigger_response` (a sample payload the steps can read)              |
| Build Action Input     | `scri0xjrcFYO` | `{ "service_id": "<service_id>", "action_id": "<action_id>", "auth_id": "<auth_id>", "instructions": "<plain words>", "thread_id": "<your id>" }`                                                                           | saves nothing                   | `inputData` (paste it into the step code verbatim, interpolating context) and `response_schema`                          |
| Create Empty Flow      | `scriawxQq670` | `{ "flow_title": "<title>", "flow_description": "<one line>" }`                                                                                                                                                             | **write**                       | `data.script_id`                                                                                                         |
| Save Trigger           | `scriiFjLfCTU` | `{ "scriptId": "<script_id>", "triggerType": "plugin" \| "cron" \| "webhook", "trigger_id": "<trigger_id>", "auth_id": "<auth_id>", "inputData": {}, "cronStatement": "<cron>" }` (the last four as the trigger type needs) | **write**, replaces the trigger | the saved trigger                                                                                                        |
| Save Steps             | `scriXhp94DJ8` | `{ "scriptId": "<script_id>", "steps": [{ "stepname": "<name>", "code": "<js>", "service_action_functions": [] }] }`                                                                                                        | **write**, replaces all steps   | the saved steps                                                                                                          |
| Run Action Once        | `scri5SwnfYyK` | `{ "service_id": "<service_id>", "action_id": "<action_id>", "auth_id": "<auth_id>", "instructions": "<plain words>", "thread_id": "<your id>" }`                                                                           | **runs a real action**          | the action's result                                                                                                      |

`thread_id`: one id you make per trigger or step (`slack-send-message-sales`), reused for later changes to the same
step, so the builder keeps its context.

Field docs and samples: `https://app.docstar.io/p/automations/llms.txt?collectionId=eInXd9-ETenX` and
`https://app.docstar.io/p/app-catalog-and-connections/llms.txt?collectionId=eInXd9-ETenX` (each endpoint links its
`.openapi.yml`). Fetch raw.

**An empty answer is not proof.** Every call answers HTTP 200: a missing or wrong token gives `{ "flows": [] }`,
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
   `triggerType: "webhook"` only; the flow then runs on each `POST https://flow.sokt.io/func/<script_id>` and the
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
action_id }]` (one per action the code calls; `name` is the exact action name; `[]` for a step that only decides or
   transforms).
7. **Run it once** if they agree (POST the webhook, cause the event, or wait for the schedule), and tell them the
   flow is in their viaSocket account, what it does, and how to pause it (under Automations at
   https://flow.viasocket.com, open the flow).

**Edit** = Get Flow → change → Save Steps with every step. A step left out is deleted.

Before Create Empty Flow, Save Trigger and Save Steps, say what will be saved and wait for the yes. The reads and the
two Build calls need no confirmation.

While building a workflow, Run Action Once is not a way to resolve names: Build Trigger Input and Build Action Input
already resolve names to ids. Only when they can't, offer it, say exactly what it will do (it runs a real action on
their real account), and call it after a yes.

## Step code

Each step is one JavaScript string run in viaSocket's VM; its `return` value is the step's result, read by later steps
at `context.res.<stepname>`; the trigger's payload is `context.req.body`.

- `stepname`: lowercase letters, digits, `_`; starts with a letter; unique.
- In scope: the registered actions (called by `name` with `{ inputData }`), `context`, `fetch`, `axios`, `await`. No
  `import`, no npm packages. 58 seconds per run.
- Read context by full path where used (`context?.res?.fetch_news?.content`), never copied into a local first; map the
  paths from Build Trigger Input's `trigger_response` and Build Action Input's `response_schema`, not from guesses.
- No `try/catch`: `if` guards. A failed step's result becomes `{ "error": {} }` and later steps still run, so check
  `context.res.<stepname>?.error` before using a result.
- `inputData` exactly as Build Action Input returned it, with context values interpolated.
- `console.log` lines in markdown with real values, for the flow's history page; never a secret.
- End with a `return` later steps can rely on. One decision or action per step; small steps over one branching step.
- Text that varies per input (replies, summaries) is the Run AI Model action's job (built-in, `auth_id` `"NoAuth"`:
  `https://viasocket.com/docs/skill/built-in-actions.md`); code does calculation and mapping.

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
