# The product's keys

Back to the skill: https://viasocket.com/docs/skill.md

Three values let the product act for each of its users: connect their apps, run their automations, talk to an AI for
them. One command puts them in place, so the first real call happens minutes in, not after a dashboard tour. Once per
project, before any code. The product needs the three in `.env`:

| `.env` key               | Value                                                                     |
| ------------------------ | ------------------------------------------------------------------------- |
| `VIASOCKET_ORG_ID`       | the workspace id                                                          |
| `VIASOCKET_PROJECT_ID`   | the embed project id                                                      |
| `VIASOCKET_EMBED_SECRET` | the signing secret. Server only: never in client code, a fixture or a log |

If all three are already there (the prompt or the person you work for put them), skip to "Check it works".

## One command, one click

Run it in the project folder (Node.js 20+, nothing to install):

```bash
npx -y viasocket-apps setup
```

It opens viaSocket's sign-in in their browser and waits up to five minutes. Tell them:

> Sign in to viaSocket in the tab that opened (or sign up), pick your company if it asks, and click **Allow**.

When they click Allow, it:

- writes `VIASOCKET_ORG_ID`, `VIASOCKET_PROJECT_ID`, `VIASOCKET_EMBED_SECRET` and `VIASOCKET_AGENT_TOKEN` (their own
  token) into `.env`;
- picks the embed project and prints it: the one already in `.env`, else the workspace's only embed, else a new one
  named after the folder (`--name <title>` names it). `--new` always makes a new one: one embed per product, so a
  second product in the same workspace gets its own;
- uses that project's signing secret, creating one if the project has none. You never see it.

It changes no billing, no limits and no settings of an existing project.

- **Exit 3** means the workspace has several embeds and it printed them: show them the list, ask which one is this
  product's, and run it again with `--project <id>`, or with `--new` when none is.
- **Exit 1** means the sign-in did not arrive or a call failed: run it once more, then take the next section that
  fits.

## Through the viaSocket MCP server, when you cannot run a command

The connector carries their sign-in, so it finds the two ids itself; only the secret needs them.

1. `get_org_details_by_token` answers `data.org.id`: that is `VIASOCKET_ORG_ID`.
2. `list_embed_projects` with that `orgId` and `type: "embed"` answers `data.projects[]`. One project: its `id` is
   `VIASOCKET_PROJECT_ID`. Several: ask which one is this product's. None: create one as the tool's own description
   says (the Create Embed Project endpoint, through `call_any_api_of_viasocket`), after their yes; one embed per
   product.
3. The secret is never read through the connector. Ask once, then wait:

> Open https://flow.viasocket.com/embed-keys?project=<project id>, sign in if it asks, click **Copy**, and paste it
> into <the exact place>. Tell me when done.

`<the exact place>` is the project's `.env` or the builder's secret settings, named the way they see them. The page
copies all three lines; the two ids in it are the ones you found.

Put the two ids where the product keeps its environment yourself, under the names above.

## When you can do neither

No command and no connector: ask once, then wait:

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

## Check it works

Before any UI: list the connections of the test user `apps-api-test-user`.

```bash
node --env-file=.env --input-type=module -e "import { listConnections } from './viasocket.js'; console.log(await listConnections('apps-api-test-user'))"
```

Not on Node.js: make the same `listConnections('apps-api-test-user')` call from your port of the module.

A list (empty until someone connects) means setup is right; a 401 means the secret or the ids are wrong.

A call failing with `host_not_allowed` means a blocked host: ask once to allow `viasocket.com`, `registry.npmjs.org`,
`flow.viasocket.com`, `flow-api.viasocket.com`, `flow.sokt.io`, `plug-service.viasocket.com`, `connect.viasocket.com`,
`mcp.viasocket.com`, `memory-api.viasocket.com` and `app.docstar.io`; until then, ask them to run each request and
paste the response. Only `serviceIdFor` and the catalog list use `plug-service.viasocket.com`: while it is blocked,
every app's page gives its `service_id`, so the rest can be tested; the product's server still calls `serviceIdFor`.

END OF PAGE
