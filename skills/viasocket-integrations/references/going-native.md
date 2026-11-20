# From the prebuilt UI to your own screens

Back to the skill: https://viasocket.com/docs/skill.md

The functions named here (`listFlows`, `setFlowStatus`, `runAction`, `listOptions`, `listConnections`, `subscribeEvent`) are in the module of https://viasocket.com/docs/apps-api.md

A product that mounted viaSocket's prebuilt UI (the iframe) and now wants its own screens. Nothing the users built
is lost; the product takes over the screens, one feature at a time.

## Keep

- **The same user id.** Sign every call with the user id (`unique_identifier` in the embed token) the prebuilt UI used for
  that user. A new id is a new user with no connections and no flows.
- **Existing connections.** Connections made in the prebuilt UI stay under the same user id: `listConnections(userId)` lists them (`identifier` is the
  `auth_id`), and nothing needs reconnecting unless one shows `isExpired: true` (manage.md).
- **The old flows.** They keep running on their own URLs. List them with `listFlows`, pause or delete them with
  `setFlowStatus` (manage.md). Never delete them for the move.
- **Editing old flows.** Only the prebuilt UI can open one. Keep a small "edit older automations" button that mounts
  it with `open: { flowId }` (https://viasocket.com/docs/embed.md), or accept that old flows are pause-only.

## Replace

| the prebuilt UI did | the product does now | page |
| --- | --- | --- |
| showed apps and actions | its own list from the catalog, forms from the action's typed input and `listOptions` | https://viasocket.com/docs/catalog-api.md, https://viasocket.com/docs/form-renderer.md, actions-and-events.md |
| Connect button | the Connect popup from its own button | connect.md |
| started a flow from an app's event | one event, one reaction: `subscribeEvent` with a webhook or a handler; several steps: an automation with that trigger | actions-and-events.md, https://viasocket.com/docs/automations.md |
| saved a form the user filled and ran it, once per call or once per item | **a flow**: a webhook automation (`runOncePerItem` for the per-item case) with one step that calls the action; the user can reopen it as a flow | https://viasocket.com/docs/automations.md |
| let the product's AI act in the user's apps | **an enabled app**: enable once, then one `runAction` per call, the action chosen at run time | app-integrations.md |
| told the product through `postMessage` events | the product writes its own record when it saves, and reads `listFlows` for status | manage.md |

An enabled app when the product's AI picks the action at run time. A flow for everything known before it runs: the
product's code or the user chose it, it should run once per item, the user should see and reopen it as a flow, or the
action's `pauses` is set (it waits for a person, a delay or the app's callback, and the next step gets the result). The embed's Settings page (run per item, custom response) belongs to
the prebuilt UI only: in code, each flow says it in its own `setTrigger`.

## Finished when

- Old users see their old flows and connections under the same id.
- One new feature runs through the product's own screens, on the test connection, once.
- The iframe is gone from every page except the "edit older automations" button, if kept.

END OF PAGE
