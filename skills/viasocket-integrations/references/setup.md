# The product's keys

Back to the skill: https://viasocket.com/docs/skill.md

Contents: One command, one click; Through the viaSocket MCP server, when you have only the connector; When you can do none of these; The client; The module; Finished when

Three values let the product act for each of its users: connect their apps, run their automations, talk to an AI for
them. One command puts them in place, so the first real call happens minutes in, not after a dashboard tour. Once per
project, before any code. The product needs the three in `.env`:

| `.env` key | Value |
| --- | --- |
| `VIASOCKET_ORG_ID` | the workspace id |
| `VIASOCKET_PROJECT_ID` | the embed project id |
| `VIASOCKET_EMBED_SECRET` | the signing secret. Server only: never in client code, a fixture or a log |

If all three are already there (the prompt or the developer you work for put them), skip to "The module".

## One command, one click

Only on the machine their browser can reach: in a cloud sandbox the link it prints comes back to that sandbox's
`127.0.0.1` and never completes, so take the next section that fits instead. Run it in the project folder (Node.js
20+, nothing to install):

```bash
npx -y viasocket-apps setup --no-open
```

It prints a sign-in link and waits up to five minutes. Give them the link as the one thing to do (never open their
browser for them; never describe a sign-in that failed: run it again and hand the new link):

> Sign in here: <link>, pick your workspace, and click **Allow**.

When they click Allow, it:

- writes `VIASOCKET_ORG_ID`, `VIASOCKET_PROJECT_ID`, `VIASOCKET_EMBED_SECRET` and `VIASOCKET_AGENT_TOKEN` (the
  developer's own token) into `.env`. The deployed server needs the first three. It needs the agent token too only
  when it makes the token's calls at run time (Run Action, creating or changing the product's own flows); calling a
  saved flow by its URL needs none. When the work needs only the token (a plug, the product's own automation, its MCP
  server), run this same command: the project it creates is empty and left unused. `.env` goes in `.gitignore` before any commit; the command warns when it is
  not;
- picks the embed project and prints it: the one already in `.env`, else the workspace's only embed, else a new one
  named after the folder (`--name <title>` names it). `--new` always makes a new one: one embed per product, so a
  second product in the same workspace gets its own;
- uses that project's signing secret, creating one if the project has none. You never see it.

It changes no billing, no limits and no settings of an existing project.

**A secret that leaked** (pasted in a chat, shown in a screenshot, committed) is replaced, not kept: on the embed
project's **Settings** page in viaSocket, section **Signing secret**, the **Replace** button makes a new one; from
code, `POST https://flow-api.viasocket.com/projects/$VIASOCKET_PROJECT_ID/secret` with the `Authorization: $VIASOCKET_AGENT_TOKEN`
header answers `data.secret`, the new one (`DELETE` on the same path removes it). Tokens signed with the old project
secret are refused from the next sign-in on, so every server that signs embed tokens gets the new value in its `.env`
at once; nothing else changes: connections, flows and ids stay. The workspace's own key (the one the Configuration
page shows) cannot be replaced today: a product still signing with it moves to a project secret of its own, which
the setup command creates.

- Always `--no-open`: without it the command opens a tab in their browser by itself, and people lose the chat. Run it
  in the background when your environment runs commands to completion, and read its output once it exits: the line
  naming the workspace, the project and the file. It never prints a secret; never open `.env` to check.
- **Exit 3** means the workspace has several embeds and it printed them: show them the list, ask which one is this
  product's, and run it again with `--project <id>`, or with `--new` when none is.
- **Exit 1** means the sign-in did not arrive or a call failed: run it again and hand the link it prints (a link from
  an earlier run is dead: its port closed with that run), then take the next section that fits.

## Through the viaSocket MCP server, when you have only the connector

The connector carries their sign-in, so it finds the two ids itself; only the secret needs them.

1. `get_org_details_by_token` answers `data.org.id`: that is `VIASOCKET_ORG_ID`.
2. `list_embed_projects` with that `orgId` and `type: "embed"` answers `data.projects[]`; leave out those with
   `status` `0` (deleted). One project left: its `id` is `VIASOCKET_PROJECT_ID`. Several: ask which one is this
   product's. None: create one as the tool's own description says (the Create Embed Project endpoint, through
   `call_any_api_of_viasocket`), after their yes; one embed per product.
3. The secret is never read through the connector. Ask once, then wait:

> Open https://flow.viasocket.com/embed-keys?project=<project id>, sign in if it asks, click **Copy**, and paste it
> into <the exact place>. Tell me when done.

`<the exact place>` is the project's `.env` or the builder's secret settings, named the way they see them. The page
copies all three lines; the two ids in it are the ones you found. If it went into `.env`, keep each key once there.

Put the two ids where the product keeps its environment yourself, under the names above.

## When you can do none of these

No command, no HTTP call and no connector: ask once, then wait:

> Open https://flow.viasocket.com/embed-keys?name=<the product's name>, sign in (or sign up), click **Create keys**
> if it shows, then **Copy**, and paste it into <the exact place>. Tell me when done.

The page makes the product's keys when the workspace has none (named by `?name=`), asks which product when there are
several, and copies the three lines `VIASOCKET_ORG_ID=…`, `VIASOCKET_PROJECT_ID=…`, `VIASOCKET_EMBED_SECRET=…` with
one button. `<the exact place>` is the project's `.env` or the builder's secret settings. With neither (a chat), they
paste it to you: write it where the server reads it and never repeat it.

## The module

Copy the module of `https://viasocket.com/docs/apps-api.md` into the server once; it signs every call itself.

**`userId`** in every call is the product's own id for the end user, as a string: one per user, forever, never the
email. Every connection, flow and AI thread belongs to it.

## Finished when

Before any UI: list the connections of the test user `apps-api-test-user`.

```bash
node --env-file=.env --input-type=module -e "import { listConnections } from './viasocket.js'; console.log(await listConnections('apps-api-test-user'))"
```

Not on Node.js: make the same `listConnections('apps-api-test-user')` call from your port of the module.

(`viasocket.js` as an ES module: a project with `"type": "module"`, or name it `viasocket.mjs`. A TypeScript file
that plain `node` cannot import: make the same call from a script or route the project already runs.)

A list (empty until someone connects) means setup is right; a 401 means the secret or the ids are wrong.

A call failing with `host_not_allowed` means a blocked host: ask once to allow these, then carry on; until then,
ask them to run each request and paste the response.

- `viasocket.com`
- `registry.npmjs.org`
- `flow.viasocket.com`
- `flow-api.viasocket.com`
- `flow.sokt.io`
- `plug-service.viasocket.com`
- `connect.viasocket.com`
- `36blocks.com`, `routes.msg91.com` and `proxy.msg91.com` (login and organisations)
- `mcp.viasocket.com`
- `memory-api.viasocket.com`
- `app.docstar.io`

Only `searchApps`, `listApps` and `listEvents` use `plug-service.viasocket.com`: while it is blocked, every app's
page gives its slug and its `service_id`, so the rest can be tested.

END OF PAGE
