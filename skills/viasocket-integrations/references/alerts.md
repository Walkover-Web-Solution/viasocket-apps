# Alerts to the product's server

Back to the skill: https://viasocket.com/docs/skill.md

viaSocket can tell the product's own server when something goes wrong for one of its users, so the product tells
that user, or its own team, the way it wants (an email, a banner, a push, a ticket). Two alerts, each a POST to an
https address of the product's own:

| alert | when it is sent | the product learns |
| --- | --- | --- |
| a user's connection expired | once, when a run needs the connection and its token can no longer be refreshed | which user (`user_id`), which app, and the `auth_id` to reconnect |
| a flow failed | about every 15 minutes, one POST per project listing the flows that failed since the last one (no POST when none failed) | which flows (`script_id`), with links to their failed runs |

No alert is stored, queued or retried on viaSocket's side: each is sent once, and the product keeps its own record
if it needs one. Set up both after the plan's yes, with `VIASOCKET_ORG_ID`, `VIASOCKET_PROJECT_ID`,
`VIASOCKET_EMBED_SECRET` and `VIASOCKET_AGENT_TOKEN` in `.env` (setup.md writes
all four).

## 1. Where to put the addresses

Both are keys of the embed project's settings, under `config`, saved with the rest of them:

| alert | key in `settings.config` | in the viaSocket dashboard |
| --- | --- | --- |
| a user's connection expired | `alertWebhookUrl` | the embed project's **Settings** page, section **Alerts** |
| a flow failed | `webhookStepFail` | the same **Alerts** section, and the **Prebuilt UI guide**, "Get notified on your server" |

A person can type them there. You set them with two calls: read the project, then write its settings back whole
with the keys added (the write replaces the settings, so a write of the keys alone would wipe the rest):

```bash
curl -s "https://flow-api.viasocket.com/projects/$VIASOCKET_PROJECT_ID" -H "Authorization: $VIASOCKET_AGENT_TOKEN"
```

It answers `data` with `identifier`, `org_id`, `title` and `settings`. Take `data.settings`, set the two keys under
`config` (keep every other key as it came), and send:

```bash
curl -s -X PUT "https://flow-api.viasocket.com/orgs/$VIASOCKET_ORG_ID/projects/$VIASOCKET_PROJECT_ID" \
  -H "Authorization: $VIASOCKET_AGENT_TOKEN" -H "Content-Type: application/json" \
  -d '{ "title": "<data.title, as it came>", "settings": <data.settings, with config.alertWebhookUrl and config.webhookStepFail set> }'
```

The answer carries the saved `settings`. `null` (or an empty string) switches an alert off. `alertWebhookUrl` must be
an https address on the public internet and not a viaSocket host: anything else is refused with a 400 that says why.
`webhookStepFail` is not checked; give it the same kind of address. The two keys may hold the same address: the
endpoint tells them apart by `event` (an expired connection) or `eventId` (a failed flow).

## 2. A user's connection expired

```json
{
  "event": "connection_expired",
  "project_id": "<the embed project>",
  "user_id": "<the unique_identifier the product put in that user's embed token>",
  "auth_id": "<the connection: connect({ authId }) reconnects it in place>",
  "service_id": "<the app>",
  "service_name": "Google Sheets",
  "connection_label": "ops@example.com",
  "expired_at": "2026-11-20T09:00:00.000Z"
}
```

Headers: `x-viasocket-event: connection_expired`, `x-viasocket-delivery` (one id per POST, for the product's own
log) and `x-viasocket-signature`: `sha256=` followed by the hex HMAC-SHA256 of the raw body with
`VIASOCKET_EMBED_SECRET` (the project's secret; the setup command creates it, and without one the header is not
sent). Refuse a POST whose signature is missing or does not match, with a 401.

What the product does: find the user by `user_id` (its own id, so no lookup table) and ask them to reconnect. Their
reconnect is the product's Connect button with `authId`
(connect.md), which keeps every flow built on that connection.

## 3. A flow failed

```json
{
  "integrationName": "<the embed project's title>",
  "eventId": "stepfail",
  "payload": {
    "scripts": {
      "<script_id>": {
        "title": "<the flow's title>",
        "scriptUrl": "<the flow in the viaSocket dashboard>",
        "logUrls": ["<one failed run in the viaSocket dashboard>"]
      }
    }
  }
}
```

One POST per project per report, with every flow that failed since the last one; a flow that failed several times
has one entry with several `logUrls`. No signature header, and no user id: the product knows which user a flow
belongs to from the `script_id` it kept when the flow was made
(https://viasocket.com/docs/automations.md), or from `listFlows(userId)`
(manage.md). The links open viaSocket's dashboard, for the product's team, not its
users. A `script_id` is a credential: keep it on the server, never in what the product shows a user.

What the product does: tell the user their automation failed (or its own team). Why it failed is in that flow's run
history, which the product reads from its server and shows in its own words
(https://viasocket.com/docs/automations.md, "Run history").

## 4. The endpoint

- It is the product's own route, on its server, reachable from the internet over https (the deployed product, or a
  tunnel while developing).
- It answers 2xx at once and does its work after: viaSocket waits 10 seconds and does not retry.
- It tells the two alerts apart by the body: `event` for an expired connection, `eventId` for a failed flow.
- It verifies `x-viasocket-signature` on an expired-connection alert (401 when missing or wrong), answers 2xx to
  `"event": "test"` without acting, and answers 2xx to anything else it does not recognise, doing nothing.
- Work that takes longer than 10 seconds goes after the answer: a slower answer counts as not delivered, and the alert
  is not sent again.

## 5. Test it

- **The expired-connection endpoint:** post the sample body of section 2 to it yourself, signed as section 2 says,
  once with `"event": "test"` (2xx, nothing done) and once as `connection_expired` for a test user (2xx, and that
  user is told). With a wrong signature it answers 401.
- **The failed-flow endpoint:** post the sample body of section 3 to it yourself. For a real one, give a test user a
  flow whose code step throws (`throw new Error('alert test')`), run it once, and wait up to 15 minutes.

viaSocket sends no test of its own. An endpoint that was never exercised is **UNTESTED** in the report.

## Finished when

- Both addresses are saved in the project's settings (read the project again and see them), or the report says
  which one was left off and why.
- The endpoint verifies the signature of an expired-connection alert, answers 2xx, and does what the plan said for
  each alert; each was exercised once as section 5 says, or is listed as UNTESTED.
- No `script_id` or secret from an alert reaches a user's browser or a log; an `auth_id` reaches the browser only in
  the Connect popup's reconnect, for that user.

END OF PAGE
