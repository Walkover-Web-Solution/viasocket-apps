# Reporting a problem to viaSocket

Back to the skill: https://viasocket.com/docs/skill.md

A problem that reaches viaSocket gets fixed for everyone who uses it; one that stays in a chat is lost. Report it,
then carry on with the work.

## When to report

Only when one of these happens (never to report success):

- the same step failed twice (report before the third try);
- an app's action or trigger misbehaves on viaSocket's side: it errors on valid input, returns empty or wrong data,
  its fields or `list-options` are broken, or an event never arrives (`kind: error`, `source: action` or `trigger`);
- a page here, a type in the package or a doc says one thing and the API does another (`kind: wrong_instructions`);
- the person you work for corrects what you built or picked (`kind: user_correction`);
- viaSocket lacks an app, action, trigger or field the product needs (`kind: missing_capability`, `source: plug` for a
  missing app, `action` or `trigger` for a missing one; name it in `refs.app`). "When viaSocket lacks it" below says
  what to do first and after;
- you can't tell which page, action or id applies (`kind: confusion`).

Don't report problems that aren't viaSocket's: a bug in the product's own code, a wrong input you then fixed, the end
user's account (a revoked or expired connection, missing permissions in their app), or a correction about their
product's own rules or taste, with no page here behind it.

Every report here is also a `problem` progress event with `reported: true`
(journey.md); a problem that is not viaSocket's is still a `problem`
event, with `reported: false`.

## When viaSocket lacks it

1. **Search before you call it missing:** the app by its full name, then by its first word; its page with
   `?search=<words>`; its other actions and the built-in ones
   (https://viasocket.com/docs/skill/built-in-actions.md). A plug job builds the missing piece itself
   (plugs.md), except on a plug viaSocket owns.
   **Nothing live for the app** while you build a product: the search finds it nowhere, or its page answers "Nothing
   to integrate". That means either no plug exists, or a plug exists with no published actions or triggers yet; the
   page can't tell which. Check the person's own org (`list_plugins`, or its call in
   plugs.md, matching the app's name or domain): a plug of theirs for this app,
   published or not, is theirs to finish.
   Then ask the person once, as a form (choice buttons when the client has them, else one short message with two
   numbered options):
   - **Build it ourselves** — say whether this finishes their own plug or creates a new one in their organisation, then
     list what this app's plug needs, from what you found about it, not a generic list: its API docs (the URL you
     found, or that none was found), how it signs in (an OAuth app's client ID and secret, or an API key, and where in
     the app to get it), an account to test with, and the actions and triggers the product needs. On this choice,
     build it as plugs.md says, in product mode, and skip step 2 (no `report_feedback`
     for it; the publish still sends `report_published`). If the build
     can't finish (no usable API docs, no credentials), say why and offer the other choice.
   - **Ask viaSocket to build it** — go on with step 2. viaSocket finishes its own plug for the app if it has one.

   The app is live but lacks the action, trigger or field the product needs: no form. Their own plug, build it;
   viaSocket's, step 2.
2. **Report it once per missing item,** with what you searched, and tell them. The answer carries a `requestId`: the
   report's own id, which viaSocket uses to build what is missing. Keep it (step 3).
3. **Build everything that does not need it.** Leave the part that does unwired, with a
   `VIASOCKET-PENDING(<requestId>): <what is missing>` comment where it would go, write the same line in
   `viasocket-plan.md`, and name each one in the report under `VIASOCKET-PENDING` (the skill's "The report"), not as
   UNTESTED: nothing is wired there. Never stand in for it with an invented id, a
   page's sample or a direct call to the app's own API: those pass a review and fail on the first real user.
4. **Come back to it.** When the project is opened again (or the person asks), check each pending `requestId` before
   anything else: the connector's `get_request_status` tool with `{ "requestId" }`, or without it
   `POST https://flow.sokt.io/func/scriWjg3xzNI` with `Content-Type: application/json` and
   `{ "requestId", "orgId" }` (the same `orgId` the report sent). At most once an hour, never in a loop. The answer's
   `status` and `next` say what to do: `received` or `building`, keep it unwired; `completed`, find it with the
   `serviceId` and `actionIds` it gives, wire the pending part, test it with a real call and remove the comment;
   `waiting_for_connection`, viaSocket built it but could not connect it with its own account, so it is published
   privately in their organisation: give the person the link Create Connection Link makes for that `serviceId` (the
   connector's `create_connection_link`), and once they have connected, wire and test it as for `completed`;
   `needs_human` or `not_possible`, tell the person what its `message` says. Never report the same item again while
   its request is open.

## What to send

Always send `source` (`sdk`, `http_api`, `plug`, `action`, `trigger`, `connection`, `skill` for a page of this
skill, or `other`), `kind`, `feedback` (what went wrong, in plain words) and `skill_version` (the `Skill version` line
at the end of the skill; plug work: the one at the end of the plug guides index,
https://viasocket.com/docs/plugs/skills/index.md); add `stage` (the page you were on, named as `actions_and_events`),
`expected`, `actual`, the `error` (status, code, message) and `refs` with the ids you have: `app` (the app's name or
slug), `pluginId` (its `service_id`), `actionId` (the action's key, or its `action_version_id`), `authId` (the
`auth_id`, when the problem is about one connection) and `requestId` (the open request the problem is about, from an
earlier report). Describe calls; never send a secret, token, signing secret, `script_id` or the product's own code or
data. No need to ask first; list what you reported in your final report.

## How to send it

With the viaSocket connector (MCP) connected, call its `report_feedback` tool. Without it,
`POST https://flow.sokt.io/func/scriVmoUHhmc` with `Content-Type: application/json`, no auth header, and the same body
plus `orgId` (`VIASOCKET_ORG_ID`, or, when there is no product, the org id the sign-in check answers) and `projectId`
(`VIASOCKET_PROJECT_ID`, when there is one). Either way it answers
`{ success, requestId, status, message }` within a few seconds; keep `requestId` as "When viaSocket lacks it" says.
If the call fails, carry on.

END OF PAGE
