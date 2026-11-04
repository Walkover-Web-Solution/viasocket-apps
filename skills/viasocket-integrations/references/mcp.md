# MCP servers

Part of the viaSocket skill: https://viasocket.com/docs/skill.md.

The person you work for wants their product usable from Claude, ChatGPT, Cursor or any other agent: a user asks
their AI to do something, and it happens inside the product. That takes an MCP server, one web address an AI client
adds to get a set of tools. viaSocket hosts it, with the product's name, its sign-in, its instructions and its
ready-made prompts; the product hosts only the API it already has, and work that starts in any agent finishes
inside the product.

Two kinds, and a product can have both:

| kind                     | what it is                                                                                                            | who makes it                                       | read                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------- |
| the product's own server | the product's API as tools: one URL for every user, each signed in with the product's login                           | you, once, with a command, in the person's account | sections 1 and 2 below           |
| users' MCP servers       | servers a user makes for an agent or AI product they build inside the product, with the tools they pick; theirs alone | the product's code, for each user                  | "Users' MCP servers", at the end |

Which one:

- "Give our product an MCP URL": the product's own server.
- "Let our users, or the agents they build, get MCP URLs": users' MCP servers.
- The request says neither: the product's own server. Connecting this agent itself to viaSocket is not this page: that
  is the viaSocket MCP server of agent-access.md.

**The product's own server** is an MCP URL the product's users paste into Claude, ChatGPT, Cursor or any MCP client.
The tools behind it are the product's own API endpoints, with the product's instructions, skills and prompts beside
them; users sign in with the product's own login, or with a key the product issues; the server carries the product's
name and icon, a stable `/connector/<slug>` address, and, if wanted, the product's own domain. viaSocket hosts it at
`mcp.viasocket.com`; the product hosts its API and, for sign-in from Claude.ai or ChatGPT when it has no OAuth yet,
two small endpoints ("The product has no OAuth yet"). There is one per product: every user uses the same URL,
so each tool call reaches the product's API as that user, and nothing per user is set up on viaSocket.

**One command does all of it.** The server is described in one file, `viasocket.mcp.json`, and one command creates or
updates it, keeps the ids of what it made, and tests the URL:

```bash
npx -y viasocket-apps mcp
```

It signs them in when `.env` has no `VIASOCKET_AGENT_TOKEN` (the same one click as the setup command; tell them:
"Sign in to viaSocket in the tab that opened (or sign up), pick your company if it asks, and click **Allow**"),
mints `VIASOCKET_MCP_TOKEN` from it and keeps it in `.env`, and never prints a secret. Signed in through the viaSocket MCP
server instead: mint the token with its `call_any_read_api_of_viasocket` tool (`GET
https://flow-api.viasocket.com/mcp/agent-token`, `Authorization` empty), write `data.token` to `.env` as
`VIASOCKET_MCP_TOKEN` without echoing it, and run the command: it uses that token while it works (24 hours). The
connector cannot call `mcp.viasocket.com` itself.

## 1. Decide, then get a yes

The plan, as the skill's "The person you work for" says: what the product's users will be able to do from Claude or
ChatGPT. Below its three lines, these decisions, for whoever reads on. The command runs only after the yes.

### The tools

- One per endpoint the product's users should reach from an AI client. Start with the few that matter.
- Each has a name (`snake_case`, at most 45 characters), one sentence on when the AI should use it, and its inputs as
  a JSON Schema with a description per field. `readOnlyHint: true` for reads, `destructiveHint: true` for deletes.
- **A tool call has 30 seconds.** Work that can take longer (a job, a build, a question to another agent) is two
  tools: one that starts it and answers an id at once, one that reads the result by that id. The product pushes the
  result to whoever waits for it; the AI polls or is told.
- **The rest of a large API:** when users need more endpoints than tools are worth writing, or jobs that chain
  several calls, add one code tool beside the few hand-made ones: section 3.

### Who signs in

