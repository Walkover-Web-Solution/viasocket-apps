# Apps in the product, for its users

Back to the skill: https://viasocket.com/docs/skill.md

The product's users bring their own apps and the product acts in them: reads their data, writes to them, reacts to
their events. What the users get is a Connect button per app in the product's own screens. After it, the product runs
that app's actions for them (send a message, add a row, fetch a report) and reacts to that app's events (a new lead, a
new message), from the server, as that user. The product builds and holds no OAuth, no webhook and no app's quirks:
viaSocket keeps each connection alive, and the product keeps one id per user and app.

## Steps

1. **Setup**, once per project: setup.md. Skip it when the three keys are in `.env`
   and its check passes.
2. **Find the app and what to call:** "Find what to call" on actions-and-events.md.
   An app is a third-party service on viaSocket (Slack, Google Sheets); code and the calls name it by its **slug**
   (`slack`, `google-sheets`), and only the Connect popup takes its `service_id`. An **action** is what an app can do
   (send a message) and a **trigger** what it can report (a new message); each has a page with its **key**
   (`Send_Message`), its **version** (`v107`) and its `inputData`, and the calls name it by key and version. Read the
   app's page and the page of each action and trigger the feature needs. After the plan's yes, a test connection
   (test-connection.md): with the command when you can run one; else, once the
   product's Connect button exists, as the one thing left in the report, tested as soon as it is there.
3. **Plan, then get a yes,** as the skill's "The person you work for" says: the three-line plan, before any code, and
   wait. This table goes into `viasocket-plan.md` in the project and into the report:

   | app                   | action or trigger (key, version) | key of `inputData`     | who supplies it                      | when                                                  |
   | --------------------- | -------------------------------- | ---------------------- | ------------------------------------ | ----------------------------------------------------- |
   | google-search-console | `Fetch_Search_Analytics` `v4`    | `siteUrl`              | the user, from a list of their sites | once, right after Connect; stored with the connection |
   | google-search-console | `Fetch_Search_Analytics` `v4`    | `startDate`, `endDate` | the product (last 28 days)           | per run                                               |

   Below the table, one line per action: who picks it (the product's code, the user from a list, or the product's AI
   from tools) and where that choice is shown and changed. Never decide a row silently. The `when` column follows the
   rule "Once, or per run" on actions-and-events.md.

4. **Build, testing as you go.** Run each call once on the test connection before writing the screen that uses it,
   and write later code from the real response; use a page's sample only until you have one. Every action is named
   by its key and a pinned version; every option list searches and pages as the page says.

   | the product needs to…                                                                                                                                                                                                                        | read                                                                |
   | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
   | let a user connect an app and store the `auth_id` it answers: that user's connection to that app, kept per user and app                                                                                                                      | connect.md                         |
   | read options from a connected app and run its actions. Enabling the app, once per user and app, creates the flow that runs them; its id, the `script_id`, is a credential kept on the server, per user                                                                | actions-and-events.md              |
   | react to the app's events (each one thing the trigger reports, as the product receives it): a subscription switches a trigger on for a user, with a handler, code that runs on viaSocket when an event arrives, and a `script_id` of its own | actions-and-events.md              |
   | show every app and any action's form in its own screens                                                                                                                                                                                      | https://viasocket.com/docs/catalog-api.md                           |
   | let users build their own workflows in viaSocket's screens                                                                                                                                                                                   | https://viasocket.com/docs/embed.md                                 |
   | use Run AI Model, Delay or Memory (key-value storage) as a step                                                                                                                                                                              | https://viasocket.com/docs/skill/built-in-actions.md                |
   | list, pause, reconnect or revoke what a user has                                                                                                                                                                                             | manage.md                          |
   | give its own AI agent the user's connected apps as tools (LangChain, Vercel AI SDK or any framework)                                                                                                                                         | https://github.com/Walkover-Web-Solution/viasocket-apps#agent-tools |

5. **Check.** Run the checker over the integration's code and fix every FAIL; it catches invented slugs, keys and
   ids and hand-built URLs (Node.js 20+; without it, say the check was not run):
   `npx -y viasocket-apps check <folder>`.
   With `VIASOCKET_TEST_EMBED_TOKEN` set to a token signed for the test user, it also checks that the token works.
6. **Report** as the skill's "The report" says, with the checker's output.

## Finished when

Every line below that applies has been decided and the report says how. A request like "integrate Slack" makes
every line apply to each action and trigger in play, even when the person you work for named none of them.

- **Confirmed:** the three-line plan was shown and they said yes before the code; the table is in
  `viasocket-plan.md` and the report, with what they changed.
- **Who connects:** the product's own user, through a Connect button with the app's icon; the `auth_id` stored per
  user, and reconnected in place when it expires. In a two-sided product the customer connects, never their visitor.
- **Where and when each value comes from:** every key of every `inputData`, as the actions-and-events page decides
  it: the user on screen (once after Connect, or per run), the product's data or AI per run, or a constant only
  when it is right for every user.
- **Who picks the action:** the product's code, the user from a list, or the product's AI from tool definitions.
- **Where it runs:** actions from the server, each `script_id` used only for the user who owns it and that
  ownership checked on the server; events through a handler on viaSocket, its record saved; the browser holds only
  the embed token (signed with `VIASOCKET_EMBED_SECRET` per user on the server), for the Connect popup and the
  prebuilt UI.
- **Tested:** each action ran once on the test connection and each subscription saw a real event. Anything that did
  not is listed as **UNTESTED** with why.
- **Proof:** the check script's output and one real call's response.

END OF PAGE
