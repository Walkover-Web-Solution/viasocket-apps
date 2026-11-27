# viaSocket plugin for Claude

viaSocket is the integration, automation and AI layer for products and for the people building them. This plugin
gives Claude two things:

| Part | What it is | Where |
| --- | --- | --- |
| **viaSocket MCP connector** | The remote MCP server at `https://connect.viasocket.com/mcp`. Claude uses it to work in your viaSocket account: search the app catalog, list your connected apps, create and edit automations (flows), manage your Developer Hub plugs, and read viaSocket's docs and API reference. | [`.mcp.json`](.mcp.json) |
| **`viasocket-integrations` skill** | The guide Claude follows when it builds with viaSocket inside your own project: app integrations for your users, automations, an AI assistant, AI memory, login and organisations, and an MCP server for your product. | [`skills/viasocket-integrations`](skills/viasocket-integrations/SKILL.md) |

## What you can ask for

- "Add a Connect Slack button to my app so each user can post to a channel they choose."
- "When a new contact is created in HubSpot, add a row to my Google Sheet."
- "Give my product's assistant long-term memory for each user."
- "List my viaSocket plugs and show how many runs each action had this month."

## Install

From the Claude plugin directory, or in Claude Code:

```
/plugin install viasocket --marketplace Walkover-Web-Solution/viasocket-apps
```

## Requirements

- A viaSocket account. Sign up at https://viasocket.com.
- The connector asks you to sign in to viaSocket (OAuth 2.0) the first time Claude uses it. You can disconnect it at
  any time from Claude's connector settings.
- Work in your own project uses the `viasocket-apps` npm package through `npx`, which needs Node.js 20 or newer.

## What this plugin runs, sends and fetches

Nothing runs when the plugin is installed: it has no hooks, no commands, no agents and no bundled executable. What
happens during a task is listed here in full.

### The MCP connector

- Every tool call goes to `https://connect.viasocket.com/mcp` with your viaSocket sign-in, and from there to
  viaSocket's own API. The tools act only on your viaSocket account.
- Tools that change something (create or save a flow, write to the viaSocket API) are marked as write tools, so
  Claude can ask you before it uses them.
- Three tools send a report to the viaSocket team: `send_feedback_to_viasocket`, `report_feedback` (a problem met
  while building) and `report_published` (a plug you just published, so viaSocket can review it). A report holds
  the text Claude writes about the problem; it is not meant to hold secrets, tokens or your private data.
- `get_viasocket_embed_secret` writes your organisation's embed signing secret to your project's `.env` in
  encrypted form. The secret is not shown in the conversation.

### The skill

- **Fetches documentation.** The skill reads viaSocket's guides from `viasocket.com/docs`,
  `memory-api.viasocket.com` and, when you ask for hosting, `embarko.ai/docs`. The copy in this folder is synced
  from https://viasocket.com/docs/skill.md, and the skill checks that page once per session and follows it when it
  is newer than the copy.
- **Runs commands in your project, after you agree to the plan.** These are `npx -y viasocket-apps <command>`
  (for example `setup`, which opens a viaSocket sign-in link and writes `VIASOCKET_ORG_ID`,
  `VIASOCKET_PROJECT_ID`, `VIASOCKET_EMBED_SECRET` and `VIASOCKET_AGENT_TOKEN` to `.env`, and `check`, which looks
  for invented ids and URLs in your code), `npm install viasocket-apps`, `pip install viasocket`,
  `npm install rtlayer-client`, and the `curl` calls a guide page shows.
- **Calls viaSocket's API.** Calls go to `flow-api.viasocket.com`, `flow.sokt.io`, `flow.viasocket.com`,
  `plug-service.viasocket.com`, `mcp.viasocket.com` and `memory-api.viasocket.com`. Login and organisations work
  also calls `36blocks.com`, `routes.msg91.com` and `proxy.msg91.com`, and plug work reads `app.docstar.io`.
- **Sends progress events to viaSocket.** At each milestone of a job the skill sends one small unauthenticated
  `POST` to `https://flow.sokt.io/func/scri9yD5OQJQ`, so viaSocket can see where the skill is easy or hard to
  follow. An event holds: your viaSocket org id and project id, a random session id, a sequence number, the time,
  the skill version, the feature being built, the agent's name (for example "Claude Code"), the event name and its
  status, the app's slug, the action or trigger id, and up to 300 characters of plain words about what happened.
  It never holds code, values from your data, tokens, secrets or your prompt. viaSocket also records the country
  the request came from. The full list of events and fields is in
  [`references/journey.md`](skills/viasocket-integrations/references/journey.md).
- **Sends problem reports to viaSocket.** When a call fails or viaSocket lacks an app or a feature, the skill
  sends a report as described in [`references/feedback.md`](skills/viasocket-integrations/references/feedback.md).

If you do not want progress events or problem reports sent, tell Claude at the start of the task.

## Privacy and support

- Privacy policy: https://viasocket.com/privacy
- Terms of service: https://viasocket.com/terms
- Support: support@viasocket.com or https://viasocket.com/help/others/support

## How this folder is kept current

`skills/viasocket-integrations` is written by `scripts/sync-skill.mjs` at the root of this repository and is never
edited by hand. Each time the served skill changes, the sync rewrites the copy and raises the plugin's version in
[`.claude-plugin/plugin.json`](.claude-plugin/plugin.json).

## License

MIT. See [LICENSE](LICENSE).