- **The product's login**: the user signs in to the product from the AI client (the product's OAuth); each tool call
  reaches the product's API as that user, with their token in the header the table below says.
- **A key the product issues**: an API key, or a token minted per job or per session. The user (or the product, for an
  agent it starts) puts it in the client's MCP headers; the product's `validationUrl` says whether it is still good.
  This is the mode for machine-to-machine use: another product's agent, a CI job, a Cursor cloud agent.
- **Nobody**: only for tools that read public data.

Claude.ai and ChatGPT can only use the product's login: they have no header setting for a key. When the product has
no OAuth, "The product has no OAuth yet" below says what to add.

How the token travels, in every mode:

| hop                                                                               | what is sent                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the AI client → viaSocket                                                         | `Authorization: Bearer <token>` on every request; viaSocket takes the token as what follows `Bearer `. Claude and ChatGPT send the token their sign-in got; Cursor, Claude Code, Windsurf and any client with a `headers` setting send what the user put there, so that entry is `"Authorization": "Bearer <token>"`: another header name, or the bare token, is refused. |
| viaSocket → the product's `validationUrl`, on every request while the login is on | the token under `headerName`: as `Bearer <token>` when `headerName` is `Authorization`, bare under any other name. A 200 means valid; anything else becomes a 401 to the client, so a token that expires stops working at once. With a key, that 401 carries no sign-in, and the client shows the server as failed until the user fixes the header.                       |
| viaSocket → each tool's API, in every mode, whenever the client sent a token      | the bare token under the tool's own `tokenHeader` (default `Authorization`), with the tool's `tokenPrefix` and a space in front when set: set `"tokenPrefix": "Bearer"` on each tool whose API reads `Authorization: Bearer <token>`. A tool whose `headers` already sets that header keeps its own value and never gets the user's token.                                |

So the product's API receives, for a tool with `"tokenPrefix": "Bearer"`, exactly what it receives from its own
frontend: `Authorization: Bearer <the user's token>`, plus the tool's arguments in the body or the query string.

Which clients send what: Cursor, Claude Code, Windsurf and VS Code send the `headers` of their config on every request
and can also run the product's OAuth; Claude.ai and ChatGPT connectors have no header setting, so they need the
product's OAuth or no login. Whether a client sends a header is confirmed by the command's test with `--token`, not
assumed.

### The product has no OAuth yet

Claude.ai and ChatGPT reach a login server only through the product's OAuth, and most products have a login form
but no OAuth. Then the product gets two small endpoints of its own, on top of the login it already has; viaSocket
calls them and nothing else changes for its users:

| endpoint                                            | receives                                                                                                                                        | answers                                                                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `loginUrl`, a page (`GET`)                          | `client_id`, `redirect_uri`, `response_type=code`, `state`, maybe `scope`                                                                       | after the user signs in with the product's own login: a redirect to `redirect_uri` with `code` and the same `state`, or with `error` |
| `tokenUrl` (`POST`, a JSON body, within 10 seconds) | `client_id`, `client_secret`, `grant_type: "authorization_code"`, `code`, `redirect_uri`; or `grant_type: "refresh_token"` with `refresh_token` | `{ "access_token", "expires_in", "refresh_token" }`; only `access_token` is required                                                 |

- The `access_token` is the product's own token, the one its API already takes. viaSocket forwards it to the tools as
  it is, and `validationUrl` must answer 200 for it, so `validationUrl` stays in the definition in this mode too.
- A `code` is good for one use and a few minutes; check `client_id`, `client_secret` and that `redirect_uri` is exactly
  the registered one. A `code` or a refresh token is never accepted where an access token is.
- `clientId` is a name you choose (`<product>-mcp`) and `clientSecret` a long random value you make. Both go in the
  product's own environment; the secret reaches the command as `"${ENV_NAME}"` from `.env`, never a committed file.
