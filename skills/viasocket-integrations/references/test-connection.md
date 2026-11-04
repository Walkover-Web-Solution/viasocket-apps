# A test connection, while building

Back to the skill: https://viasocket.com/docs/skill.md

One real run on a test account is what makes the rest of the build true: code written from a page's sample breaks on
the first real response. Running an action or fetching a trigger's real event needs a connection, and only a person
can sign in. This is a step of every app integration, not an option: code that never ran against a real connection is
**UNTESTED** (the skill's "On every job" says what that means), and the report says so per action and trigger.

The test user is the product's own id for whoever connects during the test:

- `apps-api-test-user` for the command below and for calls made without the product;
- or the id the product gives the test account that clicks its own Connect button.

Every test call runs as that user
(`userId` `'apps-api-test-user'`);
its ids never go into the product's code, and its users connect their own.

## 1. Through the product's own Connect button

The way the product's users will connect is the way to test, so the Connect button is the first screen to build
(connect.md): the token endpoint, the button with the app's icon, and the
endpoint that stores the `auth_id`. Run the product, signed in with a test account of its own (make one when it has
none), and ask, in the first line of a message:

> Open <the product's address, local or its preview>, sign up or log in, click **Connect <app>** and sign in with an
> account you can test with. Tell me when the page says it is connected.

One click tests the token endpoint, the popup, the stored `auth_id` and the first real call together. With no
command to run (a builder), this is the one thing left in the report, asked once the button exists.

## 2. From the terminal, before the product has a screen

With Node.js 20+ in the project folder (the three keys in `.env`):

```bash
npx -y viasocket-apps connect <app_slug> --user apps-api-test-user
```

It serves a one-button page on `127.0.0.1` that opens viaSocket's Connect popup for that app, prints the page's URL,
and when the sign-in lands it enables the app for that user (or finds it already enabled). Ask them to open the URL it
prints, click Connect and sign in.

## 3. With the viaSocket connector or the agent token

Signed in to the person's own account (agent-access.md), you can list their own
connections and make a sign-in link: **List Connections** and **Create Connection Link** on
my-automations.md. Those are their connections in their workspace, for their own
automations; use them to look at an app's real data, not as a stand-in for the product's test: the product's calls
still run as its test user, connected through 1 or 2.

## When the connection is there

1. `listConnections('apps-api-test-user')`: the entry whose `id` ends in
   `_<service_id>` of the app is the connection; that `id` is the `auth_id`. Through the product's own button it is
   already stored where the product keeps it.
2. Enable the app for that user and run each action once against a test target. How:
   actions-and-events.md, "The order".
3. Keep the real result. Later code follows its shape, which wins over any page sample.

## While you wait

Keep going from the pages, but test each call the moment the `auth_id` arrives, before the screen that uses it is
written. If they decline or never answer, carry on and list every call as UNTESTED in the report, with the one line
they need to run to test it themselves.

Never send them to viaSocket's dashboard to connect: the product's own button, the command and the connector are the
ways in.

END OF PAGE
