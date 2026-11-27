# Manage what a user has

Back to the skill: https://viasocket.com/docs/skill.md

A user's connections and flows are theirs. The product shows them, lets the user disconnect an app or pause a flow,
and reconnects an expired app in place so nothing built on it is lost. One call each, per user:

Functions of `https://viasocket.com/docs/apps-api.md`:

| to | function |
| --- | --- |
| list their connections: `identifier` is the `auth_id`; `connection_label` names the account (when it is a JSON string, parse it before showing it) and `service_name` the app, so two accounts of one app differ by the label; `isExpired: true` → reconnect in place, connect.md. To hear of an expiry without polling: alerts.md | `listConnections(userId)` |
| disconnect an app | `revokeConnection(userId, authId)` |
| list their flows: enabled apps, subscriptions, automations (`id` is the `script_id`) | `listFlows(userId)` |
| pause (`2`), delete (`0`), resume or restore (`1`) one | `setFlowStatus(userId, scriptId, n)` |
| rename one (`title` is required; `description` and `meta` can change too) | `renameFlow(userId, scriptId, { title, description?, meta? })` |
| change a subscription's handler | `updateSubscription(userId, scriptId, { code })` |

Before disconnecting an app, pause every flow of that user that uses the connection (status `2`): a flow on a revoked
connection fails on its next run. Which flows: an enabled app's or a subscription's entry names its connection in
`auth_id`; an automation's connections are those of its trigger and of
each step's actions, as `readFlow` (https://viasocket.com/docs/automations.md) shows them.

The flow list gives each flow's `status` as `'active'`, `'paused'`, `'deleted'` or `'drafted'` (an automation whose
trigger and steps are not both saved yet: https://viasocket.com/docs/automations.md).

Delete (`0`) is a bin: the trigger stops, and `1` within 7 days restores the flow; after that it is removed for good with its steps (https://viasocket.com/docs/automations.md).

A flow's runs, kept 14 days (30 for a failed or paused run): `runHistory` in `https://viasocket.com/docs/automations.md`.

## Alerts

To be told on the product's server when a user's connection expires or a user's flow fails, with the payloads and
where to put the addresses: alerts.md.

END OF PAGE