- The order: write both endpoints and test them locally (a code exchange against the local server); run the command
  (it creates the server and prints its redirect URI) and register that redirect URI with the endpoints; test every
  tool with `--call` and a token from the product's own login (step 3), which needs nothing new live; put the
  endpoints live; then sign in from Claude once. The endpoints go live after their local test, because the sign-in
  from Claude is the only real test they have; the report lists it as UNTESTED until it ran.
- When someone else puts code live on the product's server, write what they need in one file (`DEPLOY.md`: the files,
  the database change, the names of the values to set, how to check), with no secret value in it. The report's third
  line says to send them that file; the secret reaches them the way the product's other server secrets do.
- After viaSocket restarts its MCP service, clients sign in again on their own; the user may see the sign-in once more.

### The address and the words

- The slug of `https://mcp.viasocket.com/connector/<slug>`: lowercase, 2 to 63 characters, the product's name.
- **Instructions**: one paragraph every client reads at connect: what the product is, which tool to start with.
- **Skills**: a markdown guide per job the product's users do with the tools, naming the tools in order; the model
  loads it when it decides it needs it.
- **Prompts**: ready-made requests the user picks from the client's menu (a slash command in Claude Desktop, Claude
  Code and Cursor), with arguments the client asks for, such as "Weekly report for {{project}}".

## 2. Build it

