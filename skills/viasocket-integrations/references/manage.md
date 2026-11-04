# Manage what a user has

Back to the skill: https://viasocket.com/docs/skill.md

A user's connections and flows are theirs. The product shows them, lets the user disconnect an app or pause a flow,
and reconnects an expired app in place so nothing built on it is lost. One call each, per user:

Functions of `https://viasocket.com/docs/apps-api.md`:

| to                                                                                                           | function                                         |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| list their connections (`isExpired: true` → reconnect in place, connect.md) | `listConnections(userId)`                        |
| disconnect an app                                                                                            | `revokeConnection(userId, authId)`               |
| list their flows: enabled apps, subscriptions, automations (`id` is the `script_id`)                         | `listFlows(userId)`                              |
| pause (`2`), delete (`0`), resume or restore (`1`) one                                                       | `setFlowStatus(userId, scriptId, n)`             |
| rename one                                                                                                   | `renameFlow(userId, scriptId, { title })`        |
| change a subscription's handler                                                                              | `updateSubscription(userId, scriptId, { code })` |

Before disconnecting an app, pause every flow of that user that uses the connection (status `2`): a flow on a revoked
connection fails on its next run.

The flow list gives each flow's `status` as `'active'`, `'paused'` or `'deleted'`.

A flow's runs of the last 30 days: `runHistory` in `https://viasocket.com/docs/automations.md`.

END OF PAGE
