# Build or fix a plug

Back to the skill: https://viasocket.com/docs/skill.md

A plug makes an app available on viaSocket: its connection (OAuth, API key), its actions and its triggers, each with a
form and the code that calls the app's API. Once it exists, every flow, every product built with this skill and every
MCP server on viaSocket can use that app. The developer you work for builds one in the Developer Hub, for an app
viaSocket lacks or for their own product, and fixes or extends the plugs their org owns. viaSocket's own plugs are
never edited: a missing action, trigger or field on one is reported (`report_feedback`, `kind: missing_capability`).

The work lives in their own viaSocket account, so sign in first as the skill's "Sign in" says; how each way works:
agent-access.md.

## The guides

The plug guides are served here and change; never work from a saved copy. Fetch the index raw, pick the one row that
matches, fetch that guide, read it whole and follow it. Do not read the others.

```
https://viasocket.com/docs/plugs/skills/index.md
```

| they want… | the index row |
| --- | --- |
| a plug for an app, or two or more actions and triggers added to one | `SKILL-PLUG-CREATION.md` |
| one action or trigger of an existing plug created, fixed or improved | `SKILL-ACTION.md` |
| one connection (auth) of an existing plug created, edited or copied | `SKILL-CONNECTION.md` |

**Mode** (`publish-policy.md` "Who is asking"): you came here because the product needs what viaSocket lacks — an
app with nothing live (the person chose to build it) or an action, trigger or field on the person's own plug
(feedback.md "When viaSocket lacks it") → tell the guide you are in
**product mode**: the same steps up to the review, then it publishes privately without asking and calls
`report_published`. The person asked for plug work itself → **person mode**, as the guide says.

Only building or changing needs a guide. Listing or inspecting plugs, their actions, versions or analytics is a few
reads from the table below, with no guide to fetch.

The guides' inputs (`ORG_ID`, `APP_NAME`, `APP_DOMAIN`, `API_BASE`, `PLUGIN_ID`, …): `ORG_ID` is the org from
agent-access; `API_BASE` is `https://flow-api.viasocket.com`; the rest comes from the developer you work for or from the
MCP's list tools (`list_plugins` answers each plug's `rowid`, the `PLUGIN_ID`; `list_actions_and_triggers` the action
and version ids), mapped without the MCP below. Knowledge-base sections the guide cites are fetched one at a time through
`https://viasocket.com/docs/plugs/knowledge-base/index.md`;
`https://viasocket.com/docs/plugs/knowledge-base/publish-policy.md` wins over everything.

## Without the viaSocket MCP server

Every guide says the viaSocket MCP signs each call. With the MCP connected, that is so: follow the guide as written.
With the token instead, make the same calls yourself:

- **Every Developer Hub call** is `https://flow-api.viasocket.com/developers/<ORG_ID>/...` with the header
  `Authorization: <VIASOCKET_AGENT_TOKEN>`. Where a guide says "call it with `call_any_read_api_of_viasocket`" send the
  GET; where it says `call_any_api_of_viasocket`, send the POST, PUT, PATCH or DELETE with the full body the guide
  gives. Most reads and updates take `filter` (the lookup) and `identifier` (a record id) as query params; responses
  are `{ success, message, data }`.
- **Which endpoint, URL, filter and body:** the API reference the MCP reads is public. Start at
  `https://app.docstar.io/p/llms.txt?collectionId=eInXd9-ETenX` (the modules), open one module's `llms.txt`, then the
  endpoint's `.openapi.yml` for its method, URL, params, body and sample responses. Fetch raw.
- **Metadata:** the guide's metadata steps apply unchanged without the MCP: every create and update writes its
  `aiLogs` entry (`CREATED_BY_SKILL` / `UPDATED_BY_SKILL`, never a model name) with `"via": "token"`. Skip it and the
  plug is counted as built by a person.
- **The MCP's dedicated tools map to:**

  | tool | without the MCP |
  | --- | --- |
  | `get_org_details_by_token` | `GET https://flow-api.viasocket.com/oauth/v1/me` with the header → `data.user` and `data.org` (its `id`); `401` = sign in again |
  | `list_plugins` | `GET /developers/<ORG_ID>/get/plugins?filter=getAllPlugins&identifier=<ORG_ID>` → `data[]`, `rowid` is the plug id |
  | `list_auth_versions`, `list_actions_and_triggers`, `list_action_versions`, `get_plugin_analytics` | the Authentication, Actions and Triggers, Action Versions and Analytics modules of the reference |
  | `report_feedback` | `POST https://flow.sokt.io/func/scriVmoUHhmc`, no auth header, the body feedback.md gives, with `orgId` as that page says; answers `requestId` |
  | `report_published` | `POST https://flow.sokt.io/func/scriIJ3BvlIh` with the header and `{ pluginId, published, app?, actionIds?, note? }`, once after a publish on their own plug |

- **Never** print, paste or store the token or any `clientsecret`; client ids and secrets go into the Developer Hub
  only as the guide's connection step says. Auth reads return secrets decrypted: don't echo them.

## Finished when

The guide's own checklist, plus: nothing published before the guide's review and dry run pass; then product mode
published privately without asking, person mode as the person chose;
`report_published` sent after a publish on their own plug; the report says what was built, what they still enter
(credentials), what the dry run verified, and the Developer Hub link (`https://flow.viasocket.com/developer/<ORG_ID>`).

END OF PAGE
