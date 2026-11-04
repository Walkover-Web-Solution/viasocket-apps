# Signing in to their own account

Back to the skill: https://viasocket.com/docs/skill.md

One sign-in lets you act in the viaSocket account of the person you work for: build their own automations
(my-automations.md), their product's MCP server
(mcp.md) and their plug (plugs.md), as them. One
page revokes it.

The features for their product's users need none of this: the product's own keys sign those calls. The `setup`
command that writes those keys signs in this same way while it runs, so after it `VIASOCKET_AGENT_TOKEN` is already
in `.env`.

The ways in, in order, are the skill's "Sign in": 1 the viaSocket MCP server already connected, 2 the login command,
3 the viaSocket MCP server's own sign-in, 4 a token they paste. Take the first one you can do; when it fails, say so
in one line and take the next. Below: how each way works, how to check you are in, and what to do when one fails.

## 1. The viaSocket MCP server, already signed in

Connected when your tool list has `get_org_details_by_token` (a client may prefix the names, such as
`mcp__viasocket__get_org_details_by_token`). Its tools carry the sign-in: nothing to paste, nothing in `.env`. Load
its `quickstart-viasocket-developer-hub` skill first.

- The automation calls of my-automations.md go through its
  `call_any_api_of_viasocket` tool with an empty `Authorization`.
- The Developer Hub calls of plugs.md go through its dedicated tools or
  `call_any_read_api_of_viasocket` / `call_any_api_of_viasocket`.

Check you are in with `get_org_details_by_token`: it answers `data.org.id`. An error that says to sign in, or an empty
answer, means the connector's sign-in has lapsed: take way 2 when you can run a command on the machine where their
browser is. Otherwise, for their own account, way 3; for a product's users, the keys page in
setup.md gives all three keys at once, so go there.

## 2. The login command, when you can run a command on the machine where their browser is

Run it in the project folder (Node.js 20+; nothing to install):

```bash
npx -y viasocket-apps login
```

It opens viaSocket's sign-in page in their browser and waits up to five minutes. Tell them:

> Sign in to viaSocket in the tab that opened (or sign up), pick your company if it asks, and click **Allow**.

On Allow it writes `VIASOCKET_AGENT_TOKEN` and `VIASOCKET_ORG_ID` to `.env`, checks them with viaSocket, prints the
workspace and exits 0. You never see the token.

- Your environment refuses the command, or there is no browser on this machine: run it in the background with
  `--no-open`, send them the printed URL, and read `.env` once they say they clicked Allow. This works only when
  their browser can reach `127.0.0.1` of the machine running the command (a local agent, not a cloud sandbox): if it
  can't, go to way 3 or 4.
- Exit 1 (nothing arrived, or the sign-in was refused): run it once more, then the next way.
- `--env <file>` picks another file. The same package's `setup` and `mcp` commands sign in this way themselves when
  `.env` has no token.

## 3. The viaSocket MCP server's sign-in, when you can use a connector but not a command

If the connector is in your tool list and its sign-in has lapsed, ask once, with the exact link to your own
client's connector settings in place of `<link>` (Claude.ai: https://claude.ai/settings/connectors), then wait:

> Open <link>, click **Connect** (or **Reconnect**) next to viaSocket, sign in, and tell me when it's done.

If you have no viaSocket tools: add `https://connect.viasocket.com/mcp` as an MCP server when your client lets you
do that yourself. When only they can, ask once, then wait:

> Open <link>, add a custom connector with the address https://connect.viasocket.com/mcp, sign in when it asks, and
> tell me when it's done.

When they say it is done, call `get_org_details_by_token`; it, not the person, confirms the sign-in. If they do not
know what to do there, or it still fails, way 4 at once: never explain connectors.

## 4. A token they paste, for every other agent

When you can neither run a command nor add or use an MCP server, whatever your client is called. Ask once, then wait:

> Open https://flow.viasocket.com/agent-access, sign in (or sign up), click **Copy**, and paste it into
> <the exact place>. Tell me when done.

`<the exact place>` is where your calls read it as `VIASOCKET_AGENT_TOKEN`: the project's `.env` or the builder's
secret settings, named the way they see them. The page shows that one token and nothing else.

With no `.env` and no secret store (a chat), ask them to paste it to you. Keep it only where your calls read it,
never repeat it, and once the job is done tell them in one line that **Regenerate** on the same page replaces it.

## Using the token (ways 2 and 4)

It is their personal token for that workspace: it never expires, it acts as them, and it is revoked from the same
page (Regenerate). Send it on every viaSocket call as a header, exactly as it is:

```
Authorization: <VIASOCKET_AGENT_TOKEN>
```

Then check it once, which also gives the org id. A shell does not read `.env` by itself, so load it first:

```bash
set -a; . ./.env; set +a
curl -fsS https://flow-api.viasocket.com/oauth/v1/me -H "Authorization: $VIASOCKET_AGENT_TOKEN"
```

`200` with `data.user` (`id`, `name`, `email`) and `data.org` (`id`, the org id every Developer Hub URL needs, and
`name`) means you are in. `401` means the token did not arrive as it is (a secret store that wraps values in quotes, a
stray space), or it was pasted wrong or revoked: send the bare token, and if it still fails ask for it again, never
guess.

## Rules for the token

- It lives in `.env` or the agent's secret store, read at run time. Never in code, a committed file, a tool definition,
  a log or a report, and never in a chat message except the one paste of way 4 in a chat. Never print it, even
  masked.
- Never put it in a flow step, an action's `inputData` or a plug's code: those run on viaSocket and would carry it.
- It is for the agent, not the app: a product that never uses it at run time keeps it out of the environment it
  deploys.
- One token per person and workspace; a second copy from the page is the same token. If it may have leaked, they
  click **Regenerate** on the page and every agent holding the old one stops working.
- The embed signing secret, an embed token, a `proxy_auth_token` and a `script_id` are different things; none of them
  works here and this token works nowhere they do.

## Which workspace

The token belongs to one workspace. If they have several, the sign-in page asked them to pick one; the check above
says which. Every Developer Hub URL carries that org id; the automation calls need none.

END OF PAGE
