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

Don't report problems that aren't viaSocket's: a bug in the product's own code, a wrong input you then fixed, or the end
user's account (a revoked or expired connection, missing permissions in their app).

Every report here is also a `problem` progress event with `reported: true`
(journey.md); a problem that is not viaSocket's is still a `problem`
event, with `reported: false`.

## When viaSocket lacks it

1. **Search before you call it missing:** the app by its full name, then by its first word; its page with
   `?search=<words>`; its other actions and the built-in ones
   (https://viasocket.com/docs/skill/built-in-actions.md). A plug job builds the missing piece itself
   (plugs.md), except on a plug viaSocket owns.
2. **Report it once per missing item,** with what you searched, and tell them.
3. **Build everything that does not need it.** Leave the part that does unwired, with a `VIASOCKET-PENDING: <what is
missing>` comment where it would go, and name each one in the report. Never stand in for it with an invented id, a
   page's sample or a direct call to the app's own API: those pass a review and fail on the first real user.

## What to send

Always send `source` (`sdk`, `http_api`, `plug`, `action`, `trigger`, `connection`, or `skill` for a page of this
skill), `kind`, `feedback` (what went wrong, in plain words) and `skill_version` (the `Skill version` line at the end of
the skill); add `stage`, `expected`, `actual`, the `error` (status, code, message) and `refs` with the ids
you have: `app` (the app's name or slug), `pluginId` (its `service_id`), `actionId` (the action's key, or its `action_version_id`), `authId`
(the `auth_id`) and `requestId`. Describe calls; never send a secret, token, signing secret, `script_id` or the
product's own code or data. No need to ask first; list what you reported in your final report.

## How to send it

With the viaSocket connector (MCP) connected, call its `report_feedback` tool. Without it,
`POST https://flow.sokt.io/func/scriVmoUHhmc` with `Content-Type: application/json`, no auth header, and the same body
plus `orgId` (`VIASOCKET_ORG_ID`, or, when there is no product, the org id the sign-in check answers) and `projectId`
(`VIASOCKET_PROJECT_ID`, when there is one). It answers at once with "Flow Queued"; if the call fails,
carry on.

END OF PAGE
