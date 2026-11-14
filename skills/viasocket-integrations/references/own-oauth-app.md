# Their own OAuth app for an app

Back to the skill: https://viasocket.com/docs/skill.md

A product's users sign in to an app (Slack, Google Sheets) through viaSocket's OAuth app: nothing to register, and it
works at once. A product that has its own OAuth app with that provider can use it instead. Its users then see the
product's name on the provider's consent screen, and the provider's limits and review are the product's own.

Only the client ID and client secret change, and only for this product's users. The app's page, its actions and
triggers, the Connect button and every call in the product's code stay exactly as they are. The two values are saved
once per app; viaSocket keeps them encrypted and uses them for every sign-in and every token refresh.

Do this only when the person asks for it: "use our own client ID and secret", "the consent screen must show our
name". Never propose it, and never ask anyone to create an OAuth app: viaSocket's own works without one.

## Words

| word          | means                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| OAuth app     | what the person registered in the provider's developer console; it has a client ID and a client secret       |
| client ID     | the OAuth app's public name at the provider. Not a secret: viaSocket shows it back, and you may repeat it    |
| client secret | the OAuth app's password at the provider. You never see it                                                   |
| redirect URL  | the address the provider sends a user back to after they sign in; it is viaSocket's, the same for every user |
| the project   | the product's home in viaSocket, `VIASOCKET_PROJECT_ID` in `.env`; the two values are saved for it           |

## Rules

- **You never see the client secret.** Never ask for it in a message, never open `.env` to find it, never print it,
  never put it in code, a URL or a call you make yourself. It reaches viaSocket only by the command or the page in
  step 4. When the person pastes it to you anyway: do not repeat it, and tell them to make a new client secret in
  the provider's console, because a chat is not a safe place for it.
- **Saving switches sign-ins over at once,** for every user of the product. So step 4 comes only after the person
  confirms step 3, and a test that fails in step 5 is undone the same minute with `--remove`.
- **Their words, for this job.** "Client ID", "client secret" and "redirect URL" are the words on the provider's
  own screen and the words the person used: say them as they are. They are the exception to the skill's plain-words
  rule, on this page only.
- **The asks of this job** are the plan's yes, the redirect URL (step 3), and the page of step 4 when you cannot
  run a command. The test sign-in of step 5 is the one thing left in the report when it can wait.
- **Progress events** name this job `feature: "app-integrations"`.

## Steps

1. **Read what is there.** Find the app's slug with the catalog search
   (https://plug-service.viasocket.com/plugins/search?prefix=<name>, the `appslugname`), then:

   ```bash
   npx -y viasocket-apps oauth-app <app_slug>
   ```

   It prints the redirect URL, what is saved, and the names (never the values) of the variables in `.env` that look
   like a client ID or a client secret. That it answers is also the check that the sign-in works. Without a command
   to run, the same answer is one call, with the `service_id` shown on the app's page
   (https://viasocket.com/docs/<app slug>.md):

   ```
   GET https://flow-api.viasocket.com/projects/<VIASOCKET_PROJECT_ID>/oauth-apps/<service_id>
   Authorization: <VIASOCKET_AGENT_TOKEN>
   ```

   Its reply, under `data`:

   | field           | means                                                                                                  |
   | --------------- | ------------------------------------------------------------------------------------------------------ |
   | `available`     | `false`: viaSocket cannot take a product's own client ID and secret yet. Say so in the report and stop |
   | `supported`     | `false`: this app does not sign in with OAuth, so it has nothing to replace. Say so and stop           |
   | `redirect_urls` | every redirect URL for step 3                                                                          |
   | `app`           | `null` when nothing is saved; else `client_id` and `secret_last4`                                      |

   With neither a command nor the two `.env` values to make that call, skip to step 4's page: it shows the redirect
   URL itself.

2. **Plan, then a yes,** as the skill's "The person you work for" says. The three lines: what their users will see
   (the app's consent screen with their own app's name), the one thing they do in the provider's console, and that
   people already connected keep working as they are.
3. **The redirect URL goes into their OAuth app.** Only they can do it. One ask, its first line, with a link to the
   provider's developer console when you know it for certain:

   > Add this redirect URL to your OAuth app in <app>'s developer console: <each redirect URL>. Your OAuth app also
   > needs the same permissions <app> asks your users for today. Tell me when it is saved.

   Wait for their answer.

4. **Save the two values.** Take the first way you can do:
   - **You can run a command, and step 1 listed both variable names:**

     ```bash
     npx -y viasocket-apps oauth-app <app_slug> --id-env <NAME OF THE CLIENT ID VARIABLE> --secret-env <NAME OF THE CLIENT SECRET VARIABLE>
     ```

     You pass the two names; the command reads the values and sends them to viaSocket.

   - **Otherwise the page.** It signs them in, shows the redirect URL of step 3 and takes the two values. One ask,
     its first line:

     > Open https://flow.viasocket.com/embed-oauth-app?app=<app_slug>, paste your client ID and client secret, and
     > click **Save**.

     Add `&project=<VIASOCKET_PROJECT_ID>` when you know it; without it the page asks which product.

5. **Check with a new sign-in.** A connection made before step 4 proves nothing: it still runs on viaSocket's OAuth
   app. So connect as a user who has never connected this app (test-connection.md,
   with a `--user` of its own, such as `oauth-app-test-user`). The consent screen names their OAuth app, not
   viaSocket's: that is the proof. When the provider refuses the sign-in,
   its message names the cause: a redirect URL that is not added, a permission the OAuth app lacks, or a wrong
   client secret. Until it is fixed, put sign-ins back on viaSocket's OAuth app:
   `npx -y viasocket-apps oauth-app <app_slug> --remove`.
6. **Report** as the skill's "The report" says: which app, that new sign-ins go through their OAuth app, that the
   test sign-in showed their app's name (or **UNTESTED**, with the test sign-in as the one thing left for them), and
   that nothing changed in the product's code.

## After it is saved

- **Connections made before** keep working through viaSocket's OAuth app. One moves to theirs when its user
  reconnects in place (connect.md).
- **A new client secret** (they rotated it): step 4 again. Nothing else changes and no user reconnects.
- **Another client ID:** a connection can only be refreshed by the client ID that made it, so every user who
  connected through the old one reconnects. Say so before step 4, and go on only on their yes.
- **Back to viaSocket's OAuth app:** `npx -y viasocket-apps oauth-app <app_slug> --remove`. The same reconnect
  applies to users who connected through theirs; say so first. The page has a **Remove** button for the same.

END OF PAGE
