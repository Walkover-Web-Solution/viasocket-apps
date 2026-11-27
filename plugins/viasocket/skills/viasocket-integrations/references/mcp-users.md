# Users' MCP servers

Back to the skill: https://viasocket.com/docs/skill.md

Contents: How it works; Decide, then get a yes; Build it; Test it as a client; When it goes wrong; Finished when

A product that lets its users build agents or AI products gives each user MCP servers of their own: made inside the
product, with the tools the user picks, and taken to Claude, ChatGPT, Cursor or another agent. The product runs no
MCP server, and no user sees another's. The product's own server, one URL for all of its users that you make once
with a command, is mcp.md; this page reuses what that page says about a server's
parts (section 1), the shape of a definition (section 2) and the code tool (section 3).

## How it works

- A user's server has the parts of the product's own: tools that call the product's API, a login, instructions,
  skills and prompts. Section 1 of mcp.md says how to choose each. The product's
  code makes it, for that user, when the user saves their agent; no file and no command.
- It is made with a token for that user, from `GET https://flow-api.viasocket.com/embed/mcp/token` with their embed
  token (the one the product signs with `VIASOCKET_EMBED_SECRET`: connect.md
  shows it).
- That token is for an account of the user's own, so their servers, skills and prompts are apart from the product's
  own server and from every other user's.
- A user can have several servers, one per agent for example; each server's ids are kept with that agent.
- A user's server can have the code tool of section 3 of mcp.md: the same flow and
  tool, with the key's value in place of `"${…}"` (over HTTP, in `apiConfig.headers`). Name its skill per agent
  (`<agent>_api`), since skill names are unique per user.
- A flow of the user's is a tool too, over HTTP: `POST /tool` with `"type": "flow"` and the flow's id as `flowId`, and
  no `apiConfig`. The server POSTs the tool's arguments as the flow's body, so `inputSchema` is the body the flow
  reads. A flow the user built in the product's ready screens hands its `mcpToolJson` on publish
  (https://viasocket.com/docs/embed.md); a flow the product defines per user is https://viasocket.com/docs/automations.md.
- The product's own AI uses a user's server too: its send call takes the server's URL in `mcp_servers`
  (https://viasocket.com/docs/ai.md, section 2), so one tool list serves the product's chat screen and Claude.
- What a user's server does not have: a slug or a custom domain (its URL is given back when it is made).
- The login is `none`, `api-key` or `oauth`, with the same `login` keys as section 2 of
  mcp.md and the same token path ("Who signs in" there). With `oauth`, each server
  needs its own redirect URI, `https://mcp.viasocket.com/oauth/<server id>/callback`, registered in the product's
  OAuth app once the server exists, which is why most products issue a key instead. A key works from Claude Code, Cursor
  and the product's own AI; Claude.ai and ChatGPT take the product's login or none, never a key
  (mcp.md, "Who signs in"), so a server the user adds there needs `oauth` or `none`.

## Decide, then get a yes

Post these as the plan:

- **The tools a user can pick:** which of the product's endpoints become tools, and each tool's description.
- **Who signs in to a user's server:** `api-key`, a key the product issues per user or per agent and checks at its
  `validationUrl` (the product builds both); `oauth`, with a redirect URI registered per server; or `none` for public
  data.
- **Where the ids are kept** (per server, with the agent, in the product's database) and where the user sees the URL
  and removes a server.

## Build it

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
     "isAuthenticationEnabled": true,
     "externalAuth": { "validationUrl": "https://api.taskpad.example/me", "headerName": "Authorization", "method": "GET" },
     "branding": {
       "name": "weekly-planner",
       "title": "Weekly planner",
       "instructions": "Start with list_tasks; change a task only when the user asks.",
       "websiteUrl": "https://taskpad.example",
       "iconUrl": "https://taskpad.example/icon.png"
     }
   }
   ```

   `branding.name` is the server's machine name in the MCP handshake: the name in lowercase with dashes
   (`weekly-planner`). `title`, `websiteUrl` and `iconUrl` are what clients show; `instructions` is what every client
   reads when it connects. `branding` replaces the whole object each time, so send every key each time.

4. **Each tool:** `POST /tool`. It answers `data._id`, the tool id. The `list_tasks` tool of section 2 of
   mcp.md as a call:

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
     section 2 of mcp.md describes them.
   - `payload` takes `inputSchema` and, when the answer has a fixed shape, `outputSchema`.
   - To change a tool, send the same body with `"toolId": "<tool id>"`. To remove one, `DELETE /tool/id/<tool id>`.
   - A flow as a tool: `{ "type": "flow", "mcpServerId": "<server id>", "flowId": "<the flow's script_id>", "title", "desc", "payload": { "inputSchema": { … } } }`,
     with no `apiConfig`; sending it again with the same `flowId` updates it.

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

## Test it as a client

Test one user's server as a client, with a key its `validationUrl` accepts:

```bash
curl -s -X POST "<the server's URL>" -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <a key>" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

then the same with `"method":"tools/call","params":{"name":"<tool>","arguments":{...}}` once per tool. The answer is a
line `event: message`, then `data:` and the JSON-RPC reply. A tool's answer is in `result.content[0].text`. A tool that
failed answers a text that starts with `Error:`.

## When it goes wrong

| symptom | cause |
| --- | --- |
| `401` or `498` from `/embed/mcp/token` | The embed token is wrong (401) or missing (498): run the check of setup.md. |
| `401` from `mcp.viasocket.com/api` | The user's token expired (one hour): get a new one. |
| `404` on a server, tool, skill or prompt id | The id was deleted, or is another user's: each user's token reaches only that user's account. |
| A skill or prompt is refused as a duplicate name | Skill and prompt names are unique per user, across their servers: name them per agent (`<agent>_review`). When the id was lost after a failed save: `GET /skills/<server id>` and `GET /prompts/<server id>` list what is on that server, `GET /skill` and `GET /prompt` all of the user's, each with `_id` and `name`; change it with `PUT` and that id. |
| Two servers for one agent | The server id from the first save was not kept, so the next save made another. |

## Finished when

The report says: the tools a user can pick, the login mode and how keys are issued, where the ids are kept, where the
user sees the URL and removes a server, and one user's server tested as a client, or UNTESTED with why.

END OF PAGE
