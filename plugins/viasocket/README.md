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
- Three tools can send the viaSocket team a report: `send_feedback_to_viasocket`, `report_feedback` (a problem met
  while building) and `report_published` (a plug you just published, so viaSocket can review it). The skill tells
  Claude to use them only when you ask for a report to be sent. A report holds the text Claude writes; it is not
  meant to hold secrets, tokens or your private data.
- `get_viasocket_embed_secret` writes your organisation's embed signing secret to your project's `.env` in
  encrypted form. The secret is not shown in the conversation.

### The skill

- **Fetches documentation.** The plugin ships the skill's root page. The guide for each capability is read from
  `viasocket.com/docs`, `memory-api.viasocket.com` and, when you ask for hosting, `embarko.ai/docs`.
- **Runs commands in your project, after you agree to the plan.** These are `npx -y viasocket-apps <command>`
  (for example `setup`, which opens a viaSocket sign-in link and writes `VIASOCKET_ORG_ID`,
  `VIASOCKET_PROJECT_ID`, `VIASOCKET_EMBED_SECRET` and `VIASOCKET_AGENT_TOKEN` to `.env`, and `check`, which looks
  for invented ids and URLs in your code), `npm install viasocket-apps`, `pip install viasocket`,
  `npm install rtlayer-client`, and the `curl` calls a guide page shows.
- **Calls viaSocket's API.** Calls go to `flow-api.viasocket.com`, `flow.sokt.io`, `flow.viasocket.com`,
  `plug-service.viasocket.com`, `mcp.viasocket.com` and `memory-api.viasocket.com`. Login and organisations work
  also calls `36blocks.com`, `routes.msg91.com` and `proxy.msg91.com`, and plug work reads `app.docstar.io`.
- **Sends nothing to viaSocket for viaSocket's own use.** The plugin sends no usage or progress events and no
  problem reports. Some guide pages on `viasocket.com` describe both for other installs of the skill; the
  plugin's skill tells Claude to skip those steps. When a call fails, Claude tells you what happened, and you
  decide whether to report it.

## Privacy and support

- Privacy policy: https://viasocket.com/privacy
- Terms of service: https://viasocket.com/terms
- Support: support@viasocket.com or https://viasocket.com/help/others/support

## How this folder is kept current

`skills/viasocket-integrations/SKILL.md` is written by `scripts/sync-skill.mjs` at the root of this repository and
is never edited by hand. The sync takes the root page of the skill viaSocket serves, removes every sentence about
progress events and problem reports, and adds the section that says the plugin sends neither. When the page's
text changes, the sync rewrites the copy and raises the plugin's version in
[`.claude-plugin/plugin.json`](.claude-plugin/plugin.json).

## License

MIT. See [LICENSE](LICENSE).