1. **Write `viasocket.mcp.json`** in the product's repo (committed; a secret goes in as `"${ENV_NAME}"`, read from
   `.env` when the command runs, never written to the file):

   ```json
   {
     "name": "TaskPad",
     "slug": "taskpad",
     "instructions": "TaskPad is a task tracker. Start with list_tasks; use create_task and complete_task only when the user asks.",
     "branding": { "title": "TaskPad", "websiteUrl": "https://taskpad.example", "iconUrl": "https://taskpad.example/icon.png" },
     "login": { "mode": "api-key", "validationUrl": "https://api.taskpad.example/me", "headerName": "Authorization", "method": "GET" },
     "tools": [
       {
         "name": "list_tasks",
         "description": "Lists one user's tasks. Use it before suggesting or changing anything.",
         "api": { "url": "https://api.taskpad.example/todos", "method": "GET", "tokenPrefix": "Bearer" },
         "inputSchema": {
           "type": "object",
           "properties": { "completed": { "type": "boolean", "description": "true for done tasks only; leave out for all" } }
         },
         "annotations": { "readOnlyHint": true }
       },
       {
         "name": "complete_task",
         "description": "Marks one task as done. Only when the user says they finished it.",
         "api": { "url": "https://api.taskpad.example/todos/{{task_id}}", "method": "PATCH", "tokenPrefix": "Bearer" },
         "inputSchema": { "type": "object", "properties": { "task_id": { "type": "number" } }, "required": ["task_id"] }
       }
     ],
     "skills": [
       { "name": "daily_review", "description": "How to plan a user's day from their open tasks.", "file": "mcp/daily_review.md" }
     ],
     "prompts": [
       {
         "name": "plan_my_day",
         "title": "Plan my day",
         "description": "Suggests the three tasks to do first.",
         "arguments": [{ "name": "focus", "description": "What matters today", "required": false }],
         "content": "List my open tasks with list_tasks and suggest the three to do first, keeping {{focus}} in mind."
       }
     ]
   }
   ```

   - `login.mode` is `none`, `api-key` or `oauth`. For `oauth` add `loginUrl` (the product's authorize endpoint),
     `tokenUrl` (must accept a JSON body), `clientId` and `"clientSecret": "${TASKPAD_OAUTH_SECRET}"`, from an OAuth
     app registered in the product; then the product's owner registers the redirect URI
     `https://mcp.viasocket.com/oauth/<server id>/callback` in that app (the id is in the ids file). `"when": "needed"` makes an OAuth server open to connect, with the sign-in asked only when a tool's API answers 401.
   - `api.url` and `api.headers` take `{{argument}}` placeholders; a GET sends the other arguments as the query
     string, the other methods as the JSON body (`"queryParams": ["page"]` moves some to the query string).
     `tokenHeader` names another header for the user's token. `outputSchema` when the answer has a fixed shape.
   - A skill's `content` can be inline markdown or a `file` next to the definition.

2. **Run the command.** First `npx -y viasocket-apps mcp --dry-run`: it checks the file, says what is wrong by key,
   and sends nothing. Then the command itself creates the server, its tools, skills and prompts, or updates them in
   place on a rerun,
   and removes what the file no longer lists. The ids of everything it made go to `viasocket.mcp.ids.json`: commit
   it, it holds no secret, and it is what makes a rerun update instead of duplicate. Then it calls `tools/list` and
   `prompts/list` on the URL as a client would and prints what it found; on a login server it reports the 401 that
   is right without a token.

3. **Test one tool as a client:** `npx -y viasocket-apps mcp --call list_tasks --args '{"completed":false}'`, with
   `--token <a token the validationUrl accepts>` on a login server (a key, or a token the product issued for a test
   user: with a password login, sign in as a test user through the product's own login endpoint, such as
   `POST /auth/login`, and pass the token it answers). The answer is what the product's API returned; a tool that fails answers with a text that starts with
   `Error:`. For the product's OAuth, ask them to add the URL to Claude or Cursor once, sign in, and call each tool.
   A tool that was never called is UNTESTED.

4. **A custom domain**, when wanted: `PUT https://mcp.viasocket.com/api/mcp/<server id>/domain` with `{ "domain" }`
   and `Authorization: Bearer <VIASOCKET_MCP_TOKEN>`; it answers the DNS records the product's owner adds and goes
   `pending_dns` → `issuing_cert` → `active` on its own (an hour at most). Everything else the management API can do
   is in `https://mcp.viasocket.com/api-reference.md`; the command covers what a product needs.

5. **Give it to the product's own AI, if the product has one:** the AI feature's send call takes `mcpServers`
   (`mcp_servers` over HTTP): `[{ "name": "<product>", "url": "<the MCP URL>", "headers": { "Authorization": "Bearer <the signed-in user's token>" } }]`,
   next to its `tools`. The assistant then calls the same tools, as that user, with no second tool list to maintain.
   Any other MCP server goes in the same list.

6. **Hand it over:** the URL, a short paragraph the product can put on its own help page for its users, and how a
   user adds it (Claude: https://claude.ai/settings/connectors, add a custom connector with the URL; ChatGPT: a custom
   connector with the URL in its settings;
   Cursor and Claude Code: `{ "mcpServers": { "<product>": { "url": "<the URL>" } } }`, plus
   `"headers": { "Authorization": "Bearer <key>" }` with a key). For another product's agent: the product mints a
   token for that job, hands it with the URL, and expires it when the job ends.

## 3. A code tool for the rest of the API

A tool per endpoint is best for the few jobs users do most, but a large API would need dozens, and every tool's
description sits in the AI's context on every turn. One `run_code` tool covers the rest: the AI writes a short
JavaScript that calls any endpoint, chains several calls and returns only what is needed. A viaSocket flow runs
that code, so the product hosts nothing new.

How it works:

- A flow in the person's own viaSocket account, with a webhook trigger and one step. The step checks the caller, then
  runs the code it was sent with two things in reach: `api()`, which calls the product's API as the signed-in user,
  and `input`.
- The MCP server's `run_code` tool posts to that webhook. The AI client's token reaches the flow as it reaches any
  tool's API ("Who signs in"), and the MCP tool adds a key that only it and the flow know.
- The code gets `api` and `input`, not the request: `context` is not visible inside it, so it never reads the token
  or the key, and `api()` sends the token only to the product's API.
- One flow serves the product's own server and every user's server, because the code always acts with the caller's
  token.

### Build it

1. **The flow**, as my-automations.md builds one: Create Empty Flow,
   Save Trigger with `triggerType: "webhook"`, then Save Steps with this one step, named `run_code`. Its address is
   `https://flow.sokt.io/func/<script_id>`. Set the three values at the top:
   - `SANDBOX_KEY`: a long random string (`openssl rand -hex 24`), also kept in the product's `.env` as
     `TASKPAD_SANDBOX_KEY`, which the tool of step 2 reads.
   - `API_BASE`: the product's API address, with no `/` at the end.
   - `ME_URL`: an endpoint that answers 200 for a valid token, such as the `validationUrl` of the server's login.
   - `TOKEN_HEADER`: the header the user's token arrives in, in lowercase: `authorization` unless the tool sets
     `tokenHeader`.

   ```js
   const SANDBOX_KEY = '<the key>'
   const API_BASE = 'https://api.taskpad.example'
   const ME_URL = 'https://api.taskpad.example/me'
   const TOKEN_HEADER = 'authorization'

   if (context?.req?.headers?.['x-sandbox-key'] !== SANDBOX_KEY) return { error: 'This flow runs only for its MCP tool.' }
   if (typeof context?.req?.body?.code !== 'string' || !context?.req?.body?.code?.trim())
     return { error: 'Send "code": the body of an async JavaScript function.' }

   const token = context?.req?.headers?.[TOKEN_HEADER]
   const signedIn = token ? await fetch(ME_URL, { headers: { [TOKEN_HEADER]: token } }) : null
   if (!signedIn?.ok) return { error: 'Not signed in: the token was missing or refused.' }

   const send = fetch // kept before the code runs, so the code cannot swap fetch to catch the token
   const api = async (method, path, body) => {
     // a path must start with /, so nothing in it can change the host: the token goes only to API_BASE
     if (!String(path).startsWith('/')) throw new Error('api() takes a path that starts with /')
     const response = await send(API_BASE + path, {
       method,
       headers: { [TOKEN_HEADER]: token, 'content-type': 'application/json' },
       body: body === undefined ? undefined : JSON.stringify(body)
     })
     const text = await response.text()
     const data = await Promise.resolve()
       .then(() => JSON.parse(text))
       .catch(() => text)
     return { status: response.status, data }
   }

   const outcome = await Promise.resolve()
     .then(() =>
       new Function('api', 'input', '"use strict"; return (async () => {\n' + context.req.body.code + '\n})()')(
         api,
         context?.req?.body?.input ?? {}
       )
     )
     .then((result) => ({ result }))
     .catch((error) => ({ error: String(error?.message || error) }))
   console.log('### Code run: ' + (outcome.error ? 'failed: ' + outcome.error : 'ok'))
   return outcome
   ```

   The flow has this step only: no app actions, no connections and no other secret, because anything else in this
   flow is within the code's reach.

2. **The tool**, in `viasocket.mcp.json`'s `tools`:

   ```json
   {
     "name": "run_code",
     "description": "Runs JavaScript against the TaskPad API as the signed-in user. Use it for jobs the other tools do not cover or that need several calls; read the taskpad_api skill first.",
     "api": {
       "url": "https://flow.sokt.io/func/<script_id>",
       "method": "POST",
       "tokenPrefix": "Bearer",
       "headers": { "X-Sandbox-Key": "${TASKPAD_SANDBOX_KEY}" }
     },
     "inputSchema": {
       "type": "object",
       "properties": {
         "code": {
           "type": "string",
           "description": "The body of an async JavaScript function. `await api(method, path, body)` calls the TaskPad API as the signed-in user and answers { status, data }; `input` holds the input argument; `fetch` is available, `import`, `require` and `axios` are not. Return a small JSON value. Finish within 25 seconds."
         },
         "input": { "type": "object", "description": "Values the code reads as input." }
       },
       "required": ["code"]
     },
     "annotations": { "destructiveHint": true }
   }
   ```

   `destructiveHint` because the code can write: most clients ask the user before such a tool runs.

3. **A skill that says what to call**, in `skills`, named in the instructions ("For anything the other tools do not
   do, read taskpad_api, then use run_code"). Without it the AI guesses paths. One line per endpoint, then an
   example:

   ```markdown
   # TaskPad API, for run_code

   Call it with `await api(method, path, body)`; it answers `{ status, data }`.

   - `GET /todos?completed=false`: open tasks, `[{ "id", "title", "due", "completed" }]`.
   - `PATCH /todos/{id}` with `{ "completed": true }`: closes a task; answers the task.

   Close every overdue task:

   const { data } = await api('GET', '/todos?completed=false')
   const late = data.filter((task) => task.due < new Date().toISOString())
   for (const task of late) await api('PATCH', `/todos/${task.id}`, { completed: true })
   return { closed: late.map((task) => task.title) }
   ```

4. **Test:** `npx -y viasocket-apps mcp --call run_code --args '{"code":"return (await api(\"GET\", \"/me\")).status"}'`
   with `--token <a test user's token>` answers `{"result":200}`. Then post to the webhook without the key and see
   the refusal.

What the tool answers:

| answer                                                 | meaning                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `{ "result": … }`                                      | what the code returned                                           |
| `{ "error": "<message>" }`                             | the code threw or did not compile; the message says why          |
| `{ "error": "Not signed in: …" }`                      | the client sent no token, or `ME_URL` refused it                 |
| `{ "error": "This flow runs only for its MCP tool." }` | the key is missing or wrong: the call did not come from the tool |

Limits:

- **25 seconds:** the tool call ends at 30, and the webhook answers only when the run ends, so longer code fails.
- **Each call is a flow run** in the person's own viaSocket account and counts on its plan.
- **The code acts as the user:** it can do whatever their token allows and send what it reads anywhere with `fetch`,
  like any code an AI writes. Offer it only on a server with a login. To keep some endpoints out (admin, key
  minting), refuse their paths in `api()`.
- **It is not a hard sandbox:** the code runs in the same JavaScript as the step, so the step holds nothing the user
  may not have. Each run starts afresh, so one run's code cannot reach the next run's.
- **The flow's history** keeps each run's input and result, which the members of the person's viaSocket account can
  open.

## Finished when: the product's own server

The report says: the URL and the slug; each tool's name, endpoint and who may call it; which login mode and, for
OAuth, that the redirect URI is registered; the instructions, each skill and each prompt; the test of step 3 for
each tool, or UNTESTED with why; that `viasocket.mcp.json` and `viasocket.mcp.ids.json` are committed. With a code
tool: the flow's `script_id`, where the key is kept, its skill, and its test.

## When it goes wrong: the product's own server

| symptom                                                 | cause                                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The command says `viasocket.mcp.json: …`                | The definition is wrong at that key; nothing was created. Fix the key and rerun.                                                                                   |
| The command says `viasocket.mcp.json holds the ids …`   | The ids file of this page's earlier layout; the command moved it to `viasocket.mcp.ids.json`. Write the definition with the same slug and tool names, and rerun.   |
| `401 Unauthorized` from `/api/...`                      | `VIASOCKET_MCP_TOKEN` expired (24 hours); the command mints a new one itself, a hand-made call gets one from `GET https://flow-api.viasocket.com/mcp/agent-token`. |
| `409` on the slug                                       | Another server has it; pick another slug.                                                                                                                          |
| Two tools with the same name on the URL                 | The ids file was deleted or not committed, so a rerun created anew; delete the extras with `DELETE /api/tool/id/<_id>` and keep the file.                          |
| Sign-in fails after the product's login                 | The redirect URI is not registered in the OAuth app, or `tokenUrl` does not accept JSON.                                                                           |
| Every tool call answers `Error: Tool API responded 401` | The token went bare: set `"tokenPrefix": "Bearer"` on the tool, or `tokenHeader` for another header.                                                               |
| Cursor never asks to sign in                            | `"when": "needed"` is set: Cursor signs in only when connecting itself answers 401. Drop it.                                                                       |
| A tool answers `Error:` after 30 seconds                | The product's endpoint took longer than a tool call may; split it into start and read, as "The tools" says.                                                        |
| The custom domain stays `pending_dns`                   | The records are not there yet; `POST /api/mcp/<id>/domain/check` runs the check now and `lastError` says what is missing.                                          |

## Users' MCP servers

A product that lets its users build agents or AI products gives each user MCP servers of their own: made inside the
product, with the tools the user picks, and taken to Claude, ChatGPT, Cursor or another agent. The product runs no
MCP server, and no user sees another's.

How it works:

- A user's server has the parts of the product's own: tools that call the product's API, a login, instructions,
  skills and prompts. Section 1 says how to choose each. The product's code makes it, for that user, when the user
  saves their agent; no file and no command.
- It is made with a token for that user, from `GET https://flow-api.viasocket.com/embed/mcp/token` with their embed
  token (the one the product signs with `VIASOCKET_EMBED_SECRET`: connect.md
  shows it).
- That token is for an account of the user's own, so their servers, skills and prompts are apart from the product's
  own server and from every other user's.
- A user can have several servers, one per agent for example; each server's ids are kept with that agent.
- A user's server can have section 3's code tool: the same flow and tool, with the key's value in place of `"${…}"`
  (over HTTP, in `apiConfig.headers`). Name its skill per agent (`<agent>_api`), since skill names are unique per user.
- What a user's server does not have: a slug or a custom domain (its URL is given back when it is made), and an OAuth
  login (each server would need its own redirect URI registered in the product's OAuth app). The login is `api-key` or
  `none`.

### Decide, then get a yes

Post these as the plan:

- **The tools a user can pick:** which of the product's endpoints become tools, and each tool's description.
- **Who signs in to a user's server:** `api-key`, a key the product issues per user or per agent and checks at its
  `validationUrl` (the product builds both), or `none` for public data. How the token travels: "Who signs in" above.
- **Where the ids are kept** (per server, with the agent, in the product's database) and where the user sees the URL
  and removes a server.

### Build it

Every call answers JSON: `{ "success": true, "message": "…", "data": … }`, or `{ "success": false, "message": "<why>" }`
with a status of 400 or more. Keep each id a call gives back in the product's database.

1. **The user's token**, from the product's backend, with the user's embed token as it is (no `Bearer`):

   ```bash
   curl -s https://flow-api.viasocket.com/embed/mcp/token -H "Authorization: <the user's embed token>"
   ```

   ```json
   {
     "success": true,
     "message": "MCP user token minted",
     "data": { "token": "<token>", "token_type": "Bearer", "expires_in": 3600, "api": "https://mcp.viasocket.com/api" }
   }
   ```

   Keep `data.token` in the product's backend for `expires_in` seconds, and get a new one on a 401. Every call below
   goes to `https://mcp.viasocket.com/api` with `Authorization: Bearer <data.token>` and
   `Content-Type: application/json`.

2. **The server**, the first time only: `POST /mcp`. It answers `data._id`, the server id, and `data.url`, the MCP URL
   the user adds to their client; show that URL, never build it.

   ```json
   {
     "name": "Weekly planner",
     "isAuthenticationEnabled": true,
     "externalAuth": { "validationUrl": "https://api.taskpad.example/me", "headerName": "Authorization", "method": "GET" }
   }
   ```

   With `none`: `"isAuthenticationEnabled": false` and no `externalAuth`.

3. **Its words, look and login:** `PUT /mcp/<server id>`, right after step 2 and again whenever the user changes them,
   with the same `name`, `isAuthenticationEnabled` and `externalAuth` (`null` with `none`), plus `branding`:

   ```json
   {
     "name": "Weekly planner",
     "title": "Weekly planner",
     "instructions": "Start with list_tasks; change a task only when the user asks.",
     "websiteUrl": "https://taskpad.example",
     "iconUrl": "https://taskpad.example/icon.png"
   }
   ```

   `branding.name` is the server's machine name in the MCP handshake: the name in lowercase with dashes
   (`weekly-planner`). `title`, `websiteUrl` and `iconUrl` are what clients show; `instructions` is what every client
   reads when it connects.

4. **Each tool:** `POST /tool`. It answers `data._id`, the tool id. Section 2's `list_tasks` tool as a call:

   ```json
   {
     "type": "custom",
     "mcpServerId": "<server id>",
     "title": "list_tasks",
     "desc": "Lists one user's tasks. Use it before suggesting or changing anything.",
     "apiConfig": { "url": "https://api.taskpad.example/todos", "method": "GET", "tokenPrefix": "Bearer" },
     "payload": {
       "inputSchema": {
         "type": "object",
         "properties": { "completed": { "type": "boolean", "description": "true for done tasks only; leave out for all" } }
       }
     },
     "annotations": { "readOnlyHint": true }
   }
   ```

   - `title` is the tool's name (`snake_case`, at most 45 characters) and `desc` when the AI should use it.
   - `apiConfig` takes `url`, `method` (in capitals), `headers`, `tokenHeader`, `tokenPrefix` and `queryParams`, as
     section 2 describes them.
   - `payload` takes `inputSchema` and, when the answer has a fixed shape, `outputSchema`.
   - To change a tool, send the same body with `"toolId": "<tool id>"`. To remove one, `DELETE /tool/id/<tool id>`.

5. **Each skill:** `POST /skill` with `{ "name", "description", "content" }` answers `data._id`; then
   `POST /mcp/<server id>/skill/<skill id>` puts it on the server.
   - To change it: `PUT /skill/<skill id>` with the same body.
   - To remove it: `DELETE /mcp/<server id>/skill/<skill id>`, then `DELETE /skill/<skill id>`.
6. **Each prompt:** `POST /prompt` with `{ "name", "title", "description", "arguments", "content" }` answers
   `data._id`; then `POST /mcp/<server id>/prompt/<prompt id>`. Change and remove it as a skill, with `prompt` in
   place of `skill`.
7. **The user's servers:** `GET /mcp` answers `data` as a list, each with `_id`, `name` and `url`.
8. **Removing a server:** `DELETE /mcp/<server id>` removes it with its tools. Its skills and prompts belong to the
   user's account, not the server, so also `DELETE /skill/<skill id>` and `DELETE /prompt/<prompt id>` for each.

When the user saves their agent again: steps 3 to 6 for what changed, and remove what they dropped. Steps 4 to 6 take
the ids kept from the first save, so nothing is made twice.

Test one user's server as a client, with a key its `validationUrl` accepts:

```bash
curl -s -X POST "<the server's URL>" -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <a key>" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

then the same with `"method":"tools/call","params":{"name":"<tool>","arguments":{...}}` once per tool. The answer is a
line `event: message`, then `data:` and the JSON-RPC reply. A tool's answer is in `result.content[0].text`. A tool that
failed answers a text that starts with `Error:`.

### When it goes wrong

| symptom                                          | cause                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `401` or `498` from `/embed/mcp/token`           | The embed token is wrong (401) or missing (498): run the check of setup.md. |
| `401` from `mcp.viasocket.com/api`               | The user's token expired (one hour): get a new one.                                                          |
| `404` on a server, tool, skill or prompt id      | The id was deleted, or is another user's: each user's token reaches only that user's account.                |
| A skill or prompt is refused as a duplicate name | Skill and prompt names are unique per user, across their servers: name them per agent (`<agent>_review`).    |
| Two servers for one agent                        | The server id from the first save was not kept, so the next save made another.                               |

### Finished when

The report says: the tools a user can pick, the login mode and how keys are issued, where the ids are kept, where the
user sees the URL and removes a server, and one user's server tested as a client, or UNTESTED with why.

END OF PAGE
