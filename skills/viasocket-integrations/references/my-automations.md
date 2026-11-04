# viaSocket skill · the developer's own automations

> Part of the viaSocket skill: `https://viasocket.com/docs/skill.md`.

**Why:** the developer's own work automated in their own workspace, by the same agent that builds their product, with nothing saved before they say yes.

Build or edit a flow in the developer's own viaSocket workspace: one trigger (an app event, a schedule, a webhook) and
ordered JavaScript steps that call actions in the apps they have connected. viaSocket runs it and keeps its history; the
developer sees it under Automations at https://flow.viasocket.com. This is not the product's automation (that is
`https://viasocket.com/docs/automations.md`, run per end user from the product's code): here the developer
is the user and there is no product.

Needs a way in first: `agent-access.md`.

## The calls

Thirteen functions, all `POST https://flow.sokt.io/func/<id>` with `Content-Type: application/json`, the JSON body
shown, and `Authorization: <VIASOCKET_AGENT_TOKEN>` (through the MCP: `call_any_api_of_viasocket`, `method: "POST"`,
`Authorization` empty). A refused call still answers HTTP 200: the refusal is in the body (`success: false`, or
`error`). Reads change nothing; writes need the developer's yes.

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

## The order

1. **List Flows first,** after the check of agent-access.md passed: a
   missing or wrong token also answers `{ "flows": [] }`. A flow that already does the job, or a request that is really an edit, goes to that flow
   (Get Flow, then change it); never a second flow for the same automation.
2. **Each app the developer names:** Search Services → `service_id`; then List Triggers or List Actions, to be sure it
   can do the job before anyone signs in to anything. No match → report `kind: missing_capability`, `source: plug`,
   `refs.app`, and tell the developer.
3. **Confirm the plan** as the skill's "Talking to the developer" says: the ask, then what starts it and what
   happens, in plain words, in three lines. The developer learns what they are signing in for before any app asks.
4. **Connections:** List Connections and match on `service_id` → `auth_id`. Several accounts for one app → ask which.
   None → Create Connection Link with the `service_ids`, give the developer each `connection_url`, one per message,
   wait until they say they signed in, List Connections again. Don't build on until the `auth_id` is there. Then
   Create Empty Flow once and keep `script_id`.
5. **The trigger.** An app event: Build Trigger Input (`instructions` naming the channel, sheet, label in plain words;
   it resolves the ids itself) → Save Trigger with `triggerType: "plugin"`, `trigger_id`, `auth_id` and the returned
   `inputData` verbatim. A schedule: Save Trigger with `triggerType: "cron"` and `cronStatement` (five-field cron or
   plain words; unreadable text is refused). A webhook: Save Trigger with `triggerType: "webhook"` only; the flow then
   runs on each `POST https://flow.sokt.io/func/<script_id>` and the caller gets the last step's return value.
   Anyone with that address can run the flow, so the product keeps it on its server and sends a key of its own in a
   header (`X-Flow-Key`, a long random value in the product's `.env`). A step's return does not stop the steps after
   it, so a first step only checks the key, and every later step that acts goes on only when it passed:

   ```js
   // the first step, named check_key
   return { ok: context?.req?.headers?.['x-flow-key'] === '<the key>' }
   // the first line of every later step
   if (!context?.res?.check_key?.ok) return { skipped: 'refused' }
   ```

   The values the caller sends are at `context.req.body`; name them in Build Action Input's `instructions` ("the order id from the request")
   and read them by that path in the step.

6. **The steps.** For each app action: Build Action Input → its `inputData` goes into the step's code; then Save Steps
   with `scriptId` and the **whole** `steps` array: `stepname`, `code`, `service_action_functions: [{ name, auth_id,
action_id }]` (one per action the code calls; `name` is the exact action name; `[]` for a step that only decides or
   transforms).
7. **Run it once** if the developer agrees (POST the webhook, cause the event, or wait for the schedule), and tell
   them the flow is in their viaSocket account, what it does and how to pause it (Automations → the flow).

**Edit** = Get Flow → change → Save Steps with every step. A step left out is deleted.

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

## Rules

- Confirm before Create Empty Flow, Save Trigger and Save Steps: say what will be saved. The reads and the two Build
  calls need no confirmation.
- **Run Action Once runs a real action on the developer's real account** (sends the message, adds the row). Never on
  your own: Build Trigger Input and Build Action Input already resolve names to ids. Only when they can't, offer it,
  say exactly what it will do, and call it after a yes.
- Never put the agent token in a step, an `inputData` or a log.
- **An empty answer is not proof.** Every call answers HTTP 200: a missing or wrong token gives `{ "flows": [] }`,
  `{ "error": {} }` or `null`, and List Actions sent `service_id` instead of `serviceId` gives `{ "actions": [] }`.
  Before you conclude there is nothing, run the agent-access check and confirm the id and its key spelling came from
  the right list call (`serviceId` for List Actions, `service_id` for List Triggers).

## Finished when

The flow exists in the developer's viaSocket account with the trigger and every step saved, each connection it uses
is theirs, it ran once (or the developer declined the run), and the report names the flow and what each step does.
Nothing was created twice, and nothing was saved before the developer said yes.

END OF PAGE
